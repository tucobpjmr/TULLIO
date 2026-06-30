import { describe, it, expect } from "vitest";
import {
  isUuid, newId,
  fromDbTask, toDbTask, toDbTaskPatch,
  fromDbComment,
  fromDbNotice, toDbNotice, toDbNoticePatch,
  fromDbConversation, toDbConversation,
  fromDbMessage, toDbMessage,
  fromDbClient, toDbClient,
  fromDbNotification,
  fromDbCategory, toDbCategory,
} from "../lib/mappers.js";

const UUID = "11111111-2222-4333-8444-555555555555";

describe("isUuid / newId", () => {
  it("riconosce un uuid valido e rifiuta il resto", () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid("c123")).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
  });

  it("newId genera un uuid valido", () => {
    expect(isUuid(newId())).toBe(true);
  });
});

describe("fromDb* null-safety", () => {
  it("ritornano null su row mancante", () => {
    expect(fromDbTask(null)).toBeNull();
    expect(fromDbComment(undefined)).toBeNull();
    expect(fromDbNotice(null)).toBeNull();
    expect(fromDbConversation(null)).toBeNull();
    expect(fromDbMessage(null)).toBeNull();
    expect(fromDbClient(null)).toBeNull();
    expect(fromDbNotification(null)).toBeNull();
    expect(fromDbCategory(null)).toBeNull();
  });
});

describe("task mapping (DB ↔ app)", () => {
  it("fromDbTask normalizza snake_case → camelCase con default", () => {
    const t = fromDbTask({
      id: UUID, title: "Volo Roma", category: "booking", priority: "high",
      status: "todo", assignees: ["marco"], client_id: "cli1",
      pratica_ref: "PR-1", due_date: "2026-07-01", estimated_hours: "3",
      description: "desc", deleted_at: null, comments: null,
    });
    expect(t.client).toBe("cli1");
    expect(t.praticaRef).toBe("PR-1");
    expect(t.dueDate).toBe("2026-07-01");
    expect(t.estimatedHours).toBe(3); // coercizione a Number
    expect(t.assignees).toEqual(["marco"]);
    expect(t.comments).toEqual([]); // comments non-array → []
  });

  it("fromDbTask gestisce campi mancanti senza crash", () => {
    const t = fromDbTask({ id: UUID, title: "x" });
    expect(t.assignees).toEqual([]);
    expect(t.estimatedHours).toBe(0);
    expect(t.description).toBe("");
    expect(t.deletedAt).toBeNull();
  });

  it("toDbTask preserva un id uuid e ne genera uno se invalido", () => {
    expect(toDbTask({ id: UUID, title: "x" }).id).toBe(UUID);
    expect(isUuid(toDbTask({ id: "c123", title: "x" }).id)).toBe(true);
  });

  it("round-trip app→DB→app conserva i campi chiave", () => {
    const appTask = {
      id: UUID, title: "Hotel", category: "hotel", priority: "medium",
      status: "doing", assignees: ["lucia"], client: "cli9",
      praticaRef: "PR-9", dueDate: "2026-08-01", estimatedHours: 2,
      description: "note", deletedAt: null,
    };
    const back = fromDbTask({ ...toDbTask(appTask), comments: [] });
    expect(back).toMatchObject({
      id: UUID, title: "Hotel", category: "hotel", priority: "medium",
      status: "doing", assignees: ["lucia"], client: "cli9",
      praticaRef: "PR-9", estimatedHours: 2, description: "note",
    });
  });

  it("toDbTaskPatch traduce solo i campi presenti", () => {
    expect(toDbTaskPatch({ status: "done" })).toEqual({ status: "done" });
    const patch = toDbTaskPatch({ client: "c1", praticaRef: "P", dueDate: "d" });
    expect(patch).toEqual({ client_id: "c1", pratica_ref: "P", due_date: "d" });
    expect("title" in toDbTaskPatch({ status: "done" })).toBe(false);
  });

  it("toDbTaskPatch normalizza i null per i campi presenti", () => {
    expect(toDbTaskPatch({ client: undefined })).toEqual({ client_id: null });
    expect(toDbTaskPatch({ assignees: undefined })).toEqual({ assignees: [] });
  });
});

describe("comment mapping", () => {
  it("preferisce users.name dal join, con fallback", () => {
    expect(fromDbComment({ id: "1", users: { name: "Marco" }, text: "ciao", created_at: "t" }).user).toBe("Marco");
    expect(fromDbComment({ id: "1", user: "Lucia", text: "x", created_at: "t" }).user).toBe("Lucia");
    expect(fromDbComment({ id: "1", text: "x", created_at: "t" }).user).toBe("");
  });
});

describe("notice mapping", () => {
  it("fromDbNotice mappa author_id→author e replica created_at su updatedAt", () => {
    const n = fromDbNotice({ id: UUID, text: "avviso", author_id: "marco", pinned: 1, created_at: "2026-01-01" });
    expect(n.author).toBe("marco");
    expect(n.pinned).toBe(true);
    expect(n.createdAt).toBe("2026-01-01");
    expect(n.updatedAt).toBe("2026-01-01");
  });

  it("toDbNotice / patch normalizzano author→author_id e pinned booleano", () => {
    expect(toDbNotice({ id: UUID, text: "x", author: "marco" }).author_id).toBe("marco");
    expect(toDbNotice({ id: "c1", text: "x" }).pinned).toBe(false);
    expect(toDbNoticePatch({ pinned: 1, author: "a" })).toEqual({ pinned: true, author_id: "a" });
    expect(toDbNoticePatch({ text: "y" })).toEqual({ text: "y" });
  });
});

describe("conversation mapping", () => {
  it("round-trip conserva type/participants/pinned", () => {
    const conv = { id: UUID, type: "group", name: "Team", icon: "💬", participants: ["a", "b"], pinned: true };
    const back = fromDbConversation(toDbConversation(conv));
    expect(back).toEqual(conv);
  });

  it("participants non-array → []", () => {
    expect(fromDbConversation({ id: UUID, type: "dm" }).participants).toEqual([]);
  });
});

describe("message mapping", () => {
  it("fromDbMessage normalizza i campi file e i default", () => {
    const m = fromDbMessage({
      id: UUID, conversation_id: "c1", sender_id: "marco", type: "file",
      text: null, file_name: "a.pdf", file_size: 1024, file_type: "application/pdf",
      file_url: "path", read_by: null, reactions: null, created_at: "t",
    });
    expect(m.sender).toBe("marco");
    expect(m.fileName).toBe("a.pdf");
    expect(m.fileSize).toBe(1024);
    expect(m.text).toBe("");
    expect(m.readBy).toEqual([]);
    expect(m.reactions).toEqual({});
  });

  it("toDbMessage azzera fileSize non numerico (vecchi mock '245 KB')", () => {
    expect(toDbMessage({ id: UUID, sender: "m", fileSize: "245 KB" }, "c1").file_size).toBeNull();
    expect(toDbMessage({ id: UUID, sender: "m", fileSize: 2048 }, "c1").file_size).toBe(2048);
  });

  it("toDbMessage applica conversationId e sender_id", () => {
    const row = toDbMessage({ id: UUID, sender: "marco", text: "ciao" }, "conv-9");
    expect(row.conversation_id).toBe("conv-9");
    expect(row.sender_id).toBe("marco");
    expect(row.type).toBe("text");
  });
});

describe("client & notification mapping", () => {
  it("client round-trip conserva i contatti", () => {
    const c = { name: "Rossi", email: "r@x.it", phone: "123", address: "via", city: "Roma", notes: "vip" };
    const back = fromDbClient({ id: UUID, created_at: "t", ...toDbClient(c) });
    expect(back).toMatchObject(c);
  });

  it("fromDbNotification mappa user_id→userId e payload default", () => {
    const n = fromDbNotification({ id: UUID, user_id: "marco", type: "mention", read: 0, created_at: "t" });
    expect(n.userId).toBe("marco");
    expect(n.read).toBe(false);
    expect(n.payload).toEqual({});
  });
});

describe("category mapping", () => {
  it("round-trip app→DB→app conserva key/label/icon/color/bg", () => {
    const cat = { key: "hotel", label: "Hotel", icon: "🏨", color: "#14B8A6", bg: "#F0FDFA" };
    expect(fromDbCategory(toDbCategory(cat))).toEqual(cat);
  });

  it("fromDbCategory normalizza icon mancante a stringa vuota", () => {
    expect(fromDbCategory({ key: "x", label: "X", color: "#000", bg: "#fff" }).icon).toBe("");
  });
});
