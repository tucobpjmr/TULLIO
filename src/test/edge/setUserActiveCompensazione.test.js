// B-1 dell'analisi del 6 novembre — `set-user-active`: ban e profilo restano
// allineati anche quando la seconda scrittura fallisce.
//
// Due metà, come deleteAccountRiautenticazione.test.js: (1) `statoAccesso.ts`
// ESEGUITO con un client finto; (2) il CABLAGGIO in index.ts, letto dal
// sorgente: la funzione non scrive più ban e profilo per conto suo.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BAN_INDEFINITO, cambiaStatoAccesso, durataDaRipristinare,
} from "../../../supabase/functions/set-user-active/statoAccesso.ts";

const ID = "7c1d2e3f-0a4b-4c5d-8e6f-9a0b1c2d3e4f";
const ADESSO = Date.parse("2026-11-07T10:00:00Z");

function clientFinto({
  bannedUntil = null, letturaErr = null, utente = true,
  banErr = null, profiloErr = null, righe = [{ id: ID }], compErr = null,
} = {}) {
  const updateUserById = vi.fn()
    .mockResolvedValueOnce({ data: {}, error: banErr })
    .mockResolvedValueOnce({ data: {}, error: compErr });
  const select = vi.fn(async () => ({ data: profiloErr ? null : righe, error: profiloErr }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: utente ? { id: ID, banned_until: bannedUntil } : null },
          error: letturaErr,
        })),
        updateUserById,
      },
    },
    from: vi.fn(() => ({ update })),
    _: { updateUserById, update, eq },
  };
}

describe("durataDaRipristinare", () => {
  it("nessun ban, o un ban già scaduto → none", () => {
    expect(durataDaRipristinare(null, ADESSO)).toBe("none");
    expect(durataDaRipristinare("2026-11-01T00:00:00Z", ADESSO)).toBe("none");
    expect(durataDaRipristinare("non una data", ADESSO)).toBe("none");
  });

  it("un ban in corso → le ore che mancano, arrotondate per eccesso", () => {
    expect(durataDaRipristinare("2026-11-07T12:30:00Z", ADESSO)).toBe("3h");
    expect(durataDaRipristinare("2026-11-07T10:00:01Z", ADESSO)).toBe("1h");
  });
});

describe("cambiaStatoAccesso", () => {
  it("tutto riuscito: un ban, un update del profilo, nessuna compensazione", async () => {
    const c = clientFinto();
    expect(await cambiaStatoAccesso(c, ID, false)).toEqual({ esito: "fatto" });
    expect(c._.updateUserById).toHaveBeenCalledTimes(1);
    expect(c._.updateUserById).toHaveBeenCalledWith(ID, { ban_duration: BAN_INDEFINITO });
    expect(c._.update).toHaveBeenCalledWith({ active: false });
  });

  it("riattivare toglie il ban", async () => {
    const c = clientFinto({ bannedUntil: "2036-01-01T00:00:00Z" });
    await cambiaStatoAccesso(c, ID, true);
    expect(c._.updateUserById).toHaveBeenCalledWith(ID, { ban_duration: "none" });
  });

  it("ban fallito: il profilo non si tocca", async () => {
    const c = clientFinto({ banErr: { message: "giù" } });
    const r = await cambiaStatoAccesso(c, ID, false);
    expect(r).toMatchObject({ esito: "guasto", fase: "ban", compensato: true });
    expect(c._.update).not.toHaveBeenCalled();
  });

  it("profilo fallito dopo il ban: il ban torna com'era (nessun ban → none)", async () => {
    const c = clientFinto({ profiloErr: { message: "db" } });
    const r = await cambiaStatoAccesso(c, ID, false);
    expect(r).toMatchObject({ esito: "guasto", fase: "profilo", compensato: true });
    expect(c._.updateUserById).toHaveBeenCalledTimes(2);
    expect(c._.updateUserById).toHaveBeenLastCalledWith(ID, { ban_duration: "none" });
  });

  it("riattivazione fallita su un account eliminato: il ban si RIMETTE, non resta tolto", async () => {
    const c = clientFinto({ bannedUntil: new Date(Date.now() + 100 * 3_600_000).toISOString(), profiloErr: { message: "db" } });
    await cambiaStatoAccesso(c, ID, true);
    const [, ultima] = c._.updateUserById.mock.calls.at(-1);
    expect(ultima.ban_duration).toMatch(/^(100|101)h$/);
  });

  it("profilo assente: compensa e risponde non trovato", async () => {
    const c = clientFinto({ righe: [] });
    expect(await cambiaStatoAccesso(c, ID, false)).toEqual({ esito: "non_trovato" });
    expect(c._.updateUserById).toHaveBeenCalledTimes(2);
  });

  it("compensazione fallita: lo dice (compensato: false)", async () => {
    const c = clientFinto({ profiloErr: { message: "db" }, compErr: { message: "giù" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await cambiaStatoAccesso(c, ID, false);
    expect(r).toMatchObject({ esito: "guasto", fase: "profilo", compensato: false });
  });

  it("utente inesistente in GoTrue: non trovato, senza scrivere niente", async () => {
    const c = clientFinto({ utente: false, letturaErr: { status: 404, message: "User not found" } });
    expect(await cambiaStatoAccesso(c, ID, false)).toEqual({ esito: "non_trovato" });
    expect(c._.updateUserById).not.toHaveBeenCalled();
  });

  it("lettura fallita per altro: guasto, senza scrivere niente", async () => {
    const c = clientFinto({ letturaErr: { status: 500, message: "giù" } });
    expect(await cambiaStatoAccesso(c, ID, false)).toMatchObject({ esito: "guasto", fase: "lettura" });
    expect(c._.updateUserById).not.toHaveBeenCalled();
  });
});

describe("set-user-active — il cablaggio", () => {
  const src = readFileSync(join(process.cwd(), "supabase", "functions", "set-user-active", "index.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it("ban e profilo passano da cambiaStatoAccesso, non da scritture sciolte", () => {
    expect(src).toMatch(/await\s+cambiaStatoAccesso\s*\(\s*supabaseAdmin\s*,\s*targetId\s*,\s*active\s*\)/);
    expect(src).not.toMatch(/updateUserById/);
    expect(src).not.toMatch(/\.from\(\s*["']users["']\s*\)\s*\.update/);
  });

  it("l'audit si scrive solo dopo l'esito riuscito", () => {
    expect(src.indexOf("cambiaStatoAccesso(")).toBeLessThan(src.indexOf("registraAudit("));
  });
});
