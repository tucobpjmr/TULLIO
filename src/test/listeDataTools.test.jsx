// Funzionalità "dati" del modulo Liste viaggio non portate dalla SPA nel
// primo giro (PR #131): export Word "copia agente", riepilogo cliente,
// backup JSON (download/ripristino) ed eliminazione definitiva dal cestino.
// Il backend (RPC + gating di ruolo) era già pronto; qui si copre la UI React
// che mancava — bottoni, modali e la conferma testuale del reset totale.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { withAppData } from "./helpers/appData.jsx";

// ─── Contesto app per il render ─────────────────────────────────────────────
// Sostituisce setTeam()/setCurrentUser() sui globali eliminati: il team e
// l'utente corrente non sono più variabili di modulo lette dai componenti al
// render, ma props del provider. Restano impostabili con le stesse due
// chiamate — `ctxTeam` / `ctxUser` — così ogni test dichiara da quale team
// dipende, e `render` le applica montando l'albero dentro <AppDataProvider>.
let appCtx = { team: [], categories: {}, currentUserId: null };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
const render = (ui, options) => {
  const utils = rtlRender(withAppData(ui, appCtx), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, appCtx)) };
};


vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const TRASHED_LISTA = {
  id: "lista-cestino",
  clients: { name: "BIANCHI LUCA" },
  titolo: null,
  stato: "esaurita",
  deleted_at: "2026-07-20T10:00:00Z",
};

const apiState = {
  list: [],
  listTrash: [TRASHED_LISTA],
  saldi: [],
  backupData: { clients: [{ id: "c1" }], liste: [{ id: "l1" }], movimenti: [{ id: "m1" }, { id: "m2" }] },
  importaBackup: { clients_added: 0, liste_added: 1, movimenti_added: 2 },
  resetCompleto: { liste_deleted: 3, movimenti_deleted: 5 },
};

const ListeAPIMock = {
  list: vi.fn(async () => ({ data: apiState.list, error: null })),
  listTrash: vi.fn(async () => ({ data: apiState.listTrash, error: null })),
  saldi: vi.fn(async () => ({ data: apiState.saldi, error: null })),
  ripristina: vi.fn(async () => ({ data: null, error: null })),
  eliminaDefinitiva: vi.fn(async () => ({ data: null, error: null })),
  backupData: vi.fn(async () => ({ data: apiState.backupData, error: null })),
  importaBackup: vi.fn(async () => ({ data: apiState.importaBackup, error: null })),
  resetCompleto: vi.fn(async () => ({ data: apiState.resetCompleto, error: null })),
};

const downloadBlobMock = vi.fn();

vi.mock("../components/liste/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ListeAPI: ListeAPIMock, downloadBlob: downloadBlobMock };
});

const { ListeViaggio } = await import("../components/liste/ListeViaggio.jsx");
const { ListaDetail } = await import("../components/liste/ListaDetail.jsx");

const TEAM = [
  { id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina Verdi", role: "senior agent", active: true, pending: false },
];

const asUser = (uid) => { ctxTeam(TEAM.map((m) => ({ ...m }))); ctxUser(uid); };

const renderListe = (uid = "marco") => {
  asUser(uid);
  const dispatch = vi.fn();
  const utils = render(<ListeViaggio dispatch={dispatch} />);
  return { dispatch, ...utils };
};

describe("ListeViaggio — Strumenti dati (backup e reset)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("il bottone 'Strumenti dati' apre la modale con le opzioni di backup", async () => {
    renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    expect(screen.getByText("⬇ Scarica backup (JSON)")).toBeTruthy();
    expect(screen.getByText("⬆ Carica backup")).toBeTruthy();
  });

  it("'Reset totale…' compare solo per l'admin", async () => {
    renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    expect(screen.getByText("Reset totale…")).toBeTruthy();
  });

  it("'Reset totale…' NON compare per un ruolo non-admin", async () => {
    renderListe("gina");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    expect(screen.queryByText("Reset totale…")).toBeNull();
  });

  it("'Scarica backup' innesca il download e mostra i conteggi nel toast", async () => {
    const { dispatch } = renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    fireEvent.click(screen.getByText("⬇ Scarica backup (JSON)"));

    await waitFor(() => expect(downloadBlobMock).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Backup scaricato: 1 liste, 2 movimenti" },
    });
  });

  it("caricare un backup mostra i conteggi e chiede conferma prima della RPC", async () => {
    const { container, dispatch } = renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());

    const file = new File(
      [JSON.stringify({ app: "liste-viaggio", liste: [{ id: "l1" }], movimenti: [{ id: "m1" }, { id: "m2" }] })],
      "backup.json",
      { type: "application/json" },
    );
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText("Caricare il backup?")).toBeTruthy();
    expect(screen.getByText(/1 liste e 2 movimenti/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Carica backup" }));
    await waitFor(() => expect(ListeAPIMock.importaBackup).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Backup caricato: +0 clienti, +1 liste, +2 movimenti" },
    });
  });

  it("un file che non sembra un backup di questa app mostra un errore e non apre la conferma", async () => {
    const { container, dispatch } = renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());

    const file = new File([JSON.stringify({ foo: "bar" })], "altro.json", { type: "application/json" });
    const input = container.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "error", message: "Il file non sembra un backup di questa app." },
    }));
    expect(screen.queryByText("Caricare il backup?")).toBeNull();
  });

  it("il reset totale richiede la conferma testuale esatta prima di chiamare la RPC", async () => {
    const { dispatch } = renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Strumenti dati" }));
    fireEvent.click(screen.getByText("Reset totale…"));

    fireEvent.click(screen.getByRole("button", { name: "Elimina tutto" }));
    expect(ListeAPIMock.resetCompleto).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "error", message: "Digita esattamente: RESET TOTALE" },
    });

    fireEvent.change(screen.getByLabelText(/Per confermare digita esattamente/), {
      target: { value: "RESET TOTALE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Elimina tutto" }));

    await waitFor(() => expect(ListeAPIMock.resetCompleto).toHaveBeenCalledWith("RESET TOTALE"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Reset eseguito: 3 liste e 5 movimenti eliminati" },
    });
  });
});

describe("ListeViaggio — cestino: eliminazione definitiva", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("nel cestino compare 'Elimina definitivamente' accanto a 'Ripristina'", async () => {
    renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Filtra le liste"), { target: { value: "cestino" } });

    expect(await screen.findByText("BIANCHI LUCA")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ripristina" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Elimina definitivamente" })).toBeTruthy();
  });

  it("chiede conferma e chiama la RPC solo dopo la conferma", async () => {
    const { dispatch } = renderListe("marco");
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Filtra le liste"), { target: { value: "cestino" } });
    await screen.findByText("BIANCHI LUCA");

    fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente" }));
    expect(ListeAPIMock.eliminaDefinitiva).not.toHaveBeenCalled();

    // ST-5: la conferma passa da useConfirm(), non più dal ConfirmModal locale
    // del modulo Liste — il markup è quello di ui/Modal.jsx (role="dialog").
    const confirmDialog = screen.getByText("Eliminare definitivamente?").closest('[role="dialog"]');
    expect(confirmDialog).toBeTruthy();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Elimina definitivamente" }));
    await waitFor(() => expect(ListeAPIMock.eliminaDefinitiva).toHaveBeenCalledWith("lista-cestino"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Lista eliminata definitivamente" },
    });
  });
});

describe("ListaDetail — Copia agente e Riepilogo cliente", () => {
  const LISTA = { id: "l1", titolo: "Buono 2026", stato: "attiva", clients: { name: "ROSSI MARIO" } };
  const MOVIMENTI = [
    { id: "m1", data_movimento: "2026-07-01", descrizione: "Acconto", importo: 100, metodo: "bonifico" },
  ];

  const setup = () => {
    const dispatch = vi.fn();
    render(
      <ListaDetail
        lista={LISTA}
        movimenti={MOVIMENTI}
        history={[]}
        usersById={{}}
        dispatch={dispatch}
        onReload={vi.fn()}
        onArchived={vi.fn()}
      />,
    );
    return { dispatch };
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it("mostra i due bottoni nella barra comandi", () => {
    setup();
    expect(screen.getByRole("button", { name: "Copia agente" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Riepilogo cliente" })).toBeTruthy();
  });

  it("'Copia agente' scarica il documento Word e avvisa con un toast", () => {
    const { dispatch } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Copia agente" }));

    expect(downloadBlobMock).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlobMock.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(filename).toBe("LISTA_ROSSI_MARIO_COPIA_AGENTE.doc");
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Copia agente scaricata (Word)" },
    });
  });

  it("'Riepilogo cliente' apre l'anteprima con cliente e saldo", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));
    expect(screen.getByText("Riepilogo buono viaggio")).toBeTruthy();

    const riepilogo = document.querySelector(".lv-riepilogo");
    expect(within(riepilogo).getByText("ROSSI MARIO")).toBeTruthy();
    expect(document.querySelector(".rp-saldo b").textContent).toMatch(/100,00\s*€/);
  });
});
