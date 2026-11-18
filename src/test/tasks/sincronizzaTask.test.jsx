// La ripresa dei task per DIFFERENZA (hooks/sincronizzaTask.js).
//
// Prima, al ritorno in primo piano dopo 30 s o dopo un buco di rete, si
// rileggevano tutti i task con i commenti. Ora: i task cambiati dal cursore,
// gli id dell'insieme (per le sparizioni) e gli id dei commenti (per i
// thread). Ogni dubbio ricade sulla lettura intera.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const ok = (data) => ({ data, error: null });
const vuoto = async () => ok([]);

const TasksAPI = { list: vi.fn(), ids: vi.fn(), modificatiDal: vi.fn() };
const TaskThreadsAPI = { comments: vi.fn(vuoto), commentsForTasks: vi.fn(), idsCommenti: vi.fn() };

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: vi.fn((tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  }),
  Tasks: TasksAPI,
  TaskThreads: TaskThreadsAPI,
  Notices: { list: vi.fn(vuoto) },
  Categories: { list: vi.fn(vuoto) },
  Users: { listAll: vi.fn(vuoto), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(vuoto) },
  MessageTemplates: { list: vi.fn(vuoto) },
}));

const { sincronizzaTask, cursoreDa, MARGINE_CURSORE_MS } = await import("../../hooks/sincronizzaTask.js");
const { useAppHydration } = await import("../../hooks/useAppHydration.js");
const { reducer, makeInitialState } = await import("../../state/reducer.js");

const riga = (id, updated_at = "2026-11-18T10:00:00Z", comments = []) =>
  ({ id, title: id, status: "todo", assignees: [], updated_at, comments });
const inStato = (id, commentIds = []) =>
  ({ id, title: id, comments: commentIds.map((c) => ({ id: c })) });
const FILTRO = { includeDeleted: false, completeDal: null };
const sempre = () => true;

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  TasksAPI.ids.mockResolvedValue(ok([{ id: "a" }, { id: "b" }]));
  TasksAPI.modificatiDal.mockResolvedValue(ok([]));
  TaskThreadsAPI.idsCommenti.mockResolvedValue(ok([]));
  TaskThreadsAPI.commentsForTasks.mockResolvedValue(ok([]));
});

describe("cursoreDa", () => {
  it("prende il più recente updated_at, o tiene il precedente", () => {
    expect(cursoreDa([riga("a", "2026-11-18T09:00:00Z"), riga("b", "2026-11-18T10:00:00Z")]))
      .toBe("2026-11-18T10:00:00.000Z");
    expect(cursoreDa([], "2026-11-18T08:00:00.000Z")).toBe("2026-11-18T08:00:00.000Z");
    expect(cursoreDa([riga("a", "2026-11-18T07:00:00Z")], "2026-11-18T08:00:00.000Z"))
      .toBe("2026-11-18T08:00:00.000Z");
    expect(cursoreDa([])).toBeNull();
  });
});

describe("sincronizzaTask", () => {
  it("chiede la differenza dal cursore MENO il margine", async () => {
    await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO,
      taskInStato: () => [inStato("a"), inStato("b")], isCurrent: sempre,
    });
    const dal = TasksAPI.modificatiDal.mock.calls[0][0];
    expect(Date.parse("2026-11-18T10:00:00Z") - Date.parse(dal)).toBe(MARGINE_CURSORE_MS);
    expect(dal).not.toMatch(/\.\d{3}Z$/);
  });

  it("porta le righe cambiate, gli id e il cursore nuovo", async () => {
    TasksAPI.modificatiDal.mockResolvedValue(ok([riga("b", "2026-11-18T11:00:00Z")]));
    const r = await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO,
      taskInStato: () => [inStato("a"), inStato("b")], isCurrent: sempre,
    });
    expect(r.esito).toBe("ok");
    expect(r.payload.ids).toEqual(["a", "b"]);
    expect(r.payload.righe.map((t) => t.id)).toEqual(["b"]);
    expect(r.cursore).toBe("2026-11-18T11:00:00.000Z");
    expect(TaskThreadsAPI.commentsForTasks).not.toHaveBeenCalled();
  });

  it("rilegge solo i thread che non coincidono, e scrive vuoto un thread svuotato", async () => {
    TaskThreadsAPI.idsCommenti.mockResolvedValue(ok([{ id: "c1", task_id: "a" }, { id: "c9", task_id: "a" }]));
    TaskThreadsAPI.commentsForTasks.mockResolvedValue(ok([
      { id: "c1", task_id: "a", text: "x", created_at: "2026-11-18T09:00:00Z" },
      { id: "c9", task_id: "a", text: "y", created_at: "2026-11-18T09:30:00Z" },
    ]));
    const r = await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO,
      taskInStato: () => [inStato("a", ["c1"]), inStato("b", ["c2"])], isCurrent: sempre,
    });
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledWith(["a", "b"]);
    expect(r.payload.commenti.a.map((c) => c.id)).toEqual(["c1", "c9"]);
    expect(r.payload.commenti.b).toEqual([]);
  });

  it("un id che lo stato non conosce e la differenza non porta → lettura intera", async () => {
    TasksAPI.ids.mockResolvedValue(ok([{ id: "a" }, { id: "nuovo" }]));
    const r = await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO,
      taskInStato: () => [inStato("a")], isCurrent: sempre,
    });
    expect(r.esito).toBe("completo");
  });

  it("una lettura fallita → lettura intera; un giro superato → niente", async () => {
    TasksAPI.ids.mockResolvedValue({ data: null, error: { message: "rete" } });
    const fallita = await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO, taskInStato: () => [], isCurrent: sempre,
    });
    expect(fallita.esito).toBe("completo");

    const superata = await sincronizzaTask({
      cursore: "2026-11-18T10:00:00.000Z", filtro: FILTRO, taskInStato: () => [], isCurrent: () => false,
    });
    expect(superata.esito).toBe("superato");
  });
});

describe("reducer — SINCRONIZZA_TASK", () => {
  const base = () => {
    const s = makeInitialState({ team: [{ id: "u1", role: "admin", active: true }], currentUserId: "u1" });
    return { ...s, tasks: [inStato("a", ["c1"]), inStato("b"), inStato("sparito")] };
  };

  it("segue l'ordine degli id, toglie gli spariti, sostituisce righe e thread", () => {
    const next = reducer(base(), {
      type: "SINCRONIZZA_TASK",
      payload: { ids: ["b", "a"], righe: [{ id: "b", title: "nuovo", comments: [] }], commenti: { a: [] } },
    });
    expect(next.tasks.map((t) => t.id)).toEqual(["b", "a"]);
    expect(next.tasks[0].title).toBe("nuovo");
    expect(next.tasks[1].comments).toEqual([]);
  });

  it("una riga con una scrittura in volo resta quella locale", () => {
    const next = reducer(base(), {
      type: "SINCRONIZZA_TASK",
      payload: { ids: ["a", "b"], righe: [{ id: "b", title: "server", comments: [] }], commenti: {} },
      inVolo: new Map([["b", 1]]),
    });
    expect(next.tasks.find((t) => t.id === "b").title).toBe("b");
  });
});

describe("useAppHydration — la ripresa chiede la differenza", () => {
  const riconnetti = async () => {
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 400));
    });
  };

  it("dopo la prima lettura intera, la riconnessione non rilegge tutto", async () => {
    TasksAPI.list.mockResolvedValue(ok([riga("a"), riga("b")]));
    const dispatch = vi.fn();
    const leggiTask = () => [inStato("a"), inStato("b")];
    renderHook(() => useAppHydration({ enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(), leggiTask }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASKS" })));

    await riconnetti();

    expect(TasksAPI.list).toHaveBeenCalledTimes(1);
    expect(TasksAPI.modificatiDal).toHaveBeenCalledTimes(1);
    expect(TasksAPI.modificatiDal.mock.calls[0][0]).toBe("2026-11-18T09:58:00Z");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SINCRONIZZA_TASK" }));
  });

  it("se la differenza non basta, ricade sulla lettura intera", async () => {
    TasksAPI.list.mockResolvedValue(ok([riga("a")]));
    TasksAPI.ids.mockResolvedValue(ok([{ id: "a" }, { id: "ignoto" }]));
    const dispatch = vi.fn();
    renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(), leggiTask: () => [inStato("a")],
    }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));

    await riconnetti();

    expect(TasksAPI.list).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SINCRONIZZA_TASK" }));
  });

  it("senza leggiTask resta la lettura intera di sempre", async () => {
    TasksAPI.list.mockResolvedValue(ok([riga("a")]));
    renderHook(() => useAppHydration({ enabled: true, currentUserId: "u1", dispatch: vi.fn(), onError: vi.fn() }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));

    await riconnetti();

    expect(TasksAPI.list).toHaveBeenCalledTimes(2);
    expect(TasksAPI.modificatiDal).not.toHaveBeenCalled();
  });
});
