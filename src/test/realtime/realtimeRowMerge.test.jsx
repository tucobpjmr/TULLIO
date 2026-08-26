// Suggerimento strategico n.1 dell'audit del 16 agosto — merge per-riga
// invece di refetch del corpus.
//
// IL COSTO CHE QUESTA CORREZIONE ELIMINA. Fino a questa correzione, ogni
// evento realtime su `tasks`, `notices` o `clients` — qualunque fosse la sua
// portata, UNA riga cambiata da un solo campo — ricaricava l'ENTITÀ INTERA:
// `Tasks.list({withComments:true, includeDeleted:true})` (join sui nomi,
// cestino incluso, non paginata), `Notices.list()`, `Clients.list()`. Il
// costo cresce col PRODOTTO fra numero di righe e frequenza di scrittura, ed
// è quello che due meccanismi tolgono insieme:
//
//   1. `applyRow` (useDebouncedTableSubscription.js) — se ritorna `true`,
//      l'evento non entra nel debounce di reload: nessuna query parte.
//   2. `applicaRigaRealtime` (state/pendingWrites.js) — la stessa invariante
//      di `fondiScrittureInVolo` («per un id in volo vince SEMPRE il locale»)
//      applicata a UN evento invece che a un refetch intero.
//
// Questo file blinda la METÀ REDUCER del meccanismo: applicaRigaRealtime allo
// stato puro, e i tre case MERGE_TASK_ROW/MERGE_NOTICE_ROW/MERGE_CLIENT_ROW
// che la usano. La metà "l'evento non genera una query" è in
// src/test/realtimeApplyRow.test.jsx (il parametro sull'hook) e
// src/test/realtimeGranularita.test.jsx (il collegamento in useAppHydration).
import { describe, it, expect } from "vitest";

const { applicaRigaRealtime } = await import("../../state/pendingWrites.js");
const { reducer, makeInitialState } = await import("../../state/reducer.js");

const TEAM = [{ id: "admin1", name: "Admin", role: "Admin", active: true, pending: false }];
const statoBase = (over = {}) => ({
  ...makeInitialState({ team: TEAM, currentUserId: "admin1" }),
  ...over,
});
const inVolo = (...ids) => new Map(ids.map(id => [id, 1]));

describe("applicaRigaRealtime — l'invariante per un evento singolo", () => {
  it("INSERT: una riga con un id nuovo si aggiunge", () => {
    const out = applicaRigaRealtime(
      [{ id: "a" }],
      new Map(),
      { eventType: "INSERT", id: "b", row: { id: "b", nome: "nuova" } },
    );
    expect(out.map(r => r.id).sort()).toEqual(["a", "b"]);
  });

  it("UPDATE: una riga con un id esistente si sostituisce, in posizione", () => {
    const out = applicaRigaRealtime(
      [{ id: "a", nome: "vecchia" }, { id: "b", nome: "altra" }],
      new Map(),
      { eventType: "UPDATE", id: "a", row: { id: "a", nome: "aggiornata" } },
    );
    expect(out).toEqual([{ id: "a", nome: "aggiornata" }, { id: "b", nome: "altra" }]);
  });

  it("DELETE: la riga sparisce, le altre restano intatte", () => {
    const out = applicaRigaRealtime(
      [{ id: "a" }, { id: "b" }],
      new Map(),
      { eventType: "DELETE", id: "a" },
    );
    expect(out.map(r => r.id)).toEqual(["b"]);
  });

  it("una scrittura in volo sullo stesso id scarta l'evento: vince il locale", () => {
    const locale = [{ id: "a", nome: "il mio valore ottimistico" }];
    const out = applicaRigaRealtime(
      locale,
      inVolo("a"),
      { eventType: "UPDATE", id: "a", row: { id: "a", nome: "quello di un altro client" } },
    );
    expect(out).toBe(locale); // stesso riferimento: nessuna copia, nessun tocco
  });

  it("una scrittura in volo protegge anche dalla propria DELETE", () => {
    const locale = [{ id: "a" }];
    const out = applicaRigaRealtime(locale, inVolo("a"), { eventType: "DELETE", id: "a" });
    expect(out).toBe(locale);
  });

  it("fondiRiga, quando passato, combina la riga precedente con quella arrivata", () => {
    const out = applicaRigaRealtime(
      [{ id: "a", campo: "vecchio", extra: "da preservare" }],
      new Map(),
      { eventType: "UPDATE", id: "a", row: { id: "a", campo: "nuovo" } },
      (prev, row) => ({ ...row, extra: prev.extra }),
    );
    expect(out).toEqual([{ id: "a", campo: "nuovo", extra: "da preservare" }]);
  });

  it("senza fondiRiga, UPDATE sostituisce la riga per intero", () => {
    const out = applicaRigaRealtime(
      [{ id: "a", campo: "vecchio", extra: "sparisce" }],
      new Map(),
      { eventType: "UPDATE", id: "a", row: { id: "a", campo: "nuovo" } },
    );
    expect(out).toEqual([{ id: "a", campo: "nuovo" }]);
  });

  it("una collezione assente (mai idratata) vale come vuota, senza esplodere", () => {
    const out = applicaRigaRealtime(undefined, new Map(), { eventType: "INSERT", id: "a", row: { id: "a" } });
    expect(out).toEqual([{ id: "a" }]);
  });
});

describe("reducer — MERGE_TASK_ROW", () => {
  it("un UPDATE aggiorna i campi del task E preserva i commenti", () => {
    const state = statoBase({
      tasks: [{ id: "t1", title: "Volo Roma", status: "todo", comments: [{ id: "c1" }] }],
    });
    const next = reducer(state, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: "t1", row: { id: "t1", title: "Volo Roma", status: "done" } },
    });
    const t = next.tasks.find(t => t.id === "t1");
    // Il payload realtime non porta i commenti (colonna di un'altra tabella):
    // un merge totale li avrebbe azzerati ad ogni evento. La cronologia non
    // compare più in questa coppia — da A-3 (passo 3) non è un campo del task,
    // vive nello stato locale di TaskHistoryPanel.
    expect(t.status).toBe("done");
    expect(t.comments).toEqual([{ id: "c1" }]);
    expect("history" in t).toBe(false);
  });

  it("un INSERT aggiunge un task nuovo, con i commenti vuoti", () => {
    const state = statoBase({ tasks: [] });
    const next = reducer(state, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "INSERT", id: "t2", row: { id: "t2", title: "Task di un altro agente", comments: [] } },
    });
    expect(next.tasks.map(t => t.id)).toEqual(["t2"]);
  });

  it("un DELETE (purge/svuota cestino altrove) rimuove il task", () => {
    const state = statoBase({ tasks: [{ id: "t1" }, { id: "t2" }] });
    const next = reducer(state, { type: "MERGE_TASK_ROW", payload: { eventType: "DELETE", id: "t1" } });
    expect(next.tasks.map(t => t.id)).toEqual(["t2"]);
  });

  it("un task con scrittura in volo non viene toccato dall'evento altrui", () => {
    const state = statoBase({
      tasks: [{ id: "t1", title: "Il mio titolo ancora in volo", comments: [] }],
      pendingWrites: inVolo("t1"),
    });
    const next = reducer(state, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: "t1", row: { id: "t1", title: "Titolo di un altro client" } },
    });
    expect(next.tasks.find(t => t.id === "t1").title).toBe("Il mio titolo ancora in volo");
  });
});

describe("reducer — MERGE_NOTICE_ROW", () => {
  it("un UPDATE aggiorna l'avviso", () => {
    const state = statoBase({ notices: [{ id: "n1", text: "vecchio", pinned: false }] });
    const next = reducer(state, {
      type: "MERGE_NOTICE_ROW",
      payload: { eventType: "UPDATE", id: "n1", row: { id: "n1", text: "nuovo", pinned: true } },
    });
    expect(next.notices).toEqual([{ id: "n1", text: "nuovo", pinned: true }]);
  });

  it("un DELETE toglie l'avviso dalla bacheca", () => {
    const state = statoBase({ notices: [{ id: "n1" }, { id: "n2" }] });
    const next = reducer(state, { type: "MERGE_NOTICE_ROW", payload: { eventType: "DELETE", id: "n1" } });
    expect(next.notices.map(n => n.id)).toEqual(["n2"]);
  });

  it("un avviso con scrittura in volo non viene sovrascritto", () => {
    const state = statoBase({
      notices: [{ id: "n1", text: "il mio testo" }],
      pendingWrites: inVolo("n1"),
    });
    const next = reducer(state, {
      type: "MERGE_NOTICE_ROW",
      payload: { eventType: "UPDATE", id: "n1", row: { id: "n1", text: "testo altrui" } },
    });
    expect(next.notices.find(n => n.id === "n1").text).toBe("il mio testo");
  });
});

describe("reducer — MERGE_CLIENT_ROW", () => {
  it("un UPDATE aggiorna la scheda cliente", () => {
    const state = statoBase({ clients: [{ id: "c1", name: "Rossi Mario", city: "Roma" }] });
    const next = reducer(state, {
      type: "MERGE_CLIENT_ROW",
      payload: { eventType: "UPDATE", id: "c1", row: { id: "c1", name: "Rossi Mario", city: "Milano" } },
    });
    expect(next.clients.find(c => c.id === "c1").city).toBe("Milano");
  });

  it("un DELETE toglie il cliente dall'anagrafica", () => {
    const state = statoBase({ clients: [{ id: "c1" }, { id: "c2" }] });
    const next = reducer(state, { type: "MERGE_CLIENT_ROW", payload: { eventType: "DELETE", id: "c1" } });
    expect(next.clients.map(c => c.id)).toEqual(["c2"]);
  });

  it("un cliente con scrittura in volo non viene sovrascritto — la stessa finestra di rischio di SET_CLIENTS", () => {
    const state = statoBase({
      clients: [{ id: "c1", email: "nuova@esempio.it" }],
      pendingWrites: inVolo("c1"),
    });
    const next = reducer(state, {
      type: "MERGE_CLIENT_ROW",
      payload: { eventType: "UPDATE", id: "c1", row: { id: "c1", email: "vecchia@esempio.it" } },
    });
    expect(next.clients.find(c => c.id === "c1").email).toBe("nuova@esempio.it");
  });
});
