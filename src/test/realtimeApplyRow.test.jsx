// useDebouncedTableSubscription — il parametro `applyRow`.
//
// Suggerimento strategico n.1 dell'audit del 16 agosto: prima di questa
// opzione, ogni evento realtime che alimentava il debounce finiva SEMPRE in
// un reload — parziale (solo le tabelle toccate, già ottimizzato da A-1
// dell'8 agosto) o completo, ma sempre una query. `applyRow` è il gradino
// sotto: un evento che porta già la riga nel proprio payload può essere
// gestito SENZA alcuna query, se il chiamante lo dichiara ritornando `true`.
//
// Questo file blinda il contratto a livello di HOOK, isolato da
// useAppHydration: chi lo consuma (le tre sottoscrizioni di tasks/notices/
// clients) è testato in realtimeGranularita.test.jsx, con le reali
// dipendenze del progetto (fromDbTask/fromDbNotice/fromDbClient, dispatch).
// Qui interessa solo: se applyRow dice "gestito", il reload non parte MAI —
// né subito, né dopo il debounce, né coalescendo con un altro evento.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload = { eventType: "UPDATE", new: {} }) =>
  handlers.get(tabella)?.(payload);

vi.mock("../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
}));

const { useDebouncedTableSubscription } = await import("../hooks/useDebouncedTableSubscription.js");

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
});

describe("useDebouncedTableSubscription — applyRow", () => {
  it("quando applyRow ritorna true, l'evento non genera alcun reload", async () => {
    const reload = vi.fn();
    const applyRow = vi.fn(() => true);
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 5, applyRow }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1)); // idratazione iniziale, sempre completa

    await act(async () => {
      emetti("tasks", { eventType: "UPDATE", new: { id: "t1" } });
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(applyRow).toHaveBeenCalledWith("tasks", { eventType: "UPDATE", new: { id: "t1" } });
    // Nessun secondo reload: l'evento non è mai entrato nel debounce.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("quando applyRow ritorna false, il comportamento è quello di sempre: reload dopo il debounce", async () => {
    const reload = vi.fn();
    const applyRow = vi.fn(() => false);
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 5, applyRow }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("tasks");
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("senza applyRow, il comportamento è invariato (nessuna regressione sui nove call site esistenti)", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 5 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("tasks");
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("una sottoscrizione a più tabelle decide PER TABELLA: alcune per riga, altre a reload", async () => {
    // Lo shape esatto di useAppHydration per tasks/comments/task_history:
    // `tasks` applicato per riga, le due tabelle figlie restano sul reload
    // selettivo esistente (SET_TASK_THREADS).
    const reload = vi.fn();
    const applyRow = vi.fn((tbl) => tbl === "tasks");
    renderHook(() => useDebouncedTableSubscription(
      ["tasks", "comments"], reload, { enabled: true, delay: 5, applyRow },
    ));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("tasks");
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(reload).toHaveBeenCalledTimes(1); // tasks: gestito, niente reload

    await act(async () => {
      emetti("comments");
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(reload).toHaveBeenCalledTimes(2); // comments: applyRow dice false, reload parte
    expect([...reload.mock.calls[1][1]]).toEqual(["comments"]);
  });

  it("applyRow non viene MAI chiamato per l'idratazione iniziale né per la ripresa completa", async () => {
    // Sono gli eventi che passano `tabelle = null` a reload direttamente,
    // bypassando `debounced()` — dove applyRow vive — per costruzione: non
    // c'è un payload da applicare, solo l'incertezza su cosa si è perso.
    const reload = vi.fn();
    const applyRow = vi.fn(() => true);
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 5, applyRow }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(applyRow).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(2);
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  it("un applyRow che solleva non blocca la sottoscrizione: propaga, come un reload che rigetta", () => {
    // Nessuna garanzia speciale qui: applyRow gira nel corpo sincrono
    // dell'handler realtime, come filterEvent già faceva. Non è testato un
    // comportamento nuovo, solo che non ne è stato aggiunto uno silenzioso
    // (un try/catch che inghiottirebbe un errore di programmazione).
    const reload = vi.fn();
    const applyRow = vi.fn(() => { throw new Error("bug in applyRow"); });
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 5, applyRow }));
    expect(() => emetti("tasks")).toThrow("bug in applyRow");
  });
});
