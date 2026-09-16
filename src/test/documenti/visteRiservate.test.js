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
    expect(dinegoVista("documenti", TEAM, "dario")).toMatch(/archivio documenti/i);
    expect(dinegoVista("documenti", TEAM, "gina")).toBeNull();
  });

  it("ogni vista riservata dichiara predicato e messaggio", () => {
    for (const [vista, regola] of Object.entries(VISTE_RISERVATE)) {
      expect(typeof regola.puo, vista).toBe("function");
      expect(regola.diniego.length, vista).toBeGreaterThan(10);
    }
  });
});

describe("SET_VIEW — le viste riservate", () => {
  it("nega l'archivio documenti al driver, con un toast d'errore", () => {
    const next = reducer(stato("dario"), { type: "SET_VIEW", payload: "documenti" });
    expect(next.activeView).not.toBe("documenti");
    expect(next.toasts.at(-1).type).toBe("error");
  });

  it("lo apre a un agent", () => {
    const next = reducer(stato("gina"), { type: "SET_VIEW", payload: "documenti" });
    expect(next.activeView).toBe("documenti");
  });

  // Le due regole preesistenti non devono essere cambiate dall'estrazione.
  it("Admin resta negata ai non-admin e Liste al driver", () => {
    expect(reducer(stato("gina"), { type: "SET_VIEW", payload: "admin" }).activeView).not.toBe("admin");
    expect(reducer(stato("dario"), { type: "SET_VIEW", payload: "liste" }).activeView).not.toBe("liste");
    expect(reducer(stato("gina"), { type: "SET_VIEW", payload: "liste" }).activeView).toBe("liste");
  });
});

describe("SET_CURRENT_USER — la vista che il nuovo utente non può tenere", () => {
  // Il disallineamento che l'estrazione chiude: prima questo elenco nominava
  // "admin" e "liste" a mano, quindi passare a un driver mentre si è
  // sull'archivio documenti lo lasciava su una vista che non può usare.
  it("riporta a dashboard chi non può più stare sui documenti", () => {
    let s = reducer(stato("marco"), { type: "SET_VIEW", payload: "documenti" });
    expect(s.activeView).toBe("documenti");
    s = reducer(s, { type: "SET_CURRENT_USER", payload: "dario" });
    expect(s.activeView).toBe("dashboard");
  });

  it("non tocca la vista se il nuovo utente può tenerla", () => {
    let s = reducer(stato("marco"), { type: "SET_VIEW", payload: "documenti" });
    s = reducer(s, { type: "SET_CURRENT_USER", payload: "gina" });
    expect(s.activeView).toBe("documenti");
  });

  it("continua a riportare a dashboard da Admin e da Liste", () => {
    let s = reducer(stato("marco"), { type: "SET_VIEW", payload: "admin" });
    expect(reducer(s, { type: "SET_CURRENT_USER", payload: "gina" }).activeView).toBe("dashboard");

    s = reducer(stato("marco"), { type: "SET_VIEW", payload: "liste" });
    expect(reducer(s, { type: "SET_CURRENT_USER", payload: "dario" }).activeView).toBe("dashboard");
  });
});
