// Criticità #6, lato sorgente: useAppHydration espone un flag di caricamento
// per OGNI entità, non solo per il CRM.
//
// PERCHÉ ESISTE. Il flag esisteva per i soli clienti (`caricamentoClienti`, sessione
// 23). Tutte le altre entità — task, avvisi, categorie, team — arrivavano
// nelle viste come array vuoti indistinguibili da "il database non ha niente",
// ed è così che la Dashboard finiva per affermare "Nessuna task in scadenza"
// su dati non ancora caricati.
//
// Due proprietà, entrambe non ovvie:
//   1. il flag si chiude sul SUCCESSO del primo fetch;
//   2. si chiude anche sull'ERRORE. Uno scheletro che gira per sempre è
//      disonesto quanto un vuoto dichiarato troppo presto: dopo un errore il
//      canale è il toast, e sotto va mostrato ciò che si è riusciti a caricare.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const handlers = new Map();
const vuoto = { data: [], error: null };

// Risposte pilotate dal singolo test: `differita()` restituisce una promise che
// resta pendente finché il test non la risolve — è l'unico modo di osservare
// la finestra di caricamento, che in condizioni normali dura un istante.
const differita = () => {
  let risolvi;
  const promise = new Promise((res) => { risolvi = res; });
  return { promise, risolvi };
};

let rispostaTasks = Promise.resolve(vuoto);

vi.mock("../lib/api.js", () => ({
  subscribeToTable: vi.fn((tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  }),
  Tasks: { list: vi.fn(() => rispostaTasks) },
  Notices: { list: vi.fn(async () => vuoto) },
  Categories: { list: vi.fn(async () => vuoto) },
  TaskThreads: { comments: vi.fn(async () => vuoto), history: vi.fn(async () => vuoto) },
  Users: { listAll: vi.fn(async () => vuoto), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(async () => vuoto) },
  MessageTemplates: { list: vi.fn(async () => vuoto) },
}));

const { useAppHydration } = await import("../hooks/useAppHydration.js");
const { Users: UsersAPI } = await import("../lib/api.js");

const monta = (over = {}) => renderHook(() => useAppHydration({
  enabled: true, currentUserId: "u1", dispatch: vi.fn(), onError: vi.fn(), ...over,
}));

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  rispostaTasks = Promise.resolve(vuoto);
});

describe("useAppHydration — un flag di caricamento per entità", () => {
  it("con enabled i flag nascono tutti aperti e si chiudono a idratazione finita", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    expect(result.current.caricamento).toEqual({
      tasks: false, notices: false, categories: false, team: false, clients: false,
      messageTemplates: false,
    });
  });

  it("senza login (enabled=false) nascono già chiusi: si usano i mock, non c'è nulla da attendere", () => {
    const { result } = monta({ enabled: false, currentUserId: null });
    expect(result.current.caricamento).toEqual({
      tasks: false, notices: false, categories: false, team: false, clients: false,
      messageTemplates: false,
    });
    expect(result.current.caricamentoClienti).toBe(false);
    expect(handlers.size).toBe(0);
  });

  it("il flag dei task resta aperto finché la query è in volo", async () => {
    const { promise, risolvi } = differita();
    rispostaTasks = promise;
    const { result } = monta();

    // Le altre entità hanno già risposto: il flag è per-entità, non un unico
    // interruttore globale — chi ha i dati li mostra subito.
    await waitFor(() => expect(result.current.caricamento.notices).toBe(false));
    expect(result.current.caricamento.tasks).toBe(true);

    await act(async () => { risolvi(vuoto); });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
  });

  it("anche un fetch FALLITO chiude il flag: niente scheletro perpetuo", async () => {
    rispostaTasks = Promise.resolve({ data: null, error: { message: "rete assente" } });
    const onError = vi.fn();
    const { result } = monta({ onError });

    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    // L'errore ha comunque il suo canale.
    expect(onError).toHaveBeenCalled();
  });

  it("caricamentoClienti resta l'alias di caricamento.clients", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamentoClienti).toBe(false));
    expect(result.current.caricamentoClienti).toBe(result.current.caricamento.clients);
  });

  it("l'oggetto loading conserva la sua identità fra i reload realtime", async () => {
    // Le viste sono `memo`: un oggetto nuovo a ogni evento postgres le
    // sveglierebbe tutte senza che nulla sia cambiato per loro.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    const primo = result.current.caricamento;

    await act(async () => {
      handlers.get("tasks")?.({ eventType: "INSERT", new: {} });
      await new Promise(r => setTimeout(r, 250)); // oltre il debounce (200ms)
    });

    expect(result.current.caricamento).toBe(primo);
  });
});

// ─── B-1 (audit di architettura del 16 agosto) · `users` non si rilegge ────
// All'avvio `AuthContext.loadProfile` legge `users` per intero — deve, perché
// decide SE montare l'app (caveat #17) — e pochi millisecondi dopo
// l'idratazione la rileggeva identica: due query uguali a un round-trip di
// distanza, su ogni avvio di sessione.
//
// Le tre proprietà qui sotto sono INSEPARABILI, ed è il motivo per cui stanno
// nello stesso describe: saltare il fetch senza chiudere il flag di
// caricamento lascerebbe la vista Team a girare per sempre sotto uno
// scheletro, che è un difetto peggiore della query risparmiata.
describe("useAppHydration — il team già caricato non si rilegge (B-1)", () => {
  const TEAM = [{ id: "u1", name: "Marco", role: "admin", active: true, pending: false }];

  it("con `teamIniziale` NON chiama Users.listAll al mount", async () => {
    const { result } = monta({ teamIniziale: TEAM });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    expect(UsersAPI.listAll).not.toHaveBeenCalled();
  });

  it("…ma il flag del team si chiude lo stesso: i dati ci sono già", async () => {
    const { result } = monta({ teamIniziale: TEAM });
    await waitFor(() => expect(result.current.caricamento.team).toBe(false));
  });

  it("…e la sottoscrizione realtime parte comunque", async () => {
    // Saltare il primo fetch non deve saltare il canale: senza, l'admin che
    // approva un utente non vedrebbe più aggiornarsi l'elenco Team.
    const { result } = monta({ teamIniziale: TEAM });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    expect(handlers.has("users")).toBe(true);
  });

  it("un evento realtime rilegge il team: si salta il PRIMO fetch, non tutti", async () => {
    const { result } = monta({ teamIniziale: TEAM });
    await waitFor(() => expect(result.current.caricamento.team).toBe(false));
    expect(UsersAPI.listAll).not.toHaveBeenCalled();

    await act(async () => {
      handlers.get("users")?.({ eventType: "INSERT", new: { id: "u2" } });
    });
    await waitFor(() => expect(UsersAPI.listAll).toHaveBeenCalled());
  });

  it("senza `teamIniziale` il comportamento è quello di prima", async () => {
    // Il controllo positivo: senza, i test sopra passerebbero anche con una
    // condizione che salta SEMPRE il fetch.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.team).toBe(false));
    expect(UsersAPI.listAll).toHaveBeenCalled();
  });
});
