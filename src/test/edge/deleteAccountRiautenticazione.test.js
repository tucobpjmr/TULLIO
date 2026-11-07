// A-3 e M-3 dell'analisi del 6 novembre — `delete-account` chiede la password
// e non lascia in `auth.users` niente che identifichi la persona.
//
// Due metà, come rateLimit.test.js:
// (1) `riautenticazione.ts` ESEGUITO: è un modulo senza import `jsr:` di
//     runtime, quindi Vitest lo carica (l'import di tipi lo toglie esbuild).
// (2) il CABLAGGIO in index.ts, letto dal sorgente: una verifica corretta che
//     arriva DOPO il ban non protegge niente, e l'ordine dei passi è proprio
//     ciò che un test su (1) non vede.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emailAnonima, metadatiAzzerati, verificaPassword,
} from "../../../supabase/functions/delete-account/riautenticazione.ts";

const ID = "0b9c6a52-7d3e-4f1a-9e2b-5c8d4a1f0e37";

function clientFinto({ errore = null, idUtente = ID } = {}) {
  return {
    auth: {
      signInWithPassword: vi.fn(async () => errore
        ? { data: { user: null, session: null }, error: errore }
        : { data: { user: { id: idUtente }, session: { access_token: "t" } }, error: null }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
}

// ─── (1) la verifica ────────────────────────────────────────────────────────

describe("verificaPassword", () => {
  it("password giusta: corretta, e la sessione aperta per verificare si chiude subito", async () => {
    const client = clientFinto();
    const r = await verificaPassword(client, ID, "a@b.it", "giusta");
    expect(r.esito).toBe("corretta");
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.it", password: "giusta" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("credenziali sbagliate: sbagliata", async () => {
    const r = await verificaPassword(clientFinto({ errore: { code: "invalid_credentials", status: 400 } }), ID, "a@b.it", "x");
    expect(r.esito).toBe("sbagliata");
  });

  it("limite di GoTrue: troppi_tentativi, non «password sbagliata»", async () => {
    const r1 = await verificaPassword(clientFinto({ errore: { code: "over_request_rate_limit", status: 429 } }), ID, "a@b.it", "x");
    const r2 = await verificaPassword(clientFinto({ errore: { status: 429 } }), ID, "a@b.it", "x");
    expect([r1.esito, r2.esito]).toEqual(["troppi_tentativi", "troppi_tentativi"]);
  });

  it("qualunque altro rifiuto è un guasto: chi ha la password giusta non deve sentirsi dire che è sbagliata", async () => {
    const errore = { code: "unexpected_failure", status: 500 };
    const r = await verificaPassword(clientFinto({ errore }), ID, "a@b.it", "giusta");
    expect(r).toEqual({ esito: "guasto", errore });
  });

  it("un accesso riuscito su un ALTRO utente non conferma niente", async () => {
    const r = await verificaPassword(clientFinto({ idUtente: "un-altro" }), ID, "a@b.it", "giusta");
    expect(r.esito).toBe("sbagliata");
  });
});

describe("emailAnonima e metadatiAzzerati", () => {
  it("l'email nuova è unica per utente e su un dominio che non riceve posta", () => {
    expect(emailAnonima(ID)).toBe(`eliminato+${ID}@invalid.invalid`);
    expect(emailAnonima("a")).not.toBe(emailAnonima("b"));
    // Il formato che GoTrue accetta (checkmail.ValidateFormat): altrimenti
    // il ban, che viaggia nella stessa chiamata, fallirebbe con lei.
    expect(emailAnonima(ID)).toMatch(/^[a-z0-9.+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/);
  });

  it("ogni chiave PRESENTE va a null: GoTrue le cancella, comprese quelle che nessuno ha elencato", () => {
    const metadati = { name: "Mario Rossi", role: "agent", color: "#123", capacity: 8, invited_by: "x", email_verified: true, nuova: 1 };
    const azzerati = metadatiAzzerati(metadati);
    expect(Object.keys(azzerati).sort()).toEqual(Object.keys(metadati).sort());
    expect(Object.values(azzerati).every((v) => v === null)).toBe(true);
  });

  it("senza metadati non c'è niente da azzerare", () => {
    expect(metadatiAzzerati(null)).toEqual({});
    expect(metadatiAzzerati(undefined)).toEqual({});
  });
});

// ─── (2) IL CABLAGGIO ───────────────────────────────────────────────────────

const src = readFileSync(join(process.cwd(), "supabase", "functions", "delete-account", "index.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const posizione = (re) => {
  const m = src.match(re);
  expect(m, String(re)).toBeTruthy();
  return m.index;
};

describe("delete-account — la password viene prima di tutto ciò che è irreversibile", () => {
  it("ordine: limite → password presente → verifica → ban → pulizie", () => {
    const limite = posizione(/await\s+entroLimite\s*\(/);
    const mancante = posizione(/if\s*\(\s*!password\s*\)/);
    const verifica = posizione(/await\s+verificaPassword\s*\(/);
    const ban = posizione(/ban_duration/);
    const pulizie = posizione(/Promise\.allSettled/);
    expect(limite).toBeLessThan(mancante);
    expect(mancante).toBeLessThan(verifica);
    expect(verifica).toBeLessThan(ban);
    expect(ban).toBeLessThan(pulizie);
  });

  it("la password si legge dal corpo, e senza risponde 400", () => {
    expect(src).toMatch(/await\s+leggiCorpoJson\(\s*req\s*\)/);
    expect(src).toMatch(/if\s*\(\s*!password\s*\)\s*return\s+json\([^)]*,\s*400\s*\)/);
  });

  it("password sbagliata → 403; ogni esito diverso da «corretta» esce prima del ban", () => {
    expect(src).toMatch(/esito\s*===\s*["']sbagliata["']\)\s*return\s+json\([^)]*,\s*403\s*\)/);
    expect(src).toMatch(/esito\s*===\s*["']troppi_tentativi["']\)\s*return\s+json\([^)]*,\s*429\s*\)/);
    expect(src).toMatch(/esito\s*===\s*["']guasto["']\)\s*return\s+json\(\s*erroreInterno\(/);
  });

  it("la verifica usa la chiave ANON e non salva la sessione", () => {
    // Con la service_role, signInWithPassword funzionerebbe lo stesso, ma la
    // verifica deve passare dalla stessa porta di un login qualunque.
    const blocco = src.slice(posizione(/const\s+verifica\s*=\s*createClient\(/), posizione(/await\s+verificaPassword\s*\(/));
    expect(blocco).toMatch(/SUPABASE_ANON_KEY/);
    expect(blocco).not.toMatch(/SERVICE_ROLE/);
    expect(blocco).toMatch(/persistSession:\s*false/);
  });

  it("M-3: ban, email anonima e metadati svuotati sono UNA chiamata a GoTrue", () => {
    const chiamate = src.match(/auth\.admin\.updateUserById\(/g) ?? [];
    expect(chiamate).toHaveLength(1);
    const corpo = src.slice(posizione(/auth\.admin\.updateUserById\(/), posizione(/if\s*\(\s*banErr\s*\)/));
    expect(corpo).toMatch(/ban_duration:\s*["']87600h["']/);
    expect(corpo).toMatch(/email:\s*emailAnonima\(\s*user\.id\s*\)/);
    expect(corpo).toMatch(/email_confirm:\s*true/);
    expect(corpo).toMatch(/user_metadata:\s*metadatiAzzerati\(\s*user\.user_metadata\s*\)/);
  });
});
