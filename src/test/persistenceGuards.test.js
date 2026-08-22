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
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), createMany: vi.fn(() => Promise.resolve({ error: null, scritti: 0 })), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    MessageTemplates: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { reducer, makeInitialState, ADMIN_ONLY_ACTIONS } = await import("../state/reducer.js");
const { Tasks: TasksAPI, Users: UsersAPI, Clients: ClientsAPI, MessageTemplates: MessageTemplatesAPI } = await import("../lib/api.js");
const { isAdmin } = await import("../lib/permissions.js");

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
  return { ...base, tasks, toasts: [] };
}

// Il reducer ha davvero applicato l'azione? Un rifiuto per permessi produce un
// toast di tipo "error"; un no-op (record inesistente) restituisce lo stesso
// oggetto state. Entrambi significano "non persistere".
const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toasts?.at(-1)?.type !== "error";
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
  // M-1 dell'audit del 14 agosto (terzo passaggio). A-1 del secondo passaggio
  // aveva dato un guard alle tre mutazioni singole sull'anagrafica e saltato
  // quella IN BLOCCO: l'import restava protetto dal solo fatto che
  // ClientiView non renderizzasse il pulsante per chi non ha `canEditClient`.
  // Qui la parità è misurata come per le altre — se qualcuno toglie il guard,
  // o il controllo nel reducer, questo caso diventa rosso.
  {
    nome: "ADD_CLIENTS_BULK (import anagrafica)",
    tasks: [],
    action: { type: "ADD_CLIENTS_BULK", payload: [{ id: uuid(5), name: "Rossi Mario" }] },
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
    expect(next.toasts?.at(-1)?.type).toBe("error");
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
    // M-4: una sola chiamata in blocco, non una hardDelete per id.
    expect(TasksAPI.hardDeleteMany).toHaveBeenCalledTimes(1);
    expect(TasksAPI.hardDelete).not.toHaveBeenCalled();
    const eliminatiSulServer = TasksAPI.hardDeleteMany.mock.calls[0][0];

    expect([...eliminatiSulServer].sort()).toEqual(rimossiDalReducer.sort());
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

// UPDATE_TEAM_MEMBER è il percorso con cui un admin REVOCA i privilegi. Per
// molte versioni non aveva una entry di persistenza: il reducer aggiornava
// state.team e mostrava "Agente aggiornato", il database non riceveva nulla.
// Un utente declassato conservava i propri permessi lato server, e l'unico
// segnale era il ruolo che tornava indietro al reload.
// UPDATE_TEAM_MEMBER raggiunge il database: la entry esiste, il fallback
// senza `users.seniority`, la distinzione fra schema non migrato ed errore
// vero, lo smascheramento del trigger `fix_users_privilege_escalation`,
// normalize, i tre rifiuti e il rollback sono coperti in
// src/test/adminUpdateTeamMemberPersistence.test.js — un file a sé, estratto
// da qui (M-2 dell'audit del 14 agosto, secondo passaggio) quando questo
// file ha superato la soglia di 500 righe effettive.

// TOGGLE_TEAM_MEMBER_ACTIVE (12 agosto, suggerimento strategico n. 3): guard,
// rollback e il gate admin-only sono coperti in
// src/test/adminToggleActivePersistence.test.js — un file a sé, non una
// sezione qui, perché questo file era già alla soglia delle 500 righe
// effettive e "un file, una responsabilità" (docs/CLAUDE.md) vale anche per i
// test.

// UPDATE_NOTICE/DELETE_NOTICE/TOGGLE_PIN_NOTICE (A-1 dell'audit del 14
// agosto): guard, rollback e la concordanza col reducer sono coperti in
// src/test/noticeGuardsPersistence.test.js — un file a sé, per lo stesso
// motivo di TOGGLE_TEAM_MEMBER_ACTIVE qui sopra. La metà UI (i pulsanti
// compaiono solo per chi la RLS lascerebbe agire) è in
// noticeBoardPermessi.test.jsx.

// UPDATE_OWN_PROFILE era l'ultima mutazione su un'entità dello state a vivere
// fuori dal registry: ProfileEditor dispatchava in ottimistico e poi chiamava
// UsersAPI a mano, con un toast per scrittura e nessun rollback. Il fallimento
// lasciava lo state React aggiornato e il database no.
describe("persistence — UPDATE_OWN_PROFILE scrive entrambe le tabelle", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const PAYLOAD = {
    name: "Marco Ferretti", avatar: "MF", color: "#0F2044",
    photoUrl: "senior1/avatar.jpg", email: "marco@agenzia.it", phone: "+39 333 1234567",
  };
  const azione = (over = {}) => ({ type: "UPDATE_OWN_PROFILE", payload: { ...PAYLOAD, ...over } });

  it("la entry esiste ed è persistita (regressione: la scrittura viveva nel componente)", () => {
    const spec = PERSISTENCE.UPDATE_OWN_PROFILE;
    expect(spec, "senza entry la modale profilo torna a persistere da sé, senza rollback").toBeDefined();
    expect(spec.persist).toBeTypeOf("function");
    expect(spec.rollback).toBeTypeOf("function");
  });

  it("NON è admin-only: ognuno modifica il proprio profilo", () => {
    // useSyncedDispatch nega qualunque azione in ADMIN_ONLY_ACTIONS prima di
    // toccare il server. Ora che la scrittura passa di lì, aggiungere questa
    // action a quell'elenco farebbe smettere in silenzio di salvarsi il
    // profilo a tutti tranne gli admin — e la modale, che si fida dell'esito,
    // resterebbe aperta senza spiegare perché.
    expect(ADMIN_ONLY_ACTIONS.has("UPDATE_OWN_PROFILE")).toBe(false);
    for (const uid of ["senior1", "junior1", "driver1"]) {
      const state = statoCon([], uid);
      expect(reducerHaApplicato(state, azione()), uid).toBe(true);
    }
  });

  it("scrive public.users e public.user_contacts sulla riga dell'utente corrente", async () => {
    const state = statoCon([], "senior1");
    const res = await PERSISTENCE.UPDATE_OWN_PROFILE.persist(state, azione(), "senior1");

    expect(res.error).toBeNull();
    expect(UsersAPI.updateProfile).toHaveBeenCalledTimes(1);
    const [id, patch] = UsersAPI.updateProfile.mock.calls[0];
    // L'id è quello del reducer, non un valore che arriva dal payload: la riga
    // scritta è per costruzione la propria.
    expect(id).toBe("senior1");
    expect(patch).toEqual({ name: "Marco Ferretti", avatar: "MF", color: "#0F2044", photo_url: "senior1/avatar.jpg" });

    expect(UsersAPI.updateContact).toHaveBeenCalledWith("senior1", {
      email: "marco@agenzia.it", phone: "+39 333 1234567",
    });
  });

  it("email e telefono vuoti diventano null, non stringhe vuote", async () => {
    const state = statoCon([], "senior1");
    await PERSISTENCE.UPDATE_OWN_PROFILE.persist(state, azione({ email: "", phone: "" }), "senior1");
    expect(UsersAPI.updateContact).toHaveBeenCalledWith("senior1", { email: null, phone: null });
  });

  it("se public.users rifiuta, i contatti NON vengono scritti e l'errore risale", async () => {
    // Metà scrittura andata a buon fine è il caso peggiore: nessun rollback
    // potrebbe più riportare indietro l'insieme.
    UsersAPI.updateProfile.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });

    const state = statoCon([], "senior1");
    const res = await PERSISTENCE.UPDATE_OWN_PROFILE.persist(state, azione(), "senior1");

    expect(res.error).toMatchObject({ code: "42501" });
    expect(UsersAPI.updateContact).not.toHaveBeenCalled();
  });

  it("il rollback riporta indietro TUTTI i campi, anche quelli assenti dal membro", () => {
    // `prev` senza email/phone: il reducer ignora le chiavi undefined, quindi
    // uno snapshot che non le elenca lascerebbe a video i valori ottimistici.
    const state = { ...statoCon([], "senior1") };
    state.team = state.team.map(m => (m.id === "senior1" ? { ...m, name: "Senior", color: "#111" } : m));

    const undo = PERSISTENCE.UPDATE_OWN_PROFILE.rollback(state, azione());
    expect(undo.type).toBe("UPDATE_OWN_PROFILE");
    expect(Object.keys(undo.payload).sort())
      .toEqual(["avatar", "color", "email", "name", "phone", "photoUrl"]);
    expect(undo.payload.name).toBe("Senior");
    expect(undo.payload.color).toBe("#111");
    expect(undo.payload.email).toBeNull();
    expect(undo.payload.phone).toBeNull();
  });

  it("il rollback applicato dal reducer ripristina davvero lo stato precedente", () => {
    const prima = statoCon([], "senior1");
    const dopo = reducer(prima, azione());
    expect(dopo.team.find(m => m.id === "senior1").name).toBe("Marco Ferretti");

    const undo = PERSISTENCE.UPDATE_OWN_PROFILE.rollback(prima, azione());
    const ripristinato = reducer(dopo, undo);
    const membro = ripristinato.team.find(m => m.id === "senior1");
    expect(membro.name).toBe("Senior");
    expect(membro.avatar).toBe(prima.team.find(m => m.id === "senior1").avatar ?? null);
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
  // M-2 dell'audit del 14 agosto (terzo passaggio). Erano le uniche due
  // mutazioni sul TEAM senza compensazione: il pannello mostrava un utente
  // approvato (o rimosso) che sul database non lo era, e nessun evento
  // realtime veniva a correggerlo — una scrittura fallita non ne emette.
  it("APPROVE_TEAM_MEMBER riporta indietro il membro INTERO pre-approvazione", () => {
    const membro = { id: "u9", name: "Nuovo", role: "agent", active: false, pending: true };
    const state = { ...statoCon([], "admin1"), team: [...TEAM, membro] };
    const action = { type: "APPROVE_TEAM_MEMBER", payload: { id: "u9", role: "agent" } };
    // Il membro intero, non `{ pending: true }`: il case del reducer fa merge,
    // quindi un patch parziale lascerebbe a video l'`active` che
    // l'approvazione ha cambiato.
    expect(PERSISTENCE.APPROVE_TEAM_MEMBER.rollback(state, action))
      .toEqual({ type: "UPDATE_TEAM_MEMBER", payload: membro });
  });

  // C-1 dell'audit del 15 agosto: il ruolo con cui si approva è quello
  // dichiarato dall'azione (scelto dall'admin in AdminTeamTab), non quello
  // già presente sulla riga pending — che per un account auto-registrato era
  // il ruolo scelto dal registrante stesso. Un `persist` che leggesse il
  // ruolo dallo state invece che dal payload reintrodurrebbe esattamente la
  // vulnerabilità che questo fix chiude.
  it("APPROVE_TEAM_MEMBER scrive il ruolo dell'AZIONE, non quello già sulla riga", async () => {
    const membro = { id: "u9", name: "Nuovo", role: "admin", active: false, pending: true };
    const state = { ...statoCon([], "admin1"), team: [...TEAM, membro] };
    const action = { type: "APPROVE_TEAM_MEMBER", payload: { id: "u9", role: "agent" } };

    await PERSISTENCE.APPROVE_TEAM_MEMBER.persist(state, action);

    expect(UsersAPI.approve).toHaveBeenCalledWith("u9", "agent");
  });

  it("REMOVE_TEAM_MEMBER rimette in lista l'utente che il server non ha eliminato", () => {
    const membro = { id: "u9", name: "Nuovo", role: "agent", active: true, pending: false };
    const state = { ...statoCon([], "admin1"), team: [...TEAM, membro] };
    const action = { type: "REMOVE_TEAM_MEMBER", payload: "u9" };
    expect(PERSISTENCE.REMOVE_TEAM_MEMBER.rollback(state, action))
      .toEqual({ type: "ADD_TEAM_MEMBER", payload: membro });
  });

  it("le due compensazioni sul team sono applicabili davvero dal reducer", () => {
    // Un rollback che il reducer scarta è peggio di nessun rollback: dice di
    // aver rimesso le cose a posto senza farlo. Qui si esegue davvero.
    const membro = { id: "u9", name: "Nuovo", role: "agent", active: false, pending: true };
    const state = { ...statoCon([], "admin1"), team: [...TEAM, membro] };

    const dopoApprove = reducer(state, { type: "APPROVE_TEAM_MEMBER", payload: { id: "u9", role: "agent" } });
    expect(dopoApprove.team.find(m => m.id === "u9").pending).toBe(false);
    const undo = PERSISTENCE.APPROVE_TEAM_MEMBER.rollback(state, { type: "APPROVE_TEAM_MEMBER", payload: { id: "u9", role: "agent" } });
    const ripristinato = reducer(dopoApprove, { ...undo, meta: { compensazione: true } });
    expect(ripristinato.team.find(m => m.id === "u9").pending).toBe(true);
    expect(ripristinato.team.find(m => m.id === "u9").active).toBe(false);
    // `meta.compensazione` riporta indietro anche i toast: nessun "Agente
    // aggiornato" accanto al "Salvataggio fallito" che sta per comparire.
    expect(ripristinato.toasts).toBe(dopoApprove.toasts);

    const dopoRemove = reducer(state, { type: "REMOVE_TEAM_MEMBER", payload: "u9" });
    expect(dopoRemove.team.some(m => m.id === "u9")).toBe(false);
    const undoRemove = PERSISTENCE.REMOVE_TEAM_MEMBER.rollback(state, { type: "REMOVE_TEAM_MEMBER", payload: "u9" });
    const tornato = reducer(dopoRemove, { ...undoRemove, meta: { compensazione: true } });
    expect(tornato.team.find(m => m.id === "u9")).toEqual(membro);
  });

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

  // A-2 dell'audit dell'11 agosto: prima ADD_CLIENTS_BULK non aveva ALCUN
  // rollback (a differenza del suo gemello ADD_TASKS_BULK), quindi un import
  // fallito a metà lasciava in lista clienti che sul server non esistevano —
  // scoperto solo al reload. Ora `res.scritti` (quanti blocchi createMany ha
  // scritto prima di quello fallito) decide COSA togliere: non tutto, e non
  // niente — solo la coda che sul server non è mai arrivata.
  it("ADD_CLIENTS_BULK rimanda indietro SOLO i clienti non arrivati sul server", () => {
    const state = statoCon([], "admin1");
    const clienti = [{ id: uuid(1) }, { id: uuid(2) }, { id: uuid(3) }];
    const action = { type: "ADD_CLIENTS_BULK", payload: clienti };
    // Due blocchi su tre sono arrivati prima che il terzo fallisse.
    expect(PERSISTENCE.ADD_CLIENTS_BULK.rollback(state, action, { scritti: 2 }))
      .toEqual({ type: "ROLLBACK_CLIENTS_BULK", payload: [uuid(3)] });
  });

  it("ADD_CLIENTS_BULK non fa rollback se sono arrivati tutti i blocchi", () => {
    const state = statoCon([], "admin1");
    const clienti = [{ id: uuid(1) }, { id: uuid(2) }];
    const action = { type: "ADD_CLIENTS_BULK", payload: clienti };
    expect(PERSISTENCE.ADD_CLIENTS_BULK.rollback(state, action, { scritti: 2 })).toBeNull();
  });

  it("ADD_CLIENTS_BULK senza `res` (nessun blocco arrivato) rimanda tutto indietro", () => {
    const state = statoCon([], "admin1");
    const clienti = [{ id: uuid(1) }, { id: uuid(2) }];
    const action = { type: "ADD_CLIENTS_BULK", payload: clienti };
    expect(PERSISTENCE.ADD_CLIENTS_BULK.rollback(state, action))
      .toEqual({ type: "ROLLBACK_CLIENTS_BULK", payload: [uuid(1), uuid(2)] });
  });

  it("ADD_CLIENTS_BULK scrive con un'unica insert multi-riga, non N create() in parallelo", async () => {
    const state = statoCon([], "admin1");
    const clienti = [{ id: uuid(1), name: "A" }, { id: uuid(2), name: "B" }];
    const action = { type: "ADD_CLIENTS_BULK", payload: clienti };
    await PERSISTENCE.ADD_CLIENTS_BULK.persist(state, action, "admin1");
    expect(ClientsAPI.createMany).toHaveBeenCalledTimes(1);
    expect(ClientsAPI.create).not.toHaveBeenCalled();
  });
});

// A-1 dell'audit dell'11 agosto: prima i template di messaggio non avevano
// alcuna entry — vivevano solo in state.messageTemplates, e ADD/UPDATE/
// DELETE_MESSAGE_TEMPLATE erano dichiarati in NON_PERSISTITE_OGGI qui sotto.
// Ora hanno lo stesso trattamento delle categorie: nessun guard proprio (il
// gate è ADMIN_ONLY_ACTIONS, verificato dal wrapper useSyncedDispatch), un
// persist per ciascuna delle tre operazioni.
describe("persistence — template messaggi raggiungono il database", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("ADD_MESSAGE_TEMPLATE normalizza l'id e scrive via MessageTemplates.create", async () => {
    const state = statoCon([], "admin1");
    const action = { type: "ADD_MESSAGE_TEMPLATE", payload: { label: "Sollecito", text: "Testo" } };
    const norm = PERSISTENCE.ADD_MESSAGE_TEMPLATE.normalize(action, state, "admin1");
    expect(norm.payload.id).toMatch(/^[0-9a-f-]{36}$/i);

    await PERSISTENCE.ADD_MESSAGE_TEMPLATE.persist(state, norm, "admin1");
    expect(MessageTemplatesAPI.create).toHaveBeenCalledTimes(1);
    const [row] = MessageTemplatesAPI.create.mock.calls[0];
    expect(row).toMatchObject({ id: norm.payload.id, label: "Sollecito", text: "Testo" });
  });

  it("UPDATE_MESSAGE_TEMPLATE e DELETE_MESSAGE_TEMPLATE raggiungono l'API", async () => {
    const state = statoCon([], "admin1");
    await PERSISTENCE.UPDATE_MESSAGE_TEMPLATE.persist(
      state, { type: "UPDATE_MESSAGE_TEMPLATE", payload: { id: "mt1", label: "L", text: "T" } }, "admin1",
    );
    expect(MessageTemplatesAPI.update).toHaveBeenCalledWith("mt1", { label: "L", text: "T" });

    await PERSISTENCE.DELETE_MESSAGE_TEMPLATE.persist(
      state, { type: "DELETE_MESSAGE_TEMPLATE", payload: "mt1" }, "admin1",
    );
    expect(MessageTemplatesAPI.remove).toHaveBeenCalledWith("mt1");
  });

  it("un non-admin non raggiunge il database (gate ADMIN_ONLY_ACTIONS)", () => {
    // Nessun guard proprio sulle tre entry: il gate è quello che
    // useSyncedDispatch applica PRIMA di consultare la entry, uguale per
    // tutte le azioni ADMIN_ONLY (ADD_CATEGORY compresa). Qui si verifica che
    // le tre azioni dei template ci siano dentro.
    const state = statoCon([], "senior1");
    for (const tipo of ["ADD_MESSAGE_TEMPLATE", "UPDATE_MESSAGE_TEMPLATE", "DELETE_MESSAGE_TEMPLATE"]) {
      expect(ADMIN_ONLY_ACTIONS.has(tipo) && !isAdmin(state.team, "senior1"), tipo).toBe(true);
    }
  });
});

// ─── COMPLETEZZA DEL REGISTRY ────────────────────────────────────────────────
// I test qui sopra verificano che guard e reducer concordino sulle azioni
// PRESENTI nel registry. Nessuno di loro nota un'azione che nel registry non
// c'è: aggiungere un case al reducer e dimenticare la entry produce una UI che
// si aggiorna e un database che non riceve niente — il difetto più silenzioso
// di tutti, perché a schermo sembra funzionare finché non si ricarica.
//
// I case si leggono dal SORGENTE del reducer, non da una lista scritta a mano
// qui: una lista sarebbe una terza copia da tenere allineata, cioè esattamente
// il tipo di divergenza che questo file esiste per impedire.
// `?raw` di Vite: importa il file come testo senza eseguirlo.
const SORGENTE_REDUCER = (await import("../state/reducer.js?raw")).default;
const AZIONI_DEL_REDUCER = [...SORGENTE_REDUCER.matchAll(/case "([A-Z_]+)"/g)].map(m => m[1]);

// Ogni azione che il reducer gestisce e che NON sta nel registry deve stare in
// uno di questi quattro elenchi, con la sua ragione. È la parte che rende il
// test una decisione invece di un'omissione: chi aggiunge un case deve dire
// dove sta, e se non lo dice il test si ferma.
const SOLO_CLIENT = [
  // Stato che non esiste sul server: vista attiva, selezione, toast.
  // searchQuery/showNotif/sidebarCollapsed non sono più nel reducer (audit
  // ST-2 parte 2): sono useState nei componenti che li possiedono, quindi non
  // compaiono più fra i case del reducer e non hanno bisogno di una entry qui.
  // `RETRACT_TOASTS` (B-2) è dello stesso genere: toglie dalla coda il toast
  // di successo che il server ha poi smentito. Non c'è niente da scrivere —
  // è un'affermazione ritirata, non un dato.
  "SHOW_TOAST", "CLEAR_TOAST", "RETRACT_TOASTS", "SET_VIEW",
  "SET_SELECTED_TASK", "CLEAR_LISTE_TARGET",
  // Il log attività è ricostruito in memoria dalle azioni (buildLogEntry):
  // svuotarlo è un'operazione locale perché il log stesso lo è.
  "CLEAR_ACTIVITY_LOG",
  // Registro delle scritture in volo (state.pendingWrites). Non è un dato: è
  // bookkeeping sul CICLO DI VITA di una scrittura, dispatchato da
  // useSyncedDispatch prima e dopo spec.persist() per impedire che un refetch
  // concorrente sovrascriva una riga la cui UPDATE non ha ancora fatto commit.
  // Sul server non esiste niente da marcare — la marcatura riguarda proprio il
  // fatto che il server non sa ancora della scrittura — e persisterla sarebbe
  // una scrittura in più su una tabella che non c'è. Non stanno in
  // COMPENSAZIONE perché non compensano un fallimento: si smarcano SEMPRE, che
  // la scrittura riesca o no.
  "MARK_PENDING_WRITE", "UNMARK_PENDING_WRITE",
];

const IDRATAZIONE = [
  // Direzione opposta: sono i dati che ARRIVANO dal server. Le scrive
  // src/hooks/useAppHydration.js, e persisterle rimanderebbe indietro ciò che
  // si è appena letto.
  "SET_TASKS", "SET_TASK_THREADS", "SET_NOTICES", "SET_CLIENTS", "SET_CATEGORIES", "SET_TEAM",
  "SET_CURRENT_USER",
  // Gemelli "per riga" di SET_TASKS/SET_NOTICES/SET_CLIENTS (suggerimento
  // strategico n.1 dell'audit del 16 agosto): li dispatcha lo stesso
  // useAppHydration.js quando `applyRow` intercetta un evento realtime che
  // porta già la riga intera, invece del reload completo. Stessa direzione —
  // dati che ARRIVANO dal server — stessa ragione per non persisterli.
  "MERGE_TASK_ROW", "MERGE_NOTICE_ROW", "MERGE_CLIENT_ROW",
  // A-1 (22 agosto): la variante per-sottoinsieme di SET_TASK_THREADS,
  // dispatchata dal ramo `soloThread` quando l'evento realtime dice QUALI
  // task hanno commenti nuovi. Idratazione come le sorelle: legge dal
  // server e scrive in stato, non persiste nulla.
  "MERGE_TASK_COMMENTS",
  // Idratazione dei template di messaggio (A-1 dell'audit dell'11 agosto,
  // stesso trattamento di SET_CATEGORIES): da quando message_templates ha una
  // tabella, SET_MESSAGE_TEMPLATES ne rilegge il contenuto al mount/refresh.
  "SET_MESSAGE_TEMPLATES",
];

const COMPENSAZIONE = [
  // Le dispatcha il registry stesso quando una scrittura fallisce: sono il
  // rollback, non una scrittura. Persisterle significherebbe scrivere sul
  // server l'annullamento di qualcosa che sul server non è mai arrivato.
  "ROLLBACK_TASKS_BULK", "RESTORE_CLIENT", "CANCEL_ADMIN_ROLLBACK",
  // A-1 dell'audit del 14 agosto: gemello di RESTORE_CLIENT per DELETE_NOTICE
  // — riporta in bacheca un avviso la cui cancellazione ottimistica è stata
  // respinta dalla RLS. UPDATE_NOTICE non ne ha bisogno: il suo rollback
  // rimanda un altro UPDATE_NOTICE (come UPDATE_TEAM_MEMBER), che il reducer
  // applica come merge sulla riga esistente.
  "RESTORE_NOTICE",
  // A-2: gemello di ROLLBACK_TASKS_BULK per ADD_CLIENTS_BULK, dispatchato dal
  // registry quando ClientsAPI.createMany si ferma a metà.
  "ROLLBACK_CLIENTS_BULK",
  // M-4: rimette in lista i task cestinati quando la purge in blocco di
  // EMPTY_TRASH fallisce. La `delete … in (…)` è atomica, quindi o si rimettono
  // tutti o nessuno — e non c'è nulla da riscrivere sul server, il fallimento è
  // proprio "non è stato cancellato niente".
  "ROLLBACK_EMPTY_TRASH",
  // M-1 dell'audit del 14 agosto (secondo passaggio): dispatchata dal registry
  // quando RESTORE_BACKUP eseguito a blocchi lascia indietro alcune righe —
  // riporta al valore pre-dispatch quelle ESISTENTI, toglie quelle CREATE mai
  // arrivate sul server. Stesso principio di ROLLBACK_EMPTY_TRASH: è la
  // compensazione, non ha nulla da riscrivere.
  "ROLLBACK_RESTORE_BACKUP",
  // M-2 dell'audit del 14 agosto (secondo passaggio): riporta al nome
  // PRECEDENTE i soli task il cui update di RENAME_CLIENT_IN_TASKS non è
  // arrivato sul server (Promise.allSettled invece di Promise.all).
  "ROLLBACK_RENAME_CLIENT_IN_TASKS",
];

// Questo quarto elenco non è una categoria: è un registro di lacune note.
// Sono azioni che modificano dati che l'utente si aspetta di ritrovare, e che
// oggi vivono solo in memoria — al reload spariscono. Nessuna ha un endpoint
// (né tabella, né RPC), quindi non è "una entry dimenticata": è lavoro che
// manca a monte, nel data layer.
//
// Stanno scritte qui perché un test che le allowlist-asse in silenzio insieme
// ai toast sarebbe peggio di nessun test. Quando una viene persistita per
// davvero, il caso "nessuna azione sta in due posti" qui sotto obbliga a
// toglierla da questa lista.
const NON_PERSISTITE_OGGI = [
  // I template di messaggio (ADD/UPDATE/DELETE_MESSAGE_TEMPLATE) sono usciti
  // da questa lista l'11 agosto: hanno una entry nel registry e una tabella
  // da cui SET_MESSAGE_TEMPLATES li rilegge (A-1 dell'audit).
  //
  // Le reazioni agli avvisi hanno lo stesso shape di quelle della chat, che
  // invece passano dalla RPC messages_toggle_reaction. Per gli avvisi la RPC
  // corrispondente non esiste.
  "TOGGLE_NOTICE_REACTION",
  // Ramo legacy "agente senza account": con l'email si passa da Users.invite
  // (Edge Function) e il team si ricarica dal server; senza, il membro viene
  // aggiunto solo allo stato locale e la prima idratazione lo fa sparire.
  "ADD_TEAM_MEMBER",
  // Nessun componente la dispatcha: il nome agenzia si modifica solo via
  // RESTORE_BACKUP. Case raggiungibile da nessuno, non una lacuna di scrittura.
  "SET_AGENCY_NAME",
];

const DICHIARATE_FUORI_REGISTRY = [
  ...SOLO_CLIENT, ...IDRATAZIONE, ...COMPENSAZIONE, ...NON_PERSISTITE_OGGI,
];

describe("persistence — completezza del registry", () => {
  it("ogni azione del reducer o è nel registry o è dichiarata qui", () => {
    const dichiarate = new Set([...Object.keys(PERSISTENCE), ...DICHIARATE_FUORI_REGISTRY]);
    const orfane = [...new Set(AZIONI_DEL_REDUCER)].filter(a => !dichiarate.has(a));
    expect(
      orfane,
      "azioni del reducer senza entry di persistenza e non dichiarate: " +
      `${orfane.join(", ")}. Se scrivono un dato che deve sopravvivere al reload, ` +
      "aggiungi la entry in src/state/persistence.js; altrimenti mettile nell'elenco " +
      "giusto qui sopra, con il perché.",
    ).toEqual([]);
  });

  it("nessuna azione sta in due posti", () => {
    // Se un'azione è nel registry E in un elenco di esenzione, l'esenzione
    // vince nella lettura di chi passa di qui e nasconde la scrittura vera.
    // Vale anche al contrario: quando una lacuna di NON_PERSISTITE_OGGI viene
    // chiusa, questo caso obbliga a rimuoverla dal registro.
    const doppie = DICHIARATE_FUORI_REGISTRY.filter(a => PERSISTENCE[a]);
    expect(doppie, `dichiarate fuori dal registry ma presenti nel registry: ${doppie.join(", ")}`).toEqual([]);

    const conteggio = new Map();
    for (const a of DICHIARATE_FUORI_REGISTRY) conteggio.set(a, (conteggio.get(a) ?? 0) + 1);
    expect([...conteggio].filter(([, n]) => n > 1).map(([a]) => a)).toEqual([]);
  });

  it("il registry non contiene entry morte", () => {
    // Una entry per un'azione che il reducer non gestisce più non scrive mai:
    // useSyncedDispatch la consulta partendo dall'azione dispatchata.
    const gestite = new Set(AZIONI_DEL_REDUCER);
    const morte = Object.keys(PERSISTENCE).filter(a => !gestite.has(a));
    expect(morte, `entry di persistenza senza case nel reducer: ${morte.join(", ")}`).toEqual([]);
  });

  it("ogni entry del registry sa scrivere", () => {
    // Una entry con solo guard/rollback passerebbe tutti i test qui sopra
    // senza mandare niente al server.
    const senzaPersist = Object.entries(PERSISTENCE)
      .filter(([, spec]) => typeof spec.persist !== "function")
      .map(([a]) => a);
    expect(senzaPersist, `entry senza persist(): ${senzaPersist.join(", ")}`).toEqual([]);
  });

  it("le esenzioni dichiarate esistono davvero nel reducer", () => {
    // Un'azione rinominata lascerebbe qui il vecchio nome, e l'elenco
    // smetterebbe di descrivere il codice senza che nulla lo segnali.
    const gestite = new Set(AZIONI_DEL_REDUCER);
    const fantasmi = DICHIARATE_FUORI_REGISTRY.filter(a => !gestite.has(a));
    expect(fantasmi, `dichiarate qui ma non gestite dal reducer: ${fantasmi.join(", ")}`).toEqual([]);
  });
});
