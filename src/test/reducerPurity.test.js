// Purezza del reducer.
//
// Storia: il reducer scriveva i globali mutabili di state/appGlobals.js
// (setTeam, setCategories, setCurrentUser) da dentro i propri case. React 18
// invoca i reducer DUE volte in StrictMode e il Concurrent rendering può
// scartare un render già calcolato: un effetto collaterale lì dentro non ha
// garanzie di eseguire una volta sola, e nel frattempo le decisioni di
// autorizzazione venivano prese proprio su quelle globali.
//
// Quel modulo non esiste più (la fonte di verità è lo state, esposta ai
// componenti da state/AppDataContext.jsx), quindi le vecchie sentinelle sui
// globali non hanno più nulla da osservare. Restano — e sono la parte che
// conta davvero — le due proprietà che rendono il reducer sicuro sotto
// StrictMode e Concurrent:
//
//   1. NON MUTA il proprio input (lo state precedente resta identico);
//   2. È DETERMINISTICO (invocarlo due volte sullo stesso input dà lo stesso
//      risultato — esattamente ciò che StrictMode fa in sviluppo).
//
// Più la verifica che le decisioni di permesso si prendano su `state.team`.
import { describe, it, expect } from "vitest";
import { reducer, makeInitialState } from "../state/reducer.js";

const TEAM = [
  { id: "admin1", name: "Admin", role: "Admin",        active: true, pending: false },
  { id: "agent1", name: "Agent", role: "Senior Agent", active: true, pending: false },
];

const statoBase = (uid = "admin1") => ({
  ...makeInitialState({ team: TEAM, currentUserId: uid }),
  toast: null,
});

// Snapshot profondo, per confrontare uno state prima/dopo l'invocazione.
const snapshot = (o) => JSON.parse(JSON.stringify(o));

describe("reducer — nessun effetto collaterale sull'input", () => {
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

  it.each(AZIONI)("%s non muta lo state ricevuto", (_nome, action) => {
    const prima = statoBase();
    const atteso = snapshot(prima);
    reducer(prima, action);
    expect(snapshot(prima)).toEqual(atteso);
  });

  // Ciò che fa StrictMode in sviluppo: stesso input, due invocazioni. Se il
  // reducer avesse un effetto collaterale (una scrittura fuori dallo state, un
  // contatore, un push su un array condiviso) i due risultati divergerebbero.
  it.each(AZIONI)("%s è deterministico su due invocazioni (StrictMode)", (_nome, action) => {
    const base = statoBase();
    const a = reducer(base, action);
    const b = reducer(base, action);
    // Il log attività porta un timestamp e un suffisso casuale per riga: è
    // l'unico campo legittimamente diverso tra due invocazioni.
    expect(snapshot({ ...a, activityLog: null })).toEqual(snapshot({ ...b, activityLog: null }));
    expect(a.activityLog?.length).toBe(b.activityLog?.length);
  });
});

describe("reducer — le mutazioni finiscono nello state", () => {
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

describe("reducer — i permessi si leggono da state.team", () => {
  // Il verdetto dipende SOLO da `state.team` + `state.currentUserId`: nessuna
  // preparazione fuori dallo state, nessun ordine di test che conti.
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
