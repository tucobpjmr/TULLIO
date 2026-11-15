// useSyncedDispatch — M-1 e M-3 dell'audit del 15 novembre.
//
// M-3: due scritture sulla stessa riga partono una dopo l'altra, non insieme.
// M-1: a scrittura riuscita si applica la riga restituita dal server, che
// contiene anche la modifica di un collega scartata mentre la riga era in volo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks: { create: vi.fn(ok), update: vi.fn(ok), leggi: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok) },
    Comments: {}, Notices: {}, Clients: {}, Categories: {}, MessageTemplates: {}, Users: {},
  };
});

const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");
const { makeInitialState } = await import("../../state/reducer.js");
const { Tasks: TasksAPI } = await import("../../lib/api.js");
const { PERSISTENCE } = await import("../../state/persistence.js");

const TEAM = [{ id: "admin1", name: "Admin", role: "Admin", active: true, pending: false }];
const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;
const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: [], comments: [], ...over,
});
const rigaDb = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: [], ...over,
});

function setup(tasks = [task()]) {
  const rawDispatch = vi.fn();
  const state = { ...makeInitialState({ team: TEAM, currentUserId: "admin1" }), tasks, toasts: [] };
  const { result } = renderHook(() => useSyncedDispatch(state, rawDispatch));
  return { dispatch: result.current, rawDispatch };
}

const rinviata = () => {
  let risolvi;
  const promessa = new Promise((r) => { risolvi = r; });
  return { promessa, risolvi };
};
const tipi = (rawDispatch) => rawDispatch.mock.calls.map(([a]) => a.type);

beforeEach(() => { vi.clearAllMocks(); });

describe("M-3 · scritture in fila per riga", () => {
  it("la seconda modifica allo stesso task parte solo dopo l'esito della prima", async () => {
    const prima = rinviata();
    TasksAPI.update
      .mockImplementationOnce(() => prima.promessa)
      .mockImplementationOnce(() => Promise.resolve({ data: [rigaDb({ title: "B" })], error: null }));
    const { dispatch } = setup();

    let p1, p2;
    await act(async () => {
      p1 = dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "A" } });
      p2 = dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "B" } });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(TasksAPI.update).toHaveBeenCalledTimes(1);

    await act(async () => {
      prima.risolvi({ data: [rigaDb({ title: "A" })], error: null });
      await p1; await p2;
    });
    expect(TasksAPI.update).toHaveBeenCalledTimes(2);
    // La seconda si aspetta il valore scritto dalla prima: niente falso conflitto.
    expect(TasksAPI.update.mock.calls[1][2]).toEqual({ attesi: { title: "A" } });
  });

  it("task diversi non si aspettano", async () => {
    const prima = rinviata();
    TasksAPI.update
      .mockImplementationOnce(() => prima.promessa)
      .mockImplementationOnce(() => Promise.resolve({ data: [rigaDb({ id: uuid(2) })], error: null }));
    const { dispatch } = setup([task(), task({ id: uuid(2) })]);

    await act(async () => {
      dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "A" } });
      dispatch({ type: "UPDATE_TASK", payload: { id: uuid(2), title: "B" } });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(TasksAPI.update).toHaveBeenCalledTimes(2);
    await act(async () => { prima.risolvi({ data: [rigaDb()], error: null }); });
  });

  it("se la prima fallisce, la seconda parte comunque e il rollback tocca solo i campi della prima", async () => {
    TasksAPI.update
      .mockImplementationOnce(() => Promise.resolve({ data: null, error: { message: "rifiutata" } }))
      .mockImplementationOnce(() => Promise.resolve({ data: [rigaDb({ priority: "low" })], error: null }));
    const { dispatch, rawDispatch } = setup();

    let esiti;
    await act(async () => {
      esiti = await Promise.all([
        dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "A" } }),
        dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), priority: "low" } }),
      ]);
    });
    expect(esiti[0].error).toBeTruthy();
    expect(esiti[1]).toEqual({ error: null });
    const compensazione = rawDispatch.mock.calls.map(([a]) => a)
      .find((a) => a.meta?.compensazione);
    expect(compensazione.payload).toEqual({ id: uuid(1), title: "Volo Roma" });
  });
});

it("il rollback di un cambio di stato rimette anche completedAt", () => {
  const state = { ...makeInitialState({ team: TEAM, currentUserId: "admin1" }), tasks: [task({ completedAt: null })] };
  const action = { type: "UPDATE_TASK", payload: { id: uuid(1), status: "done" } };
  expect(PERSISTENCE.UPDATE_TASK.rollback(state, action))
    .toEqual({ type: "UPDATE_TASK", payload: { id: uuid(1), status: "todo", completedAt: null } });
});

describe("M-1 · riga restituita dal server", () => {
  it("a scrittura riuscita applica la riga del server, dopo lo smarcamento", async () => {
    // Il collega ha cambiato la priorità mentre la nostra scrittura era in volo.
    TasksAPI.update.mockResolvedValueOnce({ data: [rigaDb({ title: "A", priority: "low" })], error: null });
    const { dispatch, rawDispatch } = setup();

    await act(async () => { await dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "A" } }); });

    const t = tipi(rawDispatch);
    expect(t.indexOf("MERGE_TASK_ROW")).toBeGreaterThan(t.lastIndexOf("UNMARK_PENDING_WRITE"));
    const merge = rawDispatch.mock.calls.map(([a]) => a).find((a) => a.type === "MERGE_TASK_ROW");
    expect(merge.payload).toMatchObject({ eventType: "UPDATE", id: uuid(1), row: { title: "A", priority: "low" } });
  });

  it("vale anche per MOVE_TASK", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: [rigaDb({ status: "done" })], error: null });
    const { dispatch, rawDispatch } = setup();
    await act(async () => { await dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } }); });
    expect(tipi(rawDispatch)).toContain("MERGE_TASK_ROW");
  });

  it("niente riga se la scrittura fallisce o il server non la restituisce", async () => {
    TasksAPI.update
      .mockResolvedValueOnce({ data: null, error: { message: "rifiutata" } });
    const { dispatch, rawDispatch } = setup();
    await act(async () => { await dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "A" } }); });
    await act(async () => { await dispatch({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(tipi(rawDispatch)).not.toContain("MERGE_TASK_ROW");
  });
});
