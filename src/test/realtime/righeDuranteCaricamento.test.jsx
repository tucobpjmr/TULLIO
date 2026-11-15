// M-2 del 15 novembre · Una riga realtime arrivata MENTRE lo storico task o
// l'anagrafica clienti si caricano su richiesta non viene cancellata dallo
// snapshot, che può essere più vecchio: chi lo consegna la riapplica sopra.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const vuoto = { data: [], error: null };
const risposta = async () => vuoto;
let rispostaTasks = () => Promise.resolve(vuoto);
let rispostaClienti = () => Promise.resolve(vuoto);

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: vi.fn((tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  }),
  Tasks: { list: vi.fn((o) => rispostaTasks(o)) },
  Notices: { list: vi.fn(risposta) },
  Categories: { list: vi.fn(risposta) },
  TaskThreads: { comments: vi.fn(risposta), history: vi.fn(risposta) },
  Users: { listAll: vi.fn(risposta), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(() => rispostaClienti()) },
  MessageTemplates: { list: vi.fn(risposta) },
}));

const { useAppHydration } = await import("../../hooks/useAppHydration.js");

const differita = () => {
  let risolvi;
  const promise = new Promise((res) => { risolvi = res; });
  return { promise, risolvi };
};

const monta = (dispatch) => renderHook(() => useAppHydration({
  enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
}));

const tipi = (dispatch) => dispatch.mock.calls.map(([a]) => a.type);

beforeEach(() => {
  handlers.clear();
  rispostaTasks = () => Promise.resolve(vuoto);
  rispostaClienti = () => Promise.resolve(vuoto);
});

describe("M-2 · righe realtime durante un caricamento su richiesta", () => {
  it("storico task: la riga arrivata in volo si riapplica dopo lo snapshot", async () => {
    const dispatch = vi.fn();
    const { result } = monta(dispatch);
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const { promise, risolvi } = differita();
    rispostaTasks = () => promise;
    let inVolo;
    act(() => { inVolo = result.current.storicoTask.richiedi(); });

    act(() => {
      handlers.get("tasks")({ eventType: "UPDATE", new: { id: "t-1", title: "nuovo", status: "todo" } });
    });
    dispatch.mockClear();

    await act(async () => {
      risolvi({ data: [{ id: "t-1", title: "vecchio", status: "todo" }], error: null });
      await inVolo;
    });

    expect(tipi(dispatch).slice(0, 2)).toEqual(["SET_TASKS", "MERGE_TASK_ROW"]);
    const merge = dispatch.mock.calls[1][0];
    expect(merge.payload).toMatchObject({ eventType: "UPDATE", id: "t-1", row: { title: "nuovo" } });
  });

  it("storico task: senza eventi in volo si consegna solo lo snapshot", async () => {
    const dispatch = vi.fn();
    const { result } = monta(dispatch);
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    dispatch.mockClear();

    await act(async () => { await result.current.storicoTask.richiedi(); });

    expect(tipi(dispatch)).toContain("SET_TASKS");
    expect(tipi(dispatch)).not.toContain("MERGE_TASK_ROW");
  });

  it("anagrafica: una DELETE arrivata in volo non viene riportata in vita", async () => {
    const dispatch = vi.fn();
    const { result } = monta(dispatch);
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const { promise, risolvi } = differita();
    rispostaClienti = () => promise;
    let inVolo;
    act(() => { inVolo = result.current.clientiCompleti.richiedi(); });

    act(() => { handlers.get("clients")({ eventType: "DELETE", old: { id: "c-1" } }); });
    dispatch.mockClear();

    await act(async () => {
      risolvi({ data: [{ id: "c-1", name: "Rossi" }], error: null });
      await inVolo;
    });

    expect(tipi(dispatch).slice(0, 2)).toEqual(["SET_CLIENTS", "MERGE_CLIENT_ROW"]);
    expect(dispatch.mock.calls[1][0].payload).toEqual({ eventType: "DELETE", id: "c-1" });
  });
});
