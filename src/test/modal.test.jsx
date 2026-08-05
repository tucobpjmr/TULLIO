// Modal — il guscio condiviso dei modali centrati.
//
// `ModalPortal` risolveva già il bug di posizionamento (un antenato con
// `transform` diventa containing block per i `position: fixed` discendenti),
// ma era usato da sei modali su una ventina: gli altri ricostruivano l'overlay
// a mano, con sette opacità diverse e senza role="dialog", senza chiusura con
// Esc e senza blocco dello scroll di fondo.
//
// Questi test coprono le quattro garanzie che ora arrivano insieme al guscio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "../components/ui/Modal.jsx";

beforeEach(() => { document.body.style.overflow = ""; });

const apri = (props = {}) => render(
  <div className="fade-in" style={{ transform: "translateY(0)" }}>
    <Modal open onClose={props.onClose || vi.fn()} labelledBy="t" {...props}>
      <h2 id="t">Titolo</h2>
      <input aria-label="campo" />
    </Modal>
  </div>
);

describe("Modal — posizionamento", () => {
  it("monta su document.body, fuori dall'antenato con transform", () => {
    const { container } = apri();
    // Se restasse dentro il wrapper animato, il `position: fixed` si
    // posizionerebbe rispetto a quello e non al viewport: è esattamente il bug
    // che ModalPortal esiste per evitare.
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("non renderizza nulla con open=false", () => {
    render(<Modal open={false} onClose={vi.fn()}><p>ciao</p></Modal>);
    expect(screen.queryByText("ciao")).toBeNull();
  });
});

describe("Modal — accessibilità", () => {
  it("espone role=dialog, aria-modal e aria-labelledby", () => {
    apri();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("t");
  });
});

describe("Modal — chiusura", () => {
  it("Esc chiama onClose", () => {
    const onClose = vi.fn();
    apri({ onClose });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("il click sull'overlay chiude, quello sulla card no", () => {
    const onClose = vi.fn();
    apri({ onClose });
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog.parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closeOnOverlay=false disattiva solo il click sull'overlay, non Esc", () => {
    const onClose = vi.fn();
    apri({ onClose, closeOnOverlay: false });
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal — scroll di fondo", () => {
  it("blocca lo scroll del body mentre è aperto e lo ripristina alla chiusura", () => {
    // Senza blocco, su mobile lo scroll "attraversa" il modale e la pagina
    // sotto si muove mentre l'utente compila il form.
    const { unmount } = apri();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("ripristina il valore PRECEDENTE, non una stringa vuota", () => {
    document.body.style.overflow = "clip";
    const { unmount } = apri();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("clip");
  });
});
