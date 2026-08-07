// Segmento Versamento/Utilizzo, condiviso dai modali dei movimenti.
// Segmento Versamento (+) / Utilizzo (−). Il segno è separato dall'importo:
// l'utente digita sempre un numero positivo.
export const SegnoSeg = ({ segno, onChange, labels = true }) => (
  <div className="lv-seg">
    <button type="button" className={segno > 0 ? "on-pos" : ""} onClick={() => onChange(1)}>
      {labels ? "Versamento +" : "+"}
    </button>
    <button type="button" className={segno < 0 ? "on-neg" : ""} onClick={() => onChange(-1)}>
      {labels ? "Utilizzo −" : "−"}
    </button>
  </div>
);
