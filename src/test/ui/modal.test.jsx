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
import { Modal } from "../../components/ui/Modal.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const transform2 = { transform: "translateY(0)" };

beforeEach(() => { document.body.style.overflow = ""; });

const apri = (props = {}) => render(
  <div className="fade-in" style={transform2}>
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

// ─── M-2 · pila dei modali ──────────────────────────────────────────────────
// Il listener di Esc è su `window`, quindi ogni Modal montato riceve lo stesso
// keydown. Con i modali annidati che l'app ha davvero — la CropModal si apre da
// ProfileEditor, una ConfirmDialog dall'import clienti — un Esc per annullare
// il ritaglio chiudeva ANCHE il form sotto, con tutto quello che c'era scritto.
describe("Modal — modali annidati", () => {
  const dueModali = ({ onCloseSotto, onCloseSopra, sopraAperto = true }) => render(
    <>
      <Modal open onClose={onCloseSotto} labelledBy="a"><h2 id="a">Sotto</h2></Modal>
      <Modal open={sopraAperto} onClose={onCloseSopra} labelledBy="b"><h2 id="b">Sopra</h2></Modal>
    </>
  );

  it("Esc chiude SOLO quello in cima", () => {
    const onCloseSotto = vi.fn();
    const onCloseSopra = vi.fn();
    dueModali({ onCloseSotto, onCloseSopra });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCloseSopra).toHaveBeenCalledTimes(1);
    expect(onCloseSotto).not.toHaveBeenCalled();
  });

  it("chiuso quello in cima, Esc torna a quello sotto", () => {
    const onCloseSotto = vi.fn();
    const onCloseSopra = vi.fn();
    const { rerender } = dueModali({ onCloseSotto, onCloseSopra });

    rerender(
      <>
        <Modal open onClose={onCloseSotto} labelledBy="a"><h2 id="a">Sotto</h2></Modal>
        <Modal open={false} onClose={onCloseSopra} labelledBy="b"><h2 id="b">Sopra</h2></Modal>
      </>
    );
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCloseSotto).toHaveBeenCalledTimes(1);
  });

  it("un re-render del genitore non fa risalire in cima il modale sotto", () => {
    // `onClose` passato come arrow inline cambia identità a ogni render: se
    // fosse una dipendenza dell'effetto, il modale sotto uscirebbe e
    // rientrerebbe nella pila scavalcando quello che gli sta sopra.
    const onCloseSotto = vi.fn();
    const onCloseSopra = vi.fn();
    const albero = () => (
      <>
        <Modal open onClose={() => onCloseSotto()} labelledBy="a"><h2 id="a">Sotto</h2></Modal>
        <Modal open onClose={() => onCloseSopra()} labelledBy="b"><h2 id="b">Sopra</h2></Modal>
      </>
    );
    const { rerender } = render(albero());
    rerender(albero());

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCloseSopra).toHaveBeenCalledTimes(1);
    expect(onCloseSotto).not.toHaveBeenCalled();
  });

  it("un modale aperto DOPO va in cima, anche se in JSX è dichiarato prima", () => {
    // È la forma reale del caso: `ProfileEditor` dichiara la `CropModal` PRIMA
    // della propria, ma quella si monta solo quando c'è un'immagine da
    // ritagliare. Conta l'ordine di montaggio, non quello nel sorgente.
    const onCloseSotto = vi.fn();
    const onCloseSopra = vi.fn();
    const albero = (sopraAperto) => (
      <>
        <Modal open={sopraAperto} onClose={onCloseSopra} labelledBy="b"><h2 id="b">Sopra</h2></Modal>
        <Modal open onClose={onCloseSotto} labelledBy="a"><h2 id="a">Sotto</h2></Modal>
      </>
    );
    const { rerender } = render(albero(false));
    rerender(albero(true));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCloseSopra).toHaveBeenCalledTimes(1);
    expect(onCloseSotto).not.toHaveBeenCalled();
  });

  it("il fondo resta bloccato finché non si chiude anche il modale sotto", () => {
    const { rerender, unmount } = dueModali({ onCloseSotto: vi.fn(), onCloseSopra: vi.fn() });
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Modal open onClose={vi.fn()} labelledBy="a"><h2 id="a">Sotto</h2></Modal>
        <Modal open={false} onClose={vi.fn()} labelledBy="b"><h2 id="b">Sopra</h2></Modal>
      </>
    );
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
