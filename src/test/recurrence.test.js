import { describe, it, expect, vi } from "vitest";

// CalendarPlanner importa (transitivamente) Avatar, che da S-10 risolve le
// signed URL degli avatar via lib/api.js → client Supabase condiviso, non
// costruibile senza VITE_SUPABASE_URL. Mockato e mai usato: qui servono
// solo gli helper puri.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
import { expandRecurring, nthRecurrence } from "../components/calendar/CalendarPlanner.jsx";

// Helper: costruisce un task ricorrente con dueDate in ora locale.
const task = (recurrence, base) => ({
  id: "t1",
  title: "Task",
  recurrence,
  dueDate: base.toISOString(),
});

// Helper: raccoglie le occorrenze emesse come [mese(0-based), giorno].
const monthDayPairs = (tasks) =>
  tasks.map(t => {
    const d = new Date(t.dueDate);
    return [d.getMonth(), d.getDate()];
  });

describe("expandRecurring — overflow mensile (31 gennaio)", () => {
  it("ancora al giorno originale senza slittamento (28 feb, 31 mar, 30 apr, 31 mag)", () => {
    // 2026 non è bisestile → febbraio ha 28 giorni.
    const base = new Date(2026, 0, 31, 9, 30); // 31 gen 2026 09:30 locale
    const out = expandRecurring(
      [task("monthly", base)],
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 4, 31, 23, 59, 59)
    );
    expect(monthDayPairs(out)).toEqual([
      [0, 31], // 31 gen
      [1, 28], // 28 feb (clamp, NON 3 mar)
      [2, 31], // 31 mar
      [3, 30], // 30 apr
      [4, 31], // 31 mag
    ]);
  });

  it("in anno bisestile clampa il 31 gennaio a 29 febbraio", () => {
    // 2028 è bisestile → febbraio ha 29 giorni.
    const base = new Date(2028, 0, 31, 8, 0);
    const out = expandRecurring(
      [task("monthly", base)],
      new Date(2028, 1, 1, 0, 0, 0),
      new Date(2028, 1, 29, 23, 59, 59)
    );
    expect(monthDayPairs(out)).toEqual([[1, 29]]);
  });
});

describe("expandRecurring — overflow annuale (29 febbraio)", () => {
  it("in un anno non bisestile clampa a 28 febbraio e non slitta a 1 marzo", () => {
    const base = new Date(2024, 1, 29, 8, 0); // 29 feb 2024 (bisestile)
    const out = expandRecurring(
      [task("yearly", base)],
      new Date(2025, 0, 1, 0, 0, 0),
      new Date(2025, 11, 31, 23, 59, 59)
    );
    expect(monthDayPairs(out)).toEqual([[1, 28]]); // 28 feb 2025
  });

  it("non produce slittamento permanente: torna al 29 feb negli anni bisestili", () => {
    const base = new Date(2024, 1, 29, 8, 0);
    const out = expandRecurring(
      [task("yearly", base)],
      new Date(2024, 0, 1, 0, 0, 0),
      new Date(2028, 11, 31, 23, 59, 59)
    );
    // 2024:29, 2025:28, 2026:28, 2027:28, 2028:29
    expect(out.map(t => new Date(t.dueDate).getFullYear())).toEqual([
      2024, 2025, 2026, 2027, 2028,
    ]);
    expect(monthDayPairs(out)).toEqual([
      [1, 29], [1, 28], [1, 28], [1, 28], [1, 29],
    ]);
  });
});

describe("expandRecurring — casi base (nessuna regressione)", () => {
  it("weekly: emette ogni 7 giorni", () => {
    const base = new Date(2026, 5, 1, 10, 0); // lun 1 giu 2026
    const out = expandRecurring(
      [task("weekly", base)],
      new Date(2026, 5, 1, 0, 0, 0),
      new Date(2026, 5, 30, 23, 59, 59)
    );
    expect(monthDayPairs(out)).toEqual([
      [5, 1], [5, 8], [5, 15], [5, 22], [5, 29],
    ]);
  });

  it("daily: emette ogni giorno nel range", () => {
    const base = new Date(2026, 5, 1, 10, 0);
    const out = expandRecurring(
      [task("daily", base)],
      new Date(2026, 5, 1, 0, 0, 0),
      new Date(2026, 5, 5, 23, 59, 59)
    );
    expect(monthDayPairs(out)).toEqual([
      [5, 1], [5, 2], [5, 3], [5, 4], [5, 5],
    ]);
  });

  it("passa attraverso i task non ricorrenti immutati", () => {
    const plain = { id: "p", title: "X", dueDate: new Date(2026, 5, 10).toISOString() };
    const none = { id: "n", title: "Y", recurrence: "none", dueDate: new Date(2026, 5, 10).toISOString() };
    const out = expandRecurring(
      [plain, none],
      new Date(2026, 5, 1),
      new Date(2026, 5, 30)
    );
    expect(out).toEqual([plain, none]);
  });
});

describe("expandRecurring — preservazione dell'ora del giorno", () => {
  it("mantiene ore/minuti su ogni occorrenza, anche col clamp", () => {
    const base = new Date(2026, 0, 31, 9, 30);
    const out = expandRecurring(
      [task("monthly", base)],
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 2, 31, 23, 59, 59)
    );
    for (const t of out) {
      const d = new Date(t.dueDate);
      expect(d.getHours()).toBe(9);
      expect(d.getMinutes()).toBe(30);
    }
  });
});

describe("expandRecurring — metadati istanze", () => {
  it("marca l'originale e le istanze virtuali correttamente", () => {
    const base = new Date(2026, 0, 31, 9, 30);
    const out = expandRecurring(
      [task("monthly", base)],
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 1, 28, 23, 59, 59)
    );
    expect(out[0].id).toBe("t1");
    expect(out[0].isRecurringInstance).toBe(false);
    expect(out[1].isRecurringInstance).toBe(true);
    expect(out[1].originalId).toBe("t1");
    expect(out[1].id).not.toBe("t1");
  });
});

describe("nthRecurrence — unità", () => {
  it("n=0 restituisce la base", () => {
    const base = new Date(2026, 0, 31, 9, 30);
    expect(nthRecurrence(base, "monthly", 0).getTime()).toBe(base.getTime());
  });

  it("attraversa il confine d'anno correttamente (monthly)", () => {
    const base = new Date(2026, 10, 15, 12, 0); // 15 nov 2026
    const d = nthRecurrence(base, "monthly", 3); // +3 mesi → 15 feb 2027
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(15);
  });
});
