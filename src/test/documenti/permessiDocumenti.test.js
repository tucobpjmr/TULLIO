// I permessi dell'archivio documenti.
//
// Rispecchiano `private.can_documenti()` e la policy
// `documenti_identita_delete` (migrazione 20260916120000). Il valore di questi
// casi non è «la funzione fa quello che dice»: è che la risposta lato UI
// coincida con quella del database — la lacuna che A-1 dell'audit del 14
// agosto (secondo passaggio) ha chiuso sull'anagrafica, dove i pulsanti
// venivano mostrati a chi la RLS avrebbe poi rifiutato.
import { describe, it, expect } from "vitest";
import { canAccessDocumenti, canDeleteDocumento } from "../../lib/permissions.js";

const TEAM = [
  { id: "admin1",  role: "Admin",        active: true,  pending: false },
  { id: "mgr1",    role: "Manager",      active: true,  pending: false },
  { id: "senior1", role: "Senior Agent", active: true,  pending: false },
  { id: "junior1", role: "Junior Agent", active: true,  pending: false },
  { id: "driver1", role: "Driver",       active: true,  pending: false },
  { id: "spento",  role: "Senior Agent", active: false, pending: false },
  { id: "attesa",  role: "Senior Agent", active: true,  pending: true  },
  { id: "strano",  role: "Amministrativo", active: true, pending: false },
];

const doc = (uploadedBy) => ({ id: "d1", passeggero: "ROSSI MARIA", uploadedBy });

describe("canAccessDocumenti", () => {
  it("admin, manager e agent accedono", () => {
    for (const id of ["admin1", "mgr1", "senior1", "junior1"]) {
      expect(canAccessDocumenti(TEAM, id)).toBe(true);
    }
  });

  // Il driver è fuori come dall'anagrafica clienti, e per la stessa ragione:
  // non ha accesso ai dati delle persone.
  it("il driver non accede", () => {
    expect(canAccessDocumenti(TEAM, "driver1")).toBe(false);
  });

  it("un utente disattivato o ancora in attesa non accede", () => {
    expect(canAccessDocumenti(TEAM, "spento")).toBe(false);
    expect(canAccessDocumenti(TEAM, "attesa")).toBe(false);
  });

  // Un ruolo fuori enum non corrisponde a nessun ramo di can_documenti() lato
  // database: qui non deve corrispondere a nessuno. È la lezione del confronto
  // per sottostringa, dove «Amministrativo» otteneva i permessi di admin.
  it("un ruolo fuori enum non accede", () => {
    expect(canAccessDocumenti(TEAM, "strano")).toBe(false);
  });

  it("chi non è nel team non accede", () => {
    expect(canAccessDocumenti(TEAM, "sconosciuto")).toBe(false);
    expect(canAccessDocumenti(TEAM, undefined)).toBe(false);
    expect(canAccessDocumenti([], "admin1")).toBe(false);
  });
});

describe("canDeleteDocumento", () => {
  it("chi ha caricato il documento può eliminarlo", () => {
    expect(canDeleteDocumento(TEAM, doc("junior1"), "junior1")).toBe(true);
  });

  // L'asimmetria voluta: un agent scrive ma non cancella il lavoro di un
  // collega — la stessa che `clients` ha fra scrittura e eliminazione.
  it("un agent non elimina il documento caricato da un altro", () => {
    expect(canDeleteDocumento(TEAM, doc("senior1"), "junior1")).toBe(false);
  });

  it("manager e admin eliminano qualunque documento", () => {
    expect(canDeleteDocumento(TEAM, doc("junior1"), "mgr1")).toBe(true);
    expect(canDeleteDocumento(TEAM, doc("junior1"), "admin1")).toBe(true);
  });

  // `uploaded_by` è `on delete set null`: un documento caricato da un utente
  // poi eliminato resta senza proprietario. Lato database `null = auth.uid()`
  // vale NULL, non true — qui deve valere lo stesso, altrimenti la UI
  // mostrerebbe a un agent un pulsante che la policy rifiuta.
  it("un documento senza chi l'ha caricato resta ai soli manager e admin", () => {
    expect(canDeleteDocumento(TEAM, doc(null), "junior1")).toBe(false);
    expect(canDeleteDocumento(TEAM, doc(null), "mgr1")).toBe(true);
  });

  it("chi non accede all'archivio non elimina nulla, nemmeno il proprio", () => {
    expect(canDeleteDocumento(TEAM, doc("driver1"), "driver1")).toBe(false);
    expect(canDeleteDocumento(TEAM, doc("spento"), "spento")).toBe(false);
  });

  it("regge un documento assente", () => {
    expect(canDeleteDocumento(TEAM, null, "junior1")).toBe(false);
    expect(canDeleteDocumento(TEAM, null, "admin1")).toBe(true);
  });
});
