import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// ─── Nuova lista ───────────────────────────────────────────────────────────
// Il cliente si sceglie dall'anagrafica condivisa; "+ Nuovo cliente…" lo crea
// contestualmente (la RPC crea_lista fa INSERT su clients nella stessa
// transazione, così non restano clienti orfani se la creazione lista fallisce).
export function NuovaListaModal({ clients, onCreate, onClose, presetClientId = null }) {
  const [clientId, setClientId] = useState(presetClientId || "");
  const [newName, setNewName] = useState("");
  const [titolo, setTitolo] = useState("");

  // A-2 · Il freno al doppio invio, il `finally` e il guard di smontaggio
  // vengono dal contratto. Sulla riuscita è `run()` a chiudere l'overlay:
  // il guard rende quello smontaggio un caso previsto invece di una scrittura
  // di stato su un componente che non c'è più.
  const { salva, inVolo } = useSalvataggioLista(onCreate.run);

  const submit = () => {
    if (!clientId) return onCreate.onError("Scegli un cliente");
    if (clientId === "__new__" && !newName.trim()) return onCreate.onError("Inserisci il nome del cliente");
    salva({
      clientId: clientId === "__new__" ? null : clientId,
      titolo: titolo.trim() || null,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
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
        <button className="lv-btn primary" disabled={inVolo} onClick={submit}>
          {inVolo ? "Creo…" : "Crea lista"}
        </button>
      </div>
    </LvOverlay>
  );
}
