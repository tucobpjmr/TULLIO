// Purezza del reducer.
//
// Il reducer scriveva i globali mutabili di appGlobals.js (setTeam,
// setCategories, setCurrentUser) da dentro i propri case. React 18 invoca i
// reducer DUE volte in StrictMode e il Concurrent rendering può scartare un
// render già calcolato: un effetto collaterale lì dentro non ha garanzie di
// eseguire una volta sola, e nel frattempo le decisioni di autorizzazione
// venivano prese proprio su quelle globali.
//
// Questi test bloccano la regressione: il reducer deve limitarsi a restituire
// il nuovo state.
import { describe, it, expect, beforeEach } from "vitest";
import { reducer, makeInitialState } from "../state/reducer.js";
import * as appGlobals from "../state/appGlobals.js";
import { setTeam, setCategories, setCurrentUser } from "../state/appGlobals.js";

const TEAM = [
  { id: "admin1", name: "Admin", role: "Admin",        active: true, pending: false },
  { id: "agent1", name: "Agent", role: "Senior Agent", active: true, pending: false },
];

const statoBase = (uid = "admin1") => ({
  ...makeInitialState({ team: TEAM, currentUserId: uid }),
  toast: null,
});

// Sentinelle: valori riconoscibili che il reducer non deve toccare.
const SENTINELLA_TEAM = [{ id: "sentinella", name: "Sentinella", role: "Admin", active: true, pending: false }];
const SENTINELLA_CATS = { sentinella: { label: "Sentinella" } };

beforeEach(() => {
  setTeam(SENTINELLA_TEAM);
  setCategories(SENTINELLA_CATS);
  setCurrentUser("sentinella");
});

const globaliIntatte = () => {
  expect(appGlobals.TEAM).toBe(SENTINELLA_TEAM);
  expect(appGlobals.CATEGORIES).toBe(SENTINELLA_CATS);
  expect(appGlobals.CURRENT_USER).toBe("sentinella");
};

describe("reducer — nessuna scrittura sui globali", () => {
  const AZIONI = [
    ["SET_TEAM",                  { type: "SET_TEAM", payload: [{ id: "nuovo", name: "Nuovo", role: "Admin", active: true, pending: false }] }],
    ["ADD_TEAM_MEMBER",           { type: "ADD_TEAM_MEMBER", payload: { id: "x", name: "X", role: "Manager", active: true, pending: false } }],
    ["UPDATE_TEAM_MEMBER",        { type: "UPDATE_TEAM_MEMBER", payload: { id: "agent1", name: "Rinominato" } }],
    ["APPROVE_TEAM_MEMBER",       { type: "APPROVE_TEAM_MEMBER", payload: "agent1" }],
    ["TOGGLE_TEAM_MEMBER_ACTIVE", { type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "agent1" }],
    ["REMOVE_TEAM_MEMBER",        { type: "REMOVE_TEAM_MEMBER", payload: "agent1" }],
    ["SET_CATEGORIES",            { type: "SET_CATEGORIES", payload: { nuova: { label: "Nuova" } } }],
    ["ADD_CATEGORY",              { type: "ADD_CATEGORY", payload: { key: "hotel", label: "Hotel" } }],
    ["UPDATE_CATEGORY",           { type: "UPDATE_CATEGORY", payload: { key: "booking", label: "Rinominata" } }],
    ["REMOVE_CATEGORY",           { type: "REMOVE_CATEGORY", payload: "booking" }],
    ["SET_CURRENT_USER",          { type: "SET_CURRENT_USER", payload: "agent1" }],
    ["UPDATE_OWN_PROFILE",        { type: "UPDATE_OWN_PROFILE", payload: { name: "Io" } }],
    ["RESTORE_BACKUP",            { type: "RESTORE_BACKUP", payload: { team: [{ id: "b", name: "B" }], categories: { c: { label: "C" } } } }],
  ];

  it.each(AZIONI)("%s non tocca TEAM/CATEGORIES/CURRENT_USER", (_nome, action) => {
    reducer(statoBase(), action);
    globaliIntatte();
  });

  it("una sequenza completa di azioni lascia i globali invariati", () => {
    let s = statoBase();
    for (const [, action] of AZIONI) s = reducer(s, action);
    globaliIntatte();
  });
});

describe("reducer — le mutazioni finiscono nello state, non altrove", () => {
  it("SET_TEAM aggiorna state.team", () => {
    const nuovo = [{ id: "nuovo", name: "Nuovo", role: "Admin", active: true, pending: false }];
    expect(reducer(statoBase(), { type: "SET_TEAM", payload: nuovo }).team).toEqual(nuovo);
  });

  it("SET_CURRENT_USER aggiorna state.currentUserId", () => {
    expect(reducer(statoBase(), { type: "SET_CURRENT_USER", payload: "agent1" }).currentUserId).toBe("agent1");
  });

  it("ADD_CATEGORY aggiorna state.categories", () => {
    const next = reducer(statoBase(), { type: "ADD_CATEGORY", payload: { key: "hotel", label: "Hotel" } });
    expect(next.categories.hotel).toEqual({ label: "Hotel" });
  });
});

describe("reducer — i permessi si leggono da state.team, non dai globali", () => {
  // La prova decisiva: le globali dicono che "sentinella" è admin e che gli
  // altri utenti non esistono. Se il reducer le consultasse ancora, questi due
  // test darebbero il verdetto opposto.
  it("un admin secondo state.team può accedere alla vista Admin", () => {
    const next = reducer(statoBase("admin1"), { type: "SET_VIEW", payload: "admin" });
    expect(next.activeView).toBe("admin");
  });

  it("un non-admin secondo state.team viene respinto", () => {
    const next = reducer(statoBase("agent1"), { type: "SET_VIEW", payload: "admin" });
    expect(next.activeView).not.toBe("admin");
    expect(next.toast.type).toBe("error");
  });

  it("cambiare SOLO lo state.team cambia il verdetto sullo stesso utente", () => {
    const comeAdmin = { ...statoBase("u"), team: [{ id: "u", role: "Admin", active: true, pending: false }], currentUserId: "u" };
    const comeAgente = { ...statoBase("u"), team: [{ id: "u", role: "Junior Agent", active: true, pending: false }], currentUserId: "u" };

    expect(reducer(comeAdmin,  { type: "SET_VIEW", payload: "admin" }).activeView).toBe("admin");
    expect(reducer(comeAgente, { type: "SET_VIEW", payload: "admin" }).activeView).not.toBe("admin");
  });
});

describe("makeInitialState — factory pura", () => {
  it("non scrive i globali (React può invocarla due volte in StrictMode)", () => {
    makeInitialState({ team: TEAM, currentUserId: "admin1" });
    globaliIntatte();
  });

  it("invocazioni ripetute con gli stessi argomenti danno lo stesso risultato", () => {
    const a = makeInitialState({ team: TEAM, currentUserId: "admin1" });
    const b = makeInitialState({ team: TEAM, currentUserId: "admin1" });
    expect(a.team).toEqual(b.team);
    expect(a.currentUserId).toBe(b.currentUserId);
    expect(a.categories).toEqual(b.categories);
  });

  it("copia il team invece di condividerne il riferimento", () => {
    const state = makeInitialState({ team: TEAM, currentUserId: "admin1" });
    expect(state.team).not.toBe(TEAM);
    expect(state.team).toEqual(TEAM);
  });

  it("senza argomenti costruisce lo stato demo sui mock", () => {
    const state = makeInitialState();
    expect(state.currentUserId).toBe("marco");
    expect(state.team.length).toBeGreaterThan(0);
    expect(state.tasks.length).toBeGreaterThan(0);
  });
});
