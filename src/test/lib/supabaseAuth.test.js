// B-2 dell'audit del 30 agosto — lib/supabaseAuth.js istanzia un secondo
// GoTrueClient, indipendente dal client pieno di lib/supabase.js, per non
// scaricare postgrest/realtime/storage sulla schermata di login.
//
// Il punto che DEVE restare vero è che le due istanze restano
// intercambiabili: stessa storageKey, stesso URL auth. Se divergono, una
// sessione scritta da un'istanza diventa invisibile all'altra — silenziosamente,
// perché ognuna legge/scrive dalla propria chiave e nessuna delle due segnala
// un errore. Questo test non costruisce un client vero (le opzioni interne di
// GoTrueClient non sono API pubblica), verifica invece che le funzioni di
// derivazione producano lo stesso URL/chiave che @supabase/supabase-js
// calcola internamente per il client pieno — la stessa formula letta dal suo
// sorgente (SupabaseClient.ts): `ensureTrailingSlash` + `new URL('auth/v1',
// baseUrl)`, e `sb-<primo-segmento-host>-auth-token`.
import { describe, it, expect } from "vitest";
import { deriveAuthUrl, deriveStorageKey } from "../../lib/supabaseAuth.js";

describe("supabaseAuth — derivazione URL/storageKey", () => {
  it("calcola l'URL auth come <base>/auth/v1, con o senza slash finale sull'input", () => {
    expect(deriveAuthUrl("https://xyzcompany.supabase.co")).toBe(
      "https://xyzcompany.supabase.co/auth/v1"
    );
    expect(deriveAuthUrl("https://xyzcompany.supabase.co/")).toBe(
      "https://xyzcompany.supabase.co/auth/v1"
    );
  });

  it("calcola la storageKey come sb-<primo-segmento-host>-auth-token", () => {
    expect(deriveStorageKey("https://xyzcompany.supabase.co")).toBe(
      "sb-xyzcompany-auth-token"
    );
  });

  it("un dominio custom usa comunque solo il primo segmento dell'host", () => {
    // Stessa regola di supabase-js: `baseUrl.hostname.split('.')[0]`, non
    // l'intero hostname — un progetto dietro un dominio custom a più livelli
    // (es. db.agenzia.example.com) userebbe "db", non "db-agenzia-example".
    expect(deriveStorageKey("https://db.agenzia.example.com")).toBe(
      "sb-db-auth-token"
    );
  });

  it("senza URL non deriva nulla, invece di costruire una chiave sbagliata", () => {
    expect(deriveAuthUrl(undefined)).toBeUndefined();
    expect(deriveAuthUrl("")).toBeUndefined();
    expect(deriveStorageKey(undefined)).toBeUndefined();
  });
});
