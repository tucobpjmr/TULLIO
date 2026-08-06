import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";

// ─── Nuova lista ───────────────────────────────────────────────────────────
// Il cliente si sceglie dall'anagrafica condivisa; "+ Nuovo cliente…" lo crea
// contestualmente (la RPC crea_lista fa INSERT su clients nella stessa
// transazione, così non restano clienti orfani se la creazione lista fallisce).
export function NuovaListaModal({ clients, onCreate, onClose, presetClientId = null }) {
  const [clientId, setClientId] = useState(presetClientId || "");
  const [newName, setNewName] = useState("");
  const [titolo, setTitolo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!clientId) return onCreate.onError("Scegli un cliente");
    if (clientId === "__new__" && !newName.trim()) return onCreate.onError("Inserisci il nome del cliente");
    setSaving(true);
    const ok = await onCreate.run({
      clientId: clientId === "__new__" ? null : clientId,
      titolo: titolo.trim() || null,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
    if (!ok) setSaving(false); // consenti un nuovo tentativo
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Nuova lista</h2>
      <div className="row lv-field">
        <label htmlFor="nl-client">Cliente</label>
        <select id="nl-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli cliente —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">+ Nuovo cliente…</option>
        </select>
      </div>
      {clientId === "__new__" && (
        <div className="row lv-field">
          <label htmlFor="nl-newname">Nome nuovo cliente</label>
          <input id="nl-newname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. ROSSI MARIO" />
        </div>
      )}
      <div className="row lv-field">
        <label htmlFor="nl-title">Titolo (facoltativo)</label>
        <input id="nl-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Creo…" : "Crea lista"}
        </button>
      </div>
    </LvOverlay>
  );
}
