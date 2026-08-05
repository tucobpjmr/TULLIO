// Conformità fra il registry di persistenza e il reducer.
//
// PERCHÉ QUESTO TEST ESISTE. Fino a questo refactor i controlli di permesso
// erano scritti DUE volte: una nel reducer (stato locale) e una nel wrapper
// dispatch di VoyageDesk (scritture su Supabase). Nulla garantiva che le due
// copie dicessero la stessa cosa, e una divergenza non produce un errore
// visibile: produce righe che si scostano in silenzio dal database — o, nel
// caso peggiore (EMPTY_TRASH), la cancellazione sul server di task che
// l'utente non poteva nemmeno vedere.
//
// Oggi entrambi i livelli chiamano le stesse funzioni pure di
// lib/permissions.js. Questo file lo verifica azione per azione, ruolo per
// ruolo: se qualcuno in futuro allenta un guard senza toccare il reducer (o
// viceversa), il test rompe.
import { describe, it, expect, vi, beforeEach } from "vitest";

// L'obiettivo è verificare CHI viene toccato, non il round-trip di rete: le
// API sono spie che registrano gli argomenti.
vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { reducer, makeInitialState, ADMIN_ONLY_ACTIONS } = await import("../state/reducer.js");
const { Tasks: TasksAPI } = await import("../lib/api.js");

const TEAM = [
  { id: "admin1",  name: "Admin",  role: "Admin",        active: true, pending: false },
  { id: "senior1", name: "Senior", role: "Senior Agent", active: true, pending: false },
  { id: "junior1", name: "Junior", role: "Junior Agent", active: true, pending: false },
  { id: "driver1", name: "Driver", role: "Driver",       active: true, pending: false },
];

const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;

const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["senior1"], comments: [], ...over,
});

function statoCon(tasks, uid) {
  const base = makeInitialState({ team: TEAM, currentUserId: uid });
  return { ...base, tasks, toast: null };
}

// Il reducer ha davvero applicato l'azione? Un rifiuto per permessi produce un
// toast di tipo "error"; un no-op (record inesistente) restituisce lo stesso
// oggetto state. Entrambi significano "non persistere".
const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toast?.type !== "error";
};

// ─── Casi: per ogni azione con guard, uno scenario e i ruoli da provare ──────
const T_PROPRIO_SENIOR = task({ id: uuid(1), assignees: ["senior1"] });
const T_CODA_GLOBALE   = task({ id: uuid(2), assignees: [] });
const T_TRANSFER_LIBERO = task({ id: uuid(3), assignees: [], category: "transfer" });

const SCENARI = [
  {
    nome: "ADD_TASK categoria sensibile",
    tasks: [],
    action: { type: "ADD_TASK", payload: task({ id: uuid(4), category: "payment" }) },
  },
  {
    nome: "ADD_TASK categoria ordinaria",
    tasks: [],
    action: { type: "ADD_TASK", payload: task({ id: uuid(4), category: "booking" }) },
  },
  {
    nome: "ADD_TASKS_BULK misto (una sola categoria vietata blocca tutto)",
    tasks: [],
    action: { type: "ADD_TASKS_BULK", payload: [
      task({ id: uuid(5), category: "booking" }),
      task({ id: uuid(6), category: "admin" }),
    ] },
  },
  {
    nome: "UPDATE_TASK su task altrui",
    tasks: [T_PROPRIO_SENIOR],
    action: { type: "UPDATE_TASK", payload: { id: uuid(1), title: "Modificato" } },
  },
  {
    nome: "UPDATE_TASK su task inesistente",
    tasks: [],
    action: { type: "UPDATE_TASK", payload: { id: uuid(9), title: "Fantasma" } },
  },
  {
    nome: "MOVE_TASK dalla coda globale",
    tasks: [T_CODA_GLOBALE],
    action: { type: "MOVE_TASK", payload: { taskId: uuid(2), newStatus: "inprogress" } },
  },
  {
    nome: "MOVE_TASK transfer libero",
    tasks: [T_TRANSFER_LIBERO],
    action: { type: "MOVE_TASK", payload: { taskId: uuid(3), newStatus: "done" } },
  },
  {
    nome: "DELETE_TASK dalla coda globale",
    tasks: [T_CODA_GLOBALE],
    action: { type: "DELETE_TASK", payload: uuid(2) },
  },
  {
    nome: "RESTORE_TASK di un task altrui cestinato",
    tasks: [{ ...T_PROPRIO_SENIOR, deletedAt: new Date().toISOString() }],
    action: { type: "RESTORE_TASK", payload: uuid(1) },
  },
  {
    nome: "PURGE_TASK di un task altrui cestinato",
    tasks: [{ ...T_PROPRIO_SENIOR, deletedAt: new Date().toISOString() }],
    action: { type: "PURGE_TASK", payload: uuid(1) },
  },
  {
    nome: "ADD_COMMENT su task altrui non urgente",
    tasks: [T_PROPRIO_SENIOR],
    action: { type: "ADD_COMMENT", payload: { taskId: uuid(1), comment: { text: "ciao" } } },
  },
];

const RUOLI = ["admin1", "senior1", "junior1", "driver1"];

describe("persistence — i guard concordano con il reducer", () => {
  for (const { nome, tasks, action } of SCENARI) {
    for (const uid of RUOLI) {
      it(`${nome} — ${uid}`, () => {
        const state = statoCon(tasks, uid);
        const spec = PERSISTENCE[action.type];
        expect(spec, `manca la entry di persistenza per ${action.type}`).toBeDefined();
        expect(spec.guard, `${action.type} dovrebbe avere un guard`).toBeTypeOf("function");

        const permessoDaPersistenza = spec.guard(state, action, uid);
        const permessoDalReducer = reducerHaApplicato(state, action);

        expect(permessoDaPersistenza).toBe(permessoDalReducer);
      });
    }
  }
});

describe("persistence — gate admin-only", () => {
  // Il gate vive nel wrapper reducer (ADMIN_ONLY_ACTIONS) e viene riusato tale
  // quale da useSyncedDispatch: qui verifichiamo che l'elenco sia effettivo,
  // così nessuna azione amministrativa può essere spedita al server da un
  // utente che il reducer respinge.
  it.each([...ADMIN_ONLY_ACTIONS])("%s è negata a un non-admin", (type) => {
    const state = statoCon([], "senior1");
    const next = reducer(state, { type, payload: {} });
    expect(next.toast?.type).toBe("error");
    expect(next).not.toBe(state);
  });

  it("le stesse azioni passano il gate per un admin", () => {
    const state = statoCon([], "admin1");
    const next = reducer(state, { type: "SET_AGENCY_NAME", payload: "Nuova Agenzia" });
    expect(next.agencyName).toBe("Nuova Agenzia");
  });
});

// Le due azioni senza guard che calcolano da sole l'insieme di righe da
// toccare: sono quelle in cui una divergenza dal reducer costa più cara.
describe("persistence — insiemi calcolati (EMPTY_TRASH, RENAME_CLIENT_IN_TASKS)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("EMPTY_TRASH elimina sul server ESATTAMENTE i task che il reducer toglie", async () => {
    const cestinati = [
      { ...task({ id: uuid(1), assignees: ["junior1"] }), deletedAt: "2026-01-01T10:00:00Z" },
      { ...task({ id: uuid(2), assignees: ["senior1"] }), deletedAt: "2026-01-01T10:00:00Z" },
      { ...task({ id: uuid(3), assignees: [] }),          deletedAt: "2026-01-01T10:00:00Z" },
    ];
    const state = statoCon(cestinati, "junior1");   // il Junior gestisce solo i propri
    const action = { type: "EMPTY_TRASH" };

    const next = reducer(state, action);
    const rimossiDalReducer = cestinati
      .filter(t => !next.tasks.some(n => n.id === t.id))
      .map(t => t.id);

    await PERSISTENCE.EMPTY_TRASH.persist(state, action, "junior1");
    const eliminatiSulServer = TasksAPI.hardDelete.mock.calls.map(([id]) => id);

    expect(eliminatiSulServer.sort()).toEqual(rimossiDalReducer.sort());
    // Il caso concreto che il commento originale segnalava come rischio: il
    // Junior non deve trascinarsi dietro i task cestinati degli altri.
    expect(eliminatiSulServer).toEqual([uuid(1)]);
  });

  it("RENAME_CLIENT_IN_TASKS aggiorna sul server solo i task rinominati dal reducer", async () => {
    const tasks = [
      task({ id: uuid(1), client: "Rossi Mario", assignees: ["junior1"] }),
      task({ id: uuid(2), client: "rossi  mario", assignees: ["senior1"] }), // stessa chiave, altrui
      task({ id: uuid(3), client: "Bianchi Ada", assignees: ["junior1"] }),
    ];
    const state = statoCon(tasks, "junior1");
    const action = { type: "RENAME_CLIENT_IN_TASKS", payload: { from: "Rossi Mario", to: "Rossi Mario Jr" } };

    const next = reducer(state, action);
    const rinominatiDalReducer = next.tasks
      .filter((t, i) => t.client !== tasks[i].client)
      .map(t => t.id);

    await PERSISTENCE.RENAME_CLIENT_IN_TASKS.persist(state, action, "junior1");
    const aggiornatiSulServer = TasksAPI.update.mock.calls.map(([id]) => id);

    expect(aggiornatiSulServer.sort()).toEqual(rinominatiDalReducer.sort());
    expect(aggiornatiSulServer).toEqual([uuid(1)]);
  });

  it("RENAME_CLIENT_IN_TASKS non chiama il server quando il nome non cambia davvero", async () => {
    const state = statoCon([task({ client: "Rossi Mario" })], "admin1");
    const action = { type: "RENAME_CLIENT_IN_TASKS", payload: { from: "Rossi Mario", to: "rossi  mario" } };
    await PERSISTENCE.RENAME_CLIENT_IN_TASKS.persist(state, action, "admin1");
    expect(TasksAPI.update).not.toHaveBeenCalled();
  });
});

describe("persistence — normalizzazione degli id", () => {
  it("ADD_TASK genera un uuid quando il payload non ne ha uno valido", () => {
    const state = statoCon([], "admin1");
    const action = { type: "ADD_TASK", payload: { ...task({ id: "temp-123" }) } };
    const norm = PERSISTENCE.ADD_TASK.normalize(action, state, "admin1");
    expect(norm.payload.id).not.toBe("temp-123");
    expect(norm.payload.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("ADD_TASK conserva un uuid già valido (idempotenza fra UI e DB)", () => {
    const state = statoCon([], "admin1");
    const action = { type: "ADD_TASK", payload: task({ id: uuid(7) }) };
    expect(PERSISTENCE.ADD_TASK.normalize(action, state, "admin1").payload.id).toBe(uuid(7));
  });

  it("ADD_NOTICE assegna l'autore corrente se il payload non lo porta", () => {
    const state = statoCon([], "senior1");
    const action = { type: "ADD_NOTICE", payload: { text: "Riunione venerdì" } };
    expect(PERSISTENCE.ADD_NOTICE.normalize(action, state, "senior1").payload.author).toBe("senior1");
  });
});

describe("persistence — rollback dichiarati", () => {
  it("ADD_TASKS_BULK rimanda indietro esattamente gli id del batch", () => {
    const state = statoCon([], "admin1");
    const action = { type: "ADD_TASKS_BULK", payload: [task({ id: uuid(1) }), task({ id: uuid(2) })] };
    expect(PERSISTENCE.ADD_TASKS_BULK.rollback(state, action))
      .toEqual({ type: "ROLLBACK_TASKS_BULK", payload: [uuid(1), uuid(2)] });
  });

  it("DELETE_CLIENT ripristina il cliente rimosso in ottimistico", () => {
    const cliente = { id: "c1", name: "Rossi" };
    const state = { ...statoCon([], "admin1"), clients: [cliente] };
    const action = { type: "DELETE_CLIENT", payload: "c1" };
    expect(PERSISTENCE.DELETE_CLIENT.rollback(state, action))
      .toEqual({ type: "RESTORE_CLIENT", payload: cliente });
  });

  it("DELETE_CLIENT traduce la violazione di foreign key in un messaggio actionable", () => {
    const testo = PERSISTENCE.DELETE_CLIENT.mapError({ code: "23503", message: 'violates foreign key constraint "liste_viaggio_client_id_fkey"' });
    expect(testo).toMatch(/liste viaggio collegate/i);
    // Gli altri errori passano invariati.
    expect(PERSISTENCE.DELETE_CLIENT.mapError({ code: "500", message: "boom" })).toBe("boom");
  });
});
