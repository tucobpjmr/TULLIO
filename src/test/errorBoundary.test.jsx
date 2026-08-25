// ErrorBoundary di primo livello + il contratto che M-3 (audit del 25 agosto)
// ha reso UNICO per i tre boundary dell'app.
//
// Prima di M-3 il ciclo di vita era copiato tre volte: tre
// `getDerivedStateFromError`, tre `componentDidCatch`, due
// `getDerivedStateFromProps` uguali su prop diverse e uno mancante. Ora vive in
// components/errors/creaErrorBoundary.jsx, e questi test fissano le due
// proprietà che quella fusione deve preservare:
//
//   • il boundary di primo livello NON si riarma da solo — non ha una chiave
//     d'identità, e la sua unica via d'uscita è il reload;
//   • il codice di segnalazione nasce UNA volta per pannello e finisce in
//     console insieme al dettaglio (criticità #9): è la coppia che lo rende
//     utile, perché quello dettato dall'utente deve essere quello scritto lì.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../components/errors/ErrorBoundary.jsx";

function Esplode() {
  throw new Error("crash della shell");
}

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe("ErrorBoundary (primo livello)", () => {
  it("mostra i figli quando non c'è errore", () => {
    render(<ErrorBoundary><div>app viva</div></ErrorBoundary>);
    expect(screen.getByText("app viva")).toBeInTheDocument();
  });

  it("cattura l'errore invece di lasciare la pagina bianca", () => {
    render(<ErrorBoundary><Esplode /></ErrorBoundary>);
    expect(screen.getByText("Qualcosa è andato storto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ricarica" })).toBeInTheDocument();
  });

  it("scrive in console il codice di segnalazione insieme al dettaglio", () => {
    render(<ErrorBoundary><Esplode /></ErrorBoundary>);
    const riga = errSpy.mock.calls
      .map((args) => String(args[0]))
      .find((t) => t.includes("[VoyageDesk] Errore non gestito nel render"));
    expect(riga).toBeDefined();
    // Il codice è fra parentesi in coda alla riga: senza, l'utente ne detta uno
    // che in console non esiste.
    expect(riga).toMatch(/\([A-Z0-9-]+\)/);
  });

  it("NON si riarma cambiando prop: a questo livello l'unica uscita è il reload", () => {
    const { rerender } = render(<ErrorBoundary><Esplode /></ErrorBoundary>);
    expect(screen.getByText("Qualcosa è andato storto")).toBeInTheDocument();

    rerender(<ErrorBoundary><div>non dovrebbe tornare</div></ErrorBoundary>);
    expect(screen.getByText("Qualcosa è andato storto")).toBeInTheDocument();
    expect(screen.queryByText("non dovrebbe tornare")).not.toBeInTheDocument();
  });
});
