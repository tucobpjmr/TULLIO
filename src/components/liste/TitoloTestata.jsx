// Titolo della lista, modificabile in linea (estratto da ListaDetail.jsx).
// B-2 (audit del 26 agosto): il ciclo apri/salva/annulla e la barra azioni
// sono condivisi con NoteInterne — vedi useModificaInLinea.js.
import { useModificaInLinea } from "./useModificaInLinea.js";
import { AzioniModifica } from "./AzioniModifica.jsx";

// Titolo in testata: modificabile con un tocco, come le celle dei movimenti.
// Quando il titolo manca (caso più frequente: le liste importate non ne hanno
// uno) mostra comunque un invito esplicito, altrimenti la possibilità di
// darne uno resterebbe nascosta dentro "Modifica dati".
export function TitoloTestata({ lista, onSaved }) {
  const m = useModificaInLinea({
    leggi: () => lista.titolo,
    operazione: "modificaTitolo",
    componi: (titolo) => ({ id: lista.id, titolo }),
    onSaved,
  });

  if (m.editing) {
    return (
      <span className="lv-tit-edit">
        <input
          ref={m.inputRef}
          type="text"
          maxLength={80}
          value={m.value}
          onChange={(e) => m.setValue(e.target.value)}
          onKeyDown={m.onKeyDown}
          placeholder="Es. Buono viaggio 2026"
          aria-label="Titolo della lista"
        />
        {/* Senza contenitore: qui i bottoni stanno in linea con l'input dentro
            `.lv-tit-edit` — vedi AzioniModifica.jsx. */}
        <AzioniModifica onAnnulla={m.chiudi} onSalva={m.conferma} inVolo={m.inVolo} contenitore={null} />
      </span>
    );
  }

  return lista.titolo
    ? <button className="lv-tit-btn" title="Modifica il titolo" onClick={m.apri}>{lista.titolo} <span className="pen">✎</span></button>
    : <button className="lv-tit-btn add" title="Aggiungi un titolo" onClick={m.apri}>+ Aggiungi titolo</button>;
}
