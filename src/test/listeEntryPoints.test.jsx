// I due punti d'ingresso al modulo Liste viaggio: il bottone nell'header della
// Dashboard e il tab dentro la scheda cliente.
//
// Il modulo non ha una voce di sidebar/bottom-nav (scelta esplicita: la bottom
// bar mobile ha già 7-8 voci). Questi due punti sono quindi l'unico accesso, e
// il gating per ruolo va verificato su entrambi: il Driver non deve vederli.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";

// Senza VITE_SUPABASE_URL il client condiviso non si costruisce, e
// importOriginal() qui sotto lo caricherebbe comunque.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// Il pannello liste della scheda cliente interroga Supabase al mount: mockiamo
// il layer dati, qui interessa la navigazione, non le query.
vi.mock("../lib/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      listByClient: vi.fn(async () => ({ data: [], error: null })),
      saldi: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

const { Dashboard } = await import("../components/dashboard/Dashboard.jsx");
const { ClientiView } = await import("../components/clients/ClientiView.jsx");

const TEAM = [
  { id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false },
  { id: "giulia", name: "Giulia Neri", role: "driver", active: true, pending: false },
];

const CLIENTE = { id: "cl1", name: "MARIO ROSSI", city: "Roma", createdAt: "2026-01-01T00:00:00Z" };

const baseState = (uid) => ({
  currentUserId: uid,
  team: TEAM,
  tasks: [],
  notices: [],
  clients: [CLIENTE],
  categories: {},
});

const asUser = (uid) => { setTeam(TEAM.map(m => ({ ...m }))); setCurrentUser(uid); };

describe("Dashboard — bottone Liste viaggio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("è visibile ai non-Driver e apre la vista liste", () => {
    asUser("marco");
    const dispatch = vi.fn();
    render(<Dashboard state={baseState("marco")} dispatch={dispatch} />);

    const btn = screen.getByRole("button", { name: /Liste viaggio/i });
    fireEvent.click(btn);
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW", payload: "liste" });
  });

  it("non è mostrato al Driver", () => {
    asUser("giulia");
    render(<Dashboard state={baseState("giulia")} dispatch={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Liste viaggio/i })).toBeNull();
  });
});

describe("Scheda cliente — tab Liste viaggio", () => {
  beforeEach(() => vi.clearAllMocks());

  const openCliente = (uid) => {
    asUser(uid);
    const dispatch = vi.fn();
    render(<ClientiView state={baseState(uid)} dispatch={dispatch} />);
    fireEvent.click(screen.getByText("MARIO ROSSI"));
    return dispatch;
  };

  it("selezionando un cliente compaiono i tab Task e Liste viaggio", () => {
    openCliente("marco");
    expect(screen.getByRole("button", { name: "Task" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Liste viaggio" })).toBeTruthy();
  });

  it("il tab Liste viaggio carica le liste del solo cliente selezionato", async () => {
    const { ListeAPI } = await import("../lib/listeApi.js");
    openCliente("marco");
    fireEvent.click(screen.getByRole("button", { name: "Liste viaggio" }));

    await waitFor(() => expect(ListeAPI.listByClient).toHaveBeenCalledWith("cl1"));
    expect(await screen.findByText(/Nessuna lista viaggio per questo cliente/)).toBeTruthy();
  });

  it("al Driver il tab non compare: resta il solo pannello Task", () => {
    openCliente("giulia");
    expect(screen.queryByRole("button", { name: "Liste viaggio" })).toBeNull();
    expect(screen.getByText(/Nessun task associato a questo cliente/)).toBeTruthy();
  });
});
