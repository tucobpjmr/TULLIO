import { describe, it, expect, beforeEach } from "vitest";
import { reducer, makeInitialState } from "../state/reducer.js";

// Team di prova: un admin (marco) e una junior agent (gina). Le funzioni di
// permesso del reducer ricevono `state.team` e `state.currentUserId`, entrambi
// impostati da makeInitialState: il test non deve preparare nient'altro.
const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina", role: "junior agent", active: true, pending: false },
];

const UUID = "11111111-2222-4333-8444-555555555555";

function freshState(uid = "marco") {
  return makeInitialState({ team: TEAM_FIXTURE, currentUserId: uid });
}

const task = (over = {}) => ({
  id: UUID, title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["marco"], comments: [], ...over,
});

describe("reducer — task lifecycle (admin)", () => {
  let s;
  beforeEach(() => { s = freshState("marco"); });

  it("ADD_TASK inserisce in testa con toast di successo", () => {
    const next = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].id).toBe(UUID);
    expect(next.toasts.at(-1).type).toBe("success");
  });

  // L'insert in blocco su Supabase è atomica: se fallisce non esiste NESSUNA
  // delle task, quindi vanno tolte anche dallo stato ottimistico. Senza questo
  // restavano in lista task inesistenti sul server fino al reload successivo.
  it("ROLLBACK_TASKS_BULK toglie solo le task del batch fallito", () => {
    const T1 = "22222222-2222-4333-8444-555555555555";
    const T2 = "33333333-2222-4333-8444-555555555555";
    s = reducer(s, { type: "ADD_TASK", payload: task({ title: "Preesistente" }) });
    s = reducer(s, {
      type: "ADD_TASKS_BULK",
      payload: [task({ id: T1, title: "Bulk 1" }), task({ id: T2, title: "Bulk 2" })],
    });
    expect(s.tasks).toHaveLength(3);

    const next = reducer(s, { type: "ROLLBACK_TASKS_BULK", payload: [T1, T2] });
    expect(next.tasks.map(t => t.id)).toEqual([UUID]);
  });

  it("ROLLBACK_TASKS_BULK con lista vuota lascia lo stato intatto", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(reducer(s, { type: "ROLLBACK_TASKS_BULK", payload: [] })).toBe(s);
  });

  it("MOVE_TASK cambia lo status del task indicato", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    const next = reducer(s, { type: "MOVE_TASK", payload: { taskId: UUID, newStatus: "done" } });
    expect(next.tasks[0].status).toBe("done");
  });

  it("UPDATE_TASK applica il patch e sincronizza selectedTask", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    s = { ...s, selectedTask: s.tasks[0] };
    const next = reducer(s, { type: "UPDATE_TASK", payload: { id: UUID, title: "Nuovo titolo" } });
    expect(next.tasks[0].title).toBe("Nuovo titolo");
    expect(next.selectedTask.title).toBe("Nuovo titolo");
  });

  it("DELETE_TASK → RESTORE_TASK → PURGE_TASK", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    expect(s.tasks[0].deletedAt).toBeTruthy();
    s = reducer(s, { type: "RESTORE_TASK", payload: UUID });
    expect(s.tasks[0].deletedAt).toBeNull();
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    s = reducer(s, { type: "PURGE_TASK", payload: UUID });
    expect(s.tasks).toHaveLength(0);
  });

  it("EMPTY_TRASH elimina solo i task cestinati", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: UUID }) });
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: "22222222-2222-4333-8444-555555555555", title: "Vivo" }) });
    s = reducer(s, { type: "DELETE_TASK", payload: UUID });
    const next = reducer(s, { type: "EMPTY_TRASH" });
    expect(next.tasks).toHaveLength(1);
    expect(next.tasks[0].title).toBe("Vivo");
  });

  it("ADD_COMMENT appende il commento al task", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    const next = reducer(s, { type: "ADD_COMMENT", payload: { taskId: UUID, comment: { id: "c1", text: "ciao" } } });
    expect(next.tasks[0].comments).toHaveLength(1);
    expect(next.tasks[0].comments[0].text).toBe("ciao");
  });

  it("UNDO_LAST_ACTION ripristina lo status dopo una MOVE swipe", () => {
    s = reducer(s, { type: "ADD_TASK", payload: task({ status: "todo" }) });
    s = reducer(s, { type: "MOVE_TASK", payload: { taskId: UUID, newStatus: "done" }, swipe: true });
    expect(s.lastAction.type).toBe("MOVE_TASK");
    const next = reducer(s, { type: "UNDO_LAST_ACTION" });
    expect(next.tasks[0].status).toBe("todo");
    expect(next.lastAction).toBeNull();
  });
});

describe("reducer — permessi", () => {
  it("junior agent NON può creare task di categoria payment", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_TASK", payload: task({ category: "payment" }) });
    expect(next.tasks).toHaveLength(0);
    expect(next.toasts.at(-1).type).toBe("error");
  });

  it("junior agent può creare task di categoria normale", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_TASK", payload: task({ category: "booking", assignees: ["gina"] }) });
    expect(next.tasks).toHaveLength(1);
  });

  it("azioni admin-only sono bloccate per i non-admin", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "ADD_CATEGORY", payload: { key: "x", label: "X" } });
    expect(next.categories.x).toBeUndefined();
    expect(next.toasts.at(-1).type).toBe("error");
  });

  it("SET_VIEW admin è negata ai non-admin", () => {
    const s = freshState("gina");
    const next = reducer(s, { type: "SET_VIEW", payload: "admin" });
    expect(next.activeView).not.toBe("admin");
    expect(next.toasts.at(-1).type).toBe("error");
  });
});

// Il digest queue_stale (pannello notifiche) apre la Dashboard sulla tab
// "Coda Globale": SET_VIEW porta con sé la tab richiesta.
describe("reducer — SET_VIEW con tab coda", () => {
  it("senza queue non tocca dashboardQueue", () => {
    const s = freshState("marco");
    const next = reducer(s, { type: "SET_VIEW", payload: "calendar" });
    expect(next.activeView).toBe("calendar");
    expect(next.dashboardQueue).toBeNull();
  });

  it("con queue registra la tab richiesta", () => {
    const s = freshState("marco");
    const next = reducer(s, { type: "SET_VIEW", payload: "dashboard", queue: "global" });
    expect(next.activeView).toBe("dashboard");
    expect(next.dashboardQueue).toMatchObject({ tab: "global" });
  });

  it("il seq avanza a ogni richiesta, anche sulla stessa tab", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "dashboard", queue: "global" });
    const first = s.dashboardQueue.seq;
    s = reducer(s, { type: "SET_VIEW", payload: "dashboard", queue: "global" });
    expect(s.dashboardQueue.seq).toBe(first + 1);
  });
});

describe("reducer — categorie", () => {
  it("ADD_CATEGORY da admin aggiunge la categoria", () => {
    const s = freshState("marco");
    const next = reducer(s, { type: "ADD_CATEGORY", payload: { key: "hotel", label: "Hotel", icon: "🏨", color: "#14B8A6", bg: "#F0FDFA" } });
    expect(next.categories.hotel).toMatchObject({ label: "Hotel", icon: "🏨" });
  });

  it("SET_CATEGORIES rimpiazza l'intero dizionario (idratazione da DB)", () => {
    const s = freshState("marco");
    const payload = { hotel: { label: "Hotel", icon: "🏨", color: "#14B8A6", bg: "#F0FDFA" } };
    const next = reducer(s, { type: "SET_CATEGORIES", payload });
    expect(next.categories).toEqual(payload);
    expect(next.categories.booking).toBeUndefined(); // sostituito, non mergiato
  });

  it("SET_CATEGORIES con payload non valido non crasha (fallback {})", () => {
    const s = freshState("marco");
    const next = reducer(s, { type: "SET_CATEGORIES", payload: null });
    expect(next.categories).toEqual({});
  });
});

describe("reducer — bacheca avvisi", () => {
  let s;
  beforeEach(() => { s = freshState("marco"); });

  it("ADD_NOTICE / TOGGLE_PIN_NOTICE / DELETE_NOTICE", () => {
    s = reducer(s, { type: "ADD_NOTICE", payload: { id: UUID, text: "Avviso" } });
    expect(s.notices).toHaveLength(1);
    s = reducer(s, { type: "TOGGLE_PIN_NOTICE", payload: UUID });
    expect(s.notices[0].pinned).toBe(true);
    s = reducer(s, { type: "DELETE_NOTICE", payload: UUID });
    expect(s.notices).toHaveLength(0);
  });

  it("TOGGLE_NOTICE_REACTION aggiunge e poi rimuove la reazione dell'utente", () => {
    s = reducer(s, { type: "ADD_NOTICE", payload: { id: UUID, text: "Avviso" } });
    s = reducer(s, { type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: UUID, emoji: "👍" } });
    expect(s.notices[0].reactions["👍"]).toEqual(["marco"]);
    s = reducer(s, { type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: UUID, emoji: "👍" } });
    expect(s.notices[0].reactions["👍"]).toBeUndefined(); // lista vuota → emoji rimosso
  });
});

describe("reducer — CRM clienti", () => {
  it("ADD / UPDATE / DELETE_CLIENT", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_CLIENT", payload: { id: "cl1", name: "Rossi" } });
    expect(s.clients).toHaveLength(1);
    s = reducer(s, { type: "UPDATE_CLIENT", payload: { id: "cl1", name: "Bianchi" } });
    expect(s.clients[0].name).toBe("Bianchi");
    s = reducer(s, { type: "DELETE_CLIENT", payload: "cl1" });
    expect(s.clients).toHaveLength(0);
  });

  it("DELETE_CLIENT ottimistica: RESTORE_CLIENT la riporta in lista se il DB rifiuta", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_CLIENT", payload: { id: "cl1", name: "Rossi" } });
    const deleted = s.clients[0];
    s = reducer(s, { type: "DELETE_CLIENT", payload: "cl1" });
    expect(s.clients).toHaveLength(0);
    s = reducer(s, { type: "RESTORE_CLIENT", payload: deleted });
    expect(s.clients).toHaveLength(1);
    expect(s.clients[0].id).toBe("cl1");
    // idempotente: non duplica se il cliente è già presente
    s = reducer(s, { type: "RESTORE_CLIENT", payload: deleted });
    expect(s.clients).toHaveLength(1);
  });

  it("ADD_CLIENTS_BULK aggiunge più clienti in un colpo solo", () => {
    let s = freshState("marco");
    s = reducer(s, {
      type: "ADD_CLIENTS_BULK",
      payload: [{ id: "cl1", name: "Rossi" }, { id: "cl2", name: "Bianchi" }],
    });
    expect(s.clients).toHaveLength(2);
    expect(s.clients.map(c => c.name)).toEqual(["Rossi", "Bianchi"]);
    expect(s.toasts.at(-1).type).toBe("success");
  });

  // A-2: gemello di ROLLBACK_TASKS_BULK per ADD_CLIENTS_BULK. `createMany`
  // scrive a blocchi (lib/api.js), quindi un fallimento a metà lascia i
  // blocchi già scritti in lista — solo la coda va tolta.
  it("ROLLBACK_CLIENTS_BULK toglie solo i clienti indicati, non l'intero batch", () => {
    let s = freshState("marco");
    s = reducer(s, {
      type: "ADD_CLIENTS_BULK",
      payload: [{ id: "cl1", name: "Rossi" }, { id: "cl2", name: "Bianchi" }, { id: "cl3", name: "Verdi" }],
    });
    expect(s.clients).toHaveLength(3);
    // Solo cl3 (il terzo, non arrivato sul server) va tolto.
    const next = reducer(s, { type: "ROLLBACK_CLIENTS_BULK", payload: ["cl3"] });
    expect(next.clients.map(c => c.id)).toEqual(["cl1", "cl2"]);
  });

  it("ROLLBACK_CLIENTS_BULK con lista vuota lascia lo stato intatto", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_CLIENT", payload: { id: "cl1", name: "Rossi" } });
    expect(reducer(s, { type: "ROLLBACK_CLIENTS_BULK", payload: [] })).toBe(s);
  });

  // `task.client` è testo libero (colonna client_id text), non una FK verso
  // clients: rinominare l'anagrafica lascia indietro i task che la citano, e
  // la scheda cliente — che li cerca per nome — smette di mostrarli.
  describe("RENAME_CLIENT_IN_TASKS", () => {
    const conCliente = (id, client) => task({ id, client, assignees: ["marco"] });

    it("riscrive il nome nei task che lo citano, confronto insensibile a maiuscole e spazi", () => {
      let s = freshState("marco");
      s = { ...s, tasks: [
        conCliente("00000000-0000-4000-8000-000000000001", "rossi  mario"),
        conCliente("00000000-0000-4000-8000-000000000002", "ALTRO CLIENTE"),
      ] };
      s = reducer(s, { type: "RENAME_CLIENT_IN_TASKS", payload: { from: "ROSSI MARIO", to: "MARIO ROSSI" } });
      expect(s.tasks.map(t => t.client)).toEqual(["MARIO ROSSI", "ALTRO CLIENTE"]);
      expect(s.toasts.at(-1)).toEqual(expect.objectContaining({ message: "1 task aggiornato col nuovo nome cliente", type: "success" }));
    });

    it("non tocca nulla se nessun task cita quel cliente", () => {
      const s = { ...freshState("marco"), tasks: [conCliente(UUID, "ALTRO")] };
      expect(reducer(s, { type: "RENAME_CLIENT_IN_TASKS", payload: { from: "ROSSI", to: "BIANCHI" } })).toBe(s);
    });

    // Un task che l'utente non può modificare verrebbe comunque respinto dalla
    // RLS: mostrarlo come aggiornato sarebbe una bugia.
    it("salta i task che l'utente non può modificare", () => {
      let s = freshState("gina");
      s = { ...s, tasks: [{ ...conCliente(UUID, "ROSSI"), assignees: ["marco"], category: "admin" }] };
      const next = reducer(s, { type: "RENAME_CLIENT_IN_TASKS", payload: { from: "ROSSI", to: "BIANCHI" } });
      expect(next.tasks[0].client).toBe("ROSSI");
    });
  });
});

// A-1 dell'audit dell'11 agosto: prima ADD_MESSAGE_TEMPLATE generava un id
// locale ("mt" + Date.now()) a prescindere da persistence.js — il template
// non aveva alcuna riga corrispondente sul server con cui far coincidere
// l'id. Ora usa l'id già assegnato da normalize() (come ADD_CLIENT/
// ADD_NOTICE), lo stesso che persistence.persist scrive su
// public.message_templates.
describe("reducer — template messaggi chat", () => {
  it("ADD_MESSAGE_TEMPLATE usa l'id del payload quando presente (persistenza sincronizzata)", () => {
    let s = freshState("marco");
    const id = "11111111-2222-4333-8444-555555555555";
    s = reducer(s, { type: "ADD_MESSAGE_TEMPLATE", payload: { id, label: "Sollecito", text: "Testo" } });
    const aggiunto = s.messageTemplates.find(t => t.label === "Sollecito");
    expect(aggiunto.id).toBe(id);
  });

  it("ADD_MESSAGE_TEMPLATE genera un id locale in modalità demo (payload senza id)", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_MESSAGE_TEMPLATE", payload: { label: "Demo", text: "Testo" } });
    const aggiunto = s.messageTemplates.find(t => t.label === "Demo");
    expect(aggiunto.id).toBeTruthy();
  });

  it("ADD_MESSAGE_TEMPLATE ignora label/text vuoti", () => {
    const s = freshState("marco");
    expect(reducer(s, { type: "ADD_MESSAGE_TEMPLATE", payload: { label: "  ", text: "x" } })).toBe(s);
  });

  it("UPDATE_MESSAGE_TEMPLATE e DELETE_MESSAGE_TEMPLATE modificano solo il template indicato", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_MESSAGE_TEMPLATE", payload: { id: "mt1", label: "A", text: "x" } });
    s = reducer(s, { type: "UPDATE_MESSAGE_TEMPLATE", payload: { id: "mt1", label: "B" } });
    expect(s.messageTemplates.find(t => t.id === "mt1").label).toBe("B");
    s = reducer(s, { type: "DELETE_MESSAGE_TEMPLATE", payload: "mt1" });
    expect(s.messageTemplates.find(t => t.id === "mt1")).toBeUndefined();
  });

  // Idratazione (useAppHydration): sostituisce l'intero elenco, come
  // SET_CATEGORIES/SET_NOTICES — non un patch.
  it("SET_MESSAGE_TEMPLATES sostituisce l'intero elenco", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_MESSAGE_TEMPLATE", payload: { id: "mt1", label: "Locale", text: "x" } });
    s = reducer(s, {
      type: "SET_MESSAGE_TEMPLATES",
      payload: [{ id: "db1", label: "Dal server", text: "y" }],
    });
    expect(s.messageTemplates).toEqual([{ id: "db1", label: "Dal server", text: "y" }]);
  });

  it("SET_MESSAGE_TEMPLATES con un payload non-array svuota l'elenco invece di esplodere", () => {
    const s = freshState("marco");
    expect(reducer(s, { type: "SET_MESSAGE_TEMPLATES", payload: null }).messageTemplates).toEqual([]);
  });
});

describe("reducer — activity log & toast", () => {
  it("una LOGGED_ACTION aggiunge una voce al log", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(s.activityLog.length).toBe(1);
    expect(s.activityLog[0].type).toBe("ADD_TASK");
  });

  it("CLEAR_TOAST rimuove il toast indicato", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_TASK", payload: task() });
    expect(s.toasts).toHaveLength(1);
    const id = s.toasts[0].id;
    s = reducer(s, { type: "CLEAR_TOAST", payload: id });
    expect(s.toasts).toHaveLength(0);
  });

  it("azione sconosciuta ritorna lo stesso stato", () => {
    const s = freshState("marco");
    expect(reducer(s, { type: "NON_ESISTE" })).toBe(s);
  });
});

describe("reducer — RESTORE_BACKUP (merge non distruttivo)", () => {
  const T1 = "11111111-2222-4333-8444-555555555551";
  const T2 = "11111111-2222-4333-8444-555555555552";
  const T3 = "11111111-2222-4333-8444-555555555553";

  it("unisce i task: aggiorna gli esistenti per id, aggiunge i nuovi, conserva gli assenti", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: T1, title: "Originale 1" }) });
    s = reducer(s, { type: "ADD_TASK", payload: task({ id: T2, title: "Originale 2" }) });
    // Backup: aggiorna T2 e introduce T3; T1 NON è nel backup.
    s = reducer(s, { type: "RESTORE_BACKUP", payload: {
      tasks: [{ id: T2, title: "Aggiornato 2" }, task({ id: T3, title: "Nuovo 3" })],
    }});
    const byId = Object.fromEntries(s.tasks.map(t => [t.id, t]));
    expect(byId[T1].title).toBe("Originale 1");      // assente dal backup → conservato
    expect(byId[T2].title).toBe("Aggiornato 2");     // presente → aggiornato
    expect(byId[T3].title).toBe("Nuovo 3");          // nuovo → aggiunto
    expect(s.tasks).toHaveLength(3);
  });

  it("unisce le categorie per chiave senza eliminare quelle esistenti", () => {
    let s = freshState("marco");
    const before = Object.keys(s.categories).length;
    s = reducer(s, { type: "RESTORE_BACKUP", payload: {
      tasks: [],
      categories: { nuovacat: { label: "Nuova", color: "#000", bg: "#fff", icon: "★" } },
    }});
    expect(s.categories.nuovacat.label).toBe("Nuova");
    expect(Object.keys(s.categories).length).toBe(before + 1);
  });
});

// ─── M-1 · le compensazioni non parlano ───────────────────────────────────────
// I rollback di useSyncedDispatch riusano le action di mutazione: annullare un
// UPDATE_OWN_PROFILE fallito significa dispatchare un altro UPDATE_OWN_PROFILE
// con i valori di prima. Il case non sa di essere una compensazione e accodava
// il proprio toast di successo — "Profilo aggiornato!" restava nella pila
// accanto a "Salvataggio fallito", e il primo è quello a cui l'utente crede.
// `meta.compensazione` lo mette l'orchestratore; qui si verifica cosa il
// reducer ne fa: applica la transizione, non tocca i toast, non logga.
describe("reducer — meta.compensazione", () => {
  it("UPDATE_OWN_PROFILE di compensazione riporta i valori ma non accoda toast", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "UPDATE_OWN_PROFILE", payload: { name: "Marco Nuovo" } });
    expect(s.toasts).toHaveLength(1);
    const toastPrima = s.toasts;

    s = reducer(s, {
      type: "UPDATE_OWN_PROFILE",
      payload: { name: "Marco" },
      meta: { compensazione: true },
    });

    // La transizione di stato è quella del case: il rollback deve funzionare.
    expect(s.team.find(m => m.id === "marco").name).toBe("Marco");
    // Ma la pila dei toast è esattamente quella di prima.
    expect(s.toasts).toBe(toastPrima);
  });

  it("UPDATE_TEAM_MEMBER di compensazione non annuncia 'Agente aggiornato'", () => {
    let s = freshState("marco");
    s = reducer(s, {
      type: "UPDATE_TEAM_MEMBER",
      payload: { id: "gina", name: "Gina", role: "junior agent" },
      meta: { compensazione: true },
    });
    expect(s.toasts).toHaveLength(0);
  });

  it("una compensazione non finisce nel log attività", () => {
    let s = freshState("marco");
    s = reducer(s, {
      type: "UPDATE_TEAM_MEMBER",
      payload: { id: "gina", name: "Gina", role: "senior agent" },
      meta: { compensazione: true },
    });
    // Un annullamento tecnico non è un'azione che l'utente ha compiuto.
    expect(s.activityLog).toHaveLength(0);
    // …ma lo stato è tornato indietro davvero (toDbRole normalizza il ruolo e
    // toSeniority estrae il sotto-livello, come per un UPDATE normale).
    expect(s.team.find(m => m.id === "gina").seniority).toBe("senior");
  });

  it("senza il flag la stessa azione toasta e logga come sempre", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "UPDATE_TEAM_MEMBER", payload: { id: "gina", name: "Gina", role: "senior agent" } });
    expect(s.toasts).toHaveLength(1);
    expect(s.activityLog).toHaveLength(1);
  });
});

// ─── M-4 · rollback di EMPTY_TRASH ────────────────────────────────────────────
describe("reducer — ROLLBACK_EMPTY_TRASH", () => {
  const cestinato = (id) => task({ id, deletedAt: "2026-01-01T10:00:00Z" });
  const T1 = "11111111-2222-4333-8444-555555555551";
  const T2 = "11111111-2222-4333-8444-555555555552";

  it("rimette in lista i task che EMPTY_TRASH aveva tolto", () => {
    let s = { ...freshState("marco"), tasks: [cestinato(T1), cestinato(T2)] };
    const prima = s.tasks;
    s = reducer(s, { type: "EMPTY_TRASH" });
    expect(s.tasks).toHaveLength(0);

    s = reducer(s, { type: "ROLLBACK_EMPTY_TRASH", payload: prima, meta: { compensazione: true } });
    expect(s.tasks.map(t => t.id).sort()).toEqual([T1, T2].sort());
  });

  it("non duplica un task che nel frattempo è già tornato (eco realtime)", () => {
    const t = cestinato(T1);
    let s = { ...freshState("marco"), tasks: [t] };
    s = reducer(s, { type: "ROLLBACK_EMPTY_TRASH", payload: [t] });
    expect(s.tasks).toHaveLength(1);
  });

  it("con payload vuoto non tocca lo stato", () => {
    const s = { ...freshState("marco"), tasks: [cestinato(T1)] };
    expect(reducer(s, { type: "ROLLBACK_EMPTY_TRASH", payload: [] })).toBe(s);
  });

  it("non accoda alcun toast: quello d'errore lo mostra già l'orchestratore", () => {
    let s = { ...freshState("marco"), tasks: [] };
    s = reducer(s, { type: "ROLLBACK_EMPTY_TRASH", payload: [cestinato(T1)] });
    expect(s.toasts).toHaveLength(0);
  });
});
