// src/components/ui/ConfirmDialog.jsx
// La finestra di conferma dell'app. La METÀ VISIVA di state/ConfirmContext.jsx,
// che è quello che i componenti usano davvero (`useConfirm()`).
//
// Costruita su ui/Modal.jsx come ogni altro modale del core: portale, overlay,
// Esc, blocco dello scroll e `role="dialog"` arrivano da lì. ⛔ Non è una
// seconda impalcatura — è la regola di docs/CLAUDE.md ("un modale centrato usa
// components/ui/Modal.jsx").
//
// `layer="modalFull"` e non `modal`: una conferma nasce quasi sempre DA un
// altro modale ("stai chiudendo l'import senza aver importato", "elimina questo
// allegato" dallo slide-over), quindi deve scavalcare ciò da cui è stata
// aperta, non finirci sotto.
import { useEffect, useRef } from "react";
import { Modal } from "./Modal.jsx";
import { btn } from "../../styles/tokens.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const padding2 = { padding: "22px 24px 18px" };
const txtF19Heading = { margin: "0 0 10px", fontSize: 19, color: "var(--heading)" };
const txtF135Muted = {
  margin: "0 0 20px", fontSize: 13.5, lineHeight: 1.5,
  color: "var(--text-muted)", whiteSpace: "pre-line",
};
const rowGap10 = { display: "flex", gap: 10, justifyContent: "flex-end" };

export function ConfirmDialog({
  open, title, body, cta = "Conferma", annulla = "Annulla",
  danger = false, onConfirm, onCancel,
}) {
  const confermaRef = useRef(null);
  const annullaRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Il focus iniziale dipende da cosa si sta per fare: su un'azione
    // DISTRUTTIVA parte su "Annulla", così un Invio premuto per abitudine non
    // svuota il cestino. Su una conferma innocua parte sull'azione, che è
    // quella che l'utente ha chiesto.
    const bersaglio = danger ? annullaRef.current : confermaRef.current;
    bersaglio?.focus();
  }, [open, danger]);

  return (
    <Modal open={open} onClose={onCancel} labelledBy="vd-confirm-title" width={420}>
      <div style={padding2}>
        <h2
          id="vd-confirm-title"
          className="playfair"
          style={txtF19Heading}
        >{title}</h2>
        {body && (
          <div style={txtF135Muted}>{body}</div>
        )}
        <div style={rowGap10}>
          <button
            ref={annullaRef}
            type="button"
            onClick={onCancel}
            style={{ ...btn.ghost, padding: "9px 18px", fontSize: 13 }}
          >{annulla}</button>
          <button
            ref={confermaRef}
            type="button"
            onClick={onConfirm}
            style={{ ...(danger ? btn.danger : btn.primary), padding: "9px 18px", fontSize: 13 }}
          >{cta}</button>
        </div>
      </div>
    </Modal>
  );
}
