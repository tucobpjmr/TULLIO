// S-3 — il reload manuale del modulo Liste non deve scavalcare la protezione
// anti-race, né perdere la selettività del reload (A-1) quando parte da una
// scrittura invece che da un evento realtime.
//
// Il difetto aveva due facce, nello stesso punto (`reloadAll` in
// ListeViaggio.jsx chiamava `loadHome()` — cioè il `reload` di useListeData —
// SENZA ARGOMENTI):
//
//   1. `isCurrent` ricadeva sul default `() => true`: la guardia anti-stale
//      di useDebouncedTableSubscription era assente per quella chiamata. Un
//      reload manuale lento e uno realtime veloce potevano atterrare fuori
//      ordine — vince il più vecchio, cioè il più lento.
//   2. `tabelle` ricadeva su `null` ("carica tutto"): il ramo selettivo
//      `soloSaldi` di useListeData (A-1) non scattava mai sul percorso più
//      caldo del modulo — ListaDetail chiama `onReload()` dopo OGNI
//      scrittura, incluso registrare un movimento.
//
// La correzione ha due metà, entrambe verificate qui:
//
//   A. Un generation counter DENTRO useListeData (non nel chiamante), condi-
//      viso da reload manuale e reload realtime: da qui in poi conta solo
//      l'ordine di PARTENZA, non l'ordine di ARRIVO delle risposte.
//   B. Il chiamante (ListaDetail) dichiara quali tabelle una scrittura ha
//      invalidato, e reloadAll/onReload la propagano fino a useListeData —
//      così il reload manuale rientra sullo stesso percorso selettivo del
//      realtime, invece di ricaricare sempre tutto.
//
// Un terzo test copre la guardia di staleness di `loadDetail` (ListeViaggio),
// la stessa disciplina applicata al dettaglio di una lista.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act, render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { withAppData } from "./helpers/appData.jsx";

// ─── Promise controllabili a mano: servono a decidere l'ordine di ARRIVO
// delle risposte indipendentemente dall'ordine di PARTENZA delle chiamate,
// che è esattamente ciò che il test di race deve poter dimostrare. ─────────
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
};

// ─── subscribeToTable: registra l'handler per tabella, come in
// realtimeGranularita.test.jsx — serve a poter emettere un evento su
// "liste_viaggio" e far partire il reload realtime a comando. ─────────────
const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload = { eventType: "INSERT", new: {} }) => handlers.get(tabella)?.(payload);

const ListeAPIMock = {
  list: vi.fn(),
  listTrash: vi.fn(),
  saldi: vi.fn(),
  get: vi.fn(),
  movimenti: vi.fn(),
  history: vi.fn(),
  annullaMovimento: vi.fn(),
  cambiaStato: vi.fn(),
};

// Un solo vi.mock per modulo per l'intero file (vedi listeCointestazione.test.jsx):
// una seconda chiamata sullo stesso path lo sovrascriverebbe silenziosamente
// invece di comporsi con la prima.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({ subscribeToTable: (...a) => subscribeToTable(...a) }));
vi.mock("../components/liste/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ListeAPI: { ...actual.ListeAPI, ...ListeAPIMock } };
});

const { useListeData } = await import("../components/liste/useListeData.js");
const { ListeViaggio } = await import("../components/liste/ListeViaggio.jsx");

const render = (ui, ctx) => rtlRender(withAppData(ui, ctx));

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  ListeAPIMock.list.mockResolvedValue({ data: [{ id: "iniziale" }], error: null });
  ListeAPIMock.listTrash.mockResolvedValue({ data: [], error: null });
  ListeAPIMock.saldi.mockResolvedValue({ data: [], error: null });
  ListeAPIMock.get.mockResolvedValue({ data: { id: "l1" }, error: null });
  ListeAPIMock.movimenti.mockResolvedValue({ data: [], error: null });
  ListeAPIMock.history.mockResolvedValue({ data: [], error: null });
  ListeAPIMock.annullaMovimento.mockResolvedValue({ data: null, error: null });
  ListeAPIMock.cambiaStato.mockResolvedValue({ data: null, error: null });
});

// ─── A · generazione condivisa: vince chi è partito per ULTIMO ────────────
describe("useListeData — il reload manuale non scavalca l'anti-race (S-3)", () => {
  it("un reload manuale partito PRIMA di uno realtime, ma che risponde DOPO, non sovrascrive il risultato del realtime", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Idratazione iniziale completata (generazione 1). Le prossime due
    // reload — manuale e realtime — sono la 2ª e la 3ª chiamata a ciascun
    // metodo: le rendiamo controllabili a mano.
    const manuale = { list: deferred(), listTrash: deferred(), saldi: deferred() };
    const realtime = { list: deferred(), listTrash: deferred(), saldi: deferred() };
    ListeAPIMock.list
      .mockImplementationOnce(() => manuale.list.promise)
      .mockImplementationOnce(() => realtime.list.promise);
    ListeAPIMock.listTrash
      .mockImplementationOnce(() => manuale.listTrash.promise)
      .mockImplementationOnce(() => realtime.listTrash.promise);
    ListeAPIMock.saldi
      .mockImplementationOnce(() => manuale.saldi.promise)
      .mockImplementationOnce(() => realtime.saldi.promise);

    // 1) PARTE il reload manuale — esattamente come lo chiamava (prima di
    // questa correzione) `reloadAll` in ListeViaggio: SENZA ARGOMENTI, quindi
    // con `isCurrent` sul default `() => true`. Resta in volo.
    act(() => { result.current.reload(); });

    // 2) PARTE, DOPO, il reload realtime (evento su liste_viaggio → passa
    // dal debounce di useDebouncedTableSubscription).
    await act(async () => {
      emetti("liste_viaggio");
      await new Promise((r) => setTimeout(r, 250)); // supera il delay di debounce (200ms)
    });

    // 3) Le risposte arrivano in ordine INVERTITO rispetto alla partenza: il
    // realtime (partito 2°, generazione più recente) risponde per PRIMO...
    await act(async () => {
      realtime.list.resolve({ data: [{ id: "REALTIME" }], error: null });
      realtime.listTrash.resolve({ data: [], error: null });
      realtime.saldi.resolve({ data: [], error: null });
      await Promise.resolve();
    });
    expect(result.current.liste).toEqual([{ id: "REALTIME" }]);

    // ...e SOLO DOPO risponde il manuale (partito 1°, generazione superata):
    // deve essere scartato — vince il più recente, non il più veloce.
    await act(async () => {
      manuale.list.resolve({ data: [{ id: "MANUALE-VECCHIO" }], error: null });
      manuale.listTrash.resolve({ data: [], error: null });
      manuale.saldi.resolve({ data: [], error: null });
      await Promise.resolve();
    });
    expect(result.current.liste).toEqual([{ id: "REALTIME" }]);
  });
});

// ─── B · il chiamante dichiara cosa è cambiato ─────────────────────────────
describe("ListeViaggio — un movimento non ricarica l'elenco anche a mano (S-3)", () => {
  const TEAM = [{ id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false }];
  const LISTA = {
    id: "l1", client_id: "cl1", titolo: null, stato: "attiva",
    clients: { name: "MARIO ROSSI" }, lista_beneficiari: [],
  };
  const MOVIMENTO = { id: "m1", data_movimento: "2026-08-01", descrizione: "Acconto", importo: 100, metodo: "bonifico" };

  beforeEach(() => {
    ListeAPIMock.list.mockResolvedValue({ data: [LISTA], error: null });
    ListeAPIMock.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 100, num_movimenti: 1 }], error: null });
    ListeAPIMock.get.mockResolvedValue({ data: LISTA, error: null });
    ListeAPIMock.movimenti.mockResolvedValue({ data: [MOVIMENTO], error: null });
  });

  it("eliminare un movimento ricarica SOLO i saldi: list() e listTrash() non ripartono", async () => {
    render(<ListeViaggio />, { team: TEAM, currentUserId: "marco" });

    await screen.findByText("MARIO ROSSI");
    fireEvent.click(screen.getByText("MARIO ROSSI"));
    await screen.findByText("Acconto");

    // Azzera i conteggi dell'idratazione iniziale e dell'apertura del
    // dettaglio: da qui in poi contano solo le chiamate scatenate
    // dall'eliminazione del movimento.
    vi.clearAllMocks();

    fireEvent.click(screen.getByRole("button", { name: "Elimina movimento" }));
    fireEvent.click(screen.getByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(ListeAPIMock.annullaMovimento).toHaveBeenCalledWith("m1"));
    await waitFor(() => expect(ListeAPIMock.saldi).toHaveBeenCalled());

    // Il cuore della correzione: registrare/eliminare un movimento — l'ope-
    // razione più frequente del modulo — non deve far ripartire l'elenco
    // completo delle liste né il cestino, nemmeno quando il reload parte da
    // un click e non da un evento realtime.
    expect(ListeAPIMock.list).not.toHaveBeenCalled();
    expect(ListeAPIMock.listTrash).not.toHaveBeenCalled();
  });
});

// ─── C · loadDetail: una risposta tardiva non riappare dopo la chiusura ───
// Scenario realistico: la lista è già aperta (il dettaglio è visibile, quindi
// il bottone "torna indietro" esiste), una scrittura fa ripartire anche
// `loadDetail` (onReload ricarica sempre il dettaglio aperto) e QUESTA
// seconda richiesta resta lenta; nel frattempo l'utente chiude la lista
// PRIMA che risponda. Senza il bump esplicito su chiusura, la risposta
// tardiva — la cui generazione non è mai stata superata da una NUOVA
// loadDetail, perché chiudere non ne avvia una — riaprirebbe il dettaglio
// di una lista che l'utente ha già lasciato.
describe("ListeViaggio — loadDetail non sovrascrive il dettaglio dopo la chiusura (S-3)", () => {
  const TEAM = [{ id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false }];
  const LISTA = {
    id: "l1", client_id: "cl1", titolo: null, stato: "attiva",
    clients: { name: "MARIO ROSSI" }, lista_beneficiari: [],
  };

  beforeEach(() => {
    ListeAPIMock.list.mockResolvedValue({ data: [LISTA], error: null });
    ListeAPIMock.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 0, num_movimenti: 0 }], error: null });
  });

  it("la loadDetail avviata prima della chiusura, se risponde dopo, non riapre il dettaglio", async () => {
    // Prima apertura: risolve subito.
    ListeAPIMock.get.mockResolvedValueOnce({ data: LISTA, error: null });
    // Seconda apertura (dal reload dopo la scrittura "Segna ESAURITA"): resta
    // in volo finché non la risolviamo a mano, a lista già chiusa.
    const lenta = deferred();
    ListeAPIMock.get.mockImplementationOnce(() => lenta.promise);

    render(<ListeViaggio />, { team: TEAM, currentUserId: "marco" });

    await screen.findByText("MARIO ROSSI");
    fireEvent.click(screen.getByText("MARIO ROSSI"));
    await screen.findByRole("button", { name: "Segna ESAURITA" });

    // La scrittura fa ripartire anche il dettaglio (onReload -> loadDetail),
    // che questa volta resta pending (`lenta`, saldo 0 → nessuna conferma).
    fireEvent.click(screen.getByRole("button", { name: "Segna ESAURITA" }));
    await waitFor(() => expect(ListeAPIMock.cambiaStato).toHaveBeenCalledWith("l1", "esaurita"));

    // La lista viene chiusa PRIMA che la loadDetail pending risponda.
    fireEvent.click(screen.getByLabelText("Torna a tutte le liste"));

    // Solo ORA arriva la risposta della loadDetail avviata prima della
    // chiusura: non deve poter riaprire il dettaglio.
    await act(async () => {
      lenta.resolve({ data: LISTA, error: null });
      await Promise.resolve();
    });

    // Nessun titolo di lista con ruolo "heading" di primo livello (quello
    // della home resta "Liste viaggio").
    expect(screen.queryByRole("heading", { level: 1, name: "MARIO ROSSI" })).toBeNull();
  });
});
