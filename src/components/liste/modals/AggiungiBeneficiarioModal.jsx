import { useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF12LvMuted = { fontSize: 12, color: "var(--lv-muted)", marginTop: 4 };

// ─── Aggiungi cointestatario ────────────────────────────────────────────────
// Come NuovaListaModal per il cliente: uno esistente dall'anagrafica o un nome
// nuovo (creato contestualmente, stessa RPC-in-una-transazione di crea_lista).
// `clients` arriva già filtrato dal chiamante (ListaDetail): niente titolare,
// niente cointestatari già presenti, altrimenti si potrebbe "aggiungere" chi
// c'è già.
export function AggiungiBeneficiarioModal({ clients, onCreate, onClose }) {
  const [clientId, setClientId] = useState("");
  const [newName, setNewName] = useState("");

  const { salva, inVolo } = useSalvataggioLista(onCreate.run);

  const submit = () => {
    if (!clientId) return onCreate.onError("Scegli un cliente");
    if (clientId === "__new__" && !newName.trim()) return onCreate.onError("Inserisci il nome del cliente");
    salva({
      clientId: clientId === "__new__" ? null : clientId,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
  };

  return (
    <LvOverlay onClose={onClose}>
      <h2>Aggiungi cointestatario</h2>
      <div className="row lv-field">
        <label htmlFor="ab-client">Cliente</label>
        <select id="ab-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">— scegli cliente —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">+ Nuovo cliente…</option>
        </select>
      </div>
      {clientId === "__new__" && (
        <div className="row lv-field">
          <label htmlFor="ab-newname">Nome nuovo cliente</label>
          <input id="ab-newname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. BIANCHI MARIA" />
        </div>
      )}
      <p style={txtF12LvMuted}>
        Il cointestatario ha una propria scheda in anagrafica: comparirà anche
        nella sua scheda cliente, con questa lista e il saldo condiviso.
      </p>
      <div className="actions">
        <button className="lv-btn" onClick={onClose}>Annulla</button>
        <button className="lv-btn primary" disabled={inVolo} onClick={submit}>
          {inVolo ? "Aggiungo…" : "Aggiungi"}
        </button>
      </div>
    </LvOverlay>
  );
}
