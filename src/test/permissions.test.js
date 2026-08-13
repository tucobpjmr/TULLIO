// Matrice permessi — funzioni pure di lib/permissions.js.
//
// Prima del refactor la stessa logica viveva in state/appGlobals.js (rimosso) e
// leggeva una variabile `let` di modulo: testarla richiedeva di mutare quella
// globale nel setup, con l'ordine dei test che diventava significativo. Qui il
// team è un argomento, quindi ogni caso è isolato e la matrice ruoli × azioni
// può essere enumerata per intero.
import { describe, it, expect } from "vitest";
import {
  getMember, getAssignableTeam, getRoleType,
  isAdmin, isDriver, isJuniorAgent, isSeniorAgent,
  canViewTask, canEditTask, canCreateTaskCategory, canAccessAdmin, canAccessListe,
  getVisibleTasks, getAvailableCategories,
} from "../lib/permissions.js";

const TEAM = [
  { id: "admin1",  name: "Admin",   role: "Admin",        active: true,  pending: false },
  { id: "mgr1",    name: "Manager", role: "Manager",      active: true,  pending: false },
  { id: "senior1", name: "Senior",  role: "Senior Agent", active: true,  pending: false },
  { id: "junior1", name: "Junior",  role: "Junior Agent", active: true,  pending: false },
  { id: "driver1", name: "Driver",  role: "Driver",       active: true,  pending: false },
  { id: "spento",  name: "Spento",  role: "Senior Agent", active: false, pending: false },
  { id: "attesa",  name: "Attesa",  role: "Senior Agent", active: true,  pending: true  },
];

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma", category: "booking",
  status: "todo", assignees: ["senior1"], ...over,
});

const IN_24H = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

describe("permissions — lookup team", () => {
  it("getMember trova per id e non esplode su team vuoto o assente", () => {
    expect(getMember(TEAM, "mgr1").name).toBe("Manager");
    expect(getMember(TEAM, "inesistente")).toBeUndefined();
    expect(getMember([], "mgr1")).toBeUndefined();
    expect(getMember(undefined, "mgr1")).toBeUndefined();
  });

  it("getAssignableTeam esclude disattivati e in attesa di approvazione", () => {
    expect(getAssignableTeam(TEAM).map(m => m.id))
      .toEqual(["admin1", "mgr1", "senior1", "junior1", "driver1"]);
  });
});

describe("permissions — classificazione ruoli", () => {
  it.each([
    ["admin1",  "admin"],
    ["mgr1",    "manager"],
    ["senior1", "agent"],
    ["junior1", "agent"],
    ["driver1", "driver"],
  ])("getRoleType(%s) = %s", (uid, atteso) => {
    expect(getRoleType(TEAM, uid)).toBe(atteso);
  });

  it("un utente sconosciuto ricade sul ruolo meno privilegiato fra i non-driver", () => {
    expect(getRoleType(TEAM, "fantasma")).toBe("agent");
    expect(isAdmin(TEAM, "fantasma")).toBe(false);
  });

  it("il confronto sul ruolo è case-insensitive (il DB scrive minuscolo)", () => {
    const teamDb = [{ id: "x", role: "admin", active: true, pending: false }];
    expect(isAdmin(teamDb, "x")).toBe(true);
  });

  it("distingue Junior da Senior Agent", () => {
    expect(isJuniorAgent(TEAM, "junior1")).toBe(true);
    expect(isJuniorAgent(TEAM, "senior1")).toBe(false);
    expect(isSeniorAgent(TEAM, "senior1")).toBe(true);
    expect(isSeniorAgent(TEAM, "junior1")).toBe(false);
    expect(isSeniorAgent(TEAM, "fantasma")).toBe(false);
  });

  it("isDriver e canAccessAdmin", () => {
    expect(isDriver(TEAM, "driver1")).toBe(true);
    expect(canAccessAdmin(TEAM, "admin1")).toBe(true);
    expect(canAccessAdmin(TEAM, "mgr1")).toBe(false);
  });

  // Il confronto era per SOTTOSTRINGA: bastava che il ruolo contenesse "admin"
  // per ottenere i permessi di amministratore in tutta la UI. Il database, che
  // confronta role = 'admin' per uguaglianza, dava la risposta opposta sulla
  // stessa domanda — due livelli di autorizzazione in disaccordo.
  it.each([
    "Amministrativo", "Admin assistant", "ex-admin", "manger", "Agente driver",
  ])("un ruolo fuori enum come %s non ottiene privilegi", (role) => {
    const team = [{ id: "x", role, active: true, pending: false }];
    expect(isAdmin(team, "x")).toBe(false);
    expect(canAccessAdmin(team, "x")).toBe(false);
    expect(isDriver(team, "x")).toBe(false);
    // …e viene trattato come il profilo più ristretto, non come agent pieno:
    // è ciò che il DB gli concederebbe comunque (nessun helper private.* lo
    // riconosce, quindi vede solo i propri task).
    expect(isJuniorAgent(team, "x")).toBe(true);
    expect(isSeniorAgent(team, "x")).toBe(false);
    expect(canCreateTaskCategory(team, "payment", "x")).toBe(false);
  });

  it("il sotto-livello arriva dalla colonna seniority, non dalla stringa del ruolo", () => {
    const team = [
      { id: "j", role: "agent", seniority: "junior", active: true, pending: false },
      { id: "s", role: "agent", seniority: "senior", active: true, pending: false },
      { id: "d", role: "agent", active: true, pending: false }, // default
    ];
    expect(isJuniorAgent(team, "j")).toBe(true);
    expect(isJuniorAgent(team, "s")).toBe(false);
    expect(isJuniorAgent(team, "d")).toBe(false);
    expect(isSeniorAgent(team, "d")).toBe(true);
  });

  it("seniority non promuove né declassa gli altri ruoli", () => {
    const team = [
      { id: "a", role: "admin",  seniority: "junior", active: true, pending: false },
      { id: "m", role: "manager", seniority: "junior", active: true, pending: false },
    ];
    expect(isAdmin(team, "a")).toBe(true);
    expect(isJuniorAgent(team, "a")).toBe(false);
    expect(getRoleType(team, "m")).toBe("manager");
    expect(isJuniorAgent(team, "m")).toBe(false);
  });
});

describe("permissions — canViewTask", () => {
  it("l'admin vede tutto, anche i task di altri non urgenti", () => {
    expect(canViewTask(TEAM, task(), "admin1")).toBe(true);
  });

  it("il driver vede SOLO i propri task, mai la coda globale", () => {
    expect(canViewTask(TEAM, task({ assignees: ["driver1"] }), "driver1")).toBe(true);
    expect(canViewTask(TEAM, task({ assignees: [] }), "driver1")).toBe(false);
    expect(canViewTask(TEAM, task(), "driver1")).toBe(false);
  });

  it("un agent vede i propri, la coda globale e gli urgenti altrui", () => {
    expect(canViewTask(TEAM, task({ assignees: ["senior1"] }), "senior1")).toBe(true);
    expect(canViewTask(TEAM, task({ assignees: [] }), "senior1")).toBe(true);
    expect(canViewTask(TEAM, task({ assignees: ["mgr1"], dueDate: IN_24H }), "senior1")).toBe(true);
    expect(canViewTask(TEAM, task({ assignees: ["mgr1"] }), "senior1")).toBe(false);
  });

  it("getVisibleTasks filtra con la stessa regola e tollera input vuoti", () => {
    const tasks = [task({ id: "a", assignees: ["driver1"] }), task({ id: "b", assignees: ["mgr1"] })];
    expect(getVisibleTasks(TEAM, tasks, "driver1").map(t => t.id)).toEqual(["a"]);
    expect(getVisibleTasks(TEAM, undefined, "driver1")).toEqual([]);
  });
});

describe("permissions — canEditTask", () => {
  it("l'admin modifica qualsiasi task", () => {
    expect(canEditTask(TEAM, task({ assignees: ["junior1"] }), "admin1")).toBe(true);
  });

  it("il driver modifica solo transfer, propri o in coda globale", () => {
    expect(canEditTask(TEAM, task({ category: "transfer", assignees: ["driver1"] }), "driver1")).toBe(true);
    expect(canEditTask(TEAM, task({ category: "transfer", assignees: [] }), "driver1")).toBe(true);
    expect(canEditTask(TEAM, task({ category: "booking", assignees: ["driver1"] }), "driver1")).toBe(false);
  });

  it("il Junior Agent NON può raccogliere task dalla coda globale", () => {
    expect(canEditTask(TEAM, task({ assignees: ["junior1"] }), "junior1")).toBe(true);
    expect(canEditTask(TEAM, task({ assignees: [] }), "junior1")).toBe(false);
  });

  it("il Senior Agent può raccogliere dalla coda globale ma non toccare task altrui", () => {
    expect(canEditTask(TEAM, task({ assignees: [] }), "senior1")).toBe(true);
    expect(canEditTask(TEAM, task({ assignees: ["mgr1"] }), "senior1")).toBe(false);
  });

  it("urgente ≠ modificabile: si vede ma non si tocca", () => {
    const urgenteAltrui = task({ assignees: ["mgr1"], dueDate: IN_24H });
    expect(canViewTask(TEAM, urgenteAltrui, "senior1")).toBe(true);
    expect(canEditTask(TEAM, urgenteAltrui, "senior1")).toBe(false);
  });
});

describe("permissions — canCreateTaskCategory", () => {
  it("il driver crea solo transfer", () => {
    expect(canCreateTaskCategory(TEAM, "transfer", "driver1")).toBe(true);
    expect(canCreateTaskCategory(TEAM, "booking", "driver1")).toBe(false);
  });

  it("il Junior Agent non crea nelle categorie sensibili payment e admin", () => {
    expect(canCreateTaskCategory(TEAM, "booking", "junior1")).toBe(true);
    expect(canCreateTaskCategory(TEAM, "payment", "junior1")).toBe(false);
    expect(canCreateTaskCategory(TEAM, "admin", "junior1")).toBe(false);
  });

  it("admin e senior creano ovunque", () => {
    for (const uid of ["admin1", "senior1", "mgr1"]) {
      expect(canCreateTaskCategory(TEAM, "payment", uid)).toBe(true);
    }
  });
});

describe("permissions — getAvailableCategories", () => {
  const CATS = { booking: { label: "Booking" }, transfer: { label: "Transfer" }, payment: { label: "Pagamenti" } };

  it("il driver vede solo transfer", () => {
    expect(Object.keys(getAvailableCategories(CATS, TEAM, "driver1"))).toEqual(["transfer"]);
  });

  it("gli altri ruoli vedono l'intero dizionario", () => {
    expect(getAvailableCategories(CATS, TEAM, "senior1")).toBe(CATS);
  });

  it("non esplode con dizionario assente", () => {
    expect(getAvailableCategories(undefined, TEAM, "senior1")).toEqual({});
    expect(getAvailableCategories(undefined, TEAM, "driver1")).toEqual({ transfer: undefined });
  });
});

describe("permissions — purezza", () => {
  it("nessuna funzione muta il team ricevuto", () => {
    const snapshot = JSON.stringify(TEAM);
    canEditTask(TEAM, task(), "admin1");
    getAssignableTeam(TEAM);
    getVisibleTasks(TEAM, [task()], "senior1");
    expect(JSON.stringify(TEAM)).toBe(snapshot);
  });

  it("team diversi danno verdetti diversi per lo stesso utente (nessuno stato nascosto)", () => {
    const comeAdmin  = [{ id: "u", role: "Admin",        active: true, pending: false }];
    const comeJunior = [{ id: "u", role: "Junior Agent", active: true, pending: false }];
    const t = task({ assignees: [] });
    expect(canEditTask(comeAdmin, t, "u")).toBe(true);
    expect(canEditTask(comeJunior, t, "u")).toBe(false);
  });
});

// canAccessListe rispecchia `private.can_liste()` del database (role IN
// (admin, manager, agent) AND active). Esiste perché la stessa domanda aveva
// cinque risposte scritte in cinque punti — reducer, Archivio, ricerca
// avanzata, modulo Liste e database — formulate quattro volte su cinque come
// "non è un driver". Sono equivalenti solo per i casi ordinari: questi test
// fissano proprio i casi in cui non lo erano.
describe("permissions — accesso al modulo Liste viaggio", () => {
  it("admin, manager e agent attivi hanno accesso", () => {
    for (const uid of ["admin1", "mgr1", "senior1", "junior1"]) {
      expect(canAccessListe(TEAM, uid), uid).toBe(true);
    }
  });

  it("il Driver no", () => {
    expect(canAccessListe(TEAM, "driver1")).toBe(false);
  });

  it("un utente disattivato no, benché non sia un driver", () => {
    // `!isDriver(...)` — la formulazione precedente — gli dava accesso, e la
    // RLS lo respingeva poi con una vista piena di errori.
    expect(isDriver(TEAM, "spento")).toBe(false);
    expect(canAccessListe(TEAM, "spento")).toBe(false);
  });

  it("un utente che non è nel team no", () => {
    expect(canAccessListe(TEAM, "fantasma")).toBe(false);
    expect(canAccessListe([], "admin1")).toBe(false);
  });

  it("un ruolo fuori dall'enum del database no", () => {
    // Nessun ramo di can_liste() corrisponderebbe: qui non deve corrispondere.
    const team = [{ id: "u", role: "Amministrativo", active: true, pending: false }];
    expect(canAccessListe(team, "u")).toBe(false);
  });

  it("un utente ancora in attesa di approvazione no (M-4: private.can_liste() esclude i pending dal 6 agosto)", () => {
    // Il gate dei pending è ANCHE a monte (PendingScreen non monta l'app),
    // ma canAccessListe deve comunque rispecchiare can_liste(): prima di M-4
    // restituiva true qui, mentre il database (migrazione 20260806130000)
    // rifiuta un pending a prescindere da `active`.
    expect(canAccessListe(TEAM, "attesa")).toBe(false);
  });
});
