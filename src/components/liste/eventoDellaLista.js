// src/components/liste/eventoDellaLista.js
// Se un evento realtime delle tre tabelle del modulo tocca la lista aperta.
//
// A-3 del 15 novembre: il dettaglio leggeva i movimenti una volta sola, mentre
// il saldo (dalla home) restava vivo — saldo e righe potevano non tornare.
//
// `liste_viaggio` porta l'id della lista in `id`; `movimenti_lista` e
// `lista_beneficiari` in `lista_id`. Un DELETE senza nessuno dei due (replica
// identity di default su `movimenti_lista`: solo la PK) si accetta: meglio un
// reload in più che un dettaglio fermo.

export function eventoDellaLista(payload, listaId) {
  if (!listaId) return false;
  const riga = (payload?.eventType === "DELETE" ? payload?.old : payload?.new) || {};
  if (payload?.table === "liste_viaggio") return riga.id === undefined || riga.id === listaId;
  return riga.lista_id === undefined || riga.lista_id === listaId;
}
