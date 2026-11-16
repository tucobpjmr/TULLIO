// A-2 dell'analisi del 15 novembre: il secondo fattore dell'admin.
// La regola vera è nel database (migrazione 20261116170000) e nelle Edge
// Function (edgeFunctionAdminGate.test.js): qui si prova che l'app mostra la
// schermata giusta e chiama GoTrue nel modo giusto.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  avviaRegistrazione, codiceValido, messaggioErroreMfa, normalizzaCodice, verificaCodice,
} from "../../auth/mfa.js";
import { faseMfa, valutaMfa } from "../../auth/mfaStato.js";

const { auth, ctx } = vi.hoisted(() => ({
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(),
      listFactors: vi.fn(),
      unenroll: vi.fn(),
      enroll: vi.fn(),
      challengeAndVerify: vi.fn(),
    },
  },
  ctx: { value: null },
}));
vi.mock("../../lib/supabaseAuth.js", () => ({ supabaseAuth: auth, default: auth }));
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ctx.value }));

const { default: MfaScreen } = await import("../../auth/MfaScreen.jsx");

const fattori = (lista) => ({
  data: { all: lista, totp: lista.filter((f) => f.status === "verified") }, error: null,
});

beforeEach(() => {
  for (const f of Object.values(auth.mfa)) f.mockReset();
});

describe("faseMfa — quale passo manca", () => {
  it("solo il ruolo admin grezzo è coinvolto", () => {
    for (const ruolo of ["manager", "agent", "driver", "Admin", null]) {
      expect(faseMfa({ ruolo, livello: "aal1", fattoriVerificati: [] }), String(ruolo)).toBeNull();
    }
  });

  it("admin: aal2 → nulla; senza fattori → registra; con fattore → verifica", () => {
    expect(faseMfa({ ruolo: "admin", livello: "aal2", fattoriVerificati: [] })).toBeNull();
    expect(faseMfa({ ruolo: "admin", livello: "aal1", fattoriVerificati: [] })).toEqual({ fase: "registra" });
    expect(faseMfa({ ruolo: "admin", livello: "aal1", fattoriVerificati: [{ id: "f1" }] }))
      .toEqual({ fase: "verifica", factorId: "f1" });
    // Livello assente: si chiede il codice, non si lascia passare.
    expect(faseMfa({ ruolo: "admin", livello: null, fattoriVerificati: undefined })).toEqual({ fase: "registra" });
  });
});

describe("valutaMfa — interroga GoTrue solo quando serve", () => {
  it("per chi non è admin non fa nessuna richiesta", async () => {
    expect(await valutaMfa(auth, "agent")).toBeNull();
    expect(auth.mfa.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("admin già a aal2: non elenca i fattori", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
    expect(await valutaMfa(auth, "admin")).toBeNull();
    expect(auth.mfa.listFactors).not.toHaveBeenCalled();
  });

  it("un errore di GoTrue si propaga (AuthGate mostra Riprova), non diventa un via libera", async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: new Error("rete") });
    await expect(valutaMfa(auth, "admin")).rejects.toThrow("rete");
  });
});

describe("avviaRegistrazione e verificaCodice", () => {
  it("toglie le registrazioni a metà, poi crea il fattore TOTP", async () => {
    auth.mfa.listFactors.mockResolvedValue(fattori([
      { id: "vecchio", factor_type: "totp", status: "unverified" },
      { id: "buono", factor_type: "totp", status: "verified" },
    ]));
    auth.mfa.unenroll.mockResolvedValue({ error: null });
    auth.mfa.enroll.mockResolvedValue({
      data: { id: "nuovo", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "ABC" } }, error: null,
    });
    expect(await avviaRegistrazione(auth)).toEqual({
      factorId: "nuovo", qr: "data:image/svg+xml;utf-8,<svg/>", segreto: "ABC",
    });
    expect(auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "vecchio" });
    expect(auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: "totp" }));
  });

  it("verifica con il codice ripulito dagli spazi", async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
    await verificaCodice(auth, "f1", " 123 456 ");
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
  });

  it("codice: sei cifre, spazi tollerati", () => {
    expect(normalizzaCodice("12 34 56")).toBe("123456");
    expect(codiceValido("123 456")).toBe(true);
    for (const c of ["", "12345", "1234567", "12a456", null]) expect(codiceValido(c), String(c)).toBe(false);
  });

  it("messaggi in italiano per i casi noti", () => {
    expect(messaggioErroreMfa({ code: "mfa_verification_failed" })).toMatch(/non corretto/);
    expect(messaggioErroreMfa({ status: 429 })).toMatch(/Troppi tentativi/);
    expect(messaggioErroreMfa({ code: "mfa_totp_enroll_not_enabled" })).toMatch(/non è attivo/);
    expect(messaggioErroreMfa(new Error("x"))).toMatch(/non riuscita/);
  });
});

describe("MfaScreen", () => {
  const signOut = vi.fn();
  const refreshTeam = vi.fn(async () => {});

  it("verifica: codice giusto → verifica il fattore e rilegge il profilo", async () => {
    ctx.value = { mfa: { fase: "verifica", factorId: "f1" }, refreshTeam, signOut };
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
    render(<MfaScreen />);
    fireEvent.change(screen.getByLabelText("Codice"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(refreshTeam).toHaveBeenCalled());
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
    expect(auth.mfa.enroll).not.toHaveBeenCalled();
  });

  it("verifica: codice sbagliato → messaggio, nessun ricaricamento", async () => {
    refreshTeam.mockClear();
    ctx.value = { mfa: { fase: "verifica", factorId: "f1" }, refreshTeam, signOut };
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: { code: "mfa_verification_failed" } });
    render(<MfaScreen />);
    fireEvent.change(screen.getByLabelText("Codice"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/non corretto/);
    expect(refreshTeam).not.toHaveBeenCalled();
  });

  it("registra: mostra il QR e la chiave, poi verifica il fattore nuovo", async () => {
    ctx.value = { mfa: { fase: "registra" }, refreshTeam, signOut };
    auth.mfa.listFactors.mockResolvedValue(fattori([]));
    auth.mfa.enroll.mockResolvedValue({
      data: { id: "nuovo", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "SEGRETO" } }, error: null,
    });
    auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
    render(<MfaScreen />);
    expect(await screen.findByAltText(/QR da inquadrare/)).toBeInTheDocument();
    expect(screen.getByText("SEGRETO")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Codice"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "nuovo", code: "654321" }));
  });

  it("«Esci» chiude la sessione", () => {
    ctx.value = { mfa: { fase: "verifica", factorId: "f1" }, refreshTeam, signOut };
    render(<MfaScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Esci" }));
    expect(signOut).toHaveBeenCalled();
  });
});
