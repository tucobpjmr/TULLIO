// I due punti d'ingresso al modulo Liste viaggio: il bottone nell'header della
// Dashboard e il tab dentro la scheda cliente.
//
// Il modulo non ha una voce di sidebar/bottom-nav (scelta esplicita: la bottom
// bar mobile ha già 7-8 voci). Questi due punti sono quindi l'unico accesso, e
// il gating per ruolo va verificato su entrambi: il Driver non deve vederli.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { withAppData } from "./helpers/appData.jsx";

// ─── Contesto app per il render ─────────────────────────────────────────────
// Sostituisce setTeam()/setCurrentUser() sui globali eliminati: il team e
// l'utente corrente non sono più variabili di modulo lette dai componenti al
// render, ma props del provider. Restano impostabili con le stesse due
// chiamate — `ctxTeam` / `ctxUser` — così ogni test dichiara da quale team
// dipende, e `render` le applica montando l'albero dentro <AppDataProvider>.
let appCtx = { team: [], categories: {}, currentUserId: null, tasks: [], clients: [] };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
const ctxTasks = (t) => { appCtx = { ...appCtx, tasks: t }; };
const ctxClients = (c) => { appCtx = { ...appCtx, clients: c }; };
// M-2 (25 agosto): `dispatch` arriva per contesto, quindi il render lo prende
// fra le opzioni invece che come prop del componente sotto esame.
const render = (ui, { dispatch, ...options } = {}) => {
  const ctx = () => ({ ...appCtx, dispatch });
  const utils = rtlRender(withAppData(ui, ctx()), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, ctx())) };
};


// Senza VITE_SUPABASE_URL il client condiviso non si costruisce, e
// importOriginal() qui sotto lo caricherebbe comunque.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// Il pannello liste della scheda cliente interroga Supabase al mount: mockiamo
// il layer dati, qui interessa la navigazione, non le query.
vi.mock("../components/liste/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      listByClient: vi.fn(async () => ({ data: [], error: null })),
      // Il pannello cliente chiede solo i saldi del proprio cliente; `saldi`
      // (tutti i saldi) resta mockato perché lo usa la home del modulo.
      saldiByClient: vi.fn(async () => ({ data: [], error: null })),
      saldi: vi.fn(async () => ({ data: [], error: null })),
      // L'anagrafica chiede il conteggio liste per cliente al mount (badge
      // "N liste viaggio" sulle card): senza il mock la vista clienti
      // solleverebbe qui, non nella navigazione che questo file verifica.
      clientiConListe: vi.fn(async () => ({ data: [], error: null })),
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

const asUser = (uid) => {
  const s = baseState(uid);
  ctxTeam(TEAM.map(m => ({ ...m })));
  ctxUser(uid);
  ctxTasks(s.tasks);
  ctxClients(s.clients);
};

describe("Dashboard — bottone Liste viaggio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("è visibile ai non-Driver e apre la vista liste", () => {
    asUser("marco");
    const dispatch = vi.fn();
    render(<Dashboard />, { dispatch });

    const btn = screen.getByRole("button", { name: /Liste viaggio/i });
    fireEvent.click(btn);
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_VIEW", payload: "liste" });
  });

  it("non è mostrato al Driver", () => {
    asUser("giulia");
    render(<Dashboard />, { dispatch: vi.fn() });
    expect(screen.queryByRole("button", { name: /Liste viaggio/i })).toBeNull();
  });
});

describe("Scheda cliente — tab Liste viaggio", () => {
  beforeEach(() => vi.clearAllMocks());

  const openCliente = (uid) => {
    asUser(uid);
    const dispatch = vi.fn();
    render(<ClientiView />, { dispatch });
    fireEvent.click(screen.getByText("MARIO ROSSI"));
    return dispatch;
  };

  it("selezionando un cliente compaiono i tab Task e Liste viaggio", () => {
    openCliente("marco");
    expect(screen.getByRole("button", { name: "Task" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Liste viaggio" })).toBeTruthy();
  });

  it("il tab Liste viaggio carica le liste del solo cliente selezionato", async () => {
    const { ListeAPI } = await import("../components/liste/listeApi.js");
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

  // Bug trovato con un giro manuale in browser: passando a un Driver mentre il
  // tab "Liste viaggio" di un altro cliente era già aperto, la barra dei tab
  // spariva ma il contenuto montato restava quello del tab Liste — il Driver
  // vedeva comunque il pannello che non deve poter aprire.
  it("se il tab Liste era aperto e l'utente diventa Driver, il pannello torna su Task", () => {
    const dispatch = vi.fn();
    asUser("marco");
    const { rerender } = render(<ClientiView />, { dispatch });
    fireEvent.click(screen.getByText("MARIO ROSSI"));
    fireEvent.click(screen.getByRole("button", { name: "Liste viaggio" }));
    expect(screen.queryByText(/Nessun task associato a questo cliente/)).toBeNull();

    asUser("giulia");
    rerender(<ClientiView />);

    expect(screen.queryByRole("button", { name: "Liste viaggio" })).toBeNull();
    expect(screen.getByText(/Nessun task associato a questo cliente/)).toBeTruthy();
  });
});
