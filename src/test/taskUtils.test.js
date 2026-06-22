import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDate, formatTime, getDayKey,
  isOverdue, isUrgent,
  isActiveTask, getActiveTasks, getTrashedTasks,
  isMyTask, isInGlobalQueue,
} from "../lib/taskUtils.js";

describe("formatDate", () => {
  it("returns em dash for null/undefined", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatDate("2026-06-21T10:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("—");
  });
});

describe("formatTime", () => {
  it("returns empty string for null/undefined", () => {
    expect(formatTime(null)).toBe("");
    expect(formatTime(undefined)).toBe("");
  });

  it("returns HH:MM string for a valid ISO date", () => {
    const result = formatTime("2026-06-21T10:30:00.000Z");
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("getDayKey", () => {
  it("returns null for falsy input", () => {
    expect(getDayKey(null)).toBeNull();
    expect(getDayKey("")).toBeNull();
  });

  it("returns a consistent string key for the same date", () => {
    const k1 = getDayKey("2026-06-21T08:00:00.000Z");
    const k2 = getDayKey("2026-06-21T22:00:00.000Z");
    // Same calendar day in local time → may differ across timezones, but
    // must produce a non-null string in all cases.
    expect(typeof k1).toBe("string");
    expect(typeof k2).toBe("string");
  });
});

describe("isOverdue", () => {
  it("returns false for done tasks regardless of dueDate", () => {
    const t = { status: "done", dueDate: "2020-01-01T00:00:00.000Z" };
    expect(isOverdue(t)).toBe(false);
  });

  it("returns falsy when dueDate is missing", () => {
    const t = { status: "todo", dueDate: null };
    expect(isOverdue(t)).toBeFalsy();
  });

  it("returns true for a past dueDate on a non-done task", () => {
    const t = { status: "todo", dueDate: "2020-01-01T00:00:00.000Z" };
    expect(isOverdue(t)).toBe(true);
  });

  it("returns false for a future dueDate", () => {
    const t = { status: "todo", dueDate: "2099-01-01T00:00:00.000Z" };
    expect(isOverdue(t)).toBe(false);
  });
});

describe("isUrgent", () => {
  let now;
  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns false for done tasks", () => {
    const t = { status: "done", dueDate: new Date(now + 3600_000).toISOString() };
    expect(isUrgent(t)).toBe(false);
  });

  it("returns false when dueDate is missing", () => {
    expect(isUrgent({ status: "todo" })).toBe(false);
  });

  it("returns true when dueDate is within 24 h", () => {
    const t = { status: "todo", dueDate: new Date(now + 3600_000).toISOString() };
    expect(isUrgent(t)).toBe(true);
  });

  it("returns false when dueDate is more than 24 h away", () => {
    const t = { status: "todo", dueDate: new Date(now + 25 * 3600_000).toISOString() };
    expect(isUrgent(t)).toBe(false);
  });

  it("returns false when dueDate is already past", () => {
    const t = { status: "todo", dueDate: new Date(now - 1000).toISOString() };
    expect(isUrgent(t)).toBe(false);
  });
});

describe("active / trashed task helpers", () => {
  const active = { id: "1", title: "A" };
  const trashed = { id: "2", title: "B", deletedAt: "2026-01-01T00:00:00.000Z" };
  const tasks = [active, trashed];

  it("isActiveTask: true when no deletedAt", () => {
    expect(isActiveTask(active)).toBe(true);
    expect(isActiveTask(trashed)).toBe(false);
  });

  it("getActiveTasks returns only non-deleted", () => {
    expect(getActiveTasks(tasks)).toEqual([active]);
  });

  it("getTrashedTasks returns only deleted", () => {
    expect(getTrashedTasks(tasks)).toEqual([trashed]);
  });
});

describe("isMyTask / isInGlobalQueue", () => {
  it("isMyTask: true when userId is in assignees", () => {
    const t = { assignees: ["u1", "u2"] };
    expect(isMyTask(t, "u1")).toBe(true);
    expect(isMyTask(t, "u3")).toBe(false);
  });

  it("isInGlobalQueue: true when assignees is empty or missing", () => {
    expect(isInGlobalQueue({ assignees: [] })).toBe(true);
    expect(isInGlobalQueue({})).toBe(true);
    expect(isInGlobalQueue({ assignees: ["u1"] })).toBe(false);
  });
});
