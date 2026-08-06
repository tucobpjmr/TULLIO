// src/components/ui/Modal.jsx
// Il guscio di un modale centrato: portale + overlay + chiusura con Esc +
// blocco dello scroll di fondo + semantica accessibile.
//
// PERCHÉ ESISTE. `ModalPortal` risolveva già il bug di posizionamento (un
// antenato con `transform` diventa containing block per i `position: fixed`
// discendenti, e il modale finiva centrato sull'altezza della vista scrollabile
// invece che sul viewport) — ma era usato da SEI modali su una ventina. Gli
// altri ricostruivano l'overlay a mano, con sette opacità diverse
// (0.65 / 0.6 / 0.55 / 0.5 / 0.45 / 0.4 / 0.3), senza `role="dialog"`, senza
// chiusura con Esc e senza blocco dello scroll sottostante.
//
// Il fix strutturale esisteva già: non era applicato dove serviva. Qui è
// incorporato una volta sola, e con lui arrivano gratis anche le tre cose che
// prima erano a macchia di leopardo.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../styles/tokens.js";

// Un'unica opacità dell'overlay. Le sette varianti precedenti erano deriva
// accumulata, non gerarchia: nessuna vista mostra due overlay sovrapposti in
// cui la differenza di tono comunichi qualcosa.
const VELO = "rgba(15,32,68,0.5)";

/**
 * @param {boolean}   open
 * @param {function}  onClose      chiamata da Esc e dal click sull'overlay
 * @param {string}    [labelledBy] id del titolo, per aria-labelledby
 * @param {number}    [width]      larghezza massima della card (px)
 * @param {number}    [padding]    padding dell'overlay attorno alla card
 * @param {'modal'|'modalFull'} [layer] scala z-index (vedi styles/tokens.js)
 * @param {object}    [cardStyle]  override dello stile della card
 * @param {boolean}   [closeOnOverlay=true]
 */
export function Modal({
  open, onClose, labelledBy, width = 500, padding = 16,
  layer = "modal", cardStyle, closeOnOverlay = true, children,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    // Blocco dello scroll di fondo: senza, su mobile lo scroll "attraversa" il
    // modale e la pagina sotto si muove mentre l'utente compila il form.
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      // mousedown e non click: se l'utente inizia a selezionare testo DENTRO la
      // card e rilascia fuori, un handler su click chiuderebbe il modale
      // perdendo quanto scritto.
      onMouseDown={closeOnOverlay ? (e) => { if (e.target === e.currentTarget) onClose?.(); } : undefined}
      style={{
        position: "fixed", inset: 0, background: VELO,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z[`${layer}Backdrop`] ?? Z.modalBackdrop, padding,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="slide-up vd-modal-mh"
        style={{
          background: "var(--card)", borderRadius: 14, width, maxWidth: "100%",
          overflowY: "auto", boxShadow: "0 30px 80px rgba(0,0,0,0.2)",
          border: "1px solid var(--border)", zIndex: Z[layer] ?? Z.modal,
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
