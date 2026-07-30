// Helper del pannello notifiche — in particolare il digest della coda globale
// (migration 20260725_queue_stale_relevance_digest): una sola notifica
// queue_stale per utente che riassume i task in scadenza senza assegnatario,
// invece di una riga per task (screenshot utente: 32 non lette tutte uguali).
import { describe, it, expect } from "vitest";
import { notifTitle, notifSubtitle, notifTime, notifTarget, NOTIF_CATEGORIES } from "../lib/notifUtils.js";

// task_id/task_title puntano sempre al più urgente (tasks[0], già ordinato
// per scadenza), come nel payload reale scritto da notify_queue_stale()
// dopo 20260730_queue_stale_notif_direct_task.
const digest = (count, tasks) => ({
  id: "n1",
  type: "queue_stale",
  read: false,
  createdAt: new Date().toISOString(),
  payload: {
    count, tasks, task_ids: tasks.map(t => t.id), view: "dashboard", queue: "global",
    task_id: tasks[0]?.id, task_title: tasks[0]?.title,
  },
});

describe("notifTitle — queue_stale", () => {
  it("riassume il conteggio quando i task sono più d'uno", () => {
    const n = digest(3, [
      { id: "t1", title: "CK RYANAIR", due_date: "2026-07-26T09:25:00Z" },
      { id: "t2", title: "CK ITA", due_date: "2026-07-26T14:05:00Z" },
      { id: "t3", title: "CK TAP", due_date: "2026-07-26T11:35:00Z" },
    ]);
    expect(notifTitle(n)).toBe("3 task in scadenza senza assegnatario");
  });

  it("resta specifico con un solo task (payload con task_title)", () => {
    const n = {
      type: "queue_stale",
      payload: { count: 1, task_id: "t1", task_title: "CK RYANAIR", tasks: [{ id: "t1", title: "CK RYANAIR" }] },
    };
    expect(notifTitle(n)).toBe("Task in scadenza senza assegnatario: CK RYANAIR");
  });

  it("regge il vecchio payload per-task (senza count)", () => {
    const n = { type: "queue_stale", payload: { task_id: "t1", task_title: "cuba festa rocco" } };
    expect(notifTitle(n)).toBe("Task in scadenza senza assegnatario: cuba festa rocco");
  });

  it("non lascia mai il titolo vuoto", () => {
    expect(notifTitle({ type: "queue_stale", payload: {} })).toBe("Task in scadenza senza assegnatario");
  });
});

describe("notifSubtitle", () => {
  it("elenca i primi tre titoli e conta i restanti", () => {
    const n = digest(5, [
      { id: "t1", title: "CK RYANAIR" },
      { id: "t2", title: "CK ITA" },
      { id: "t3", title: "CK TAP" },
      { id: "t4", title: "CK WIZZ" },
      { id: "t5", title: "CK VUELING" },
    ]);
    expect(notifSubtitle(n)).toBe("CK RYANAIR · CK ITA · CK TAP · +2");
  });

  it("senza resto non aggiunge il +N", () => {
    const n = digest(2, [{ id: "t1", title: "CK RYANAIR" }, { id: "t2", title: "CK ITA" }]);
    expect(notifSubtitle(n)).toBe("CK RYANAIR · CK ITA");
  });

  it("niente sottotitolo per un task singolo o per gli altri tipi", () => {
    expect(notifSubtitle(digest(1, [{ id: "t1", title: "CK RYANAIR" }]))).toBeNull();
    expect(notifSubtitle({ type: "task_due", payload: { task_title: "CK ITA" } })).toBeNull();
    expect(notifSubtitle({ type: "queue_stale" })).toBeNull();
  });
});

describe("notifTarget", () => {
  it("il digest con più task apre direttamente il task più urgente", () => {
    expect(notifTarget(digest(3, [{ id: "t1", title: "CK RYANAIR" }]))).toEqual({
      kind: "task", taskId: "t1",
    });
  });

  it("con un solo task apre direttamente il task", () => {
    const n = { type: "queue_stale", payload: { count: 1, task_id: "t1", view: "dashboard", queue: "global" } };
    expect(notifTarget(n)).toEqual({ kind: "task", taskId: "t1" });
  });

  it("payload legacy senza task_id ricade sulla vista (fallback)", () => {
    const n = { type: "queue_stale", payload: { count: 3, view: "dashboard", queue: "global" } };
    expect(notifTarget(n)).toEqual({ kind: "view", view: "dashboard", queue: "global" });
  });

  it("la chat apre la conversazione", () => {
    expect(notifTarget({ type: "chat_message", payload: { conversation_id: "c1" } })).toEqual({
      kind: "chat", conversationId: "c1",
    });
  });

  it("payload senza destinazione → non navigabile", () => {
    expect(notifTarget({ type: "user_pending", payload: { user_name: "Elena" } })).toBeNull();
    expect(notifTarget({ type: "user_pending" })).toBeNull();
  });
});

describe("notifTime / categorie", () => {
  it("formatta i minuti recenti", () => {
    const n = { createdAt: new Date(Date.now() - 5 * 60000).toISOString() };
    expect(notifTime(n)).toBe("5 min fa");
  });

  it("queue_stale resta nella categoria Task", () => {
    expect(NOTIF_CATEGORIES.task).toContain("queue_stale");
  });
});
