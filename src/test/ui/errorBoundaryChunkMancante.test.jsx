// A-4 dell'audit UX/errori del 31 agosto — il chunk lazy mancante dopo un
// deploy non è un errore di dominio: nessuno dei tre boundary deve applicargli
// il proprio pannello («Torna alla Dashboard» / «Chiudi»), che non ripara
// nulla e richiude il ciclo. Tutti e tre devono mostrare lo stesso annuncio
// («Tullio è stato aggiornato») con lo stesso rimedio (ricarica).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../components/errors/ErrorBoundary.jsx";
import { ViewErrorBoundary } from "../../components/errors/ViewErrorBoundary.jsx";
import { OverlayErrorBoundary } from "../../components/errors/OverlayErrorBoundary.jsx";

function EsplodeChunk() {
  throw new Error("Failed to fetch dynamically imported module: /assets/AdminView-a1b2.js");
}
function EsplodeOrdinario() {
  throw new Error("crash qualsiasi");
}

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe("chunk lazy mancante — stesso pannello nei tre boundary (A-4)", () => {
  it("ErrorBoundary (primo livello): 'Tullio è stato aggiornato', non 'Qualcosa è andato storto'", () => {
    render(<ErrorBoundary><EsplodeChunk /></ErrorBoundary>);
    expect(screen.getByText("Tullio è stato aggiornato")).toBeInTheDocument();
    expect(screen.queryByText("Qualcosa è andato storto")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ricarica" })).toBeInTheDocument();
  });

  it("ViewErrorBoundary: 'Tullio è stato aggiornato', non 'Torna alla Dashboard'", () => {
    render(
      <ViewErrorBoundary viewKey="liste" onReset={() => {}}>
        <EsplodeChunk />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("Tullio è stato aggiornato")).toBeInTheDocument();
    expect(screen.queryByText("Questa sezione ha avuto un problema")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Torna alla Dashboard/ })).not.toBeInTheDocument();
  });

  it("OverlayErrorBoundary: 'Tullio è stato aggiornato', non 'Chiudi'", () => {
    render(
      <OverlayErrorBoundary resetKey="task-1" onReset={() => {}}>
        <EsplodeChunk />
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("Tullio è stato aggiornato")).toBeInTheDocument();
    expect(screen.queryByText("Non è stato possibile aprire questo pannello")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Chiudi" })).not.toBeInTheDocument();
  });

  it("un errore ordinario continua a produrre il pannello di sempre, con codice di segnalazione", () => {
    render(
      <ViewErrorBoundary viewKey="liste" onReset={() => {}}>
        <EsplodeOrdinario />
      </ViewErrorBoundary>,
    );
    expect(screen.getByText("Questa sezione ha avuto un problema")).toBeInTheDocument();
    expect(screen.queryByText("Tullio è stato aggiornato")).not.toBeInTheDocument();
  });

  it("riconosce anche la forma storica ChunkLoadError", () => {
    function EsplodeWebpack() {
      const e = new Error("Loading chunk 42 failed");
      e.name = "ChunkLoadError";
      throw e;
    }
    render(<ErrorBoundary><EsplodeWebpack /></ErrorBoundary>);
    expect(screen.getByText("Tullio è stato aggiornato")).toBeInTheDocument();
  });
});
