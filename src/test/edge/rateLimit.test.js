// B-2 dell'audit del 2 settembre (prosegue M-3 del 31 agosto). Due metà,
// stessa tecnica di edgeFunctionAdminGate.test.js:
// (1) `entroLimite` si comporta come dichiarato — compresa la scelta di
//     lasciar passare (fail-open) se la RPC stessa fallisce.
// (2) il CABLAGGIO: le quattro Edge Function chiamano davvero `entroLimite`
//     prima dell'operazione privilegiata, e rispondono 429 sopra soglia — un
//     helper corretto che nessuno chiama è esattamente lo stato che questo
//     rilievo descrive.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { entroLimite } from "../../../supabase/functions/_shared/rateLimit.ts";

const FUNZIONI_LIMITATE = ["invite-user", "delete-user", "set-user-active", "delete-account"];

const sorgente = (nome) =>
  readFileSync(join(process.cwd(), "supabase", "functions", nome, "index.ts"), "utf8");

const senzaCommenti = (ts) =>
  ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─── (1) entroLimite ────────────────────────────────────────────────────────

describe("entroLimite", () => {
  it("passa la chiave/finestra/soglia alla RPC e ritorna il suo verdetto", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const ok = await entroLimite({ rpc }, "invite-user:admin1", 60, 20);
    expect(ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rate_limit_incrementa", {
      p_chiave: "invite-user:admin1",
      p_finestra_minuti: 60,
      p_soglia: 20,
    });
  });

  it("sopra soglia la RPC ritorna false, e la funzione lo riporta", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const ok = await entroLimite({ rpc }, "invite-user:admin1", 60, 20);
    expect(ok).toBe(false);
  });

  it("un errore della RPC lascia passare (fail-open), non blocca la richiesta", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("rete") });
    const ok = await entroLimite({ rpc }, "invite-user:admin1", 60, 20);
    expect(ok).toBe(true);
  });
});

// ─── (2) IL CABLAGGIO ───────────────────────────────────────────────────────

describe("Edge Function privilegiate — il limite è cablato, non solo disponibile", () => {
  it.each(FUNZIONI_LIMITATE)("%s importa e chiama entroLimite", (nome) => {
    const src = senzaCommenti(sorgente(nome));
    expect(src).toMatch(/import\s*\{\s*entroLimite\s*\}\s*from\s*["']\.\.\/_shared\/rateLimit\.ts["']/);
    expect(src).toMatch(/await\s+entroLimite\s*\(/);
  });

  it.each(FUNZIONI_LIMITATE)("%s risponde 429 quando entroLimite nega", (nome) => {
    const src = senzaCommenti(sorgente(nome));
    // Non basta che la funzione sia chiamata: il valore falso deve portare a
    // un 429 e non essere ignorato — stesso principio di (2) in
    // edgeFunctionAdminGate.test.js, verificato lì sul gate admin.
    expect(src).toMatch(/entroLimite\([^)]*\)\)\)\s*\{[\s\S]{0,120}?429/);
  });

  it("la chiave di rate limit include l'id di chi chiama, non solo il nome della funzione", () => {
    // Un secchio condiviso fra tutti i chiamanti limiterebbe l'agenzia intera
    // al primo admin che invita — il difetto opposto a quello che B-2 chiude.
    for (const nome of FUNZIONI_LIMITATE) {
      const src = senzaCommenti(sorgente(nome));
      expect(src, nome).toMatch(new RegExp(`\`${nome}:\\$\\{`));
    }
  });
});
