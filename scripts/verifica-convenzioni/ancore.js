// scripts/verifica-convenzioni/ancore.js
//
// ─── ANCORE · un rilievo legato a una condizione verificabile sul codice ────
// M-3 dell'audit del 2 settembre. Il controllo n. 7 di index.js
// (leggiStatoAudit/leggiStatoIndex) confronta la tabella di un audit con il
// marcatore in INDEX.md: due PROSE, scritte dalla stessa mano nello stesso
// commit, che per costruzione non possono smentirsi. È il motivo per cui A-1
// e A-4 dell'audit del 31 agosto sono stati corretti nel codice il 1
// settembre e sono rimasti dichiarati aperti — in entrambi i documenti —
// fino al 3, con quel controllo verde per tutto il tempo.
//
// Un'ANCORA lega un rilievo a una condizione MISURABILE sul sorgente: se
// `chiuso()` è vera ma la riga della tabella non porta un ✔ (o viceversa), il
// documento e il codice stanno raccontando due storie diverse, e questo
// controllo lo dice nominando ENTRAMBE le letture. Non sostituisce il
// giudizio di chi chiude un rilievo — un `chiuso()` che ritorna sempre `true`
// passerebbe questo controllo e sarebbe comunque falso — dice soltanto che le
// due fonti sono allineate.
//
// File a sé (M-1 dell'audit del 2 settembre l'ha spostato qui da
// convenzioni.js): quel modulo aveva superato la soglia di `max-lines`
// (500 righe effettive), ed è la stessa diagnosi già vista su `lib/api.js` e
// `liste/listeApi.js` — un file che accumula concetti che cambiano per
// ragioni indipendenti si spezza lungo un confine che già esiste, non si
// alza la soglia.
import { LetturaFallita, entryDelRegistry } from './convenzioni.js';

// L'elenco delle azioni che `A-1` dell'audit del 31 agosto nominava come
// «restano scoperte»: le otto mutazioni del dominio task/commento senza
// `rollback`. `ADD_TASKS_BULK` non è in elenco perché quel rilievo la
// dichiarava già a posto — è la sola differenza fra questo elenco e le nove
// entry «Task» del registry.
const ENTRY_ANCORA_A1_31_AGOSTO = [
  'ADD_TASK', 'UPDATE_TASK', 'MOVE_TASK', 'DELETE_TASK',
  'RESTORE_TASK', 'PURGE_TASK', 'UNDO_LAST_ACTION', 'ADD_COMMENT',
];

/**
 * L'ancora di `A-1` dell'audit del 31 agosto: le azioni che quel rilievo
 * nominava esplicitamente come prive di `rollback`. Ritorna quelle che lo
 * sono ANCORA — vuoto quando il rilievo è davvero chiuso.
 *
 * @param {string} testoRegistry `persistence.js` (+ `persistenceAdmin.js` se
 *   le azioni cercate potessero viverci; oggi non serve, sono tutte nel primo).
 */
export function entryTaskSenzaRollback(testoRegistry) {
  const perTipo = new Map(entryDelRegistry(testoRegistry).map(e => [e.tipo, e.corpo]));
  return ENTRY_ANCORA_A1_31_AGOSTO.filter((tipo) => {
    const corpo = perTipo.get(tipo);
    // Un'azione non trovata nel registry non è "chiusa": è un rilievo su cui
    // questa ancora non può più dire nulla di sensato, e va segnalata come
    // ancora aperta piuttosto che far sparire silenziosamente il conteggio.
    return corpo === undefined || !/\brollback\s*:/.test(corpo);
  });
}

// ⚠️ Serve la RIGA della tabella delle priorità, non l'intero documento: un
// rilievo può essere nominato altrove (una sezione di dettaglio, una nota)
// senza che quella menzione dichiari lo stato. La stessa regex di
// `leggiStatoAudit` — la prima cella deve APRIRE con l'identificativo.
export function verificaAncore(ancore, testiAudit) {
  const risultati = [];
  for (const ancora of ancore) {
    const testo = testiAudit[ancora.audit];
    if (testo === undefined) {
      throw new LetturaFallita(
        `Ancora ${ancora.audit} ${ancora.rilievo}: il documento non è fra quelli letti `
        + `da questo script (manca in AUDIT o il nome non combacia).`);
    }
    const re = new RegExp(`^\\|\\s*\\*{0,2}${ancora.rilievo}\\*{0,2}[^|]*\\|`, 'm');
    const riga = testo.split('\n').find(r => re.test(r));
    if (riga === undefined) {
      throw new LetturaFallita(
        `Ancora ${ancora.audit} ${ancora.rilievo}: nessuna riga «| ${ancora.rilievo} |» `
        + `nella tabella delle priorità — l'identificativo è cambiato?`);
    }
    const dichiaratoChiuso = riga.includes('✔');
    const chiusoNelCodice = ancora.chiuso();
    risultati.push({
      nome: `ancora ${ancora.audit} ${ancora.rilievo} (${ancora.descrizione})`,
      dove: ancora.audit,
      dichiarato: dichiaratoChiuso,
      misurato: chiusoNelCodice,
      rimedio: chiusoNelCodice
        ? `${ancora.rilievo} è chiuso nel codice (${ancora.descrizione}) ma la sua riga in `
          + `${ancora.audit} non porta ✔ — marcala e aggiorna INDEX.md.`
        : `${ancora.rilievo} porta ✔ in ${ancora.audit} ma la condizione (${ancora.descrizione}) `
          + `non è più vera nel codice — il rilievo è regredito o l'ancora è da rivedere.`,
    });
  }
  return risultati;
}
