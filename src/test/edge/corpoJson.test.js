// B-4 dell'analisi del 6 novembre — un corpo malformato è un 400, non un 500.
//
// Due metà, come rateLimit.test.js: (1) `leggiCorpoJson` ESEGUITO; (2) il
// CABLAGGIO, letto dal sorgente: nessuna funzione chiama più `req.json()`
// nudo, che lancia e finisce nel catch del 500.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { leggiCorpoJson, testo } from "../../../supabase/functions/_shared/corpoJson.ts";

const richiesta = (corpo) => new Request("https://x.invalid/f", { method: "POST", body: corpo });

describe("leggiCorpoJson", () => {
  it("un oggetto JSON passa com'è", async () => {
    expect(await leggiCorpoJson(richiesta('{"userId":"u1","active":true}'))).toEqual({ userId: "u1", active: true });
  });

  it.each([
    ["malformato", "{userId:"],
    ["vuoto", ""],
    ["null", "null"],
    ["un numero", "42"],
    ["una stringa", '"u1"'],
    ["un array", '["u1"]'],
  ])("%s → null", async (_nome, corpo) => {
    expect(await leggiCorpoJson(richiesta(corpo))).toBeNull();
  });

  it("senza corpo → null", async () => {
    expect(await leggiCorpoJson(new Request("https://x.invalid/f", { method: "POST" }))).toBeNull();
  });
});

describe("testo", () => {
  it("ripulisce le stringhe e scarta il resto", () => {
    expect(testo("  a@b.it ")).toBe("a@b.it");
    expect([testo(undefined), testo(null), testo(42), testo({})]).toEqual(["", "", "", ""]);
  });
});

const FUNZIONI = ["invite-user", "delete-user", "set-user-active", "delete-account", "send-push"];
const sorgente = (nome) =>
  readFileSync(join(process.cwd(), "supabase", "functions", nome, "index.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("Edge Function — il corpo passa da leggiCorpoJson", () => {
  it.each(FUNZIONI)("%s non chiama req.json() nudo", (nome) => {
    const src = sorgente(nome);
    expect(src).not.toMatch(/req\.json\s*\(/);
    expect(src).toMatch(/await\s+leggiCorpoJson\s*\(\s*req\s*\)/);
  });

  it.each(["invite-user", "delete-user", "set-user-active"])("%s risponde 400 se il corpo non è valido", (nome) => {
    expect(sorgente(nome)).toMatch(/if\s*\(\s*!body\s*\)\s*return\s+json\(\s*\{\s*error:\s*MSG_CORPO_NON_VALIDO\s*\}\s*,\s*400\s*\)/);
  });
});
