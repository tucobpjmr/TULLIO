import { describe, it, expect } from "vitest";
import {
  PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS, RECURRENCE_OPTIONS, TASK_TEMPLATES,
  DB_ROLES, ROLE_LABELS, SENIORITY_LEVELS, toDbRole, toSeniority, roleLabel,
} from "../lib/taskConstants.js";

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

// Il vecchio TEAM_ROLES elencava le LABEL e veniva usato anche come valore di
// member.role. Era il difetto: il database confronta users.role per uguaglianza
// esatta con 'admin'|'manager'|'agent'|'driver', quindi ogni label scritta lì
// dentro produceva un utente che non passa nessun helper di ruolo — invisibile,
// perché la RLS non solleva errori, restituisce insiemi vuoti.
describe("DB_ROLES", () => {
  it("contiene esattamente i quattro valori dell'enum del database", () => {
    expect(DB_ROLES).toEqual(["admin", "manager", "agent", "driver"]);
  });

  it("sono tutti minuscoli: il confronto lato DB è case-sensitive", () => {
    for (const r of DB_ROLES) expect(r).toBe(r.toLowerCase());
  });

  it("ogni ruolo ha una label di presentazione", () => {
    for (const r of DB_ROLES) expect(ROLE_LABELS[r]).toBeTruthy();
  });
});

describe("toDbRole", () => {
  it("lascia passare i valori dell'enum", () => {
    for (const r of DB_ROLES) expect(toDbRole(r)).toBe(r);
  });

  it("normalizza le label mostrate nei select", () => {
    expect(toDbRole("Admin")).toBe("admin");
    expect(toDbRole("Manager")).toBe("manager");
    expect(toDbRole("Driver")).toBe("driver");
  });

  it("appiattisce su 'agent' le vecchie label con il sotto-livello incorporato", () => {
    expect(toDbRole("Senior Agent")).toBe("agent");
    expect(toDbRole("Junior Agent")).toBe("agent");
  });

  it("rifiuta i valori fuori enum invece di ripiegare su un default", () => {
    // Il ripiego silenzioso su 'agent' assegnerebbe permessi a un refuso.
    expect(toDbRole("Amministrativo")).toBeNull();
    expect(toDbRole("manger")).toBeNull();
    expect(toDbRole("")).toBeNull();
    expect(toDbRole(undefined)).toBeNull();
  });
});

describe("toSeniority", () => {
  it("legge la colonna dedicata quando c'è", () => {
    expect(toSeniority({ role: "agent", seniority: "junior" })).toBe("junior");
    expect(toSeniority({ role: "agent", seniority: "senior" })).toBe("senior");
  });

  it("ricade sulla vecchia label per i dati non ancora migrati", () => {
    expect(toSeniority({ role: "Junior Agent" })).toBe("junior");
    expect(toSeniority({ role: "Senior Agent" })).toBe("senior");
  });

  it("il default è 'senior': la migrazione non toglie permessi a nessuno", () => {
    expect(toSeniority({ role: "agent" })).toBe("senior");
    expect(toSeniority({ role: "agent", seniority: "boh" })).toBe("senior");
  });

  it("SENIORITY_LEVELS elenca solo i due livelli ammessi dal CHECK sul DB", () => {
    expect(SENIORITY_LEVELS).toEqual(["senior", "junior"]);
  });
});

describe("roleLabel", () => {
  it("mostra la label, non il valore grezzo del database", () => {
    expect(roleLabel({ role: "admin" })).toBe("Admin");
    expect(roleLabel({ role: "manager" })).toBe("Manager");
    expect(roleLabel({ role: "driver" })).toBe("Driver");
  });

  it("per gli agent include il sotto-livello", () => {
    expect(roleLabel({ role: "agent", seniority: "junior" })).toBe("Junior Agent");
    expect(roleLabel({ role: "agent", seniority: "senior" })).toBe("Senior Agent");
    expect(roleLabel({ role: "Junior Agent" })).toBe("Junior Agent");
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
