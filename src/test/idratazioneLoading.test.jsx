// Criticità #6, lato sorgente: useAppHydration espone un flag di caricamento
// per OGNI entità, non solo per il CRM.
//
// PERCHÉ ESISTE. Il flag esisteva per i soli clienti (`crmLoading`, sessione
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
}));

const { useAppHydration } = await import("../hooks/useAppHydration.js");

const monta = (over = {}) => renderHook(() => useAppHydration({
  enabled: true, currentUserId: "u1", dispatch: vi.fn(), onError: vi.fn(), ...over,
}));

beforeEach(() => {
  handlers.clear();
  rispostaTasks = Promise.resolve(vuoto);
});

describe("useAppHydration — un flag di caricamento per entità", () => {
  it("con enabled i flag nascono tutti aperti e si chiudono a idratazione finita", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.loading.tasks).toBe(false));
    expect(result.current.loading).toEqual({
      tasks: false, notices: false, categories: false, team: false, clients: false,
    });
  });

  it("senza login (enabled=false) nascono già chiusi: si usano i mock, non c'è nulla da attendere", () => {
    const { result } = monta({ enabled: false, currentUserId: null });
    expect(result.current.loading).toEqual({
      tasks: false, notices: false, categories: false, team: false, clients: false,
    });
    expect(result.current.crmLoading).toBe(false);
    expect(handlers.size).toBe(0);
  });

  it("il flag dei task resta aperto finché la query è in volo", async () => {
    const { promise, risolvi } = differita();
    rispostaTasks = promise;
    const { result } = monta();

    // Le altre entità hanno già risposto: il flag è per-entità, non un unico
    // interruttore globale — chi ha i dati li mostra subito.
    await waitFor(() => expect(result.current.loading.notices).toBe(false));
    expect(result.current.loading.tasks).toBe(true);

    await act(async () => { risolvi(vuoto); });
    await waitFor(() => expect(result.current.loading.tasks).toBe(false));
  });

  it("anche un fetch FALLITO chiude il flag: niente scheletro perpetuo", async () => {
    rispostaTasks = Promise.resolve({ data: null, error: { message: "rete assente" } });
    const onError = vi.fn();
    const { result } = monta({ onError });

    await waitFor(() => expect(result.current.loading.tasks).toBe(false));
    // L'errore ha comunque il suo canale.
    expect(onError).toHaveBeenCalled();
  });

  it("crmLoading resta l'alias di loading.clients", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.crmLoading).toBe(false));
    expect(result.current.crmLoading).toBe(result.current.loading.clients);
  });

  it("l'oggetto loading conserva la sua identità fra i reload realtime", async () => {
    // Le viste sono `memo`: un oggetto nuovo a ogni evento postgres le
    // sveglierebbe tutte senza che nulla sia cambiato per loro.
    const { result } = monta();
    await waitFor(() => expect(result.current.loading.tasks).toBe(false));
    const primo = result.current.loading;

    await act(async () => {
      handlers.get("tasks")?.({ eventType: "INSERT", new: {} });
      await new Promise(r => setTimeout(r, 250)); // oltre il debounce (200ms)
    });

    expect(result.current.loading).toBe(primo);
  });
});
