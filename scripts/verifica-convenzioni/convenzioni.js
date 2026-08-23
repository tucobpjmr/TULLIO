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
 * Legge da docs/CLAUDE.md quanti `style={{…}}` inline restano, nella forma
 * «N style inline dinamici».
 *
 * È il numero di M-1 (audit del 12 agosto), ed è il candidato ideale a
 * marcire: 1.528 → 1.487 → 335 in tre sessioni, ogni volta riscritto a mano in
 * quattro documenti. Misurarlo costa una regola ESLint già scritta.
 */
export function leggiStiliInline(testo) {
  const m = /(\d+)\s+style inline dinamici/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «N style inline dinamici». Se è ' +
      'stata riscritta, aggiorna QUESTO script insieme al documento: un ' +
      'controllo che non trova più il proprio pattern smette di controllare ' +
      'in silenzio.');
  }
  return Number(m[1]);
}

/**
 * Stato dei rilievi di un audit, letto dalla sua tabella delle priorità.
 * Una riga è `| ST-6 | Media | … |` oppure `| **M-1** ✔ | … |`; un rilievo
 * chiuso porta `✔` nella riga (la convenzione del repo è `~~Media~~ ✔
 * **risolto**`).
 *
 * `prefisso` può essere un elenco: un audit può numerare i rilievi con più
 * prefissi (C, A, M, B in quello del 12 agosto) e il numero che INDEX.md
 * dichiara è il totale.
 *
 * Si conta per IDENTIFICATIVO, non per riga: un documento può nominare lo
 * stesso rilievo in due tabelle (la priorità e il dettaglio delle correzioni),
 * ed è quel che fa AUDIT_STRUTTURA — contando le righe i suoi quindici rilievi
 * diventavano ventinove.
 */
export function leggiStatoAudit(testo, prefisso) {
  const prefissi = Array.isArray(prefisso) ? prefisso : [prefisso];
  // La prima cella deve APRIRE con l'identificativo; quel che segue (✔, ⚙,
  // «(parte 2 di 2)») è libero, perché un rilievo ancora aperto porta un
  // marcatore diverso da ✔ e non deve sparire dal totale.
  const re = new RegExp(`^\\|\\s*\\*{0,2}((?:${prefissi.join("|")})-\\d+)\\*{0,2}[^|]*\\|`);
  const perId = new Map();
  for (const riga of testo.split("\n")) {
    const m = re.exec(riga);
    if (!m) continue;
    perId.set(m[1], (perId.get(m[1]) || false) || riga.includes("✔"));
  }
  if (perId.size === 0) {
    throw new LetturaFallita(
      `Nessuna riga di tabella «| ${prefissi.join("/")}-N |» trovata nel documento: la ` +
      'tabella delle priorità è la fonte di questo controllo e senza di essa ' +
      'non c\'è niente da confrontare.');
  }
  return { totale: perId.size, chiusi: [...perId.values()].filter(Boolean).length };
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
 * I file che montano un componente `lazy()` senza avere in casa una rete di
 * sicurezza (A-1 dell'audit performance/UX del 16 agosto, secondo passaggio).
 *
 * PERCHÉ ESISTE. `Suspense` gestisce l'attesa, non l'errore: un chunk che
 * risponde 404 — cosa che succede a ogni deploy con una scheda aperta — fa
 * salire l'eccezione fino al primo boundary sopra di sé, che per sette dei
 * nove punti di montaggio dell'app era il boundary della VISTA (si perde la
 * vista per non aver aperto un modale) o quello di `main.jsx` (si perde
 * l'intera app). Il rimedio è `components/ui/LazyPanel.jsx`, che compone i due
 * pezzi; questo controllo esiste perché il decimo call site non possa
 * ricominciare da capo.
 *
 * ⚠️ È un controllo PER FILE e non per punto di montaggio, e la scelta è
 * deliberata: sapere se un dato `<Suspense>` abbia un antenato boundary
 * richiede di risalire l'albero JSX — e attraverso i confini di file, dove un
 * sorgente non arriva. La domanda "questo file monta un lazy e non nomina
 * nessuna rete di sicurezza" si risponde invece con certezza, ed è vera
 * esattamente nei casi che il rilievo descrive. Il costo è un falso negativo
 * possibile (un file che importa `LazyPanel` per un pannello e lascia un
 * secondo `Suspense` nudo per un altro); il test di `lazyPanel.test.jsx`
 * copre quello che questo controllo non vede.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]} i percorsi in violazione (vuoto = tutto a posto)
 */
export function montaggiLazySenzaRete(sorgenti) {
  // L'IMPORT di `lazy` da react, non la sua chiamata: `/\blazy\s*\(/` sembra
  // il controllo più diretto ma prende anche la prosa dei commenti — «lo
  // spinner mostrato mentre un chunk lazy (AdminView, …) viene scaricato» in
  // ui/LazyFallback.jsx, che è il file del FALLBACK e non monta niente. Il
  // primo giro di questo controllo lo ha segnalato davvero. L'import invece
  // c'è se e solo se il file può montare un lazy, e non può restare per
  // sbaglio: `no-unused-vars` lo toglierebbe.
  const IMPORTA_LAZY = /import\s*\{[^}]*\blazy\b[^}]*\}\s*from\s*["']react["']/;
  // `ErrorBoundary` è sottostringa di ViewErrorBoundary e OverlayErrorBoundary,
  // quindi questa alternativa da sola copre tutte e tre — più il boundary di
  // PRIMO livello, che è la rete giusta dell'unico montaggio in cui il chunk è
  // l'app intera (auth/AuthGate.jsx, B-1): lì non esiste "il resto dell'app" in
  // cui rientrare, e la pagina con "Ricarica" è la sola uscita. La condizione
  // verificata resta la stessa — un `lazy()` e un boundary nello stesso file.
  const HA_RETE = /LazyPanel|ErrorBoundary/;
  const conLazy = (sorgenti || []).filter(f => IMPORTA_LAZY.test(f.testo));
  // Stessa regola non negoziabile del resto del file: se NESSUN file chiama
  // `lazy()`, questo controllo non ha verificato niente — e passerebbe.
  if (conLazy.length === 0) {
    throw new LetturaFallita(
      'Nessun file che importi `lazy` da react trovato in src/: il code splitting è la ' +
      'premessa di questo controllo e senza di esso non c\'è niente da verificare.');
  }
  return conLazy.filter(f => !HA_RETE.test(f.testo)).map(f => f.path);
}

/**
 * Il numero di call site di `useSalvataggio` dichiarato in docs/CLAUDE.md
 * (A-2/M-1/M-4 dell'audit performance/UX del 16 agosto, secondo passaggio).
 */
export function leggiCallSiteSalvataggio(testo) {
  const m = /(\d+)\s+call site usano\s+`useSalvataggio`/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «N call site usano `useSalvataggio`». ' +
      'Se è stata riscritta, aggiorna QUESTO script insieme al documento.');
  }
  return Number(m[1]);
}

/**
 * I file dell'app che usano il contratto «salva e chiudi».
 *
 * PERCHÉ ESISTE, e cosa NON fa. A differenza di `montaggiLazySenzaRete` questo
 * non è un controllo di correttezza: «questo form si chiude prima di conoscere
 * l'esito della scrittura» non è una domanda a cui un sorgente risponda da
 * solo — dipende da chi passa `onSave`, da cosa quel `onSave` attende e da chi
 * chiama `setModal(null)`, cioè da tre file diversi. Quella proprietà la
 * fissano i test di `salvaEChiudi.test.jsx`, che la osservano invece di
 * dedurla.
 *
 * Questo tiene onesto il NUMERO scritto nel documento, che è il mestiere di
 * questo script: se un form viene riscritto a mano e smette di passare
 * dall'hook, il conteggio scende e la CI lo dice — invece di lasciare in
 * `docs/CLAUDE.md` una regola che il codice non applica più, che è esattamente
 * il modo in cui il rilievo era nato.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]} i percorsi che importano l'hook
 */
export function usiSalvataggio(sorgenti) {
  const IMPORTA = /import\s*\{[^}]*\buseSalvataggio\b[^}]*\}\s*from/;
  const usi = (sorgenti || []).filter(f => IMPORTA.test(f.testo)).map(f => f.path);
  if (usi.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ importa `useSalvataggio`: o l\'hook è stato rimosso, o ' +
      'la forma dell\'import è cambiata. In entrambi i casi questo controllo non ' +
      'sta più verificando niente.');
  }
  return usi;
}

/**
 * Il numero di viste che chiedono lo storico INTERO dei task, dichiarato in
 * docs/CLAUDE.md (A-3 dell'audit performance/UX del 16 agosto, secondo
 * passaggio).
 */
export function leggiCallSiteStorico(testo) {
  const m = /(\d+)\s+viste chiedono\s+`useStoricoTaskCompleto`/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «N viste chiedono `useStoricoTaskCompleto`». ' +
      'Se è stata riscritta, aggiorna QUESTO script insieme al documento.');
  }
  return Number(m[1]);
}

/**
 * Le viste che dichiarano di aver bisogno del corpus intero dei task.
 *
 * PERCHÉ IL NUMERO VA TENUTO ONESTO, e perché in ENTRAMBE le direzioni. A-3
 * vive su un equilibrio che nessuna delle due metà protegge da sola:
 *
 *  • una vista di TROPPO — la Dashboard, il Calendario, una scheda cliente —
 *    annulla il rilievo lasciandone in piedi tutto il codice. L'app tornerebbe
 *    a scaricare lo storico intero a ogni avvio, e non fallirebbe niente:
 *    sarebbe solo di nuovo lenta, con dentro un modulo che dichiara di aver
 *    risolto il problema.
 *  • una vista di MENO — un tab nuovo che conta le task completate senza
 *    chiedere il corpus — mostra un numero plausibile e sbagliato, che è il
 *    difetto peggiore dei due.
 *
 * Come per `usiSalvataggio`, questo NON verifica che le viste giuste siano
 * quelle giuste: l'elenco motivato sta in `state/StoricoTaskContext.jsx` e il
 * comportamento è verificato dai test. Qui si fa scadere il numero in modo
 * rumoroso, che è il mestiere di questo script.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]} i percorsi che importano l'hook
 */
export function usiStoricoTask(sorgenti) {
  const IMPORTA = /import\s*\{[^}]*\buseStoricoTaskCompleto\b[^}]*\}\s*from/;
  const usi = (sorgenti || []).filter(f => IMPORTA.test(f.testo)).map(f => f.path);
  if (usi.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ importa `useStoricoTaskCompleto`: o l\'hook è stato rimosso, ' +
      'o la forma dell\'import è cambiata. In entrambi i casi la finestra ' +
      'dell\'idratazione (A-3) non ha più nessuno che ne carichi il complemento.');
  }
  return usi;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CONTROLLI CHE NEGANO, NON CHE CONTANO
//  (suggerimento strategico n. 3 dell'audit performance/UX del 19 agosto)
// ═══════════════════════════════════════════════════════════════════════════
//
// I controlli qui sopra fanno due mestieri diversi, e la differenza è la
// ragione per cui esiste questa sezione:
//
//   • `usiSalvataggio` e `usiStoricoTask` CONTANO i call site e li confrontano
//     con un numero scritto in docs/CLAUDE.md. Tengono onesto il numero. Non
//     hanno intercettato A-4 e A-2 dell'audit del 19 agosto, e NON POTEVANO:
//     «3 call site usano useSalvataggio» era vero quando è stato scritto — il
//     difetto era che i form fossero nove.
//   • `montaggiLazySenzaRete` NEGA: cerca un `lazy()` che non abbia un
//     boundary e fallisce se ne trova uno. Non ha bisogno di sapere quanti
//     dovrebbero essercene, quindi non scade quando l'app cresce.
//
// Il secondo tipo chiude una CATEGORIA; il primo la documenta. Quattro dei
// nove rilievi del 19 agosto avevano la stessa forma — «una regola giusta,
// con un file suo e un commento che la spiega, applicata a una parte dei call
// site» — e per la terza volta in tre audit consecutivi. È il salto che
// `no-restricted-imports` ha già fatto per il bundle: dal ricordarsi al non
// poter più sbagliare.
//
// ⚠️ COSA QUESTI CONTROLLI NON FANNO. Nessuno di loro verifica un
// COMPORTAMENTO: «questo form si chiude prima di conoscere l'esito» dipende da
// tre file diversi e lo fissano i test (`salvaEChiudi*.test.jsx`). Qui si
// verifica una FORMA riconoscibile sul sorgente — la stessa cosa che fa
// `montaggiLazySenzaRete`, e con lo stesso limite: un file può passare questi
// controlli ed essere comunque sbagliato. Servono a impedire la ricaduta di un
// difetto già visto, non a dimostrare che non ce ne siano altri.
//
// ⛔ E nessuno di loro deve essere calibrato ALLARGANDO le eccezioni quando
// diventa rosso: un controllo con una lista di eccezioni che cresce è un
// controllo che ha smesso di controllare (vedi `AVVISI_ACCETTATI` in
// verifica-advisor, dove le eccezioni sono nove e ognuna ha un perché scritto).

/**
 * I tipi d'azione dichiarati nel registry di persistenza, letti dal SORGENTE.
 *
 * Non una lista scritta a mano: sarebbe la seconda copia di un elenco che vive
 * già in `state/persistence.js`, e la copia che diverge in silenzio è
 * esattamente il modo in cui questi controlli smettono di controllare (stessa
 * scelta di `persistenceGuards.test.js`, che legge i `case` dal reducer invece
 * di elencarli).
 *
 * @param {string} testo il sorgente di src/state/persistence.js
 * @returns {string[]}
 */
export function azioniRegistry(testo) {
  const azioni = [...String(testo).matchAll(/^ {2}([A-Z][A-Z_0-9]+):\s*\{/gm)].map(m => m[1]);
  if (azioni.length === 0) {
    throw new LetturaFallita(
      'Nessuna entry trovata in src/state/persistence.js: o il registry ha ' +
      'cambiato forma, o il file non è quello. In entrambi i casi i controlli ' +
      'che dipendono da questo elenco passerebbero a vuoto.');
  }
  return azioni;
}

/**
 * A-4 · I form che scrivono e non aspettano l'esito.
 *
 * LA FORMA CERCATA, e perché è questa. Un file che importa `validaCampi` ha un
 * form con dei campi obbligatori — cioè dati digitati che vale la pena
 * validare. Se quello stesso file dispatcha un'azione del registry di
 * persistenza, quella scrittura può essere RIFIUTATA (RLS, rete, guard), e
 * allora i dati digitati devono sopravvivere al rifiuto. Le due strade
 * accettate sono `useSalvataggio` (il contratto) o l'attesa a mano (`await
 * dispatch(`), che è ciò che `ProfileEditor` e le tab del BulkTaskCreator
 * facevano già bene prima che l'hook esistesse.
 *
 * ⚠️ Il predicato è «valida E scrive», non «scrive»: una `DELETE_CLIENT`
 * dispatchata da una conferma e seguita da `chiudiOverlay()` NON è il difetto —
 * non c'è niente di digitato da perdere, e l'ottimistico con rollback e toast è
 * il pattern giusto per quel caso. Restringere a chi ha un form è ciò che
 * separa i sei call site del rilievo dai molti che vanno bene così.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @param {string[]} azioni i tipi del registry (vedi azioniRegistry)
 * @returns {string[]} i percorsi che scrivono senza attendere
 */
export function formSenzaAttesaEsito(sorgenti, azioni) {
  const HA_FORM = /import\s*\{[^}]*\bvalidaCampi\b[^}]*\}\s*from/;
  const ATTENDE = /\buseSalvataggio\b|await\s+dispatch\s*\(/;
  const SCRIVE = new RegExp(
    `dispatch\\(\\s*\\{\\s*type:\\s*["'](?:${azioni.join('|')})["']`);
  const conForm = (sorgenti || []).filter(f => HA_FORM.test(f.testo));
  if (conForm.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ importa `validaCampi`: o la validazione inline è ' +
      'stata rimossa, o la forma dell\'import è cambiata. Senza, questo ' +
      'controllo non ha più nessun form da guardare.');
  }
  return conForm
    .filter(f => SCRIVE.test(f.testo) && !ATTENDE.test(f.testo))
    .map(f => f.path);
}

/**
 * A-2 · Le ricerche che normalizzano a ogni battuta.
 *
 * `matchTermini` normalizza i campi della riga a ogni confronto; dentro un
 * `useMemo` che ha la query fra le dipendenze quel lavoro si rifà per intero a
 * ogni carattere digitato, su tutte le righe. La forma giusta è l'indice
 * precalcolato (`indicizza` una volta per riga, `matchIndice` per battuta):
 * misurato 6,32 ms → 0,19 su 835 clienti (M-3) e 6,21 → 0,18 su 292 task
 * (A-2), che a 2500 task diventano 49,25 → 1,47.
 *
 * ⚠️ Il predicato è «`matchTermini` DENTRO un `useMemo`», non «`matchTermini`»:
 * la funzione resta legittima per chi ha una riga sola da confrontare e non un
 * elenco da indicizzare — `filtraListe` in `liste/listeOrdinamento.js` la usa
 * di proposito ed è una funzione pura esportata, non un memo. Il difetto non è
 * la funzione: è chiamarla in un ciclo che riparte a ogni battuta.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]}
 */
export function ricercheSenzaIndice(sorgenti) {
  // Dal `useMemo(` fino alla sua chiusura approssimata: si guarda una finestra
  // generosa invece di bilanciare le parentesi, perché un falso positivo qui
  // costa una riga di commento e un falso NEGATIVO costa il rilievo.
  const BLOCCO_MEMO = /useMemo\(([\s\S]{0,2000}?)\n\s*\}?,\s*\[/g;
  const fuori = [];
  for (const f of sorgenti || []) {
    for (const m of f.testo.matchAll(BLOCCO_MEMO)) {
      if (/\bmatchTermini\s*\(/.test(m[1])) { fuori.push(f.path); break; }
    }
  }
  // Il controllo positivo di sé stesso: se NESSUN file usa l'indice, la regola
  // non è applicata da nessuna parte e questo zero non significa niente.
  const conIndice = (sorgenti || []).filter(f => /\bmatchIndice\s*\(/.test(f.testo));
  if (conIndice.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ usa `matchIndice`: o l\'indice di ricerca è stato ' +
      'rimosso, o è cambiato nome. Senza, «zero ricerche senza indice» ' +
      'significa «zero ricerche».');
  }
  return [...new Set(fuori)];
}

/**
 * M-2 · Le iterazioni quadratiche: `indexOf`/`findIndex` dentro una `.map()`.
 *
 * Cercare la posizione di un elemento nell'array mentre lo si sta già
 * scorrendo è O(n²), e l'indice ce l'ha già il secondo parametro della
 * callback (o si porta dietro dalla costruzione della lista). Nella lista
 * messaggi della chat erano 125.000 confronti per render su una conversazione
 * da 500 messaggi, e quel render riparte ogni 2,5 secondi mentre un collega
 * scrive (l'evento di typing).
 *
 * ⚠️ È il controllo più stretto dei tre di proposito: cerca una forma precisa e
 * non una categoria di lentezza. Non dice niente su una `.filter()` dentro una
 * `.map()` o su un `.find()` su un ALTRO array — che è spesso legittimo (una
 * lookup su un elenco piccolo). Chiude la ricaduta di M-2, non la classe.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]}
 */
export function iterazioniQuadratiche(sorgenti) {
  // `.map(` seguita, entro il corpo della callback, da un `.indexOf(`/
  // `.findIndex(` su un identificatore: la finestra è corta perché la forma da
  // prendere è «cerco l'indice appena entrato nel ciclo».
  const MAPPA_CON_RICERCA =
    /\.map\(\s*\(?\s*[A-Za-z_$][\w$]*[^)]{0,40}\)?\s*=>\s*\{[\s\S]{0,200}?\b[A-Za-z_$][\w$]*\.(indexOf|findIndex)\s*\(/g;
  return (sorgenti || [])
    .filter(f => MAPPA_CON_RICERCA.test(f.testo))
    .map(f => f.path);
}

/**
 * M-1 (passo 2) · Le viste che chiedono l'anagrafica INTERA.
 *
 * Stesso mestiere di `usiStoricoTask`, su un equilibrio che si rompe nelle
 * stesse due direzioni: una vista di troppo — una che vuole solo SUGGERIRE un
 * cliente, e per quello c'è la ricerca lato server — annulla la finestra
 * lasciandone in piedi il codice; una in meno mostra un'anagrafica parziale
 * come se fosse tutta. Quale sia il numero giusto lo decide l'elenco motivato
 * in `state/ClientiCompletiContext.jsx`; qui si fa rumore quando cambia.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]} i percorsi che importano l'hook
 */
export function usiClientiCompleti(sorgenti) {
  const IMPORTA = /import\s*\{[^}]*\buseClientiCompleti\b[^}]*\}\s*from/;
  const usi = (sorgenti || []).filter(f => IMPORTA.test(f.testo)).map(f => f.path);
  if (usi.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ importa `useClientiCompleti`: o l\'hook è stato ' +
      'rimosso, o la forma dell\'import è cambiata. In entrambi i casi la ' +
      'finestra sull\'anagrafica (M-1) non ha più nessuno che ne carichi il ' +
      'complemento, e le due viste che la guardano mostrano un elenco parziale.');
  }
  return usi;
}

/**
 * Il numero di viste che chiedono l'anagrafica intera, dichiarato in
 * docs/CLAUDE.md (M-1, passo 2, dell'audit del 19 agosto).
 */
export function leggiCallSiteClienti(testo) {
  const m = /(\d+)\s+viste chiedono\s+`useClientiCompleti`/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «N viste chiedono `useClientiCompleti`». ' +
      'Se è stata riscritta, aggiorna QUESTO script insieme al documento.');
  }
  return Number(m[1]);
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

// ─── A-5 · LE FORME DI STILE DUPLICATE ───────────────────────────────────────
// `src/styles/common.js` si dichiara in cima «gli oggetti di stile costanti che
// ricorrono in TRE O PIÙ FILE», e dice anche come ci si arriva: promuovendo una
// forma già in uso, non scrivendone una nuova. È una buona regola e il progetto
// l'ha seguita — ma a occhio, confrontando i NOMI. Nessuno ha mai confrontato i
// VALORI, e sono i valori a dire se due forme sono la stessa cosa: al 23 agosto
// c'erano 791 costanti di stile a livello di modulo fuori da src/styles/, con
// 122 casi di stesso nome e valore diverso — e tre forme identiche alla lettera
// in tre file ciascuna, che la regola avrebbe promosso e che nessuno aveva
// visto.
//
// I due controlli qui sotto NEGANO invece di contare, come `lazy() senza
// boundary`: l'atteso è 0 e non un numero dichiarato in un documento. «791» era
// vero il 23 agosto e sarà falso domani; «nessuna forma è definita tre volte»
// resta vero finché qualcuno non lo rompe, ed è la proprietà che si voleva.
//
// ⚠️ Il confronto è sul valore NORMALIZZATO (proprietà ordinate, spazi e
// virgolette uniformati): `{display:"flex", gap:6}` e `{ gap: 6, display: 'flex' }`
// sono la stessa forma e devono contare come tale, altrimenti il controllo
// vedrebbe solo i copia-incolla e non le riscritture — che sono il caso più
// frequente e più difficile da notare a mano.

/**
 * Le forme identiche definite a livello di modulo in `soglia` file o più.
 *
 * @param {{path: string, nome: string, valore: string}[]} costanti
 * @param {number} soglia il numero di file oltre il quale la forma va promossa
 * @returns {string[]} una riga per forma, con i file che la ripetono
 */
export function formeDuplicate(costanti, soglia = 3) {
  if (costanti.length === 0) {
    throw new LetturaFallita(
      'Nessuna costante-oggetto trovata a livello di modulo in src/: o il ' +
      'progetto ha cambiato del tutto forma, o l\'estrazione è rotta. In ' +
      'entrambi i casi questo controllo passerebbe a vuoto.');
  }
  const perValore = new Map();
  for (const { path, valore } of costanti) {
    if (!perValore.has(valore)) perValore.set(valore, new Set());
    perValore.get(valore).add(path);
  }
  return [...perValore]
    .filter(([, file]) => file.size >= soglia)
    .map(([valore, file]) => `${valore} — in ${[...file].sort().join(', ')}`);
}

/**
 * Le costanti locali che ripetono alla lettera una forma GIÀ in common.js.
 *
 * È il caso peggiore dei due: la forma è stata promossa, il registro condiviso
 * ce l'ha, e un file se la riscrive lo stesso — quindi il prossimo che cambia
 * quella in common.js crede di averle cambiate tutte.
 *
 * @param {{path: string, nome: string, valore: string}[]} costanti quelle FUORI da src/styles/
 * @param {{nome: string, valore: string}[]} comuni quelle esportate da src/styles/common.js
 * @returns {string[]}
 */
export function formeGiaInComune(costanti, comuni) {
  if (comuni.length === 0) {
    throw new LetturaFallita(
      'Nessuna costante esportata da src/styles/common.js: il registro delle ' +
      'forme condivise è la base di questo confronto e senza di esso non c\'è ' +
      'niente da confrontare.');
  }
  const perValore = new Map(comuni.map(c => [c.valore, c.nome]));
  return costanti
    .filter(c => perValore.has(c.valore))
    .map(c => `${c.path}: \`${c.nome}\` ripete stiliComuni.${perValore.get(c.valore)}`);
}
