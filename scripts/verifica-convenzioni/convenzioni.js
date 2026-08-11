// scripts/verifica-convenzioni/convenzioni.js
//
// Parte PURA della verifica: estrae i numeri dichiarati nei documenti e li
// confronta con quelli misurati. Fuori da index.js perché è la parte che si
// può testare senza far girare ESLint né leggere il disco.
//
// ⛔ REGOLA NON NEGOZIABILE DI QUESTO FILE: ogni lettura da un documento
// FALLISCE se il pattern non c'è. Uno script di verifica che passa perché non
// ha trovato niente da verificare è peggio del problema che risolve — è il
// problema, con in più l'apparenza di essere risolto.

export class LetturaFallita extends Error {}

/**
 * Legge dal testo di un documento il conteggio dei casi `react/no-multi-comp`
 * dichiarato in docs/CLAUDE.md, nella forma «N casi aperti in M file».
 */
export function leggiConteggioMultiComp(testo) {
  const m = /(\d+)\s+casi aperti in\s+(\d+)\s+file/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «N casi aperti in M file» per ' +
      'react/no-multi-comp. Se la frase è stata riscritta, aggiorna QUESTO ' +
      'script insieme al documento: un controllo che non trova più il proprio ' +
      'pattern smette di controllare in silenzio.');
  }
  return { casi: Number(m[1]), file: Number(m[2]) };
}

/**
 * Stato dei rilievi di un audit, letto dalla sua tabella delle priorità.
 * Una riga è `| ST-6 | Media | … |`; un rilievo chiuso porta `✔` nella riga
 * (la convenzione del repo è `~~Media~~ ✔ **risolto**`).
 */
export function leggiStatoAudit(testo, prefisso) {
  const righe = testo.split("\n").filter(r => new RegExp(`^\\|\\s*${prefisso}-\\d+\\s*\\|`).test(r));
  if (righe.length === 0) {
    throw new LetturaFallita(
      `Nessuna riga di tabella «| ${prefisso}-N |» trovata nel documento: la ` +
      'tabella delle priorità è la fonte di questo controllo e senza di essa ' +
      'non c\'è niente da confrontare.');
  }
  const totale = righe.length;
  const chiusi = righe.filter(r => r.includes("✔")).length;
  return { totale, chiusi };
}

/**
 * Stato dichiarato in docs/INDEX.md per un documento di audit, nella forma
 * machine-readable `⟦stato: N/M chiusi⟧` sulla riga che nomina il file.
 *
 * Il marcatore esiste perché la colonna "Rilievi aperti" di INDEX.md è prosa —
 * utile a chi legge, inutile a chi verifica. Due formati per due lettori, e il
 * controllo tiene insieme quello leggibile e quello misurato.
 */
export function leggiStatoIndex(testo, nomeFile) {
  const riga = testo.split("\n").find(r => r.includes(nomeFile) && r.includes("⟦stato:"));
  if (!riga) {
    throw new LetturaFallita(
      `docs/INDEX.md: manca il marcatore ⟦stato: N/M chiusi⟧ sulla riga di ` +
      `${nomeFile}. Va aggiunto quando si aggiunge un audit all'indice: senza, ` +
      'questo controllo non ha un termine di paragone e passerebbe a vuoto.');
  }
  const m = /⟦stato:\s*(\d+)\/(\d+)\s+chiusi⟧/.exec(riga);
  if (!m) {
    throw new LetturaFallita(
      `docs/INDEX.md: il marcatore sulla riga di ${nomeFile} non è nella forma ` +
      '⟦stato: N/M chiusi⟧.');
  }
  return { chiusi: Number(m[1]), totale: Number(m[2]) };
}

/**
 * Confronta dichiarato e misurato e produce l'elenco degli scarti.
 * Ogni scarto dice ENTRAMBI i numeri e cosa aggiornare: la divergenza è il
 * difetto, non il numero — chi legge deve poter decidere se ha sbagliato il
 * documento o il codice.
 */
export function confronta(controlli) {
  return controlli
    .filter(c => c.dichiarato !== c.misurato)
    .map(c => `${c.nome}: ${c.dove} dice ${c.dichiarato}, misurato ${c.misurato}. ${c.rimedio}`);
}
