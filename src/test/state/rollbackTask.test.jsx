// A-1 dell'analisi del 14 novembre · La compensazione di una scrittura task
// non deve ripassare dal controllo di permesso.
//
// Il rollback di UPDATE_TASK era un'altra UPDATE_TASK, giudicata da
// canEditTask sullo stato OTTIMISTICO. Un agente che riassegna un proprio task
// a un collega non è più assegnatario: se la scrittura falliva, il reducer
// negava il rollback e a schermo restava un task riassegnato che il database
// non aveva. Qui si verifica che ROLLBACK_TASK rimetta la riga, sia da solo
// sia nel percorso vero (useReducer + useSyncedDispatch).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReducer } from "react";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  Tasks: {
    update: vi.fn(async () => ({ data: [{ id: "x" }], error: null })),
    leggi: vi.fn(async () => ({ data: null, error: null })),
    create: vi.fn(), createMany: vi.fn(), softDelete: vi.fn(), restore: vi.fn(),
    hardDelete: vi.fn(), hardDeleteMany: vi.fn(),
  },
  Comments: { create: vi.fn() },
  Notices: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), togglePin: vi.fn() },
  Users: {}, Clients: {}, Categories: {}, MessageTemplates: {},
}));

const { Tasks: TasksAPI } = await import("../../lib/api.js");
const { reducer, makeInitialState } = await import("../../state/reducer.js");
const { PERSISTENCE } = await import("../../state/persistence.js");
const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");

const ID = "11111111-2222-4333-8444-555555555555";
const TEAM = [
  { id: "agente1", name: "Sofia", role: "Senior Agent", active: true, pending: false },
  { id: "agente2", name: "Luca", role: "Senior Agent", active: true, pending: false },
];
const taskMio = (over = {}) => ({
  id: ID, title: "Volo Roma", category: "booking", priority: "high", status: "todo",
  assignees: ["agente1"], client: null, praticaRef: null, contact: null,
  dueDate: null, estimatedHours: 1, description: "", deletedAt: null,
  completedAt: null, comments: [{ id: "c1", text: "ciao" }], ...over,
});
const stato = (tasks) => ({
  ...makeInitialState({ team: TEAM, currentUserId: "agente1" }), tasks, toasts: [],
});
const RIASSEGNA = { type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente2"] } };

beforeEach(() => vi.clearAllMocks());

describe("ROLLBACK_TASK nel reducer", () => {
  // Controllo positivo: senza la correzione il rollback è davvero negato.
  // Se questo caso smette di valere, i successivi non provano più nulla.
  it("una UPDATE_TASK di ripristino, dopo la riassegnazione, è negata", () => {
    const dopo = reducer(stato([taskMio()]), RIASSEGNA);
    const ripristino = reducer(dopo, { type: "UPDATE_TASK", payload: taskMio(), meta: { compensazione: true } });
    expect(ripristino.tasks[0].assignees).toEqual(["agente2"]);
  });

  it("riporta gli assegnatari anche se il task non è più dell'utente", () => {
    const prima = stato([taskMio()]);
    const dopo = reducer(prima, RIASSEGNA);
    const undo = PERSISTENCE.UPDATE_TASK.rollback(prima, RIASSEGNA, { error: { message: "rete" } });
    expect(undo.type).toBe("ROLLBACK_TASK");
    const tornato = reducer(dopo, { ...undo, meta: { compensazione: true } });
    expect(tornato.tasks[0].assignees).toEqual(["agente1"]);
    expect(tornato.toasts).toBe(dopo.toasts);
  });

  it("tiene i commenti arrivati durante la scrittura", () => {
    const prima = stato([taskMio()]);
    const conCommento = reducer(reducer(prima, RIASSEGNA), {
      type: "MERGE_TASK_COMMENTS",
      payload: { taskIds: [ID], comments: { [ID]: [{ id: "c1", text: "ciao" }, { id: "c2", text: "nuovo" }] } },
    });
    const tornato = reducer(conCommento, { type: "ROLLBACK_TASK", payload: taskMio(), meta: { compensazione: true } });
    expect(tornato.tasks[0].comments.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("allinea il task aperto nel pannello", () => {
    const prima = { ...stato([taskMio()]) };
    const aperto = reducer(prima, { type: "SET_SELECTED_TASK", payload: prima.tasks[0] });
    const dopo = reducer(aperto, RIASSEGNA);
    const tornato = reducer(dopo, { type: "ROLLBACK_TASK", payload: taskMio(), meta: { compensazione: true } });
    expect(tornato.selectedTask).toBe(tornato.tasks[0]);
    expect(tornato.selectedTask.assignees).toEqual(["agente1"]);
  });

  it("ignora un task che non c'è più e un payload senza id", () => {
    const s = stato([taskMio()]);
    expect(reducer(s, { type: "ROLLBACK_TASK", payload: taskMio({ id: "altro" }) })).toBe(s);
    expect(reducer(s, { type: "ROLLBACK_TASK", payload: null })).toBe(s);
  });
});

describe("il percorso vero: useReducer + useSyncedDispatch", () => {
  function setup(tasks) {
    return renderHook(() => {
      const [s, rawDispatch] = useReducer(reducer, stato(tasks));
      const dispatch = useSyncedDispatch(s, rawDispatch, { enabled: true });
      return { s, dispatch };
    });
  }

  it("riassegnazione respinta dal server: il task torna all'agente", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    const { result } = setup([taskMio()]);
    let esito;
    await act(async () => { esito = await result.current.dispatch(RIASSEGNA); });
    expect(esito.error).toBeTruthy();
    expect(result.current.s.tasks[0].assignees).toEqual(["agente1"]);
    expect(result.current.s.toasts.some(t => t.type === "error")).toBe(true);
  });

  it("conflitto: si vede la versione del server anche se localmente il task non è più mio", async () => {
    // L'agente riassegna a Luca; intanto un collega aveva già cambiato il titolo.
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    TasksAPI.leggi.mockResolvedValueOnce({
      data: {
        id: ID, title: "Volo Parigi", category: "booking", priority: "high", status: "todo",
        assignees: ["agente1"], client_id: null, pratica_ref: null, contact: null,
        due_date: null, estimated_hours: 1, description: null, deleted_at: null, completed_at: null,
      },
      error: null,
    });
    const { result } = setup([taskMio()]);
    await act(async () => {
      await result.current.dispatch({ type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente2"], title: "Volo Roma" } });
    });
    expect(result.current.s.tasks[0].title).toBe("Volo Parigi");
    expect(result.current.s.tasks[0].assignees).toEqual(["agente1"]);
  });
});
