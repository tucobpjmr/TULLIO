// src/components/liste/listeReducers.js
// Il reducer locale degli overlay del modulo Liste. È una funzione pura — sta
// qui, fuori dal componente, proprio perché si possa testare come tale.

// ─── LISTE: OVERLAY ────────────────────────────────────────────────────────
// overlayReducer: quale finestra del modulo è aperta, UNA alla volta.
//
// PERCHÉ ESISTE. In ListeViaggio erano quattro useState booleani/oggetto
// (`nuovaOpen`, `strumentiOpen`, `resetOpen`, `pendingImport`) più il loro dato
// di corredo (`importProgress`). Descrivevano una cosa sola — quale overlay è
// aperto — ed erano mutuamente esclusivi per costruzione, ma niente nel codice
// lo diceva: lo stato "importa backup aperto E reset aperto" era
// rappresentabile, e tenerlo impossibile era responsabilità di ogni handler che
// li toccava (`setStrumentiOpen(false); setResetOpen(true);` — due scritture
// per una transizione sola). È la classe di difetto che non si vede in review e
// si trova in produzione con «mi si sono aperte due finestre».
//
// Qui lo stato "due aperti" non è più rappresentabile: c'è UN campo `tipo`, e
// aprire sostituisce. Stesso movimento già fatto nel sottosistema accanto
// (chat/chatReducers.js), rilievo ST-7 di docs/AUDIT_STRUTTURA_2026-08-10.md.
//
// NON entrano qui `search`/`filter`/`sort`/`limit`: sono quattro valori
// indipendenti che convivono per definizione (si cerca DENTRO un filtro, con un
// ordinamento), non una macchina a stati — accorparli renderebbe illeggibile
// una transizione che oggi è una riga. Nemmeno `openId`/`detail`: quello non è
// un overlay ma la ROTTA del modulo (elenco ↔ dettaglio di una lista), e gli
// overlay convivono con entrambe — "+ Nuova lista" apre la modale e, alla
// creazione, porta l'utente sul dettaglio della lista appena creata. Fonderli
// significherebbe dichiarare mutuamente esclusive due cose che non lo sono.
export const overlayIniziale = { tipo: null, dati: null };

export function overlayReducer(stato, azione) {
  switch (azione.type) {
    // Aprire un overlay mentre un altro è aperto lo SOSTITUISCE: è la
    // proprietà che il vecchio codice doveva mantenere a mano.
    case "APRI":   return { tipo: azione.overlay, dati: azione.dati ?? null };
    case "CHIUDI": return overlayIniziale;
    // L'avanzamento dell'import è l'unico dato che cambia MENTRE l'overlay
    // resta aperto: è un update sui dati, non una transizione. Su qualunque
    // altro overlay (o a modale chiusa) è un no-op che ritorna lo STESSO
    // oggetto — una risposta tardiva del layer dati, arrivata dopo che
    // l'utente ha chiuso o cambiato finestra, non deve riaprire nulla né far
    // ri-renderizzare il modulo.
    case "PROGRESSO":
      return stato.tipo === "import"
        ? { ...stato, dati: { ...stato.dati, progress: azione.progress } }
        : stato;
    default: return stato;
  }
}
