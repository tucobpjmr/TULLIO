import { describe, it, expect } from "vitest";
import { validateBackup, validateTasks, validateCategories, validateNotices } from "../../lib/backupValidation.js";

const validTask = (overrides = {}) => ({
  id: "t1",
  title: "Prenotazione voli",
  category: "booking",
  priority: "high",
  status: "todo",
  assignees: [],
  ...overrides,
});

describe("validateBackup", () => {
  it("accetta un backup valido senza warning", () => {
    const data = {
      version: "0.5",
      tasks: [validTask()],
      categories: { booking: { label: "Prenotazioni", icon: "✈️", color: "#000", bg: "#fff" } },
      notices: [{ id: "n1", text: "Avviso" }],
    };
    const { fatalError, sanitized, warnings } = validateBackup(data);
    expect(fatalError).toBeNull();
    expect(warnings).toEqual([]);
    expect(sanitized.tasks).toHaveLength(1);
    expect(sanitized.categories).toEqual(data.categories);
    expect(sanitized.notices).toEqual(data.notices);
  });

  it("blocca se il contenuto non è un oggetto", () => {
    expect(validateBackup(null).fatalError).toMatch(/non valido/i);
    expect(validateBackup(42).fatalError).toMatch(/non valido/i);
    expect(validateBackup([1, 2]).fatalError).toMatch(/non valido/i);
  });

  it("blocca se tasks manca o non è un array", () => {
    expect(validateBackup({}).fatalError).toMatch(/tasks/);
    expect(validateBackup({ tasks: "nope" }).fatalError).toMatch(/tasks/);
  });

  it("segnala ma non blocca uno status non riconosciuto, normalizzandolo a todo", () => {
    const data = { tasks: [validTask({ status: "in_pausa" })] };
    const { fatalError, sanitized, warnings } = validateBackup(data);
    expect(fatalError).toBeNull();
    expect(sanitized.tasks[0].status).toBe("todo");
    expect(warnings.some(w => w.includes("non riconosciuto"))).toBe(true);
  });

  it("scarta i task senza titolo, segnalandolo", () => {
    const data = { tasks: [validTask({ title: "" }), validTask({ id: "t2" })] };
    const { sanitized, warnings } = validateBackup(data);
    expect(sanitized.tasks).toHaveLength(1);
    expect(sanitized.tasks[0].id).toBe("t2");
    expect(warnings.some(w => w.includes("titolo"))).toBe(true);
  });

  it("scarta i task senza id, segnalandolo", () => {
    const data = { tasks: [validTask({ id: "" }), validTask({ id: "t2" })] };
    const { sanitized, warnings } = validateBackup(data);
    expect(sanitized.tasks).toHaveLength(1);
    expect(warnings.some(w => w.includes("id mancante"))).toBe(true);
  });

  it("ignora categories/notices malformati mantenendo quelli correnti", () => {
    const data = { tasks: [validTask()], categories: "boh", notices: { a: 1 } };
    const { sanitized, warnings } = validateBackup(data);
    expect(sanitized.categories).toBeUndefined();
    expect(sanitized.notices).toBeUndefined();
    expect(warnings.some(w => w.includes("categories"))).toBe(true);
    expect(warnings.some(w => w.includes("notices"))).toBe(true);
  });
});

describe("validateTasks", () => {
  it("azzera assignees non validi", () => {
    const { validTasks, errors } = validateTasks([validTask({ assignees: "marco" })]);
    expect(validTasks[0].assignees).toEqual([]);
    expect(errors.some(e => e.includes("assignees"))).toBe(true);
  });

  it("rimuove categoria non stringa", () => {
    const { validTasks, errors } = validateTasks([validTask({ category: 42 })]);
    expect(validTasks[0].category).toBeNull();
    expect(errors.some(e => e.includes("categoria"))).toBe(true);
  });

  it("scarta elementi non oggetto", () => {
    const { validTasks, errors } = validateTasks([null, "x", validTask()]);
    expect(validTasks).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});

describe("validateCategories", () => {
  it("passa undefined quando non presente", () => {
    expect(validateCategories(undefined)).toEqual({ validCategories: undefined, errors: [] });
  });

  it("esclude voci senza label", () => {
    const { validCategories, errors } = validateCategories({ ok: { label: "OK" }, bad: { icon: "x" } });
    expect(Object.keys(validCategories)).toEqual(["ok"]);
    expect(errors).toHaveLength(1);
  });
});

describe("validateNotices", () => {
  it("passa undefined quando non presente", () => {
    expect(validateNotices(undefined)).toEqual({ validNotices: undefined, errors: [] });
  });

  it("esclude notice senza id/text", () => {
    const { validNotices, errors } = validateNotices([{ id: "n1", text: "ciao" }, { text: "senza id" }]);
    expect(validNotices).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});
