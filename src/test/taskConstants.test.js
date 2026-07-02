import { describe, it, expect } from "vitest";
import { PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS, RECURRENCE_OPTIONS, TASK_TEMPLATES, TEAM_ROLES } from "../lib/taskConstants.js";

describe("PRIORITIES", () => {
  const keys = ["critical", "high", "medium", "low"];

  it("has exactly the four expected keys", () => {
    expect(Object.keys(PRIORITIES)).toEqual(keys);
  });

  it("each priority has label, color, bg", () => {
    for (const k of keys) {
      expect(PRIORITIES[k]).toMatchObject({ label: expect.any(String), color: expect.any(String), bg: expect.any(String) });
    }
  });
});

describe("STATUSES", () => {
  it("is an array of 5 strings", () => {
    expect(Array.isArray(STATUSES)).toBe(true);
    expect(STATUSES).toHaveLength(5);
  });

  it("includes todo and done", () => {
    expect(STATUSES).toContain("todo");
    expect(STATUSES).toContain("done");
  });

  it("every status has a label and a color", () => {
    for (const s of STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_COLORS[s]).toBeTruthy();
    }
  });
});

describe("TEAM_ROLES", () => {
  it("has exactly the five canonical roles used by member.role", () => {
    expect(TEAM_ROLES).toEqual(["Manager", "Senior Agent", "Junior Agent", "Driver", "Admin"]);
  });

  it("contains no duplicates", () => {
    expect(new Set(TEAM_ROLES).size).toBe(TEAM_ROLES.length);
  });
});

describe("RECURRENCE_OPTIONS", () => {
  const keys = ["none", "daily", "weekly", "monthly"];

  it("has exactly the four expected keys", () => {
    expect(Object.keys(RECURRENCE_OPTIONS)).toEqual(keys);
  });

  it("each option has label and icon", () => {
    for (const k of keys) {
      expect(RECURRENCE_OPTIONS[k]).toMatchObject({ label: expect.any(String), icon: expect.any(String) });
    }
  });
});

describe("TASK_TEMPLATES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(TASK_TEMPLATES)).toBe(true);
    expect(TASK_TEMPLATES.length).toBeGreaterThan(0);
  });

  it("each template has id, name, icon, tasks array", () => {
    for (const tmpl of TASK_TEMPLATES) {
      expect(tmpl).toMatchObject({ id: expect.any(String), name: expect.any(String), icon: expect.any(String) });
      expect(Array.isArray(tmpl.tasks)).toBe(true);
      expect(tmpl.tasks.length).toBeGreaterThan(0);
    }
  });

  it("each sub-task has title, category, priority, dayOffset, estimatedHours", () => {
    for (const tmpl of TASK_TEMPLATES) {
      for (const t of tmpl.tasks) {
        expect(t).toMatchObject({
          title: expect.any(String),
          category: expect.any(String),
          priority: expect.any(String),
          dayOffset: expect.any(Number),
          estimatedHours: expect.any(Number),
        });
      }
    }
  });

  it("all sub-task priorities are valid PRIORITIES keys", () => {
    const valid = new Set(Object.keys(PRIORITIES));
    for (const tmpl of TASK_TEMPLATES) {
      for (const t of tmpl.tasks) {
        expect(valid.has(t.priority)).toBe(true);
      }
    }
  });
});
