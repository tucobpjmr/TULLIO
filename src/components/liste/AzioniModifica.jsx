// src/components/liste/AzioniModifica.jsx
//
// ─── B-2 (audit del 26 agosto) · LA BARRA AZIONI DEGLI EDITOR IN LINEA ────
//
// Annulla + Salva, con l'attesa dipinta. Erano tre copie — `TitoloTestata`,
// `NoteInterne`, `CellEditor` — ed è la copia che rendeva il rilievo un
// rilievo e non una somiglianza: lo stile era GIÀ stato riconosciuto come
// condiviso (`lv-cell-edit-actions` in liste.css), ma il markup era stato
// ricopiato lo stesso. Un difetto qui — il `disabled` che manca, l'etichetta
// che cambia — si correggeva in un file su tre e nessuno se ne accorgeva.
//
// ⚠️ IL CONTENITORE È UN PARAMETRO, e non è una comodità: `TitoloTestata` non
// ha `lv-cell-edit-actions`, ha i due bottoni in linea dentro `.lv-tit-edit`
// insieme all'input (flex, gap 6, wrap). Avvolgerli anche lì aggiungerebbe
// `justify-content:flex-end` e `margin-top:10px`, cioè li staccherebbe
// dall'input su una riga propria — una modifica visiva che questo rilievo non
// chiede. Passando `contenitore={null}` i bottoni escono nudi, e la
// differenza fra i due casi si legge qui invece di essere dedotta da tre file.

/**
 * @param {object} props
 * @param {() => void} props.onAnnulla
 * @param {() => void} props.onSalva
 * @param {boolean} props.inVolo   scrittura in corso: bottone spento e in attesa
 * @param {string|null} [props.contenitore]  classe del wrapper, `null` per nessuno
 */
export const AzioniModifica = ({ onAnnulla, onSalva, inVolo, contenitore = "lv-cell-edit-actions" }) => {
  const bottoni = (
    <>
      <button className="lv-btn sm" onClick={onAnnulla}>Annulla</button>
      <button className="lv-btn primary sm" disabled={inVolo} onClick={onSalva}>
        {inVolo ? "Salvo…" : "Salva"}
      </button>
    </>
  );
  return contenitore ? <div className={contenitore}>{bottoni}</div> : bottoni;
};
