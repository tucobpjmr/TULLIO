// «Salvato ✓» accanto a un campo — B-6 dell'analisi del 4 novembre.
//
// La conferma di una modifica in linea sta dove l'utente sta guardando, non in
// un toast nell'angolo: un toast a ogni campo lasciato copriva la bottom-nav e
// spingeva fuori dalla pila quelli delle azioni vere (swipe, cestino), che
// portano un «Annulla». Il nodo resta montato e cambia solo il testo: una
// regione `aria-live` annuncia ciò che CAMBIA dentro di sé, e una che nasce già
// piena spesso non viene letta affatto.
const stileSalvato = { marginLeft: 6, fontSize: 11, fontWeight: 600, color: "var(--success)" };

/** @param {{ visibile: boolean }} props */
export function SalvatoInLinea({ visibile }) {
  return (
    <span role="status" aria-live="polite" style={stileSalvato}>
      {visibile ? "Salvato ✓" : ""}
    </span>
  );
}
