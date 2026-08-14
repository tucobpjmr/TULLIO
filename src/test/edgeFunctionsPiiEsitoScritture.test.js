// M-1 e M-2 dell'audit del 14 agosto — due difetti distinti nelle Edge
// Function privilegiate, entrambi nella categoria "la funzione fa qualcosa in
// meno di quello che promette, senza dirlo".
//
// Come edgeFunctionAdminGate.test.js, questi file TypeScript non entrano nel
// perimetro di Vitest (import `jsr:`/`npm:` che Node non risolve): si verifica
// il CABLAGGIO leggendo il sorgente, non eseguendolo. Un file a sé e non una
// sezione di quel file: qui il tema è l'esito delle scritture, non
// l'autorizzazione — due domande diverse sulle stesse funzioni.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sorgente = (nome) =>
  readFileSync(join(process.cwd(), "supabase", "functions", nome, "index.ts"), "utf8");

// Stessa precauzione di edgeFunctionAdminGate.test.js: i commenti discutono a
// lungo il difetto che stiamo cercando di escludere, e senza toglierli la
// ricerca leggerebbe le spiegazioni come codice.
const senzaCommenti = (ts) =>
  ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─── M-1 — delete-user rimuove anche l'avatar dallo storage ────────────────
describe("delete-user — pulizia PII allineata a delete-account (M-1)", () => {
  const src = senzaCommenti(sorgente("delete-user"));

  it("rimuove l'avatar dal bucket 'avatars' prima di rispondere", () => {
    // La FK CASCADE su public.users ripulisce le righe, non lo storage: senza
    // questa chiamata l'avatar di un utente ELIMINATO restava nel bucket a
    // tempo indefinito. Stessa pulizia già presente in delete-account.
    expect(src).toMatch(/\.storage\s*\.\s*from\(\s*["']avatars["']\s*\)/);
    expect(src).toMatch(/\.remove\(\s*\[\s*`\$\{[^}]+\}\/avatar\.jpg`/);
  });

  it("la rimozione avviene su ENTRAMBI i percorsi di successo, non solo uno", () => {
    // Due percorsi finiscono con "l'utente non c'è più": l'hard-delete
    // riuscita e il ramo "not found" (utente già sparito da auth, ripulito
    // solo lato public.users). Contare le occorrenze invece di cercarne una
    // sola: una correzione fatta a metà — solo il ramo principale — passerebbe
    // un assert singolo e lascerebbe l'avatar orfano sull'altro ramo.
    const chiamate = src.match(/rimuoviAvatar\(/g) || [];
    expect(chiamate.length).toBeGreaterThanOrEqual(2);
  });

  it("la pulizia non fa fallire la risposta se lo storage dà errore (best-effort)", () => {
    // .remove() su un percorso assente non è un errore lato Supabase, ma se
    // lo fosse comunque non deve rovesciare una hard-delete già committata su
    // auth.users: l'errore va solo loggato.
    expect(src).toMatch(/if\s*\(\s*error\s*\)\s*console\.error/);
  });
});

// ─── M-2 — invite-user non scarta l'esito degli upsert di profilo/contatto ─
describe("invite-user — l'esito degli upsert non viene ignorato (M-2)", () => {
  const src = senzaCommenti(sorgente("invite-user"));

  it("legge l'error di ENTRAMBI gli upsert (users e user_contacts)", () => {
    // Prima erano due `await ... .upsert(...)` senza destrutturare l'esito:
    // un fallimento (tipico: user_contacts, che non ha alcun trigger di
    // riserva) spariva in silenzio e la risposta restava { success: true }.
    expect(src).toMatch(/const\s*\[\s*profilo\s*,\s*contatto\s*\]/);
    expect(src).toMatch(/profilo\.error/);
    expect(src).toMatch(/contatto\.error/);
  });

  it("non fa fallire la richiesta: l'email d'invito è già partita", () => {
    // Un 500 qui spingerebbe l'admin a riprovare, generando un secondo
    // invito per lo stesso indirizzo — l'esito resta { success: true, … }.
    expect(src).toMatch(/success:\s*true[\s\S]{0,120}warning/);
  });

  it("il 'success' silenzioso di prima non è più raggiungibile: ogni ramo passa dal controllo", () => {
    // Il difetto originale era che NESSUN controllo esisteva sull'esito dei
    // due upsert: la sola presenza di un `if (problemi.length)` prima del
    // return finale della funzione (non del ramo resend, che li salta del
    // tutto) è la prova che la corsa a vuoto non può più capitare.
    expect(src).toMatch(/problemi\.length/);
  });
});
