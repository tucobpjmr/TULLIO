#!/usr/bin/env node
// scripts/verifica-convenzioni/index.js
//
// Fa fallire la CI quando un numero scritto in docs/ non è più quello misurato.
//
// PERCHÉ ESISTE (ST-13). `docs/CLAUDE.md` ha portato «19 no-multi-comp in 12
// file» per due sessioni dopo che erano 20 in 10, e `docs/INDEX.md` ha dato per
// aperti cinque rilievi P2 che erano chiusi. Sono inezie in sé, ma sono la
// stessa crepa che l'audit del 7 agosto ha classificato ALTA quando riguardava
// la sicurezza: un documento che afferma qualcosa di falso viene creduto. La
// correzione strutturale non è riscrivere i numeri a mano un'altra volta — è
// farli scadere in modo RUMOROSO invece che silenzioso, come già fanno
// verifica-rpc/ per le RPC e verifica-advisor/ per i lint di Supabase.
//
//   npm run verifica:convenzioni
//
// Non richiede rete né credenziali: misura questo repo. Esce 1 su qualunque
// divergenza, 2 su un errore imprevisto.
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';
import {
  LetturaFallita, leggiConteggioMultiComp, leggiStatoAudit, leggiStatoIndex,
  leggiStiliInline, confronta,
} from './convenzioni.js';

// Gli audit sotto controllo: nome del file, prefisso dei suoi rilievi.
const AUDIT = [
  { file: 'AUDIT_STRUTTURA_2026-08-10.md', prefisso: 'ST' },
  { file: 'AUDIT_PERFORMANCE_2026-08.md', prefisso: 'P2' },
  // Quattro prefissi in una tabella sola: Critici, Alta, Media, Bassa.
  { file: 'AUDIT_ARCHITETTURA_2026-08-12.md', prefisso: ['C', 'A', 'M', 'B'] },
  { file: 'AUDIT_ARCHITETTURA_2026-08-14.md', prefisso: ['C', 'A', 'M', 'B'] },
  { file: 'AUDIT_ARCHITETTURA_2026-08-14_ii.md', prefisso: ['C', 'A', 'M', 'B'] },
  { file: 'AUDIT_ARCHITETTURA_2026-08-14_iii.md', prefisso: ['C', 'A', 'M', 'B'] },
];

// Misura i warning di una regola sul sorgente dell'app.
//
// Si usa l'API di ESLint e non un parsing dell'output testuale: il formato
// dell'output è di presentazione e cambia fra versioni, mentre i risultati sono
// il contratto. È anche il motivo per cui questo script può dire QUANTI FILE,
// che dal testo si conterebbe a occhio.
async function misuraRegola(regola) {
  const eslint = new ESLint();
  const risultati = await eslint.lintFiles(['src', 'scripts', 'eslint.config.js']);
  let casi = 0;
  const file = new Set();
  for (const r of risultati) {
    const suoi = r.messages.filter(m => m.ruleId === regola);
    if (suoi.length === 0) continue;
    casi += suoi.length;
    file.add(r.filePath);
  }
  return { casi, file: file.size };
}

// Conta i nodi che corrispondono a un selettore, riusando il parser di ESLint
// invece di aggiungere un parser JSX a questo script.
//
// La regola `no-restricted-syntax` della configurazione del progetto viene
// sovrascritta per questa istanza: qui serve contare TUTTI gli `style={{…}}`,
// mentre quella in eslint.config.js segnala solo i costanti (che sono zero).
async function contaSelettore(selettore) {
  const eslint = new ESLint({
    overrideConfig: {
      rules: { 'no-restricted-syntax': ['warn', { selector: selettore, message: 'conteggio' }] },
    },
  });
  const risultati = await eslint.lintFiles(['src']);
  return risultati.reduce(
    (n, r) => n + r.messages.filter(m => m.ruleId === 'no-restricted-syntax').length, 0);
}

// Ogni oggetto letterale passato a un attributo `style`. Dopo M-1 sono per
// costruzione tutti dinamici: quelli costanti sono costanti di modulo, e la
// regola in eslint.config.js impedisce che ne rientrino.
const STILE_INLINE = "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression";

async function main() {
  const claudeMd = await readFile('docs/CLAUDE.md', 'utf8');
  const indexMd = await readFile('docs/INDEX.md', 'utf8');

  const controlli = [];

  // 1. react/no-multi-comp — l'arretrato dichiarato, che è un numero vivo.
  const multiCompDichiarato = leggiConteggioMultiComp(claudeMd);
  const multiCompMisurato = await misuraRegola('react/no-multi-comp');
  controlli.push({
    nome: 'no-multi-comp (casi)', dove: 'docs/CLAUDE.md',
    dichiarato: multiCompDichiarato.casi, misurato: multiCompMisurato.casi,
    rimedio: 'Aggiorna la frase «N casi aperti in M file» (o chiudi i casi).',
  });
  controlli.push({
    nome: 'no-multi-comp (file)', dove: 'docs/CLAUDE.md',
    dichiarato: multiCompDichiarato.file, misurato: multiCompMisurato.file,
    rimedio: 'Aggiorna la frase «N casi aperti in M file» (o chiudi i casi).',
  });

  // 2. max-lines — CLAUDE.md lo dichiara un ERRORE a zero violazioni, ed è
  //    quella la ragione per cui è un errore e non un warning. Se smette di
  //    essere zero, la frase nel documento diventa falsa.
  const maxLines = await misuraRegola('max-lines');
  controlli.push({
    nome: 'max-lines (violazioni)', dove: 'docs/CLAUDE.md («a zero violazioni»)',
    dichiarato: 0, misurato: maxLines.casi,
    rimedio: 'Spezza il file oltre soglia: la deroga dichiarata è una sola (state/reducer.js).',
  });

  // 3. Stili inline (M-1). Il numero che è stato riscritto a mano in quattro
  //    documenti per tre sessioni di fila: 1.528 → 1.487 → 335. Ora si misura.
  const stiliDichiarati = leggiStiliInline(claudeMd);
  const stiliMisurati = await contaSelettore(STILE_INLINE);
  controlli.push({
    nome: 'style inline (dinamici)', dove: 'docs/CLAUDE.md',
    dichiarato: stiliDichiarati, misurato: stiliMisurati,
    rimedio: 'Aggiorna la frase «N style inline dinamici» in docs/CLAUDE.md.',
  });

  // 4. Stato dei rilievi: quello che l'indice dichiara contro quello che il
  //    documento di audit porta nella propria tabella delle priorità.
  for (const { file, prefisso } of AUDIT) {
    const testo = await readFile(`docs/${file}`, 'utf8');
    const misurato = leggiStatoAudit(testo, prefisso);
    const dichiarato = leggiStatoIndex(indexMd, file);
    controlli.push({
      nome: `${file} (rilievi chiusi)`, dove: 'docs/INDEX.md',
      dichiarato: dichiarato.chiusi, misurato: misurato.chiusi,
      rimedio: `Aggiorna ⟦stato: N/${misurato.totale} chiusi⟧ sulla riga di ${file}.`,
    });
    controlli.push({
      nome: `${file} (rilievi totali)`, dove: 'docs/INDEX.md',
      dichiarato: dichiarato.totale, misurato: misurato.totale,
      rimedio: `Aggiorna ⟦stato: ${misurato.chiusi}/M chiusi⟧ sulla riga di ${file}.`,
    });
  }

  const scarti = confronta(controlli);

  for (const c of controlli) {
    const ok = c.dichiarato === c.misurato;
    console.log(`  ${ok ? '✓' : '✗'} ${c.nome}: ${c.misurato}`);
  }

  if (scarti.length > 0) {
    console.error('\nLa realtà e i documenti divergono. La DIVERGENZA è il difetto, non il numero:\n');
    for (const s of scarti) console.error(`  ✗ ${s}`);
    console.error('\nDecidi da che parte sta l\'errore — nel documento o nel codice — e correggi quella.');
    process.exit(1);
  }

  console.log(`\n${controlli.length} controlli, nessuna divergenza.`);
}

main().catch((e) => {
  if (e instanceof LetturaFallita) {
    console.error(`Verifica non eseguibile: ${e.message}`);
    process.exit(1);
  }
  console.error(`Errore imprevisto durante la verifica delle convenzioni: ${e.stack || e.message}`);
  process.exit(2);
});
