// Note interne della lista, modificabili in linea (estratto da ListaDetail.jsx).
import { useEffect, useRef, useState } from "react";
import { useListeWrite } from "./listePersistence.js";
import { useSalvataggioLista } from "./useSalvataggioLista.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mt16 = { marginTop: 16 };

// Note interne: sezione a uso del team, separata dal "foglio" dei movimenti.
// Non finisce mai nel riepilogo cliente: riepilogoTesto/RiepilogoClienteModal
// leggono solo `movimenti`, mai `lista.note` (vedi listeApi.js/listeModals.jsx).
export function NoteInterne({ lista, onSaved }) {
  const [editing, setEditing] = useState(false);
  // Vuoto e non `lista.note`: `apri()` riassegna sempre dalla prop — stesso
  // motivo di TitoloTestata.
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const open = () => { setValue(lista.note || ""); setEditing(true); };

  const { salva, inVolo } = useSalvataggioLista(
    async (note) => (await esegui("modificaNote", { id: lista.id, note })).ok,
    { alSuccesso: () => { setEditing(false); onSaved(); } },
  );

  const save = () => {
    const note = value.trim() || null;
    if (note === (lista.note || null)) return setEditing(false);
    salva(note);
  };

  return (
    <div className="lv-card lv-note-card" style={mt16}>
      <div className="lv-note-head">
        <h3>Note interne</h3>
        <span className="lv-note-hint">Solo per il team — escluse dal riepilogo cliente</span>
      </div>
      {editing ? (
        <>
          <textarea
            ref={inputRef}
            className="lv-note-text"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Es. accordi presi, promemoria per l'agenzia…"
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          />
          <div className="lv-cell-edit-actions">
            <button className="lv-btn sm" onClick={() => setEditing(false)}>Annulla</button>
            <button className="lv-btn primary sm" disabled={inVolo} onClick={save}>
              {inVolo ? "Salvo…" : "Salva"}
            </button>
          </div>
        </>
      ) : lista.note ? (
        <p className="lv-note-body" onClick={open} title="Tocca per modificare">{lista.note}</p>
      ) : (
        <button className="lv-btn sm" onClick={open}>+ Aggiungi nota interna</button>
      )}
    </div>
  );
}
