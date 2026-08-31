// LvOverlay — il guscio comune degli undici modali del modulo Liste viaggio.
//
// Tre rilievi dell'audit UX/errori del 31 agosto, tutti sullo stesso file:
//   M-2 · il click sul velo chiudeva SEMPRE, senza `closeOnOverlay={false}`
//         come in ui/Modal — il caso peggiore per un modulo di form lunghi.
//   M-3 · `aria-modal="true"` senza trappola del focus né restituzione.
//   B-3 · Esc chiudeva ANCHE i modali sotto: fuori dalla pila di ui/Modal.
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LvOverlay } from "../../components/liste/modals/LvOverlay.jsx";
import { Modal } from "../../components/ui/Modal.jsx";
import { _resetPilaModali } from "../../components/ui/pilaModali.js";

afterEach(() => { _resetPilaModali(); document.body.style.overflow = ""; });

describe("LvOverlay — click sul velo (M-2)", () => {
  it("di default NON chiude: il click sul velo non invoca onClose", () => {
    const onClose = vi.fn();
    render(<LvOverlay onClose={onClose} labelledBy="t">contenuto</LvOverlay>);
    // Portale su document.body: il velo non è dentro il container di render.
    fireEvent.mouseDown(document.body.querySelector(".lv-overlay"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("con chiudiSuVelo chiude solo se il click è sul velo stesso, non sul contenuto", () => {
    const onClose = vi.fn();
    render(
      <LvOverlay onClose={onClose} chiudiSuVelo labelledBy="t">
        <button>dentro</button>
      </LvOverlay>,
    );
    fireEvent.mouseDown(screen.getByText("dentro"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body.querySelector(".lv-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("LvOverlay — Esc e la pila condivisa con ui/Modal (B-3)", () => {
  it("Esc chiude quando il modale è l'unico aperto", () => {
    const onClose = vi.fn();
    render(<LvOverlay onClose={onClose} labelledBy="t">contenuto</LvOverlay>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("un Esc con un ui/Modal aperto SOPRA chiude solo quello, non anche LvOverlay sotto", () => {
    const onCloseLv = vi.fn();
    const onCloseModal = vi.fn();
    render(
      <>
        <LvOverlay onClose={onCloseLv} labelledBy="t">contenuto liste</LvOverlay>
        <Modal open onClose={onCloseModal} labelledBy="m">contenuto modal</Modal>
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseModal).toHaveBeenCalledTimes(1);
    expect(onCloseLv).not.toHaveBeenCalled();
  });

  it("chiuso il modale in cima, Esc torna a raggiungere quello sotto", () => {
    const onCloseLv = vi.fn();
    const onCloseModal = vi.fn();
    const { rerender } = render(
      <>
        <LvOverlay onClose={onCloseLv} labelledBy="t">contenuto liste</LvOverlay>
        <Modal open onClose={onCloseModal} labelledBy="m">contenuto modal</Modal>
      </>,
    );
    // Il Modal si chiude smontandosi (come fa il chiamante reale: open=false).
    rerender(
      <>
        <LvOverlay onClose={onCloseLv} labelledBy="t">contenuto liste</LvOverlay>
        <Modal open={false} onClose={onCloseModal} labelledBy="m">contenuto modal</Modal>
      </>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCloseLv).toHaveBeenCalledTimes(1);
  });
});

describe("LvOverlay — trappola del focus (M-3)", () => {
  it("Tab dall'ultimo elemento torna al primo, dentro il modale", () => {
    render(
      <LvOverlay onClose={() => {}} labelledBy="t">
        <button>primo</button>
        <button>ultimo</button>
      </LvOverlay>,
    );
    const primo = screen.getByText("primo");
    const ultimo = screen.getByText("ultimo");
    ultimo.focus();
    expect(document.activeElement).toBe(ultimo);
    fireEvent.keyDown(ultimo, { key: "Tab" });
    expect(document.activeElement).toBe(primo);
  });

  it("Shift+Tab dal primo elemento torna all'ultimo", () => {
    render(
      <LvOverlay onClose={() => {}} labelledBy="t">
        <button>primo</button>
        <button>ultimo</button>
      </LvOverlay>,
    );
    const primo = screen.getByText("primo");
    const ultimo = screen.getByText("ultimo");
    primo.focus();
    fireEvent.keyDown(primo, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(ultimo);
  });

  it("alla chiusura il focus torna a chi aveva aperto il modale", () => {
    function Harness() {
      const [aperto, setAperto] = useState(false);
      return (
        <div>
          <button onClick={() => setAperto(true)}>apri</button>
          {aperto && (
            <LvOverlay onClose={() => setAperto(false)} labelledBy="t">
              <button>dentro</button>
            </LvOverlay>
          )}
        </div>
      );
    }
    render(<Harness />);
    const apriBtn = screen.getByText("apri");
    apriBtn.focus();
    fireEvent.click(apriBtn);
    expect(screen.getByText("dentro")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("dentro")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(apriBtn);
  });
});
