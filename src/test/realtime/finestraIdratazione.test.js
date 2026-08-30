// src/test/finestraIdratazione.test.js
// A-3 · La finestra dell'idratazione, lato data layer.
//
// PERCHÉ ESISTE. `Tasks.list` è la lettura che alimenta OGNI vista dell'app, e
// dal 17 agosto ha un terzo parametro — `completeDal` — che decide quanta
// parte dello storico entra nel payload d'avvio. Un parametro che sbaglia in
// un verso costa banda; sbagliando nell'altro fa SPARIRE delle task senza che
// nulla lo dica, che è esattamente la famiglia di difetto contro cui esiste
// `paginazione.test.js` (il troncamento silenzioso del cap PostgREST) — con
// l'aggravante che qui il filtro lo scriviamo noi.
//
// Le tre proprietà verificate sotto sono quelle che, se cadessero, non
// farebbero fallire nulla in modo visibile:
//
//   1. senza `completeDal` la query è ESATTAMENTE quella di prima. È il
//      percorso del caricamento dello storico (Archivio, Cestino, export…):
//      se la finestra ci finisse dentro per errore, quelle viste
//      mostrerebbero un archivio incompleto chiamandolo completo.
//   2. `completeDal` e `includeDeleted` sono ASSI DIVERSI. La finestra parla
//      di task completate; il cestino ha la sua chiave. Confonderli
//      significherebbe che chiedere il cestino porta con sé mezzo archivio, o
//      peggio, che la finestra si porti via il cestino.
//   3. il predicato è FAIL-OPEN sulle righe senza `completed_at`. Per
//      l'invariante della migration 20260630144254 non ne esistono; se un
//      giorno esistessero, devono restare DENTRO la finestra invece di
//      diventare invisibili a ogni percorso.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Registro delle chiamate al finto builder PostgREST: qui non interessa la
// paginazione (quella è di paginazione.test.js) ma la FORMA della query — quali
// filtri sono stati applicati e con quali argomenti.
const chiamate = [];

const builder = (tabella) => {
  const stato = { is: [], or: [], ordini: [] };
  const self = {
    select: (_cols, _opts) => self,
    order: (col) => { stato.ordini.push(col); return self; },
    is: (col, val) => { stato.is.push([col, val]); return self; },
    or: (espressione) => { stato.or.push(espressione); return self; },
    range: () => {
      chiamate.push({ tabella, ...stato });
      return Promise.resolve({ data: [], count: 0, error: null });
    },
  };
  return self;
};

vi.mock("../../lib/supabase", () => {
  const supabase = { from: vi.fn((tabella) => builder(tabella)) };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { Tasks } = await import("../../lib/api.js");

// Senza millisecondi, come lo produce `inizioFinestra` in useAppHydration:
// dentro `or=(…)` il punto è il separatore fra colonna, operatore e valore.
const DAL = "2026-06-18T08:00:00Z";
const ultima = () => chiamate[chiamate.length - 1];

beforeEach(() => { chiamate.length = 0; });

describe("Tasks.list — la finestra sulle task completate (A-3)", () => {
  it("senza completeDal la query resta quella di prima: nessuna `or`", async () => {
    await Tasks.list({ withComments: true, includeDeleted: true });
    expect(ultima().or).toEqual([]);
    // …e il cestino non viene filtrato via.
    expect(ultima().is).toEqual([]);
    // L'ordinamento deterministico di C-1 non è negoziabile e resta.
    expect(ultima().ordini).toEqual(["due_date", "id"]);
  });

  it("con completeDal filtra le completate per data, lasciando passare le altre", async () => {
    await Tasks.list({ withComments: true, completeDal: DAL });
    expect(ultima().or).toHaveLength(1);
    const rami = ultima().or[0].split(",");
    expect(rami).toContain("status.neq.done");
    expect(rami).toContain(`completed_at.gte.${DAL}`);
  });

  it("è FAIL-OPEN sulle righe `done` senza data: restano dentro, non spariscono", async () => {
    // Una task che non sappiamo datare deve essere un difetto VISIBILE (una
    // riga di troppo nell'avvio), non uno invisibile (una riga che nessun
    // percorso carica più).
    await Tasks.list({ completeDal: DAL });
    expect(ultima().or[0].split(",")).toContain("completed_at.is.null");
  });

  it("il valore entra nell'espressione senza essere spezzato dal separatore", async () => {
    // `or=(colonna.operatore.valore, …)`: il punto separa i tre pezzi. Questo
    // caso verifica che il ramo del confine sia esattamente uno e finisca con
    // la data intera — se un giorno tornassero i millisecondi, il valore
    // conterrebbe il separatore e questo test lo direbbe.
    await Tasks.list({ completeDal: DAL });
    const rami = ultima().or[0].split(",");
    const confine = rami.filter(r => r.startsWith("completed_at.gte."));
    expect(confine).toEqual([`completed_at.gte.${DAL}`]);
    expect(confine[0].split(".")).toHaveLength(3);
  });

  it("la finestra NON è il cestino: `completeDal` non implica includeDeleted", async () => {
    await Tasks.list({ completeDal: DAL });
    expect(ultima().is).toEqual([["deleted_at", null]]);
  });

  it("il cestino NON è la finestra: includeDeleted non implica completeDal", async () => {
    await Tasks.list({ includeDeleted: true });
    expect(ultima().is).toEqual([]);
    expect(ultima().or).toEqual([]);
  });

  it("i due assi si combinano: cestino incluso E finestra sulle completate", async () => {
    await Tasks.list({ includeDeleted: true, completeDal: DAL });
    expect(ultima().is).toEqual([]);
    expect(ultima().or).toHaveLength(1);
  });
});
