// src/test/paginazione.test.js
// ST-3 — una lettura che deve arrivare INTERA non può essere una `select`
// nuda.
//
// PERCHÉ ESISTE. PostgREST tronca ogni select a `db-max-rows` (1000 di default
// sui progetti Supabase) rispondendo **HTTP 200 senza errore**. Un difetto di
// questo tipo non fallisce da solo: `Clients.list()` ha convissuto con 818
// righe in produzione senza che nulla lo segnalasse, e il primo sintomo
// sarebbe stato un cliente che "non esiste" — non un errore.
//
// Le asserzioni sono quindi due, e la seconda è quella che conta: che il
// risultato contenga TUTTE le righe anche quando il server le consegna in
// pagine, cioè che il troncamento silenzioso non sia rappresentabile.
import { describe, it, expect, vi, beforeEach } from "vitest";

const CAP = 1000;              // il cap che il finto server applica
const TOTALE = 1500;           // righe oltre il cap: due pagine

// Righe finte con id crescente, così l'ordine è verificabile.
const RIGHE = Array.from({ length: TOTALE }, (_, i) => ({
  id: `c${String(i).padStart(4, "0")}`,
  name: `Cliente ${i}`,
}));

// Registro delle chiamate: serve a distinguere "ha paginato" da "ha chiesto
// tutto in un colpo e il finto server gliene ha dati 1000".
const chiamate = [];

// Finto builder PostgREST: thenable monouso, `.order()` concatenabile,
// `.range(da, a)` che tronca al cap come fa il server vero e restituisce il
// `count` totale nel Content-Range.
const builder = (tabella) => {
  const stato = { ordini: [], conteggio: false, eq: [] };
  const self = {
    select: (_cols, opts) => { stato.conteggio = opts?.count === "exact"; return self; },
    order: (col) => { stato.ordini.push(col); return self; },
    // `Tasks.list()` filtra il cestino con `.is('deleted_at', null)` DOPO la
    // select: il builder deve restare concatenabile, altrimenti il test
    // fallirebbe per la forma della catena e non per ciò che misura. Stesso
    // discorso per `.eq()`, che `TaskThreads.historyForTask` usa per il
    // `task_id` (A-3, passo 3); il filtro viene registrato perché c'è un test
    // che verifica proprio quello.
    is: () => self,
    eq: (col, val) => { stato.eq.push([col, val]); return self; },
    range: (da, a) => {
      const richieste = a - da + 1;
      const consegnate = Math.min(richieste, CAP);
      chiamate.push({ tabella, da, a, ordini: [...stato.ordini], conteggio: stato.conteggio, eq: [...stato.eq] });
      return Promise.resolve({
        data: RIGHE.slice(da, da + consegnate),
        count: stato.conteggio ? TOTALE : null,
        error: null,
      });
    },
    // Una select senza .range(): è la forma che il cap tronca in silenzio.
    then: (risolvi) => risolvi({ data: RIGHE.slice(0, CAP), count: null, error: null }),
  };
  return self;
};

vi.mock("../../lib/supabase", () => ({
  supabase: { from: vi.fn((tabella) => builder(tabella)) },
}));

const { Clients, Tasks, TaskThreads, Messages, Notices, Conversations } = await import("../../lib/api.js");
const { fetchAllRows, fetchRowsUpTo } = await import("../../lib/pagination.js");

beforeEach(() => { chiamate.length = 0; });

describe("Clients.list — non può essere troncata dal cap PostgREST", () => {
  it("pagina con .range() invece di fare una select nuda", async () => {
    await Clients.list();
    expect(chiamate.length).toBeGreaterThan(0);
    expect(chiamate[0].da).toBe(0);
  });

  it("chiede il conteggio esatto: è l'unico modo di sapere quando fermarsi", async () => {
    // Senza `count: 'exact'` l'unico criterio sarebbe la pagina vuota, e una
    // risposta da 1000 righe su una tabella di 1000 righe sarebbe
    // indistinguibile da una troncata.
    await Clients.list();
    expect(chiamate[0].conteggio).toBe(true);
  });

  it("ordina in modo DETERMINISTICO (name non è unico: due omonimi esistono)", async () => {
    // Senza una seconda chiave unica Postgres non garantisce lo stesso ordine
    // fra due query, e due pagine consecutive possono ripetere o saltare una
    // riga — un difetto che si manifesta solo oltre il cap, cioè dove nessuno
    // guarda.
    await Clients.list();
    expect(chiamate[0].ordini).toEqual(["name", "id"]);
  });

  it("restituisce TUTTE le 1500 righe, non le prime 1000", async () => {
    const { data, error } = await Clients.list();
    expect(error).toBeNull();
    expect(data).toHaveLength(TOTALE);
    expect(data[0].id).toBe("c0000");
    expect(data[TOTALE - 1].id).toBe("c1499");
  });
});

// ─── C-1 · le tre letture aggiunte il 12 agosto 2026 ────────────────────────
// `clients` era il caso NOTO (818 righe contro un cap di 1000). Queste tre
// erano il caso che nessuno stava guardando, e una di esse aveva una data:
// `task_history` guadagna una riga per ogni cambio di stato, priorità,
// scadenza, assegnatario o cestinamento, e a 621 righe con ~14,8 al giorno era
// a ~26 giorni dal cap.
//
// Il sintomo che questi test impediscono non è "mancano dei dati". Il reload
// completo passa dalle risorse ANNIDATE di TASK_SELECT_WITH_COMMENTS, che il
// cap del primo livello non tocca; è il reload SELETTIVO (`soloThread` in
// useAppHydration, quello che scatta quando un collega commenta) a rileggere
// la tabella piatta. Con l'ordine ascendente a cadere sono le righe più
// RECENTI, e `SET_TASK_THREADS` traduce una riga assente in `[]`. Cioè: il
// thread sparisce quando qualcun altro commenta e torna premendo F5.
//
// ─── A-3, passo 3 · la cronologia è ancora qui, ma con un'altra forma ──────
// `TaskThreads.history()` (per corpus) è diventata `historyForTask(taskId)`.
// Resta in questo elenco — e la paginazione resta il contratto — per una
// ragione che vale la pena dire, perché a prima vista il filtro `.eq` la
// renderebbe superflua: il cap di PostgREST non guarda quanto è VEROSIMILE il
// risultato, guarda quante righe tornano. Una cronologia di un task non
// arriverà a mille righe, ma è esattamente il ragionamento con cui
// `Clients.list()` è rimasta una select nuda fino a 818 righe (ST-3). Il costo
// di tenerla paginata è zero; il costo di dedurre che non serve è una riga che
// non arriva, senza errore.
//
// ─── B-3 dell'audit del 16 agosto · le due letture rimaste ─────────────────
// Il documento del 12 agosto (C-1) chiudeva con «non resta una sola lettura
// del data layer che possa essere troncata in silenzio». La frase era più
// larga di ciò che era stato fatto: sette `select` nude erano rimaste, e di
// quelle cinque sono su tabelle limitate per costruzione (il team, le
// categorie, i template dei messaggi) dove una paginazione non aggiungerebbe
// nulla. Due no, ed è la stessa proprietà che conta per `task_history`: la
// bacheca non ha potatura, e le conversazioni ne guadagnano una per ogni chat
// aperta. Sono lontanissime dal cap — ma è esattamente il ragionamento con cui
// `Clients.list()` è rimasta una select nuda fino a 818 righe (ST-3).
describe.each([
  ["Tasks.list", () => Tasks.list(), ["due_date", "id"]],
  ["TaskThreads.comments", () => TaskThreads.comments(), ["created_at", "id"]],
  ["TaskThreads.historyForTask", () => TaskThreads.historyForTask("t1"), ["created_at", "id"]],
  ["Notices.list", () => Notices.list(), ["pinned", "created_at", "id"]],
  ["Conversations.listMine", () => Conversations.listMine(), ["updated_at", "id"]],
])("%s — non può essere troncata dal cap PostgREST", (_nome, chiama, ordiniAttesi) => {
  it("pagina con .range() invece di fare una select nuda", async () => {
    await chiama();
    expect(chiamate.length).toBeGreaterThan(0);
    expect(chiamate[0].da).toBe(0);
  });

  it("chiede il conteggio esatto", async () => {
    await chiama();
    expect(chiamate[0].conteggio).toBe(true);
  });

  it("ordina in modo DETERMINISTICO, chiudendo su una colonna unica", async () => {
    // Né `due_date` né `created_at` sono unici: il trigger log_task_history()
    // inserisce più righe nella STESSA transazione (stato e priorità cambiati
    // insieme hanno lo stesso timestamp al microsecondo), e senza una chiave
    // di spareggio due pagine consecutive possono ripetere o saltare una riga.
    await chiama();
    expect(chiamate[0].ordini).toEqual(ordiniAttesi);
  });

  it("restituisce TUTTE le 1500 righe, non le prime 1000", async () => {
    const { data, error } = await chiama();
    expect(error).toBeNull();
    expect(data).toHaveLength(TOTALE);
    expect(data[TOTALE - 1].id).toBe("c1499");
  });
});

// ─── A-3, passo 3 · la cronologia si legge PER TASK APERTO ────────────────
// Il filtro è la correzione, non un dettaglio dell'implementazione: senza,
// questa lettura torna a scaricare la cronologia di TUTTI i task su un
// percorso che scatta a ogni modifica fatta da chiunque, ed è muta — funziona,
// costa, e nessun test fallisce.
describe("TaskThreads.historyForTask — legge la cronologia di UN task", () => {
  it("filtra per task_id invece di leggere il corpus", async () => {
    await TaskThreads.historyForTask("task-42");
    expect(chiamate[0].eq).toEqual([["task_id", "task-42"]]);
  });

  it("i commenti restano invece per corpus: la ricerca globale ci cerca dentro", async () => {
    // `AdvancedSearchPanel` fa `matchTermini(… (t.comments || []).map(c => c.text))`.
    // È la differenza fra le due tabelle figlie, e la ragione per cui il passo
    // 3 di A-3 tocca solo la cronologia.
    await TaskThreads.comments();
    expect(chiamate[0].eq).toEqual([]);
  });
});

// ─── B-2 · Messages.listAll dichiarava un limite (2000) che il cap del
// server (1000) troncava in silenzio, restituendo sempre e solo i 1000
// messaggi più recenti anche quando ne erano stati chiesti 2000.
describe("Messages.listAll — il limite dichiarato deve essere davvero consegnato", () => {
  it("pagina con .range() invece di un .limit() nudo", async () => {
    await Messages.listAll(2000);
    expect(chiamate.length).toBeGreaterThan(0);
    expect(chiamate[0].da).toBe(0);
  });

  it("ordina in modo deterministico, chiudendo su id", async () => {
    await Messages.listAll(2000);
    expect(chiamate[0].ordini).toEqual(["created_at", "id"]);
  });

  it("restituisce fino a 2000 righe, non le prime 1000 troncate dal cap", async () => {
    const { data, error } = await Messages.listAll(2000);
    expect(error).toBeNull();
    expect(data).toHaveLength(TOTALE); // 1500: sotto il limite di 2000, sopra il cap di 1000
  });

  it("non richiede più pagine di quelle necessarie a coprire il limite", async () => {
    chiamate.length = 0;
    await Messages.listAll(2000);
    // 2000 / 1000 (PAGE_SIZE) = al più due richieste, non una scarica-tutto.
    expect(chiamate.length).toBeLessThanOrEqual(2);
  });
});

describe("fetchAllRows — il contratto della paginazione", () => {
  it("propaga l'errore invece di restituire una lista parziale", async () => {
    const { data, error } = await fetchAllRows(() => ({
      range: () => Promise.resolve({ data: null, count: null, error: { message: "boom" } }),
    }));
    // Mezza tabella con `error: null` sarebbe il difetto che questo modulo
    // esiste per impedire, in un'altra forma.
    expect(data).toBeNull();
    expect(error).toEqual({ message: "boom" });
  });

  it("si ferma su una pagina vuota anche se `count` non arriva", async () => {
    let n = 0;
    const { data, error } = await fetchAllRows(() => ({
      range: () => Promise.resolve({
        data: n++ === 0 ? [{ id: 1 }] : [],
        count: null,          // server che non manda il Content-Range
        error: null,
      }),
    }));
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

// B-2 · fetchRowsUpTo: come fetchAllRows, ma con un tetto — smette di
// chiedere pagine appena raggiunge `limit`, non solo a fine tabella.
describe("fetchRowsUpTo — pagina fino a un tetto, non fino a fine tabella", () => {
  it("propaga l'errore invece di restituire una lista parziale", async () => {
    const { data, error } = await fetchRowsUpTo(() => ({
      range: () => Promise.resolve({ data: null, error: { message: "boom" } }),
    }), 2000);
    expect(data).toBeNull();
    expect(error).toEqual({ message: "boom" });
  });

  it("si ferma su una pagina più corta di quella richiesta anche sotto il limite", async () => {
    let n = 0;
    const { data, error } = await fetchRowsUpTo(() => ({
      range: () => Promise.resolve({
        data: n++ === 0 ? [{ id: 1 }] : [],
        error: null,
      }),
    }), 2000);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("non supera `limit` righe anche se il server ne avrebbe di più", async () => {
    const range = vi.fn((da, a) =>
      Promise.resolve({
        data: Array.from({ length: a - da + 1 }, (_, i) => ({ id: da + i })),
        error: null,
      }));
    const { data, error } = await fetchRowsUpTo(() => ({ range }), 1500);
    expect(error).toBeNull();
    expect(data).toHaveLength(1500);
    // L'ultima .range() chiesta non deve mai sforare oltre l'indice 1499.
    const ultima = range.mock.calls.at(-1);
    expect(ultima[1]).toBe(1499);
  });

  it("chiede al più due pagine per un limite di 2000 righe (PAGE_SIZE=1000)", async () => {
    const range = vi.fn((da, a) =>
      Promise.resolve({
        data: Array.from({ length: a - da + 1 }, (_, i) => ({ id: da + i })),
        error: null,
      }));
    await fetchRowsUpTo(() => ({ range }), 2000);
    expect(range).toHaveBeenCalledTimes(2);
  });
});
