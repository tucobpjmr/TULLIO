import { describe, it, expect, beforeEach } from "vitest";
import { reducer, makeInitialState } from "../state/reducer.js";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";

// Team di prova: un admin (marco) e una junior agent (gina). Le funzioni di
// permesso del reducer leggono i globali TEAM/CURRENT_USER via appGlobals, quindi
// li impostiamo prima di costruire lo state.
const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina", role: "junior agent", active: true, pending: false },
];

const UUID = "11111111-2222-4333-8444-555555555555";

function freshState(uid = "marco") {
  setTeam(TEAM_FIXTURE.map(m => ({ ...m })));
  setCurrentUser(uid);
  return makeInitialState({ team: TEAM_FIXTURE, currentUserId: uid });
}

const task = (over = {}) => ({
  id: UUID, title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["marco"], comments: [], ...over,
});

describe("reducer — task lifecycle (admin)", () => {
  let s;
  beforeEach(() => { s = freshState("marco"); });

  it("ADD_TASK inserisce in testa con toast di successo", () => {
    const next = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe(UUID);
    expect(next.toast.type).toBe("success");
  });

  it("MOVE_TASK cambia lo status del task indicato", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    const next = reducer(s, { type: "MOVE_TASK", payload: { taskId: UUID, newStatus: "done" } });
    expect(next.tasks[0].status).toBe("done");
  });

  it("UPDATE_TASK applica il patch e sincronizza selectedTask", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    s = { ...s, selectedTask: s.tasks[0] };
    const next = reducer(s, { type: "UPDATE_TASK", payload: { id: UUID, title: "Nuovo titolo" } });
    expect(next.tasks[0].title).toBe("Nuovo titolo");
    expect(next.selectedTask.title).toBe("Nuovo titolo");
  });

  it("DELETE_TASK → RESTORE_TASK → PURGE_TASK", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    expect(s.tasks[0].deletedAt).toBeTruthy();
    s = reducer(s, { type: "RESTORE_TASK", payload: UUID });
    expect(s.tasks[0].deletedAt).toBeNull();
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    s = reducer(s, { type: "PURGE_TASK", payload: UUID });
    expect(s.tasks).toHaveLength(0);
  });

  it("EMPTY_TRASH elimina solo i task cestinati", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: UUID }) });
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: "22222222-2222-4333-8444-555555555555", title: "Vivo" }) });
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    const next = reducer(s, { type: "EMPTY_TRASH" });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].title).toBe("Vivo");
  });

  it("ADD_COMMENT appende il commento al task", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    const next = reducer(s, { type: "ADD_COMMENT", payload: { taskId: UUID, comment: { id: "c1", text: "ciao" } } });
    expect(next.tasks[0].comments).toHaveLength(1);
    expect(next.tasks[0].comments[0].text).toBe("ciao");
  });

  it("UNDO_LAST_ACTION ripristina lo status dopo una MOVE swipe", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task({ status: "todo" }) });
    s = reducer(s, { type: "MOVE_TASK", payload: { taskId: UUID, newStatus: "done" }, swipe: true });
    expect(s.lastAction.type).toBe("MOVE_TASK");
    const next = reducer(s, { type: "UNDO_LAST_ACTION" });
    expect(next.tasks[0].status).toBe("todo");
    expect(next.lastAction).toBeNull();
  });
});

describe("reducer — permessi", () => {
  it("junior agent NON può creare task di categoria payment", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_TASK", payload: task({ category: "payment" }) });
    expect(next.tasks).toHaveLength(0);
    expect(next.toast.type).toBe("error");
  });

  it("junior agent può creare task di categoria normale", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_TASK", payload: task({ category: "booking", assignees: ["gina"] }) });
    expect(next.tasks).toHaveLength(1);
  });

  it("azioni admin-only sono bloccate per i non-admin", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_CATEGORY", payload: { key: "x", label: "X" } });
    expect(next.categories.x).toBeUndefined();
    expect(next.toast.type).toBe("error");
  });

  it("SET_VIEW admin è negata ai non-admin", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "SET_VIEW", payload: "admin" });
    expect(next.activeView).not.toBe("admin");
    expect(next.toast.type).toBe("error");
  });
});

describe("reducer — bacheca avvisi", () => {
  let s;
  beforeEach(() => { s = freshState("marco"); });

  it("ADD_NOTICE / TOGGLE_PIN_NOTICE / DELETE_NOTICE", () => {
    s = reducer(s, { type: "ADD_NOTICE", payload: { id: UUID, text: "Avviso" } });
    expect(s.notices).toHaveLength(1);
    s = reducer(s, { type: "TOGGLE_PIN_NOTICE", payload: UUID });
    expect(s.notices[0].pinned).toBe(true);
    s = reducer(s, { type: "DELETE_NOTICE", payload: UUID });
    expect(s.notices).toHaveLength(0);
  });

  it("TOGGLE_NOTICE_REACTION aggiunge e poi rimuove la reazione dell'utente", () => {
    s = reducer(s, { type: "ADD_NOTICE", payload: { id: UUID, text: "Avviso" } });
    s = reducer(s, { type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: UUID, emoji: "👍" } });
    expect(s.notices[0].reactions["👍"]).toEqual(["marco"]);
    s = reducer(s, { type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: UUID, emoji: "👍" } });
    expect(s.notices[0].reactions["👍"]).toBeUndefined(); // lista vuota → emoji rimosso
  });
});

describe("reducer — CRM clienti", () => {
  it("ADD / UPDATE / DELETE_CLIENT", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_CLIENT", payload: { id: "cl1", name: "Rossi" } });
    expect(s.clients).toHaveLength(1);
    s = reducer(s, { type: "UPDATE_CLIENT", payload: { id: "cl1", name: "Bianchi" } });
    expect(s.clients[0].name).toBe("Bianchi");
    s = reducer(s, { type: "DELETE_CLIENT", payload: "cl1" });
    expect(s.clients).toHaveLength(0);
  });
});

describe("reducer — activity log & toast", () => {
  it("una LOGGED_ACTION aggiunge una voce al log", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(s.activityLog.length).toBe(1);
    expect(s.activityLog[0].type).toBe("ADD_TASK");
  });

  it("CLEAR_TOAST azzera il toast", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(s.toast).not.toBeNull();
    s = reducer(s, { type: "CLEAR_TOAST" });
    expect(s.toast).toBeNull();
  });

  it("azione sconosciuta ritorna lo stesso stato", () => {
    const s = freshState("marco");
    expect(reducer(s, { type: "NON_ESISTE" })).toBe(s);
  });
});
