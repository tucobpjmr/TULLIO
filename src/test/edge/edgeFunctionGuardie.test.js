// B-1, B-2, B-3 dell'analisi del 16 novembre. Due metà, come in
// rateLimit.test.js: gli helper puri si eseguono, il cablaggio nelle Edge
// Function si verifica leggendo i sorgenti.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { endpointAmmesso } from "../../../supabase/functions/send-push/endpointAmmesso.ts";
import { entroLimite } from "../../../supabase/functions/_shared/rateLimit.ts";
import { eUltimoAdminAttivo } from "../../../supabase/functions/_shared/ultimoAdmin.ts";

const sorgente = (nome) =>
  readFileSync(join(process.cwd(), "supabase", "functions", nome, "index.ts"), "utf8");
const senzaCommenti = (ts) =>
  ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─── B-1 · send-push chiama solo i servizi push ────────────────────────────

describe("endpointAmmesso", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/QK1",
    "https://updates.push.services.mozilla.com/wpush/v2/x",
    "https://wns2-db5p.notify.windows.com/w/?token=x",
    "https://fcm.googleapis.com:443/wp/x",
  ])("ammette %s", (url) => {
    expect(endpointAmmesso(url)).toBe(true);
  });

  it.each([
    ["http, non https", "http://fcm.googleapis.com/fcm/send/abc"],
    ["host qualunque", "https://esempio.it/hook"],
    ["suffisso finto", "https://evilfcm.googleapis.com.attacker.io/x"],
    ["host che finisce come quello ammesso senza punto", "https://notpush.apple.com.evil/x"],
    ["indirizzo interno", "https://169.254.169.254/latest"],
    ["porta diversa", "https://fcm.googleapis.com:8443/x"],
    ["credenziali nell'URL", "https://u:p@fcm.googleapis.com/x"],
    ["non è un URL", "fcm.googleapis.com/x"],
    ["non è una stringa", null],
  ])("rifiuta: %s", (_, url) => {
    expect(endpointAmmesso(url)).toBe(false);
  });

  it("send-push lo chiama prima di inviare", () => {
    const src = senzaCommenti(sorgente("send-push"));
    expect(src).toMatch(/if\s*\(\s*!endpointAmmesso\(sub\.endpoint\)\)\s*\{[\s\S]{0,120}?return;/);
    expect(src.indexOf("endpointAmmesso(sub.endpoint)"))
      .toBeLessThan(src.indexOf("pushTextMessage"));
  });
});

// ─── B-2 · in delete-account un guasto del rate limit blocca ───────────────

describe("entroLimite con bloccaSeGuasto", () => {
  it("un errore della RPC blocca", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("rete") });
    expect(await entroLimite({ rpc }, "k", 60, 5, { bloccaSeGuasto: true })).toBe(false);
  });

  it("senza errore il verdetto resta quello della RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await entroLimite({ rpc }, "k", 60, 5, { bloccaSeGuasto: true })).toBe(true);
  });

  it("delete-account lo usa", () => {
    const src = senzaCommenti(sorgente("delete-account"));
    expect(src).toMatch(/entroLimite\([^)]*bloccaSeGuasto:\s*true[^)]*\)\)\)\s*\{[\s\S]{0,120}?429/);
  });
});

// ─── B-3 · l'ultimo admin attivo non si elimina ───────────────────────────

// Finto client: `users` restituisce il bersaglio a `maybeSingle()` e il
// conteggio degli altri admin alla catena di filtri.
function clientFinto({ bersaglio, altri, errore = null }) {
  const catena = {
    select: () => catena,
    eq: () => catena,
    or: () => catena,
    neq: () => Promise.resolve({ count: altri, error: errore }),
    maybeSingle: () => Promise.resolve({ data: bersaglio, error: null }),
  };
  return { from: () => catena };
}

const ADMIN = { role: "admin", active: true, pending: false };

describe("eUltimoAdminAttivo", () => {
  it("l'unico admin attivo è l'ultimo", async () => {
    expect(await eUltimoAdminAttivo(clientFinto({ bersaglio: ADMIN, altri: 0 }), "a"))
      .toEqual({ ok: true, ultimo: true });
  });

  it("con un altro admin attivo no", async () => {
    expect(await eUltimoAdminAttivo(clientFinto({ bersaglio: ADMIN, altri: 1 }), "a"))
      .toEqual({ ok: true, ultimo: false });
  });

  it.each([
    ["agent", { role: "agent", active: true, pending: false }],
    ["admin disattivato", { role: "admin", active: false, pending: false }],
    ["admin in attesa", { role: "admin", active: true, pending: true }],
    ["riga assente", null],
  ])("un bersaglio che non è admin attivo (%s) non conta", async (_, bersaglio) => {
    expect(await eUltimoAdminAttivo(clientFinto({ bersaglio, altri: 0 }), "a"))
      .toEqual({ ok: true, ultimo: false });
  });

  it("un errore di lettura non è un via libera", async () => {
    const esito = await eUltimoAdminAttivo(
      clientFinto({ bersaglio: ADMIN, altri: null, errore: new Error("db") }), "a");
    expect(esito.ok).toBe(false);
  });

  it.each(["delete-account", "delete-user"])("%s lo chiama e risponde 409", (nome) => {
    const src = senzaCommenti(sorgente(nome));
    expect(src).toMatch(/await\s+eUltimoAdminAttivo\(/);
    expect(src).toMatch(/if\s*\(ultimo\.ultimo\)\s*return\s+json\(\{\s*error:\s*MSG_ULTIMO_ADMIN\s*\},\s*409\)/);
  });

  it("delete-user controlla prima di eliminare", () => {
    const src = senzaCommenti(sorgente("delete-user"));
    expect(src.indexOf("eUltimoAdminAttivo(")).toBeLessThan(src.indexOf("auth.admin.deleteUser("));
  });

  it("delete-account controlla prima del ban", () => {
    const src = senzaCommenti(sorgente("delete-account"));
    expect(src.indexOf("eUltimoAdminAttivo(")).toBeLessThan(src.indexOf("auth.admin.updateUserById("));
  });
});
