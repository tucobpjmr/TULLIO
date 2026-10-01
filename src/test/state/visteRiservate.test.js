// La tabella dei guard per vista, e i due punti del reducer che la usano.
//
// Prima erano tre `if` dentro `SET_VIEW` più due condizioni scritte a mano in
// `SET_CURRENT_USER` — cioè DUE elenchi di viste riservate da tenere
// allineati, e già disallineati fra loro. Questi casi fissano che ne esista
// uno solo: le stesse viste devono essere negate all'apertura E riportate a
// dashboard al cambio utente.
import { describe, it, expect } from "vitest";
import { reducer, makeInitialState } from "../../state/reducer.js";
import { VISTE_RISERVATE, dinegoVista } from "../../state/visteRiservate.js";

const TEAM = [
  { id: "marco",  name: "Marco",  role: "admin",        active: true, pending: false },
  { id: "gina",   name: "Gina",   role: "junior agent", active: true, pending: false },
  { id: "dario",  name: "Dario",  role: "driver",       active: true, pending: false },
];

const stato = (uid) => makeInitialState({ team: TEAM, currentUserId: uid });

describe("dinegoVista", () => {
  it("una vista non riservata è aperta a chiunque", () => {
    for (const vista of ["dashboard", "calendar", "archivio", "trash"]) {
      expect(dinegoVista(vista, TEAM, "dario")).toBeNull();
    }
  });

  it("restituisce il messaggio, non un booleano: il chiamante ha bisogno di entrambi", () => {
    expect(dinegoVista("liste", TEAM, "dario")).toMatch(/liste viaggio/i);
    expect(dinegoVista("liste", TEAM, "gina")).toBeNull();
  });

  it("ogni vista riservata dichiara predicato e messaggio", () => {
    for (const [vista, regola] of Object.entries(VISTE_RISERVATE)) {
      expect(typeof regola.puo, vista).toBe("function");
      expect(regola.diniego.length, vista).toBeGreaterThan(10);
    }
  });

  it("l'archivio documenti non è più una vista", () => {
    expect(VISTE_RISERVATE.documenti).toBeUndefined();
  });
});

describe("SET_VIEW — le viste riservate", () => {
  it("nega Liste al driver, con un toast d'errore", () => {
    const next = reducer(stato("dario"), { type: "SET_VIEW", payload: "liste" });
    expect(next.activeView).not.toBe("liste");
    expect(next.toasts.at(-1).type).toBe("error");
  });

  it("Admin resta negata ai non-admin, Liste aperta a un agent", () => {
    expect(reducer(stato("gina"), { type: "SET_VIEW", payload: "admin" }).activeView).not.toBe("admin");
    expect(reducer(stato("gina"), { type: "SET_VIEW", payload: "liste" }).activeView).toBe("liste");
  });
});

describe("SET_CURRENT_USER — la vista che il nuovo utente non può tenere", () => {
  it("non tocca la vista se il nuovo utente può tenerla", () => {
    let s = reducer(stato("marco"), { type: "SET_VIEW", payload: "liste" });
    s = reducer(s, { type: "SET_CURRENT_USER", payload: "gina" });
    expect(s.activeView).toBe("liste");
  });

  it("riporta a dashboard da Admin e da Liste", () => {
    let s = reducer(stato("marco"), { type: "SET_VIEW", payload: "admin" });
    expect(reducer(s, { type: "SET_CURRENT_USER", payload: "gina" }).activeView).toBe("dashboard");

    s = reducer(stato("marco"), { type: "SET_VIEW", payload: "liste" });
    expect(reducer(s, { type: "SET_CURRENT_USER", payload: "dario" }).activeView).toBe("dashboard");
  });
});
