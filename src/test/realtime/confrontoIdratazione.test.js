// ST-15 · Il confronto che evita di sostituire un array identico.
//
// PERCHÉ QUESTI TEST ESISTONO. Un confronto sbagliato in questa posizione non
// produce un errore visibile: se dice sempre "diverso" si torna al
// comportamento di prima (nessuno se ne accorge, il rilievo resta aperto con il
// codice che sembra chiuderlo); se dice "uguale" quando non lo è, uno schermo
// smette di aggiornarsi. Le due asserzioni che contano sono quelle sui casi
// limite, non quelle sul caso normale.
import { describe, it, expect } from "vitest";
import { stessaRiga, stessaLista, stessaMappa } from "../../lib/confrontoIdratazione.js";

const M = (extra = {}) => ({
  id: "marco", name: "Marco", role: "manager", color: "#0F2044",
  active: true, pending: false, photoUrl: null, ...extra,
});

describe("stessaRiga", () => {
  it("due righe con gli stessi valori sono equivalenti anche con chiavi in ordine diverso", () => {
    // È il motivo per cui non si usa JSON.stringify: lì questo caso sarebbe
    // "diverso", il confronto non riuscirebbe mai e la correzione sarebbe finta.
    expect(stessaRiga({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("un campo cambiato le rende diverse", () => {
    expect(stessaRiga(M(), M({ name: "Marco F." }))).toBe(false);
    expect(stessaRiga(M(), M({ active: false }))).toBe(false);
  });

  it("null e undefined sullo stesso campo contano come lo stesso valore", () => {
    // I mapper producono `null` dove il DB ha NULL, ma una chiave assente e una
    // chiave a null descrivono lo stesso profilo: trattarle come diverse
    // farebbe dispatchare a ogni evento, cioè non correggerebbe niente.
    expect(stessaRiga({ photoUrl: null }, { photoUrl: undefined })).toBe(true);
    expect(stessaRiga({ photoUrl: null }, {})).toBe(true);
  });

  it("una chiave in più con un valore vero le rende diverse", () => {
    expect(stessaRiga({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("0, \"\" e false non vengono confusi con l'assenza", () => {
    expect(stessaRiga({ capacity: 0 }, { capacity: null })).toBe(false);
    expect(stessaRiga({ name: "" }, {})).toBe(false);
    expect(stessaRiga({ active: false }, { active: null })).toBe(false);
  });
});

describe("stessaLista", () => {
  it("due letture identiche del team sono equivalenti", () => {
    expect(stessaLista([M(), M({ id: "sofia" })], [M(), M({ id: "sofia" })])).toBe(true);
  });

  it("una riga cambiata, aggiunta o rimossa rompe l'equivalenza", () => {
    expect(stessaLista([M()], [M({ role: "admin" })])).toBe(false);
    expect(stessaLista([M()], [M(), M({ id: "sofia" })])).toBe(false);
    expect(stessaLista([M(), M({ id: "sofia" })], [M()])).toBe(false);
  });

  it("l'ORDINE conta: due permutazioni non sono equivalenti", () => {
    // L'elenco del team è renderizzato nell'ordine della query: considerarle
    // uguali significherebbe non aggiornare uno schermo che deve cambiare.
    const a = [M(), M({ id: "sofia" })];
    const b = [M({ id: "sofia" }), M()];
    expect(stessaLista(a, b)).toBe(false);
  });

  it("null NON è equivalente a una lista: una lettura mancata non salta un aggiornamento", () => {
    // È il caso del primo giro (nessun payload precedente) e quello di una
    // risposta incompleta: entrambi devono dispatchare.
    expect(stessaLista(null, [])).toBe(false);
    expect(stessaLista(null, [M()])).toBe(false);
    expect(stessaLista(undefined, [M()])).toBe(false);
    expect(stessaLista([M()], null)).toBe(false);
  });

  it("due liste vuote sono equivalenti", () => {
    // Il caso "team vuoto che resta vuoto": nessun dispatch, ma lo scheletro si
    // chiude comunque perché segnaCaricata sta fuori dal ramo.
    expect(stessaLista([], [])).toBe(true);
  });
});

describe("stessaMappa", () => {
  const CAT = { booking: { label: "Booking", icon: "✈️", color: "#000", bg: "#fff" } };

  it("due letture identiche delle categorie sono equivalenti", () => {
    expect(stessaMappa(CAT, { booking: { ...CAT.booking } })).toBe(true);
  });

  it("un'etichetta cambiata, una categoria aggiunta o rimossa rompono l'equivalenza", () => {
    expect(stessaMappa(CAT, { booking: { ...CAT.booking, label: "Prenotazioni" } })).toBe(false);
    expect(stessaMappa(CAT, { ...CAT, hotel: { label: "Hotel" } })).toBe(false);
    expect(stessaMappa(CAT, {})).toBe(false);
  });

  it("null non è equivalente a una mappa", () => {
    expect(stessaMappa(null, {})).toBe(false);
    expect(stessaMappa(null, CAT)).toBe(false);
  });
});
