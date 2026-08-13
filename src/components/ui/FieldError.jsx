// src/components/ui/FieldError.jsx
// ─── CRITICITÀ #10 · il messaggio d'errore accanto al campo che lo causa ───
// La metà VISIVA della validazione (quella pura sta in lib/validators.js): il
// messaggio sotto l'input e gli attributi che lo legano all'input per chi non
// vede il layout.
//
// `role="alert"` fa annunciare il messaggio nel momento in cui compare; senza,
// uno screen reader non ha modo di sapere che sotto il campo è apparso del
// testo nuovo. È la coppia con `aria-describedby` sull'input a chiudere il
// cerchio: l'annuncio dice cosa c'è che non va, e riportando il focus sul
// campo il messaggio viene riletto come sua descrizione.

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF115Bold = {
  marginTop: 4, fontSize: 11.5, fontWeight: 600, lineHeight: 1.35,
  color: "var(--danger)",
};
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <div
      id={id}
      role="alert"
      style={txtF115Bold}
    >
      {children}
    </div>
  );
}

/**
 * Gli attributi da spargere sull'input (`{...ariaCampo("mv-desc", errori.desc)}`).
 *
 * Esiste perché la coppia va scritta INSIEME o non serve a niente: un
 * `aria-invalid` senza `aria-describedby` dice "questo campo è sbagliato" e
 * non dice perché; un `aria-describedby` che punta a un id inesistente (il
 * caso in cui l'errore non c'è) viene ignorato dagli screen reader ma resta
 * una promessa non mantenuta nel DOM. Qui o ci sono entrambi o nessuno dei due.
 *
 * @param {string} id       id del <FieldError> corrispondente
 * @param {string|null} errore  messaggio corrente per quel campo, se c'è
 */
export function ariaCampo(id, errore) {
  return errore
    ? { "aria-invalid": "true", "aria-describedby": id }
    : { "aria-invalid": undefined, "aria-describedby": undefined };
}
