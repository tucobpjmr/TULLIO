import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";

// ─── Reset totale ────────────────────────────────────────────────────────
// Hard delete di tutte le liste/movimenti/storico. Riservato all'admin sia
// nella RPC (private.is_admin()) sia qui: la conferma testuale esatta è la
// stessa barriera anti-click-accidentale della SPA sorgente.
export function ResetTotaleModal({ onClose, onSave }) {
  const [testo, setTesto] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (testo.trim() !== "RESET TOTALE") return onSave.onError("Digita esattamente: RESET TOTALE");
    setSaving(true);
    const ok = await onSave.run();
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Reset totale dell&rsquo;applicazione</h2>
      <p style={{ color: "var(--lv-neg)", fontWeight: 600 }}>Attenzione: operazione irreversibile.</p>
      <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>
        Verranno eliminati <b>definitivamente tutte le liste, tutti i movimenti e
        tutto lo storico</b> (compreso il cestino). L&rsquo;anagrafica clienti e gli
        account restano. Si consiglia di <b>scaricare prima un backup</b>.
      </p>
      <div className="row lv-field" style={{ marginTop: 12 }}>
        <label htmlFor="reset-conf">Per confermare digita esattamente: RESET TOTALE</label>
        <input
          id="reset-conf"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="RESET TOTALE"
          autoComplete="off"
          autoCapitalize="characters"
        />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn danger" disabled={saving} onClick={submit}>
          {saving ? "Elimino…" : "Elimina tutto"}
        </button>
      </div>
    </LvOverlay>
  );
}
