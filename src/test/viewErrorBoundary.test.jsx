// ViewErrorBoundary: il boundary attorno alla sola vista attiva.
//
// Serve a contenere il raggio d'azione di un errore di render. Il boundary di
// primo livello (main.jsx) è a tutta pagina: senza questo, un crash dentro una
// vista — tipicamente il modulo Liste viaggio, il codice più recente e lazy —
// porterebbe via anche Topbar, Sidebar e bottom-nav, lasciando come unica via
// d'uscita il reload.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewErrorBoundary } from "../components/errors/ViewErrorBoundary.jsx";

function Esplode() {
  throw new Error("crash del modulo liste");
}

// React logga in console ogni errore catturato da un boundary: qui è atteso,
// silenziarlo tiene leggibile l'output della suite.
let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe("ViewErrorBoundary", () => {
  it("mostra i figli quando non c'è errore", () => {
    render(
      <ViewErrorBoundary viewKey="dashboard" onReset={() => {}}>
        <div>contenuto della vista</div>
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("contenuto della vista")).toBeInTheDocument();
  });

  it("cattura l'errore della vista e mostra il messaggio invece di propagarlo", () => {
    // Se il boundary non catturasse, render() propagherebbe e il test fallirebbe.
    render(
      <ViewErrorBoundary viewKey="liste" onReset={() => {}}>
        <Esplode />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("Questa sezione ha avuto un problema")).toBeInTheDocument();
    expect(screen.getByText(/crash del modulo liste/)).toBeInTheDocument();
  });

  it("il bottone di uscita invoca onReset (torna alla Dashboard senza reload)", () => {
    const onReset = vi.fn();
    render(
      <ViewErrorBoundary viewKey="liste" onReset={onReset}>
        <Esplode />
      </ViewErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Torna alla Dashboard/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("si riarma cambiando vista: dopo un crash, un'altra vista torna a renderizzare", () => {
    const { rerender } = render(
      <ViewErrorBoundary viewKey="liste" onReset={() => {}}>
        <Esplode />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("Questa sezione ha avuto un problema")).toBeInTheDocument();

    // Senza getDerivedStateFromProps il boundary resterebbe bloccato sul
    // messaggio d'errore anche navigando altrove: React non lo rimonta.
    rerender(
      <ViewErrorBoundary viewKey="dashboard" onReset={() => {}}>
        <div>dashboard di nuovo viva</div>
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("dashboard di nuovo viva")).toBeInTheDocument();
    expect(screen.queryByText("Questa sezione ha avuto un problema")).not.toBeInTheDocument();
  });
});
