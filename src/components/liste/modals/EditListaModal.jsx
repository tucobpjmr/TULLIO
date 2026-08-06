import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";

// ─── Modifica dati lista (titolo +, volendo, nome cliente) ─────────────────
// Il titolo appartiene alla lista; il nome cliente NO: è la riga
// dell'anagrafica condivisa (`clients`), la stessa che usano le altre liste
// dello stesso intestatario, la scheda cliente e i task che lo citano.
// `modifica_lista` con p_client_name valorizzato fa una UPDATE su `clients`.
//
// Per questo il campo nasce in sola lettura e serve una spunta esplicita per
// sbloccarlo: chi voleva correggere il titolo di una lista non deve poter
// rinominare per sbaglio un cliente di tutta l'agenzia. A spunta spenta il
// nome non viene nemmeno inviato (clientName: null → la RPC lo lascia com'è).
export function EditListaModal({ lista, onSave, onClose }) {
  const nomeOriginale = lista.clients?.name || "";
  const [name, setName] = useState(nomeOriginale);
  const [titolo, setTitolo] = useState(lista.titolo || "");
  const [rinomina, setRinomina] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (rinomina && !name.trim()) return onSave.onError("Il nome del cliente è obbligatorio");
    setSaving(true);
    const ok = await onSave.run({
      id: lista.id,
      titolo: titolo.trim() || null,
      clientName: rinomina ? name.trim() : null,
    });
    if (!ok) setSaving(false);
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Modifica dati lista</h2>
      <div className="row lv-field">
        <label htmlFor="el-title">Titolo della lista (facoltativo)</label>
        <input id="el-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
      </div>
      <div className="row lv-field">
        <label htmlFor="el-client">Nome del titolare (anagrafica condivisa)</label>
        <input
          id="el-client"
          value={name}
          disabled={!rinomina}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. ROSSI MARIO"
          style={rinomina ? undefined : { opacity: 0.6 }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginTop: 2, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={rinomina}
          onChange={(e) => { setRinomina(e.target.checked); if (!e.target.checked) setName(nomeOriginale); }}
          style={{ marginTop: 3, cursor: "pointer" }}
        />
        <span>Rinomina il titolare in anagrafica</span>
      </label>
      <p style={{ fontSize: 12, color: "var(--lv-muted)", marginTop: 6 }}>
        {rinomina
          ? "Il nome è quello dell'anagrafica: cambiarlo cambia l'intestazione di tutte le liste di questo cliente, della sua scheda e dei riepiloghi generati da qui in avanti."
          : "Per correggere solo questa lista basta il titolo: il nome del titolare resta com'è. I cointestatari (se presenti) si aggiungono e rimuovono dal dettaglio della lista, non da qui."}
      </p>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={saving} onClick={submit}>
          {saving ? "Salvo…" : "Salva modifiche"}
        </button>
      </div>
    </LvOverlay>
  );
}
