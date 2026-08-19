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
import { readFile, readdir } from 'node:fs/promises';
import { ESLint } from 'eslint';
import {
  LetturaFallita, leggiCallSiteSalvataggio, leggiCallSiteStorico, leggiConteggioMultiComp,
  leggiStatoAudit, leggiStatoIndex, leggiStiliInline, montaggiLazySenzaRete,
  usiSalvataggio, usiStoricoTask, confronta,
  // Suggerimento strategico n. 3 dell'audit del 19 agosto: controlli che NEGANO
  // i call site mancanti invece di CONTARE quelli presenti. Vedi il blocco che
  // li introduce in convenzioni.js.
  azioniRegistry, formSenzaAttesaEsito, ricercheSenzaIndice, iterazioniQuadratiche,
  // M-1 (passo 2): la finestra sull'anagrafica e chi ne chiede il complemento.
  usiClientiCompleti, leggiCallSiteClienti,
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
  // B-6 dell'audit del 16 agosto: questi due mancavano dal registro, quindi il
  // loro ⟦stato: N/M chiusi⟧ in INDEX.md non lo verificava nessuno — un
  // marcatore machine-readable che nessuna macchina legge è una nota a
  // margine, e l'audit del 15 agosto è quello con più rilievi ANCORA APERTI.
  { file: 'AUDIT_ARCHITETTURA_2026-08-15.md', prefisso: ['C', 'A', 'M', 'B'] },
  { file: 'AUDIT_ARCHITETTURA_2026-08-16.md', prefisso: ['C', 'A', 'M', 'B'] },
  // Registrato insieme al documento, non dopo: è la lezione di B-6/B-7 sopra —
  // un audit fuori dal registro ha un ⟦stato: N/M chiusi⟧ che nessuno verifica,
  // e questo è quello con tutti gli undici rilievi ancora aperti.
  { file: 'AUDIT_PERFORMANCE_UX_2026-08-16_ii.md', prefisso: ['C', 'A', 'M', 'B'] },
  // Stessa regola di sopra, applicata alla riga che la enuncia: registrato
  // insieme al documento. È l'audit con tutti e nove i rilievi ancora aperti,
  // cioè quello in cui il marcatore di INDEX.md ha più occasioni di scadere.
  { file: 'AUDIT_PERFORMANCE_UX_2026-08-19.md', prefisso: ['C', 'A', 'M', 'B'] },
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

// I sorgenti dell'app, esclusi i test: una sonda che monta un `lazy()` apposta
// per farlo fallire (src/test/lazyPanel.test.jsx) non è un punto di montaggio
// dell'app, ed è anzi il test di questo stesso controllo.
async function sorgentiApp(dir = 'src') {
  const voci = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const v of voci) {
    const path = `${dir}/${v.name}`;
    if (v.isDirectory()) {
      if (v.name === 'test') continue;
      out.push(...await sorgentiApp(path));
    } else if (/\.jsx?$/.test(v.name)) {
      out.push({ path, testo: await readFile(path, 'utf8') });
    }
  }
  return out;
}

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

  // 4. `lazy()` senza rete di sicurezza (A-1 dell'audit performance/UX del 16
  //    agosto, secondo passaggio). A differenza dei tre sopra non confronta un
  //    numero scritto in un documento: l'atteso è zero e non è negoziabile —
  //    un punto di montaggio scoperto non è una cifra che invecchia, è un
  //    deploy che porta via l'app a chi ha la scheda aperta. L'elenco dei file
  //    in violazione finisce nel rimedio, così il messaggio dice DOVE.
  const sorgenti = await sorgentiApp();
  const scoperti = montaggiLazySenzaRete(sorgenti);
  controlli.push({
    nome: 'lazy() senza boundary', dove: 'docs/CLAUDE.md',
    dichiarato: 0, misurato: scoperti.length,
    rimedio: `Monta con components/ui/LazyPanel.jsx (Suspense + boundary insieme): ${scoperti.join(', ')}`,
  });

  // 5. Call site del contratto «salva e chiudi» (A-2/M-1/M-4). Qui il numero
  //    torna a essere un numero dichiarato, non un atteso: serve a far rumore
  //    quando un form smette di passare dall'hook. Che i form NON si chiudano
  //    prima di conoscere l'esito lo verificano i test, non un sorgente letto
  //    a stringhe — vedi il commento di `usiSalvataggio`.
  const salvataggi = usiSalvataggio(sorgenti);
  controlli.push({
    nome: 'call site di useSalvataggio', dove: 'docs/CLAUDE.md',
    dichiarato: leggiCallSiteSalvataggio(claudeMd), misurato: salvataggi.length,
    rimedio: `Aggiorna la frase «N call site usano \`useSalvataggio\`» (misurati: ${salvataggi.join(', ')}).`,
  });

  // ─── 5-bis, 5-ter, 5-quater · i controlli che NEGANO ─────────────────────
  //    (suggerimento strategico n. 3 dell'audit performance/UX del 19 agosto)
  //
  //    L'atteso è 0 e non un numero dichiarato in un documento, che è tutta la
  //    differenza: un controllo che conta scade quando l'app cresce («3 call
  //    site» era vero quando è stato scritto, e i form erano nove), uno che
  //    nega no. Stessa forma di `lazy() senza boundary` qui sopra, e stessa
  //    onestà: ognuno SOLLEVA se non trova il proprio presupposto, invece di
  //    passare a vuoto.
  const azioni = azioniRegistry(await readFile('src/state/persistence.js', 'utf8'));

  const senzaAttesa = formSenzaAttesaEsito(sorgenti, azioni);
  controlli.push({
    nome: 'form che scrivono senza attendere l\'esito', dove: 'docs/CLAUDE.md',
    dichiarato: 0, misurato: senzaAttesa.length,
    rimedio: `Passa da \`useSalvataggio\` (o attendi il dispatch a mano, come ProfileEditor): ${senzaAttesa.join(', ')}`,
  });

  const senzaIndice = ricercheSenzaIndice(sorgenti);
  controlli.push({
    nome: 'ricerche che normalizzano a ogni battuta', dove: 'docs/CLAUDE.md',
    dichiarato: 0, misurato: senzaIndice.length,
    rimedio: `Usa \`indicizza\` + \`matchIndice\` invece di \`matchTermini\` dentro il useMemo: ${senzaIndice.join(', ')}`,
  });

  const quadratiche = iterazioniQuadratiche(sorgenti);
  controlli.push({
    nome: 'indexOf/findIndex dentro una .map()', dove: 'docs/CLAUDE.md',
    dichiarato: 0, misurato: quadratiche.length,
    rimedio: `O(n²) per render: l'indice ce l'ha già la callback di map, o si porta dietro dalla costruzione della lista: ${quadratiche.join(', ')}`,
  });

  // 6. Viste che chiedono il corpus intero dei task (A-3). Stesso mestiere del
  //    controllo qui sopra, su un equilibrio che si rompe in DUE direzioni: una
  //    vista in più annulla la finestra dell'idratazione lasciandone in piedi
  //    il codice, una in meno mostra un conteggio parziale come se fosse un
  //    totale. Quale sia il numero giusto lo decide l'elenco motivato in
  //    `src/state/StoricoTaskContext.jsx`; qui si fa rumore quando cambia.
  const storico = usiStoricoTask(sorgenti);
  controlli.push({
    nome: 'viste che chiedono lo storico', dove: 'docs/CLAUDE.md',
    dichiarato: leggiCallSiteStorico(claudeMd), misurato: storico.length,
    rimedio: `Aggiorna la frase «N viste chiedono \`useStoricoTaskCompleto\`» (misurate: ${storico.join(', ')}).`,
  });

  // 6-bis. Viste che chiedono l'anagrafica INTERA (M-1, passo 2). Gemello del
  //    controllo qui sopra, e si rompe nelle stesse due direzioni: una vista
  //    di troppo annulla la finestra, una in meno mostra un elenco parziale
  //    come se fosse tutto.
  const clienti = usiClientiCompleti(sorgenti);
  controlli.push({
    nome: 'viste che chiedono l\'anagrafica', dove: 'docs/CLAUDE.md',
    dichiarato: leggiCallSiteClienti(claudeMd), misurato: clienti.length,
    rimedio: `Aggiorna la frase «N viste chiedono \`useClientiCompleti\`» (misurate: ${clienti.join(', ')}).`,
  });

  // 7. Stato dei rilievi: quello che l'indice dichiara contro quello che il
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
