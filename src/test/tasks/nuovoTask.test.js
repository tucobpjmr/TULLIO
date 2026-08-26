// src/test/nuovoTask.test.js
//
// A-2 · La forma canonica di un task appena creato.
//
// I casi qui sotto non testano "una funzione che costruisce un oggetto": ogni
// gruppo corrisponde a una DIVERGENZA reale fra i cinque percorsi di creazione
// prima che la factory esistesse, e serve a impedire che torni. Le divergenze
// erano queste — misurate, non ipotizzate:
//
//   • `praticaRef` assente nel percorso di import (buco funzionale);
//   • `recurrence: "none"` in UN call site su cinque, per un campo che il
//     database non ha (vedi A-3);
//   • `estimatedHours` calcolato in tre modi diversi;
//   • `description` normalizzata in quattro modi diversi;
//   • `assignees` costruito come `[x]` con `x` possibilmente null;
//   • DuplicateTab che spreadava `...src`, portandosi dietro `completedAt`.

import { describe, it, expect } from "vitest";
import { nuovoTask, DEFAULT_TASK } from "../../lib/tasks/nuovoTask.js";
import { toDbTask } from "../../lib/mappers.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("nuovoTask — identità", () => {
  it("genera un uuid valido, diverso a ogni chiamata", () => {
    const a = nuovoTask({ title: "A" });
    const b = nuovoTask({ title: "B" });
    expect(a.id).toMatch(UUID_RE);
    expect(a.id).not.toBe(b.id);
  });

  it("rispetta un id già fornito dal chiamante", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    expect(nuovoTask({ title: "A", id }).id).toBe(id);
  });

  // L'uuid deve sopravvivere al mapper: è ciò che permette di caricare gli
  // allegati subito dopo la creazione, perché il path nel bucket parte dal
  // task_id. Se `toDbTask` lo rigenerasse, l'id in UI e quello sul database
  // divergerebbero fino al primo refetch.
  it("l'id sopravvive a toDbTask", () => {
    const t = nuovoTask({ title: "A" });
    expect(toDbTask(t).id).toBe(t.id);
  });
});

describe("nuovoTask — normalizzazione dei testi", () => {
  it("trimma il titolo e la descrizione", () => {
    const t = nuovoTask({ title: "  Volo Roma  ", description: "  due bagagli  " });
    expect(t.title).toBe("Volo Roma");
    expect(t.description).toBe("due bagagli");
  });

  // I quattro campi opzionali avevano quattro varianti della stessa regola
  // sparse sui call site (`x.trim() || null`, `String(x || "").trim() || null`,
  // `x || null`). Sul database la colonna è NULL, e "" non è NULL.
  it.each(["client", "praticaRef", "contact"])(
    "%s: stringa vuota, spazi e undefined valgono tutti null",
    (campo) => {
      expect(nuovoTask({ title: "A", [campo]: "" })[campo]).toBeNull();
      expect(nuovoTask({ title: "A", [campo]: "   " })[campo]).toBeNull();
      expect(nuovoTask({ title: "A" })[campo]).toBeNull();
      expect(nuovoTask({ title: "A", [campo]: "  X  " })[campo]).toBe("X");
    },
  );

  // `description` è l'eccezione voluta: sul database è una colonna testo che
  // le viste leggono senza guard, e il default è "" e non null.
  it("description assente è stringa vuota, non null", () => {
    expect(nuovoTask({ title: "A" }).description).toBe("");
  });
});

describe("nuovoTask — assegnatari", () => {
  // Tre call site su cinque scrivevano `assignees: x ? [x] : []`, e uno lo
  // scriveva già così. Passare `[null]` è la forma naturale del chiamante che
  // non sa se il valore c'è: la factory se ne occupa.
  it("scarta i valori vuoti invece di lasciarli nell'array", () => {
    expect(nuovoTask({ title: "A", assignees: [null] }).assignees).toEqual([]);
    expect(nuovoTask({ title: "A", assignees: [undefined, "u1", ""] }).assignees).toEqual(["u1"]);
  });

  it("assignees assente o non-array è un array vuoto", () => {
    expect(nuovoTask({ title: "A" }).assignees).toEqual([]);
    expect(nuovoTask({ title: "A", assignees: null }).assignees).toEqual([]);
  });

  // Il default è condiviso e viene spreadato a ogni chiamata: se non fosse
  // copiato, due task creati di fila condividerebbero lo stesso array.
  it("due task non condividono l'array degli assegnatari", () => {
    const a = nuovoTask({ title: "A" });
    const b = nuovoTask({ title: "B" });
    expect(a.assignees).not.toBe(b.assignees);
    expect(a.assignees).not.toBe(DEFAULT_TASK.assignees);
  });
});

describe("nuovoTask — scadenza", () => {
  it("converte il valore di un datetime-local in ISO", () => {
    const t = nuovoTask({ title: "A", dueDate: "2026-12-31T10:30" });
    expect(t.dueDate).toBe(new Date("2026-12-31T10:30").toISOString());
  });

  // Idempotenza: DuplicateTab parte da un task esistente, quindi passa un ISO
  // già normalizzato. Senza questa proprietà la factory non sarebbe utilizzabile
  // da tutti e cinque i percorsi con la stessa chiamata.
  it("un ISO già normalizzato passa invariato", () => {
    const iso = "2026-12-31T09:30:00.000Z";
    expect(nuovoTask({ title: "A", dueDate: iso }).dueDate).toBe(iso);
  });

  it("assente, vuota o stringa vuota → null", () => {
    expect(nuovoTask({ title: "A" }).dueDate).toBeNull();
    expect(nuovoTask({ title: "A", dueDate: "" }).dueDate).toBeNull();
    expect(nuovoTask({ title: "A", dueDate: null }).dueDate).toBeNull();
  });
});

describe("nuovoTask — ore stimate", () => {
  // Tre regole diverse sui cinque call site: la costante `1`, il valore del
  // template, e `parseFloat(cella) || 1` nell'import. Ora una sola.
  it.each([
    ["assente", undefined, 1],
    ["stringa numerica", "2.5", 2.5],
    ["numero", 3, 3],
    ["zero", 0, 1],
    ["negativo", -4, 1],
    ["non numerico", "molte", 1],
    ["NaN da parseFloat", NaN, 1],
  ])("%s → %s", (_caso, dato, atteso) => {
    expect(nuovoTask({ title: "A", estimatedHours: dato }).estimatedHours).toBe(atteso);
  });
});

describe("nuovoTask — la forma è chiusa", () => {
  // ⛔ Il caso che vale di più del file. Se qualcuno riaggiunge un campo a un
  // solo percorso di creazione — che è esattamente come `recurrence` è
  // sopravvissuto in QuickAddTask per mesi, e come `praticaRef` è sparito
  // dall'import — la forma canonica smette di essere canonica e nessun altro
  // test se ne accorge.
  it("le chiavi sono esattamente quelle attese", () => {
    expect(Object.keys(nuovoTask({ title: "A" })).sort()).toEqual([
      "assignees", "category", "client", "comments", "contact", "description",
      "dueDate", "estimatedHours", "id", "praticaRef", "priority", "status", "title",
    ]);
  });

  // `recurrence` non è un campo del task: non esiste sul database (nessuna
  // migrazione lo nomina), `toDbTask` non lo scrive e nessuna UI lo imposta.
  // Vedi A-3.
  it("non porta `recurrence`, nemmeno se il chiamante la passa", () => {
    const t = nuovoTask({ title: "A", recurrence: "weekly" });
    expect(t.recurrence).toBeUndefined();
    expect(toDbTask(t)).not.toHaveProperty("recurrence");
  });

  // Il caso di DuplicateTab: partendo da un task ESISTENTE si copiano i campi
  // di contenuto, non quelli che descrivono la vita della riga sorgente.
  it("non porta i timestamp di ciclo di vita del task sorgente", () => {
    const t = nuovoTask({
      title: "Copia",
      completedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(t.completedAt).toBeUndefined();
    expect(t.deletedAt).toBeUndefined();
    expect(t.status).toBe("todo");
  });

  it("i default non sono mutabili", () => {
    expect(Object.isFrozen(DEFAULT_TASK)).toBe(true);
  });
});
