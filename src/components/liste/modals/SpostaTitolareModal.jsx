import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";

// ─── Sposta il titolare su un cliente diverso ──────────────────────────────
// Chiude il cerchio dell'anagrafica: un "intestatario-evento" nato
// dall'import dei documenti Word (es. "50° RICCARDO SCAMARCIO") può essere
// ricondotto alla persona vera, già presente come cliente CRM pulito, senza
// passare da SQL a mano. Solo clienti ESISTENTI (niente "+ Nuovo cliente…"
// come nelle altre modali): se la destinazione non esiste ancora, l'azione
// giusta è rinominare il cliente attuale da "Modifica dati lista", non
// crearne uno nuovo per poi spostarcisi.
export function SpostaTitolareModal({ clients, cointestatariIds, titolareAttuale, onMove, onClose }) {
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!clientId) return onMove.onError("Scegli il cliente di destinazione");
    setSaving(true);
    const ok = await onMove.run(clientId);
    if (!ok) setSaving(false);
  };

  const promuove = cointestatariIds.has(clientId);

  return (
    <LvOverlay onClose={onClose}>
      <h2>Sposta su un altro cliente</h2>
      <p style={{ fontSize: 13, color: "var(--lv-muted)", marginTop: -8, marginBottom: 12 }}>
        La lista di <b>{titolareAttuale}</b> passa a un altro cliente già in
        anagrafica. Nessuno dei due nomi cambia: cambia solo a chi è intestata
        questa lista.
      </p>
      <div className="row lv-field">
        <label htmlFor="st-client">Nuovo titolare</label>
        <select id="st-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli cliente —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {promuove && (
        <p style={{ fontSize: 12, color: "var(--lv-muted)", marginTop: 4 }}>
          È già cointestatario di questa lista: diventando titolare verrà
          tolto dai cointestatari.
        </p>
      )}
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Sposto…" : "Sposta"}
        </button>
      </div>
    </LvOverlay>
  );
}
