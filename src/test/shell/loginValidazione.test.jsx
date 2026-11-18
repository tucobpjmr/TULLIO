// B-4 dell'analisi UX del 15 novembre: il login valida da sé, in italiano,
// invece di lasciare la bolla del browser (`type="email"` + `required`).
// M-2: un'uscita non chiesta è spiegata qui.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const auth = vi.hoisted(() => ({ valore: null }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => auth.valore }));

const { default: LoginScreen } = await import("../../auth/LoginScreen.jsx");

beforeEach(() => {
  auth.valore = {
    signIn: vi.fn(async () => ({ error: null })),
    resetPassword: vi.fn(async () => ({ error: null })),
    resendConfirmation: vi.fn(async () => ({ error: null })),
    sessioneTerminata: false,
  };
});

const accedi = () => fireEvent.click(screen.getByRole("button", { name: "Accedi" }));

describe("LoginScreen — validazione", () => {
  it("il campo email non usa la validazione nativa del browser", () => {
    render(<LoginScreen />);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "text");
    expect(email).toHaveAttribute("inputmode", "email");
    expect(email.closest("form")).toHaveAttribute("novalidate");
  });

  it("email vuota o sbagliata: messaggio in italiano e nessun tentativo", () => {
    render(<LoginScreen />);
    accedi();
    expect(screen.getByRole("alert")).toHaveTextContent("Inserisci la tua email.");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "mario@agenzia" } });
    accedi();
    expect(screen.getByRole("alert")).toHaveTextContent(/Email non valida/);
    expect(auth.valore.signIn).not.toHaveBeenCalled();
  });

  it("password vuota: messaggio, poi con i campi a posto parte l'accesso", () => {
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: " Mario@Agenzia.it " } });
    accedi();
    expect(screen.getByRole("alert")).toHaveTextContent("Inserisci la password.");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "segreta" } });
    accedi();
    expect(auth.valore.signIn).toHaveBeenCalledWith("mario@agenzia.it", "segreta");
  });

  it("dopo un'uscita non chiesta spiega che la sessione è terminata (M-2)", () => {
    auth.valore.sessioneTerminata = true;
    render(<LoginScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(/La sessione è terminata/);
  });
});
