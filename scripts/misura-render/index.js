#!/usr/bin/env node
// scripts/misura-render/index.js
//
// Misura il costo della funzione pura più cara del calendario, su un dataset
// sintetico alla scala di produzione.
//
//   npm run misura:render
//
// Non ha soglie né uscita 1: è uno strumento di misura, non un gate — la
// domanda "quanto costa" non ha una risposta giusta o sbagliata, ha solo una
// risposta ignota finché qualcuno non la esegue.
//
// ─── PERCHÉ MISURA `layoutColumns` E NON PIÙ `expandRecurring` (A-3) ─────────
// Questo script è nato per rispondere a P2-4 (docs/AUDIT_PERFORMANCE_2026-08.md):
// «`expandRecurring` chiamata tre volte per render invece di una è un difetto
// certo, ma quanto costa a 248 task nessuno lo sapeva». La misura c'era, il
// rilievo è stato chiuso, e il numero è finito in un audit.
//
// Il soggetto però era codice morto. `recurrence` non esiste sul database
// (nessuna delle 109 migrazioni lo nomina), `toDbTask`/`fromDbTask` non lo
// mappano e nessuna UI lo imposta: l'unico writer in tutta la codebase era
// `QuickAddTask`, che scriveva la costante `"none"`. `expandRecurring`
// prendeva quindi sempre il ramo «non ricorrente» e restituiva l'array di
// partenza.
//
// Il segnale era QUI, e va detto perché è la parte che si ripete. Per misurare
// qualcosa, questo script doveva FABBRICARE il campo:
//
//     recurrence: ricorrente ? RECURRENCES[i % RECURRENCES.length] : 'none',
//
// con una `QUOTA_RICORRENTI = 0.3` dichiarata «non misurata sul progetto reale
// (è un dato che vive nel database di produzione, non nel repository)». Non
// viveva nel database di produzione: non esisteva. Un benchmark che deve
// inventare i propri dati d'ingresso perché il repository non ne contiene
// nessuno sta misurando un percorso che nessuno percorre — ed è un'informazione
// sul codice, non sul benchmark.
//
// Il soggetto nuovo è `layoutColumns` (components/calendar/calendarLayout.js),
// scelto per le proprietà che al precedente mancavano: gira DAVVERO a ogni
// render delle due griglie orarie (una volta per la vista giorno, sette per la
// settimana piena), lavora su task veri senza campi da fabbricare, ed è
// quadratico — per ogni evento rifiltra l'intero elenco della giornata per
// calcolare `totalCols`. È anche il tipo di forma che `npm run
// verifica:convenzioni` sorveglia altrove (`iterazioniQuadratiche`).
import { layoutColumns } from '../../src/components/calendar/calendarLayout.js';

const N_TASK = 248;

// Quante task cadono nello stesso giorno: è la variabile che conta, perché
// `layoutColumns` riceve UNA GIORNATA per volta, non l'elenco intero. Le tre
// scale sotto coprono l'agenda scarica, quella piena e il caso peggiore
// plausibile (un giorno di partenze di gruppo).
const EVENTI_PER_GIORNO = [4, 12, 40];

// Genera gli eventi di una giornata, sovrapposti fra loro: la sovrapposizione
// è ciò che fa lavorare l'algoritmo (senza, ogni evento sta in colonna 0 e il
// calcolo di `totalCols` è banale).
function generaGiornata(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 7, 24, 8, 0, 0);
    // Inizi scaglionati di 20 minuti su una finestra di 8 ore, durate di 1-3
    // ore: a 12 eventi al giorno se ne sovrappongono sempre diversi.
    d.setMinutes(d.getMinutes() + (i * 20) % (8 * 60));
    out.push({
      id: `t${i}`,
      title: `Task sintetico ${i}`,
      category: 'booking',
      priority: 'medium',
      status: i % 5 === 0 ? 'done' : 'todo',
      assignees: [`agente${i % 5}`],
      dueDate: d.toISOString(),
      estimatedHours: 1 + (i % 3),
      deletedAt: null,
    });
  }
  return out;
}

function media(fn, iterazioni) {
  // Riscaldamento: esclude la compilazione JIT dalla misura.
  for (let i = 0; i < 20; i++) fn();
  const inizio = performance.now();
  for (let i = 0; i < iterazioni; i++) fn();
  return (performance.now() - inizio) / iterazioni;
}

function main() {
  const ITER = 2000;

  console.log(`misura:render — layoutColumns, ${ITER} iterazioni per media\n`);
  console.log('  eventi/giorno   ms/chiamata   vista giorno (×1)   settimana piena (×7)');
  console.log('  ─────────────   ───────────   ─────────────────   ────────────────────');

  const risultati = EVENTI_PER_GIORNO.map((n) => {
    const giornata = generaGiornata(n);
    const t = media(() => layoutColumns(giornata), ITER);
    console.log(
      `  ${String(n).padStart(13)}   ${t.toFixed(4).padStart(11)}   ` +
      `${t.toFixed(4).padStart(17)}   ${(t * 7).toFixed(4).padStart(20)}`,
    );
    return { n, t };
  });

  // Il confronto che dice se la forma quadratica conta a questa scala: se il
  // costo crescesse linearmente, quadruplicare gli eventi quadruplicherebbe il
  // tempo. Un fattore molto più alto è la quadraticità che si vede.
  const [piccolo] = risultati;
  const grande = risultati[risultati.length - 1];
  const fattoreEventi = grande.n / piccolo.n;
  const fattoreTempo = grande.t / piccolo.t;

  console.log(`\n  Da ${piccolo.n} a ${grande.n} eventi/giorno: ${fattoreEventi}× gli eventi, ` +
              `${fattoreTempo.toFixed(1)}× il tempo.`);
  console.log(`  Lineare sarebbe ${fattoreEventi.toFixed(1)}×; il resto è il filtro interno`);
  console.log('  che, per ogni evento, ripercorre l\'intera giornata per calcolare totalCols.');
  console.log(`\n  Scala di riferimento: ${N_TASK} task in tutto il progetto, distribuiti su`);
  console.log('  mesi — le giornate davvero affollate sono l\'eccezione, ed è la ragione');
  console.log('  per cui questa forma non è ancora un problema. La misura serve a sapere');
  console.log('  quando lo diventerà, invece di scoprirlo da un calendario che scatta.');
}

main();
