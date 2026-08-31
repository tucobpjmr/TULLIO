import { useRef, useState } from "react";
import { LvOverlay } from "./LvOverlay.jsx";
import { useSalvataggioLista } from "../useSalvataggioLista.js";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { validaCampi, primoCampoInvalido } from "../../../lib/validators.js";
// M-1 · le regole sono condivise con AggiungiBeneficiarioModal (stesso picker
// cliente-esistente-o-nuovo — vedi regoleCliente.js).
import { REGOLE_CLIENTE, ORDINE_CLIENTE } from "../regoleCliente.js";

// ─── Nuova lista ───────────────────────────────────────────────────────────
// Il cliente si sceglie dall'anagrafica condivisa; "+ Nuovo cliente…" lo crea
// contestualmente (la RPC crea_lista fa INSERT su clients nella stessa
// transazione, così non restano clienti orfani se la creazione lista fallisce).
export function NuovaListaModal({ clients, onCreate, onClose, presetClientId = null }) {
  const [clientId, setClientId] = useState(presetClientId || "");
  const [newName, setNewName] = useState("");
  const [titolo, setTitolo] = useState("");
  const [errori, setErrori] = useState({});
  const clientRef = useRef(null);
  const newNameRef = useRef(null);
  const rifCampo = { clientId: clientRef, newName: newNameRef };

  // A-2 · Il freno al doppio invio, il `finally` e il guard di smontaggio
  // vengono dal contratto. Sulla riuscita è `run()` a chiudere l'overlay:
  // il guard rende quello smontaggio un caso previsto invece di una scrittura
  // di stato su un componente che non c'è più.
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
      titolo: titolo.trim() || null,
      newClientName: clientId === "__new__" ? newName.trim() : null,
    });
  };

  return (
    <LvOverlay onClose={onClose}>
      {/* M-4 · `<form>` e non `<div>`: Invio deve inviare. */}
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <h2>Nuova lista</h2>
        <div className="row lv-field">
          <label htmlFor="nl-client">Cliente</label>
          <select
            id="nl-client" ref={clientRef} value={clientId}
            onChange={(e) => aggiorna("clientId", setClientId)(e.target.value)}
            {...ariaCampo("nl-client-err", errori.clientId)}
          >
            <option value="">— scegli cliente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ Nuovo cliente…</option>
          </select>
          <FieldError id="nl-client-err">{errori.clientId}</FieldError>
        </div>
        {clientId === "__new__" && (
          <div className="row lv-field">
            <label htmlFor="nl-newname">Nome nuovo cliente</label>
            <input
              id="nl-newname" ref={newNameRef} value={newName}
              onChange={(e) => aggiorna("newName", setNewName)(e.target.value)}
              placeholder="Es. ROSSI MARIO"
              {...ariaCampo("nl-newname-err", errori.newName)}
            />
            <FieldError id="nl-newname-err">{errori.newName}</FieldError>
          </div>
        )}
        <div className="row lv-field">
          <label htmlFor="nl-title">Titolo (facoltativo)</label>
          <input id="nl-title" value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Buono viaggio 2026" />
        </div>
        <div className="actions">
          <button type="button" className="lv-btn" onClick={onClose}>Annulla</button>
          <button type="submit" className="lv-btn primary" disabled={inVolo}>
            {inVolo ? "Creo…" : "Crea lista"}
          </button>
        </div>
      </form>
    </LvOverlay>
  );
}
