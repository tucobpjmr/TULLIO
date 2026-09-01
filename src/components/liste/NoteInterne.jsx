// Note interne della lista, modificabili in linea (estratto da ListaDetail.jsx).
// B-2 (audit del 26 agosto): il ciclo apri/salva/annulla e la barra azioni
// sono condivisi con TitoloTestata — vedi useModificaInLinea.js.
import { useModificaInLinea } from "./useModificaInLinea.js";
import { AzioniModifica } from "./AzioniModifica.jsx";
import { attivaConTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const mt16 = { marginTop: 16 };

// Note interne: sezione a uso del team, separata dal "foglio" dei movimenti.
// Non finisce mai nel riepilogo cliente: riepilogoTesto/RiepilogoClienteModal
// leggono solo `movimenti`, mai `lista.note` (vedi listeDocumenti.js).
export function NoteInterne({ lista, onSaved }) {
  const m = useModificaInLinea({
    leggi: () => lista.note,
    operazione: "modificaNote",
    componi: (note) => ({ id: lista.id, note }),
    onSaved,
  });

  return (
    <div className="lv-card lv-note-card" style={mt16}>
      <div className="lv-note-head">
        <h3>Note interne</h3>
        <span className="lv-note-hint">Solo per il team — escluse dal riepilogo cliente</span>
      </div>
      {m.editing ? (
        <>
          <textarea
            ref={m.inputRef}
            className="lv-note-text"
            rows={4}
            value={m.value}
            onChange={(e) => m.setValue(e.target.value)}
            placeholder="Es. accordi presi, promemoria per l'agenzia…"
            onKeyDown={m.onKeyDown}
          />
          <AzioniModifica onAnnulla={m.chiudi} onSalva={m.conferma} inVolo={m.inVolo} />
        </>
      ) : lista.note ? (
        <p
          className="lv-note-body"
          role="button"
          tabIndex={0}
          onClick={m.apri}
          onKeyDown={attivaConTastiera(m.apri)}
          title="Tocca per modificare"
        >{lista.note}</p>
      ) : (
        <button className="lv-btn sm" onClick={m.apri}>+ Aggiungi nota interna</button>
      )}
    </div>
  );
}
