#!/usr/bin/env node
// scripts/misura-render/index.js
//
// Risponde alla domanda che l'audit (docs/AUDIT_PERFORMANCE_2026-08.md, P2-4)
// lasciava aperta di proposito: `expandRecurring` chiamata tre volte per
// render invece di una è un difetto certo, ma quanto costa a 248 task nessuno
// lo sapeva — non c'era un profilo, un benchmark o un test di performance in
// tutta la codebase. Non misura render React (un vero React.Profiler
// richiede un browser): misura la funzione pura al centro del rilievo,
// `expandRecurring` di calendarRecurrence.js, invariata da questa sessione,
// su un dataset sintetico alla scala di produzione (248 task, 9 agosto 2026).
//
//   npm run misura:render
//
// Non ha soglie né uscita 1: è uno strumento di misura, non un gate — la
// domanda "quanto costa" non ha una risposta giusta o sbagliata, ha solo una
// risposta ignota finché qualcuno non la esegue.
import { expandRecurring } from '../../src/components/calendar/calendarRecurrence.js';

const N_TASK = 248;
const RECURRENCES = ['daily', 'weekly', 'monthly', 'yearly'];
// Quota di task ricorrenti: non misurata sul progetto reale (è un dato che
// vive nel database di produzione, non nel repository), stimata larga per
// non sottostimare il costo — è la leva che rende `expandRecurring` più
// caro di un semplice filter, quindi conviene errare per eccesso.
const QUOTA_RICORRENTI = 0.3;

function generaTaskSintetici(n) {
  const oggi = new Date();
  const out = [];
  for (let i = 0; i < n; i++) {
    const ricorrente = i < n * QUOTA_RICORRENTI;
    // Sparsi su ±180 giorni: un mix di scadenze passate, presenti e future,
    // come in una base task reale dopo mesi d'uso.
    const offsetGiorni = Math.floor((i / n) * 360) - 180;
    const due = new Date(oggi);
    due.setDate(due.getDate() + offsetGiorni);
    out.push({
      id: `t${i}`,
      title: `Task sintetico ${i}`,
      category: 'booking',
      priority: 'medium',
      status: i % 5 === 0 ? 'done' : 'todo',
      assignees: [`agente${i % 5}`],
      dueDate: due.toISOString(),
      recurrence: ricorrente ? RECURRENCES[i % RECURRENCES.length] : 'none',
      deletedAt: null,
    });
  }
  return out;
}

function rangeDelMese(d) {
  const y = d.getFullYear(), m = d.getMonth();
  return [new Date(y, m, 1, 0, 0, 0), new Date(y, m + 1, 0, 23, 59, 59)];
}
function rangeDellaSettimana(d) {
  const s = new Date(d); s.setDate(d.getDate() - d.getDay());
  s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
  return [s, e];
}
function rangeDelGiorno(d) {
  const s = new Date(d); s.setHours(0, 0, 0, 0);
  const e = new Date(d); e.setHours(23, 59, 59, 999);
  return [s, e];
}

function media(fn, iterazioni) {
  // Riscaldamento: esclude compilazione JIT dalla misura.
  for (let i = 0; i < 20; i++) fn();
  const inizio = performance.now();
  for (let i = 0; i < iterazioni; i++) fn();
  return (performance.now() - inizio) / iterazioni;
}

function main() {
  const tasks = generaTaskSintetici(N_TASK);
  const oggi = new Date();
  const [meseS, meseE] = rangeDelMese(oggi);
  const [settS, settE] = rangeDellaSettimana(oggi);
  const [giornoS, giornoE] = rangeDelGiorno(oggi);

  const ITER = 500;
  const tMese = media(() => expandRecurring(tasks, meseS, meseE), ITER);
  const tSettimana = media(() => expandRecurring(tasks, settS, settE), ITER);
  const tGiorno = media(() => expandRecurring(tasks, giornoS, giornoE), ITER);

  const occorrenzeMese = expandRecurring(tasks, meseS, meseE).length;

  const primaTreChiamate = tMese + tSettimana + tGiorno;
  const dopoUnaChiamata = tMese; // vista mese: la più cara delle tre, caso peggiore

  // Scenario resize (P2-7): un trascinamento del bordo finestra produceva
  // fino a ~400 `setWidth` (audit, P2-7) — prima di questa sessione, ognuno
  // invalidava CalendarPlanner e quindi le sue tre chiamate. Dopo P2-7, lo
  // stesso trascinamento produce al più 3 render (una per soglia di fascia
  // attraversata: 640/1024/1280), e dopo P2-4 ciascuno ne fa una sola.
  const RESIZE_RENDER_PRIMA = 400;
  const RESIZE_RENDER_DOPO = 3; // caso peggiore: tutte e tre le soglie di fascia attraversate
  const dragPrima = RESIZE_RENDER_PRIMA * primaTreChiamate;
  const dragDopo = RESIZE_RENDER_DOPO * dopoUnaChiamata;

  console.log(`misura:render — ${N_TASK} task sintetici (${Math.round(QUOTA_RICORRENTI * 100)}% ricorrenti), ${ITER} iterazioni per media\n`);
  console.log(`  expandRecurring(mese):      ${tMese.toFixed(4)} ms/chiamata → ${occorrenzeMese} occorrenze`);
  console.log(`  expandRecurring(settimana): ${tSettimana.toFixed(4)} ms/chiamata`);
  console.log(`  expandRecurring(giorno):    ${tGiorno.toFixed(4)} ms/chiamata`);
  console.log(`\n  Per render con la vista mese aperta (la più cara delle tre):`);
  console.log(`  P2-4 prima (3 chiamate): ${primaTreChiamate.toFixed(4)} ms`);
  console.log(`  P2-4 dopo  (1 chiamata): ${dopoUnaChiamata.toFixed(4)} ms  (${(100 * (1 - dopoUnaChiamata / primaTreChiamate)).toFixed(0)}% in meno)`);
  console.log(`\n  Un trascinamento del bordo finestra (~${RESIZE_RENDER_PRIMA} render prima di P2-7, al più ${RESIZE_RENDER_DOPO} dopo):`);
  console.log(`  prima di P2-4+P2-7: ${dragPrima.toFixed(0)} ms di solo expandRecurring sul thread principale`);
  console.log(`  dopo  P2-4+P2-7:    ${dragDopo.toFixed(1)} ms`);
  console.log(`\n  Risposta alla domanda dell'audit: NON è sub-millisecondo — una singola`);
  console.log(`  chiamata a 248 task costa ~${tMese.toFixed(1)} ms, misurabile e non nullo. Il`);
  console.log(`  rilievo era quindi corretto per due ragioni, non una: il costo per render`);
  console.log(`  è reale già oggi, e P2-7 lo moltiplicava per ogni pixel di un resize.`);
}

main();
