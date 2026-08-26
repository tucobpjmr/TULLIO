import { LvOverlay } from "./LvOverlay.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF14LvMuted = { fontSize: 14, color: "var(--lv-muted)" };
const txtF13LvMuted = { fontSize: 13, color: "var(--lv-muted)" };

// ─── Conferma caricamento backup ────────────────────────────────────────────
// Il merge (importa_backup) somma ai dati esistenti e salta i duplicati per
// id: non cancella nulla, ma un file sbagliato può comunque aggiungere righe
// indesiderate, quindi resta una conferma esplicita prima della RPC.
export function ImportaBackupConfirmModal({ nL, nB = 0, nM, progress = null, onClose, onSave }) {

  // Il carico di un backup e' l'operazione piu' lunga del modulo (molte
  // chiamate in fila, vedi `progress` qui sotto): e' anche quella su cui un
  // secondo click mentre la prima e' in volo costa di piu', ed e' il freno su
  // `ref` del contratto a impedirlo — non lo stato, che fra due click
  // ravvicinati puo' non essersi ancora ri-renderizzato.
  const { salva, inVolo } = useSalvataggioLista(onSave.run);

  // Il ripristino viaggia a blocchi: su un backup grande sono molte chiamate
  // in fila, e senza avanzamento il bottone fermo su "Carico…" sembrerebbe
  // piantato. La percentuale compare solo quando c'è davvero qualcosa da
  // scrivere (total > 0), così i backup piccoli non lampeggiano.
  const perc = progress?.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <LvOverlay onClose={onClose}>
      <h2>Caricare il backup?</h2>
      <p style={txtF14LvMuted}>
        Il file contiene {nL} liste{nB ? `, ${nB} cointestatari` : ""} e {nM} movimenti.
        I dati verranno AGGIUNTI a quelli esistenti; i duplicati (stesso
        identificativo) vengono saltati. Nulla viene cancellato.
      </p>
      {perc !== null && (
        <p style={txtF13LvMuted} role="status">
          Caricamento: {progress.done} di {progress.total} righe ({perc}%)
        </p>
      )}
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={inVolo} onClick={() => salva()}>
          {inVolo ? "Carico…" : "Carica backup"}
        </button>
      </div>
    </LvOverlay>
  );
}
