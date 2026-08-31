import { useRef, useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { validaCampi, primoCampoInvalido } from "../../../lib/validators.js";
// M-1 · le regole sono condivise con NuovaListaModal (stesso picker
// cliente-esistente-o-nuovo — vedi regoleCliente.js).
import { REGOLE_CLIENTE, ORDINE_CLIENTE } from "../regoleCliente.js";

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
  const [errori, setErrori] = useState({});
  const clientRef = useRef(null);
  const newNameRef = useRef(null);
  const rifCampo = { clientId: clientRef, newName: newNameRef };

  const { salva, inVolo } = useSalvataggioLista(onCreate.run);

  const aggiorna = (campo, set) => (valore) => {
    set(valore);
    setErrori((prec) => (prec[campo] ? { ...prec, [campo]: undefined } : prec));
  };

  const submit = () => {
    const valori = { clientId, newName };
    const trovati = validaCampi(valori, REGOLE_CLIENTE);
    const primo = primoCampoInvalido(trovati, ORDINE_CLIENTE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    salva({
      clientId: clientId === "__new__" ? null : clientId,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
  };

  return (
    <LvOverlay onClose={onClose}>
      {/* M-4 · `<form>` e non `<div>`: Invio deve inviare. */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2>Aggiungi cointestatario</h2>
        <div className="row lv-field">
          <label htmlFor="ab-client">Cliente</label>
          <select
            id="ab-client" ref={clientRef} value={clientId}
            onChange={(e) => aggiorna("clientId", setClientId)(e.target.value)}
            {...ariaCampo("ab-client-err", errori.clientId)}
          >
            <option value="">— scegli cliente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ Nuovo cliente…</option>
          </select>
          <FieldError id="ab-client-err">{errori.clientId}</FieldError>
        </div>
        {clientId === "__new__" && (
          <div className="row lv-field">
            <label htmlFor="ab-newname">Nome nuovo cliente</label>
            <input
              id="ab-newname" ref={newNameRef} value={newName}
              onChange={(e) => aggiorna("newName", setNewName)(e.target.value)}
              placeholder="Es. BIANCHI MARIA"
              {...ariaCampo("ab-newname-err", errori.newName)}
            />
            <FieldError id="ab-newname-err">{errori.newName}</FieldError>
          </div>
        )}
        <p style={txtF12LvMuted}>
          Il cointestatario ha una propria scheda in anagrafica: comparirà anche
          nella sua scheda cliente, con questa lista e il saldo condiviso.
        </p>
        <div className="actions">
          <button type="button" className="lv-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="lv-btn primary" disabled={inVolo}>
            {inVolo ? "Aggiungo…" : "Aggiungi"}
          </button>
        </div>
      </form>
    </LvOverlay>
  );
}
