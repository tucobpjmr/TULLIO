// OverlayErrorBoundary: il boundary attorno ai modali lazy (TaskSlideOver,
// BulkTaskCreator).
//
// Senza questo, un crash in un modale lazy sale fino all'ErrorBoundary di
// main.jsx e sostituisce l'INTERA app con la schermata "Ricarica", anche se
// la dashboard sotto è integra. Qui l'errore resta confinato all'overlay.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayErrorBoundary } from "../components/OverlayErrorBoundary.jsx";

function Esplode() {
  throw new Error("crash del modale");
}

let errSpy;
beforeEach(() => { errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errSpy.mockRestore(); });

describe("OverlayErrorBoundary", () => {
  it("mostra i figli quando non c'è errore", () => {
    render(
      <OverlayErrorBoundary resetKey="t1" onReset={() => {}}>
        <div>contenuto del modale</div>
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("contenuto del modale")).toBeInTheDocument();
  });

  it("cattura l'errore del modale e mostra il messaggio invece di propagarlo", () => {
    render(
      <OverlayErrorBoundary resetKey="t1" onReset={() => {}}>
        <Esplode />
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("Non è stato possibile aprire questo pannello")).toBeInTheDocument();
    expect(screen.getByText(/crash del modale/)).toBeInTheDocument();
  });

  it("il bottone Chiudi invoca onReset", () => {
    const onReset = vi.fn();
    render(
      <OverlayErrorBoundary resetKey="t1" onReset={onReset}>
        <Esplode />
      </OverlayErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("si riarma quando resetKey cambia (apertura di un altro task senza chiudere)", () => {
    // Riproduce openTaskById in VoyageDesk.jsx: click su una notifica mentre
    // un altro task è già aperto sostituisce selectedTask senza smontare lo
    // slide-over, quindi senza un confronto d'identità il crash sul task
    // precedente resterebbe visibile aprendo quello nuovo.
    const { rerender } = render(
      <OverlayErrorBoundary resetKey="task-1" onReset={() => {}}>
        <Esplode />
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("Non è stato possibile aprire questo pannello")).toBeInTheDocument();

    rerender(
      <OverlayErrorBoundary resetKey="task-2" onReset={() => {}}>
        <div>task 2 di nuovo vivo</div>
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("task 2 di nuovo vivo")).toBeInTheDocument();
    expect(screen.queryByText("Non è stato possibile aprire questo pannello")).not.toBeInTheDocument();
  });

  it("resetKey invariato non cancella l'errore da solo (nessun rimontaggio implicito)", () => {
    const { rerender } = render(
      <OverlayErrorBoundary resetKey="task-1" onReset={() => {}}>
        <Esplode />
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("Non è stato possibile aprire questo pannello")).toBeInTheDocument();

    rerender(
      <OverlayErrorBoundary resetKey="task-1" onReset={() => {}}>
        <div>non dovrebbe apparire</div>
      </OverlayErrorBoundary>,
    );
    expect(screen.getByText("Non è stato possibile aprire questo pannello")).toBeInTheDocument();
    expect(screen.queryByText("non dovrebbe apparire")).not.toBeInTheDocument();
  });
});
