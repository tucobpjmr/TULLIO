// Guardie di stato del modulo Liste viaggio.
//
// Il modulo non ha una voce di sidebar/bottom-nav: ci si arriva solo dal
// bottone nell'header della Dashboard e dal tab nella scheda cliente. Questo
// rende le guardie del reducer più importanti del solito — nessun elemento di
// navigazione riporta l'utente fuori se la vista resta impostata su "liste".
import { describe, it, expect } from "vitest";
import { reducer, makeInitialState } from "../../state/reducer.js";

const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina", role: "junior agent", active: true, pending: false },
  { id: "giulia", name: "Giulia", role: "driver", active: true, pending: false },
];

const LISTA_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function freshState(uid = "marco") {
  return makeInitialState({ team: TEAM_FIXTURE, currentUserId: uid });
}

describe("reducer — accesso al modulo Liste viaggio", () => {
  it("SET_VIEW liste è consentita ad admin, manager e agent", () => {
    for (const uid of ["marco", "gina"]) {
      const next = reducer(freshState(uid), { type: "SET_VIEW", payload: "liste" });
      expect(next.activeView).toBe("liste");
      expect(next.toasts).toHaveLength(0);
    }
  });

  it("SET_VIEW liste è negata al Driver", () => {
    const next = reducer(freshState("giulia"), { type: "SET_VIEW", payload: "liste" });
    expect(next.activeView).not.toBe("liste");
    expect(next.toasts.at(-1).type).toBe("error");
  });

  it("passando a un utente Driver la vista liste torna a dashboard", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "liste" });
    expect(s.activeView).toBe("liste");
    s = reducer(s, { type: "SET_CURRENT_USER", payload: "giulia" });
    expect(s.activeView).toBe("dashboard");
    expect(s.listeTarget).toBeNull();
  });

  it("passando a un utente non Driver la vista liste resta aperta", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "liste" });
    s = reducer(s, { type: "SET_CURRENT_USER", payload: "gina" });
    expect(s.activeView).toBe("liste");
  });
});

// Il tab "Liste viaggio" della scheda cliente apre una lista precisa: SET_VIEW
// porta con sé l'id, il modulo lo consuma da state.listeTarget.
describe("reducer — apertura mirata di una lista", () => {
  it("senza id azzera listeTarget (si apre l'elenco)", () => {
    const next = reducer(freshState("marco"), { type: "SET_VIEW", payload: "liste" });
    expect(next.listeTarget).toBeNull();
  });

  it("con id registra la lista richiesta", () => {
    const next = reducer(freshState("marco"), { type: "SET_VIEW", payload: "liste", lista: LISTA_ID });
    expect(next.listeTarget).toMatchObject({ id: LISTA_ID });
  });

  it("il seq avanza anche richiedendo due volte la stessa lista", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "liste", lista: LISTA_ID });
    const first = s.listeTarget.seq;
    s = reducer(s, { type: "SET_VIEW", payload: "liste", lista: LISTA_ID });
    expect(s.listeTarget.seq).toBe(first + 1);
  });

  it("CLEAR_LISTE_TARGET consuma la richiesta: rientrando non riapre la lista", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "liste", lista: LISTA_ID });
    s = reducer(s, { type: "CLEAR_LISTE_TARGET" });
    expect(s.listeTarget).toBeNull();
  });

  it("una vista diversa da liste non tocca listeTarget", () => {
    let s = freshState("marco");
    s = reducer(s, { type: "SET_VIEW", payload: "liste", lista: LISTA_ID });
    s = reducer(s, { type: "SET_VIEW", payload: "clienti" });
    expect(s.listeTarget).toMatchObject({ id: LISTA_ID });
  });
});
