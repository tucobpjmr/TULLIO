// Strumenti dati e operazioni irreversibili del modulo Liste viaggio.
//
// Le due operazioni coperte qui distruggono dati senza possibilità di
// recupero: il reset totale azzera l'archivio dell'intera agenzia, l'hard
// delete cancella una lista e il suo storico senza lasciare traccia. Nella SPA
// mono-agenzia erano alla portata di chiunque fosse autenticato; dentro
// VoyageDesk, che ha i ruoli, sono ristrette — e questi test sono ciò che
// impedisce a una modifica futura di riaprirle per distrazione.
//
// Il gate è nell'interfaccia: lato DB le RPC restano concesse a ogni utente
// autenticato, quindi è difesa in profondità e non la garanzia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const CESTINATA = {
  id: "l9",
  titolo: "Vecchia lista",
  stato: "attiva",
  deleted_at: "2026-07-20T10:00:00Z",
  clients: { name: "BIANCHI ANNA" },
};

vi.mock("../lib/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      list: vi.fn(async () => ({ data: [], error: null })),
      listTrash: vi.fn(async () => ({ data: [CESTINATA], error: null })),
      saldi: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

const { ListeViaggio } = await import("../components/liste/ListeViaggio.jsx");

const TEAM = [
  { id: "adm", name: "Marco Rossi", role: "admin", active: true, pending: false },
  { id: "mgr", name: "Laura Verdi", role: "manager", active: true, pending: false },
  { id: "agt", name: "Paolo Neri", role: "agent", active: true, pending: false },
];

const asUser = (uid) => { setTeam(TEAM.map((m) => ({ ...m }))); setCurrentUser(uid); };

const baseState = (uid) => ({ currentUserId: uid, team: TEAM, clients: [], listeTarget: null });

// Monta il modulo e aspetta che il primo caricamento sia finito.
const mount = async (uid) => {
  asUser(uid);
  render(<ListeViaggio state={baseState(uid)} dispatch={vi.fn()} />);
  await screen.findByRole("button", { name: /Nuova lista/ });
};

const apriCestino = () => {
  fireEvent.change(screen.getByLabelText("Filtra le liste"), { target: { value: "cestino" } });
};

describe("Cestino — eliminazione definitiva", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin e manager possono eliminare per sempre una lista cestinata", async () => {
    for (const uid of ["adm", "mgr"]) {
      await mount(uid);
      apriCestino();
      expect(await screen.findByText("BIANCHI ANNA")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Elimina" })).toBeTruthy();
      screen.getByRole("button", { name: "Ripristina" }); // resta comunque disponibile
      document.body.innerHTML = "";
    }
  });

  it("all'agent resta il solo Ripristina", async () => {
    await mount("agt");
    apriCestino();
    expect(await screen.findByText("BIANCHI ANNA")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ripristina" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Elimina" })).toBeNull();
  });

  it("l'eliminazione chiede conferma nominando la lista, e non parte da sola", async () => {
    const { ListeAPI } = await import("../lib/listeApi.js");
    ListeAPI.eliminaDefinitivamente = vi.fn(async () => ({ data: null, error: null }));

    await mount("adm");
    apriCestino();
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));

    expect(screen.getByText("Eliminare definitivamente?")).toBeTruthy();
    // Il nome compare anche nella riga: qui interessa che sia nel testo della
    // conferma, così l'utente sa esattamente cosa sta per distruggere.
    expect(screen.getByText(/BIANCHI ANNA.*verranno eliminati per sempre/)).toBeTruthy();
    // Finché non si conferma, nessuna chiamata al database.
    expect(ListeAPI.eliminaDefinitivamente).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Elimina per sempre" }));
    await waitFor(() => expect(ListeAPI.eliminaDefinitivamente).toHaveBeenCalledWith("l9"));
  });
});

describe("Strumenti dati — reset totale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("l'admin trova il reset totale fra gli strumenti", async () => {
    await mount("adm");
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    expect(screen.getByRole("button", { name: /Reset totale/ })).toBeTruthy();
  });

  it("manager e agent vedono gli strumenti ma non il reset", async () => {
    for (const uid of ["mgr", "agt"]) {
      await mount(uid);
      fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
      // Backup ed export restano disponibili: non distruggono nulla.
      expect(screen.getByRole("button", { name: /Scarica backup/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Reset totale/ })).toBeNull();
      expect(screen.getByText(/riservato agli amministratori/)).toBeTruthy();
      document.body.innerHTML = "";
    }
  });

  it("il reset resta bloccato finché non si digita esattamente la frase", async () => {
    const { ListeAPI } = await import("../lib/listeApi.js");
    ListeAPI.resetCompleto = vi.fn(async () => ({ data: {}, error: null }));

    await mount("adm");
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    fireEvent.click(screen.getByRole("button", { name: /Reset totale/ }));

    const conferma = screen.getByRole("button", { name: "Elimina tutto" });
    expect(conferma.disabled).toBe(true);

    const input = screen.getByLabelText(/Per confermare digita/);
    fireEvent.change(input, { target: { value: "reset totale" } }); // minuscolo: non basta
    expect(screen.getByRole("button", { name: "Elimina tutto" }).disabled).toBe(true);

    fireEvent.change(input, { target: { value: "RESET TOTALE" } });
    expect(screen.getByRole("button", { name: "Elimina tutto" }).disabled).toBe(false);
    expect(ListeAPI.resetCompleto).not.toHaveBeenCalled();
  });
});
