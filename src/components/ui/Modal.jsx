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

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../styles/tokens.js";
import { apriModale, chiudiModale, inCima } from "./pilaModali.js";
import { useTrappolaFocus } from "../../hooks/useTrappolaFocus.js";

// Un'unica opacità dell'overlay. Le sette varianti precedenti erano deriva
// accumulata, non gerarchia: nessuna vista mostra due overlay sovrapposti in
// cui la differenza di tono comunichi qualcosa.
const VELO = "rgba(15,32,68,0.5)";

/**
 * @param {object}    props
 * @param {boolean}   props.open
 * @param {function}  props.onClose      chiamata da Esc e dal click sull'overlay
 * @param {string}    [props.labelledBy] id del titolo, per aria-labelledby
 * @param {number|string} [props.width]  larghezza massima della card — un
 *   numero (px) o un valore CSS (`"min(420px, 96vw)"`, `"calc(100vw - 32px)"`)
 * @param {number}    [props.padding]    padding dell'overlay attorno alla card
 * @param {'modal'|'modalFull'} [props.layer] scala z-index (vedi styles/tokens.js)
 * @param {object}    [props.cardStyle]  override dello stile della card
 * @param {boolean}   [props.closeOnOverlay=true]
 * @param {import('react').ReactNode} [props.children]
 */
export function Modal({
  open, onClose, labelledBy, width = 500, padding = 16,
  layer = "modal", cardStyle, closeOnOverlay = true, children,
}) {
  // `onClose` in un ref, e `open` unica dipendenza dell'effetto: se l'effetto si
  // ri-eseguisse a ogni cambio d'identità della callback (che i chiamanti
  // passano quasi sempre come arrow inline) questo modale uscirebbe e
  // rientrerebbe in cima alla pila a ogni render del genitore, scavalcando
  // quello che gli si è aperto sopra.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const token = apriModale();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (!inCima(token)) return;   // non sono io quello in cima
      onCloseRef.current?.();
    };
    // Blocco dello scroll di fondo: senza, su mobile lo scroll "attraversa" il
    // modale e la pagina sotto si muove mentre l'utente compila il form. Con i
    // modali annidati il salva/ripristina si impila da sé: il secondo salva
    // "hidden" (messo dal primo) e lo rimette chiudendosi, quindi il fondo resta
    // bloccato finché non si chiude anche il primo.
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      chiudiModale(token);
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // M-3 · `aria-modal="true"` senza trappola del focus né restituzione era
  // una promessa non mantenuta: vedi hooks/useTrappolaFocus.js.
  useTrappolaFocus(cardRef, open);

  if (!open) return null;

  return createPortal(
    // A-2 dell'audit UX/errori del 1 settembre: jsx-a11y chiede un
    // role/tabIndex/onKeyDown su questo div perché ha un handler di mouse, ma
    // qui la richiesta non si applica — è il velo pieno-schermo che chiude al
    // click FUORI dalla card, non un controllo. Il suo equivalente da
    // tastiera esiste già (Esc, poche righe sopra) e vive sul focus trap
    // (useTrappolaFocus), non su questo elemento: dargli tabIndex lo
    // metterebbe nell'ordine di tabulazione come una tappa vuota e senza
    // nome, PEGGIO dell'assenza di ruolo che la regola segnala.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
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
        ref={cardRef}
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
