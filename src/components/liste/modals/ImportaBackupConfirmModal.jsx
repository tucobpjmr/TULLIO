import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF14LvMuted = { fontSize: 14, color: "var(--lv-muted)" };
const txtF13LvMuted = { fontSize: 13, color: "var(--lv-muted)" };

// ─── Conferma caricamento backup ────────────────────────────────────────────
// Il merge (importa_backup) somma ai dati esistenti e salta i duplicati per
// id: non cancella nulla, ma un file sbagliato può comunque aggiungere righe
// indesiderate, quindi resta una conferma esplicita prima della RPC.
export function ImportaBackupConfirmModal({ nL, nM, progress = null, onClose, onSave }) {
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const ok = await onSave.run();
    if (!ok) setSaving(false);
  };

  // Il ripristino viaggia a blocchi: su un backup grande sono molte chiamate
  // in fila, e senza avanzamento il bottone fermo su "Carico…" sembrerebbe
  // piantato. La percentuale compare solo quando c'è davvero qualcosa da
  // scrivere (total > 0), così i backup piccoli non lampeggiano.
  const perc = progress?.total ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <LvOverlay onClose={onClose}>
      <h2>Caricare il backup?</h2>
      <p style={txtF14LvMuted}>
        Il file contiene {nL} liste e {nM} movimenti. I dati verranno AGGIUNTI a
        quelli esistenti; i duplicati (stesso identificativo) vengono saltati.
        Nulla viene cancellato.
      </p>
      {perc !== null && (
        <p style={txtF13LvMuted} role="status">
          Caricamento: {progress.done} di {progress.total} righe ({perc}%)
        </p>
      )}
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Carico…" : "Carica backup"}
        </button>
      </div>
    </LvOverlay>
  );
}
