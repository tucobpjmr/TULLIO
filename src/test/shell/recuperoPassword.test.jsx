// M-2 dell'analisi del 10 novembre — «imposta password» si apre solo da un
// link vero, solo con una sessione, e ha una via d'uscita.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const auth = vi.hoisted(() => ({ valore: {} }));
vi.mock("../../auth/AuthContext.jsx", async (originale) => ({
  ...(await originale()),
  useAuth: () => auth.valore,
}));
vi.mock("../../auth/AuthContext", async (originale) => ({
  ...(await originale()),
  useAuth: () => auth.valore,
}));
vi.mock("../../VoyageDesk.jsx", () => ({ default: () => <div>APP</div> }));
vi.mock("../../auth/LoginScreen.jsx", () => ({ default: () => <div>LOGIN</div> }));

const { detectAuthLinkType } = await import("../../auth/AuthContext.jsx");
const { AuthGate } = await import("../../auth/AuthGate.jsx");
const { default: UpdatePasswordScreen } = await import("../../auth/UpdatePasswordScreen.jsx");

const base = () => ({
  session: null, profile: null, team: [], caricando: false, recovery: true, recoveryKind: "recovery",
  authError: null, refreshTeam: vi.fn(), retryInit: vi.fn(), signOut: vi.fn(),
  updatePassword: vi.fn(), annullaRecovery: vi.fn(),
});
beforeEach(() => { auth.valore = base(); });

describe("detectAuthLinkType — `type` vale solo accanto a un token", () => {
  it.each([
    ["#access_token=abc&type=recovery", "", "recovery"],
    ["#access_token=abc&refresh_token=x&type=invite", "", "invite"],
    ["", "?token_hash=abc&type=recovery", "recovery"],
    ["", "?code=abc&type=invite", "invite"],
  ])("link vero %s %s → %s", (hash, search, atteso) => {
    expect(detectAuthLinkType({ hash, search })).toBe(atteso);
  });

  it.each([
    ["", "?type=recovery"],
    ["#type=invite", ""],
    ["#access_token=&type=recovery", ""],
    ["#access_token=abc&type=signup", ""],
    ["", ""],
  ])("senza token (o tipo estraneo) %s %s → null", (hash, search) => {
    expect(detectAuthLinkType({ hash, search })).toBeNull();
  });
});

describe("AuthGate — la schermata password chiede una sessione", () => {
  it("recovery senza sessione → login, non «imposta password»", () => {
    render(<AuthGate />);
    expect(screen.getByText("LOGIN")).toBeTruthy();
    expect(screen.queryByText("Imposta una nuova password")).toBeNull();
  });

  it("controllo positivo: recovery con sessione → «imposta password»", () => {
    auth.valore = { ...base(), session: { user: { id: "u1" } } };
    render(<AuthGate />);
    expect(screen.getByText("Imposta una nuova password")).toBeTruthy();
  });
});

describe("UpdatePasswordScreen — una via d'uscita", () => {
  it("recupero: «Annulla» chiude la schermata senza uscire dalla sessione", () => {
    render(<UpdatePasswordScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(auth.valore.annullaRecovery).toHaveBeenCalledTimes(1);
    expect(auth.valore.signOut).not.toHaveBeenCalled();
  });

  it("invito: «Esci» chiude anche la sessione (resterebbe un account senza password)", () => {
    auth.valore = { ...base(), recoveryKind: "invite" };
    render(<UpdatePasswordScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Esci" }));
    expect(auth.valore.signOut).toHaveBeenCalledTimes(1);
    expect(auth.valore.annullaRecovery).toHaveBeenCalledTimes(1);
  });
});
