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
import { ESLint, Linter } from 'eslint';
import {
  LetturaFallita, leggiCallSiteSalvataggio, leggiCallSiteStorico, leggiConteggioMultiComp,
  leggiStatoAudit, leggiStatoIndex, leggiStiliInline, montaggiLazySenzaRete,
  usiSalvataggio, usiStoricoTask, confronta,
  // Suggerimento strategico n. 3 dell'audit del 19 agosto: controlli che NEGANO
  // i call site mancanti invece di CONTARE quelli presenti. Vedi il blocco che
  // li introduce in convenzioni.js.
  azioniRegistry, formSenzaAttesaEsito, ricercheSenzaIndice, iterazioniQuadratiche,
  // A-1 (26 agosto): il secondo verbo di scrittura dell'app, il controllo
  // sullo stato di invio a mano, e i due perimetri dichiarati -- senza i quali
  // un atteso di 0 non distingue "nessun debito" da "non ho guardato".
  statoInvioScrittoAMano, leggiPerimetroContratto,
  // A-4: il tetto FISICO, accanto a quello di max-lines che salta i commenti.
  fileOltreTettoFisico,
  // M-1 (passo 2): la finestra sull'anagrafica e chi ne chiede il complemento.
  usiClientiCompleti, leggiCallSiteClienti,
  // A-5 (23 agosto, secondo passaggio): le forme di stile confrontate per
  // VALORE e non per nome. Vedi il blocco che le introduce in convenzioni.js.
  formeDuplicate, formeGiaInComune,
  // M-3 (26 agosto): i nomi di common.js con un suffisso di collisione,
  // cioè meccanici come gli altri ma su un valore che non hanno.
  suffissoDiCollisione,
  // B-3 (25 agosto): due nomi per un concetto solo dentro lo stesso file.
  doppioNome,
  // B-3 (26 agosto): i test stanno in cartelle che rispecchiano il sorgente.
  testSciolti,
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
  // Mancava dal registro fin dalla sua creazione — esattamente la condizione
  // che B-6 del 16 agosto aveva esteso questo elenco per impedire. Registrato
  // ora, nella stessa sessione che ne chiude B-1 e B-3: senza, l'aggiornamento
  // dei loro marcatori ⟦stato: N/9 chiusi⟧ in questo file e in INDEX.md non
  // sarebbe verificato da nessuno script.
  { file: 'AUDIT_ARCHITETTURA_2026-08-23.md', prefisso: ['C', 'A', 'M', 'B'] },
  // Registrato insieme al documento, come i tre sopra. ⚠️ Il prefisso è UNO
  // solo e non i quattro tiers: in questo audit `A-` è una sequenza
  // progressiva e la priorità sta nella propria colonna — la deviazione è
  // dichiarata in cima al documento, e la ragione è che i riferimenti A-3/A-4/
  // A-5 sono già citati dentro il codice (eslint.config.js, styles/common.js,
  // lib/realtime.js, questo stesso script).
  { file: 'AUDIT_ARCHITETTURA_2026-08-23_ii.md', prefisso: 'A' },
  // Registrato insieme al documento, come i quattro sopra: e' l'audit con tre
  // rilievi ANCORA APERTI, cioe' quello il cui marcatore ha piu' occasioni di
  // scadere. I prefissi sono due — M (media) e B (bassa) — perche' non ha
  // rilievi critici ne' di alta priorita'.
  { file: 'AUDIT_ARCHITETTURA_2026-08-25.md', prefisso: ['M', 'B'] },
  // Registrato insieme al documento, come i cinque sopra — ed e' l'audit con
  // TUTTI E UNDICI i rilievi ancora aperti, cioe' quello il cui marcatore
  // ha piu' occasioni di scadere. I prefissi sono tre: A (alta), M (media),
  // B (bassa). Nessun rilievo critico, quindi niente C.
  //
  // ⚠️ A-1 di quell'audit riguarda QUESTO script: `formSenzaAttesaEsito`
  // certifica un perimetro piu' piccolo del codice (non vede le dodici form
  // di components/liste/, che scrivono con `esegui` e non con un dispatch del
  // registry core). Finche' non e' chiuso, il controllo n. 5-bis qui sotto
  // stampa uno 0 che vale solo per il core.
  { file: 'AUDIT_ARCHITETTURA_2026-08-26.md', prefisso: ['A', 'M', 'B'] },
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

// Le costanti-oggetto dichiarate a LIVELLO DI MODULO, con il loro valore
// normalizzato (A-5). Serve ai due controlli sulle forme di stile duplicate.
//
// Passa dall'AST e non da un'espressione regolare, a differenza degli altri
// controlli testuali di questo script, e la ragione è che qui non si cerca una
// forma nel testo — si confrontano dei VALORI. `{display:"flex", gap:6}` e
// `{ gap: 6, display: 'flex' }` sono la stessa costante e devono risultare
// uguali; una regex vedrebbe due stringhe diverse e il controllo troverebbe
// solo i copia-incolla, cioè il caso più raro. `Linter` è API pubblica di
// ESLint e dà il parser (JSX compreso) senza aggiungere una dipendenza.
//
// «A livello di modulo» è parte della definizione, non un dettaglio
// dell'implementazione: una costante dentro un componente è un oggetto nuovo a
// ogni render — quello è il difetto M-1, e ha già la sua regola
// (STILE_INLINE_COSTANTE in eslint.config.js). Qui si guarda ciò che M-1 ha
// prodotto: le forme estratte fuori dal JSX, e quante volte la stessa è stata
// estratta due volte.
const SELETTORI_COSTANTI = [
  'Program > VariableDeclaration > VariableDeclarator[init.type="ObjectExpression"]',
  'Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator[init.type="ObjectExpression"]',
];

function costantiOggetto(sorgenti) {
  const linter = new Linter();
  const regola = {
    create(context) {
      const sc = context.sourceCode;
      const visita = (n) => {
        // Le proprietà ORDINATE: l'ordine in cui sono scritte non cambia ciò
        // che il browser disegna, quindi non deve cambiare l'identità della
        // forma. Spazi e virgolette uniformati per la stessa ragione.
        const valore = n.init.properties
          .map(pr => sc.getText(pr).replace(/\s+/g, ' ').replace(/"/g, "'"))
          .sort().join(', ');
        context.report({ node: n, message: JSON.stringify({ nome: n.id.name, valore: `{ ${valore} }` }) });
      };
      return Object.fromEntries(SELETTORI_COSTANTI.map(s => [s, visita]));
    },
  };
  const config = {
    files: ['**/*.js', '**/*.jsx'],
    plugins: { locale: { rules: { estrai: regola } } },
    rules: { 'locale/estrai': 'error' },
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  };
  const out = [];
  for (const { path, testo } of sorgenti) {
    for (const m of linter.verify(testo, config, path)) {
      // Gli altri messaggi sono rumore di configurazione (una direttiva
      // eslint-disable per una regola che questa config minima non carica):
      // non riguardano la misura.
      if (m.ruleId === 'locale/estrai') out.push({ path, ...JSON.parse(m.message) });
    }
  }
  return out;
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
    rimedio: 'Spezza il file oltre soglia: dal 23 agosto non ci sono deroghe (quella di state/reducer.js è stata chiusa estraendone due fette).',
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
    dichiarato: 0, misurato: senzaAttesa.fuori.length,
    rimedio: `Passa da \`useSalvataggio\` (o attendi il dispatch a mano, come ProfileEditor): ${senzaAttesa.fuori.join(', ')}`,
  });

  // ─── 5-quinquies · A-1 (audit del 26 agosto) ──────────────────────────────
  //    Lo stato di invio scritto a mano su una scrittura. Controllo a sé e non
  //    un allargamento del precedente: quello chiede «i dati digitati
  //    sopravvivono a un rifiuto?», questo «lo stato di invio viene dal
  //    contratto?» — vedi il commento di statoInvioScrittoAMano per le tre
  //    garanzie che una copia a mano non ha.
  const aMano = statoInvioScrittoAMano(sorgenti, azioni);
  controlli.push({
    nome: 'stato di invio scritto a mano', dove: 'docs/CLAUDE.md',
    dichiarato: 0, misurato: aMano.length,
    rimedio: `\`const [saving, …]\` su una scrittura: prendilo da \`useSalvataggio\` — ${aMano.join(', ')}`,
  });

  // ─── 5-sexies · il PERIMETRO, dichiarato ─────────────────────────────────
  //    A-1 e' nato da un controllo verde su un perimetro piu' piccolo del
  //    codice. Un atteso di 0 non protegge da questo: protegge dal debito che
  //    CRESCE, non dal perimetro che si RESTRINGE. Questo numero sta in
  //    docs/CLAUDE.md e rende visibile il restringimento — se una form nuova
  //    scrive in un modo che `scriveDavvero` non riconosce, il perimetro cala
  //    e il controllo lo dice, invece di continuare a stampare uno zero.
  //
  //    Vale per DUE controlli e non per uno: `statoInvioScrittoAMano` condivide
  //    `scriveDavvero` e non puo' dichiarare un perimetro proprio (il suo stato
  //    finale corretto e' zero file), quindi e' questo numero a proteggere
  //    anche lui. Vedi il commento di quella funzione.
  controlli.push({
    nome: 'form nel perimetro del contratto', dove: 'docs/CLAUDE.md',
    dichiarato: leggiPerimetroContratto(claudeMd), misurato: senzaAttesa.perimetro.length,
    rimedio: `Aggiorna la frase «il contratto «salva e chiudi» guarda N form» (misurati: ${senzaAttesa.perimetro.join(', ')}).`,
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

  // A-4 · Il tetto FISICO. `max-lines` misura con `skipComments: true`, e i
  // commenti qui sono il 28% delle righe: il suo tetto di 500 lasciava passare
  // un file da 1001. Questo misura ciò che si apre. La soglia è un ratchet
  // (vedi il docblock di fileOltreTettoFisico): si abbassa a elenco vuoto.
  const TETTO_FISICO = 850;
  const troppoLunghi = fileOltreTettoFisico(sorgenti, TETTO_FISICO);
  controlli.push({
    nome: `file oltre ${TETTO_FISICO} righe fisiche`, dove: 'scripts/verifica-convenzioni/convenzioni.js',
    dichiarato: 0, misurato: troppoLunghi.length,
    rimedio: `La parte NARRATIVA (com'era prima, quale audit lo ha cambiato) va in docs/, non cancellata: ${troppoLunghi.map(f => `${f.path} (${f.righe})`).join(', ')}`,
  });

  // 5-quinquies e 5-sexies · le forme di stile duplicate (A-5). Stessa
  //    famiglia dei tre qui sopra: l'atteso è 0. La soglia è quella che
  //    `src/styles/common.js` dichiara di se stesso in cima — «le forme che
  //    ricorrono in tre o più file» — e fino al 23 agosto era applicata a
  //    occhio, confrontando i nomi: quattro forme la superavano senza che
  //    nessuno le vedesse, e due file riscrivevano alla lettera una forma che
  //    common.js aveva già.
  const costanti = costantiOggetto(sorgenti);
  const fuoriDagliStili = costanti.filter(c => !c.path.startsWith('src/styles/'));
  const inComune = costanti.filter(c => c.path === 'src/styles/common.js');

  const duplicate = formeDuplicate(fuoriDagliStili);
  controlli.push({
    nome: 'forme di stile identiche in 3+ file', dove: 'src/styles/common.js («tre o più file»)',
    dichiarato: 0, misurato: duplicate.length,
    rimedio: `Promuovi la forma in src/styles/common.js e importane il namespace: ${duplicate.join(' | ')}`,
  });

  const gia = formeGiaInComune(fuoriDagliStili, inComune);
  controlli.push({
    nome: 'forme già in common.js riscritte altrove', dove: 'src/styles/common.js',
    dichiarato: 0, misurato: gia.length,
    rimedio: `Usa quella condivisa invece di ridefinirla: ${gia.join(' | ')}`,
  });

  // 5-octies · M-3 (audit del 26 agosto). Terzo della famiglia degli stili, e
  //    l'unico che guarda i NOMI invece dei valori. `rowGap62` non è «gap 62»:
  //    è «la seconda forma che somigliava a rowGap6», su un modulo che 85 file
  //    importano. Il predicato è relazionale (il nome senza l'ultima cifra è
  //    un altro nome esportato) e non sintattico, perché `rowGap4` e `txtF13`
  //    hanno cifre che significano qualcosa e devono restare — vedi il
  //    preambolo di `suffissoDiCollisione`.
  const collisioni = suffissoDiCollisione(inComune);
  controlli.push({
    nome: 'nomi di stile con suffisso di collisione', dove: 'src/styles/common.js (fan-in 85)',
    dichiarato: 0, misurato: collisioni.length,
    rimedio: `Dai alla forma il nome del suo RUOLO, non un numero progressivo: ${collisioni.join(' | ')}`,
  });

  // 5-nonies · B-3 (audit del 26 agosto). I 146 file di test erano tutti allo
  //    stesso livello, e la loro struttura viveva nei prefissi dei nomi — dove
  //    nessuno strumento la vede. Ora rispecchiano le cartelle del sorgente, e
  //    questo controllo è ciò che impedisce alla cartella di tornare piatta un
  //    file per volta: è già successo a `components/` dopo la stessa
  //    operazione (B-1 del 25 agosto).
  const sciolti = testSciolti(
    (await readdir('src/test', { withFileTypes: true }))
      .filter(v => v.isFile()).map(v => v.name));
  controlli.push({
    nome: 'test sciolti in src/test/', dove: 'src/test/ (una cartella per area)',
    dichiarato: 0, misurato: sciolti.length,
    rimedio: `Spostali nella cartella dell'area che verificano: ${sciolti.join(', ')}`,
  });

  // 5-septies · B-3 (audit del 25 agosto). La lingua degli identificatori è
  //    decisa in docs/CLAUDE.md; qui si misura il suo caso peggiore, cioè la
  //    stessa cosa chiamata in due modi nello stesso file. L'atteso è 0, e le
  //    coppie sono un elenco ESPLICITO (COPPIE_SINONIME): niente euristica
  //    sulla lingua, quindi niente falsi positivi da imparare a saltare.
  const doppi = doppioNome(sorgenti);
  controlli.push({
    nome: 'doppio nome per lo stesso concetto', dove: 'docs/CLAUDE.md (lingua degli identificatori)',
    dichiarato: 0, misurato: doppi.length,
    rimedio: `Un concetto, un nome — e in italiano se lo scegliamo noi: ${doppi.join(' | ')}`,
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
