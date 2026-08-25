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
  // A-2 (audit del 26 agosto) · Anche `useSalvataggioLista`, che è il contratto
  // nel dialetto del modulo Liste. Contare il solo nome nudo avrebbe fatto
  // scendere questo numero da 25 a 14 il giorno in cui dodici form lo hanno
  // ADOTTATO — cioè avrebbe raccontato l'opposto di ciò che è successo. Il
  // numero misura quanti file hanno il contratto, non da quale porta ci sono
  // entrati.
  const IMPORTA = /import\s*\{[^}]*\buseSalvataggio(?:Lista)?\b[^}]*\}\s*from/;
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
 * ⚠️ A-1 (audit del 26 agosto) · «scrive» non è più solo «dispatcha»: questa
 * app ha DUE registry di scrittura, e il predicato ne conosceva uno. Vedi
 * `scriveDavvero` qui sotto, che è dove sta il rilievo. Da qui cambia anche il
 * VALORE DI RITORNO: non più il solo elenco dei bocciati, ma anche il
 * perimetro — chi controlla ha bisogno di sapere non solo quanti ne ha
 * bocciati, ma quanti ne ha guardati.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @param {string[]} azioni i tipi del registry core (vedi azioniRegistry)
 * @returns {{perimetro: string[], fuori: string[]}}
 */
export function formSenzaAttesaEsito(sorgenti, azioni) {
  const HA_FORM = /import\s*\{[^}]*\bvalidaCampi\b[^}]*\}\s*from/;
  const conForm = (sorgenti || []).filter(f => HA_FORM.test(f.testo));
  if (conForm.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ importa `validaCampi`: o la validazione inline è ' +
      'stata rimossa, o la forma dell\'import è cambiata. Senza, questo ' +
      'controllo non ha più nessun form da guardare.');
  }
  const perimetro = conForm.filter(f => scriveDavvero(f.testo, azioni));
  if (perimetro.length === 0) {
    throw new LetturaFallita(
      'Nessuno dei file che importano `validaCampi` risulta scrivere: i verbi ' +
      'di scrittura riconosciuti da `scriveDavvero` non descrivono più come ' +
      'questa app scrive, e il controllo passerebbe a vuoto.');
  }
  return {
    perimetro: perimetro.map(f => f.path),
    fuori: perimetro.filter(f => !ATTENDE_ESITO.test(f.testo)).map(f => f.path),
  };
}

/**
 * A-1 (audit del 26 agosto) · I DUE verbi di scrittura di questa app.
 *
 * PERCHÉ ESISTE, ed è tutto il rilievo. Fino a qui «scrivere» voleva dire una
 * cosa sola: dispatchare un'azione del registry di `state/persistence.js`. Ma
 * questa app ha DUE registry di scrittura — la scelta è di dominio, ed è
 * documentata in M-1 dell'audit del 25 agosto: il core è ottimistico perché è
 * ciò che l'operatore tocca in continuazione, il modulo Liste conferma prima
 * perché lì il dato è denaro. Le scritture del secondo passano da
 * `esegui("nomeOperazione", …)` (`liste/listePersistence.js`), e da `run()`
 * quando la modale riceve l'operazione già confezionata dal genitore.
 *
 * Nessuna delle due forme somiglia a un `dispatch`, quindi nessuno dei dodici
 * form del modulo Liste poteva far scattare i controlli qui sotto. Non erano
 * conformi e non erano nemmeno segnalati: `AddMovBox.jsx` importa
 * `validaCampi`, gestisce `saving` a mano, ed era esente per un motivo solo —
 * il verbo con cui scrive. Un controllo verde su un perimetro più piccolo del
 * codice è peggio di un controllo assente: quello assente lascia la domanda
 * aperta, questo la chiude con la risposta sbagliata.
 *
 * ⚠️ Se nasce un TERZO registry, va aggiunto qui. Il segnale che serve è
 * proprio la ragione per cui i due controlli chiamanti dichiarano il proprio
 * perimetro in docs/CLAUDE.md invece di limitarsi a pretendere 0: un perimetro
 * che si restringe si vede, invece di continuare a stampare uno zero su un
 * insieme sempre più piccolo.
 *
 * NON è coperto qui, ed è deliberato: la scrittura che chiama direttamente il
 * data layer senza passare da un registry (`Users.invite` in
 * `admin/AddTeamMemberModal.jsx` e `admin/BulkInviteModal.jsx`). È M-6
 * dell'audit del 26 agosto, con la sua ragione: `BulkInviteModal` è un batch
 * con esito PER RIGA e progresso live, cioè una forma che il contratto non
 * copre ancora — e allargare il predicato prima di aver deciso quella forma
 * produrrebbe un rosso senza una correzione da applicare.
 *
 * @param {string} testo
 * @param {string[]} azioni i tipi del registry core (vedi azioniRegistry)
 */
function scriveDavvero(testo, azioni) {
  // Registry del core: dispatch di un'azione dichiarata in persistence.js.
  const CORE = new RegExp(
    `dispatch\\(\\s*\\{\\s*type:\\s*["'](?:${azioni.join('|')})["']`);
  // Registry del modulo Liste: l'esecutore, e la sua forma confezionata.
  const LISTE = /\besegui\s*\(\s*["'][a-zA-Z]/;
  const LISTE_CONFEZIONATA = /\bon[A-Z]\w*\.run\s*\(/;
  return CORE.test(testo) || LISTE.test(testo) || LISTE_CONFEZIONATA.test(testo);
}

/**
 * Le strade accettate per attendere l'esito: il contratto, il suo adattatore
 * per il modulo Liste (`useSalvataggioLista`, A-2), o l'attesa a mano.
 *
 * ⚠️ `\buseSalvataggio\b` NON basta e non è un dettaglio di regex: il `\b`
 * finale fa fallire il confronto su `useSalvataggioLista`, ed è giusto così —
 * i due nomi vanno distinti, altrimenti il controllo «call site di
 * useSalvataggio» conterebbe l'uno per l'altro. Qui servono entrambi perché
 * qui la domanda non è QUALE hook, è se l'esito viene atteso.
 */
const ATTENDE_ESITO = /\buseSalvataggio(?:Lista)?\b|await\s+dispatch\s*\(/;

/**
 * A-1 (audit del 26 agosto), seconda metà · Lo stato di invio scritto a mano.
 *
 * PERCHÉ È UN CONTROLLO A SÉ e non un allargamento di quello sopra. I due
 * rispondono a due domande diverse, e nessuna delle due da sola descrive un
 * file:
 *
 *  • `formSenzaAttesaEsito` chiede «i dati digitati sopravvivono a un
 *    rifiuto?». Il suo marcatore è `validaCampi`, cioè "qui c'è qualcosa che
 *    vale la pena validare, quindi qualcosa da perdere".
 *  • questo chiede «lo stato di invio viene dal contratto?». Il suo marcatore
 *    è `const [saving, …]`, e intercetta le tre garanzie che una copia scritta
 *    a mano non ha, TUTTE argomentate dentro hooks/useSalvataggio.js:
 *      ① il freno al doppio invio su un `ref` e non sullo stato (fra due click
 *        ravvicinati React può non aver ri-renderizzato: entrambi i gestori
 *        leggono `false` e partono due scritture — su `registraMovimento` sono
 *        due movimenti su un saldo);
 *      ② `setSaving(false)` dentro un `finally` (senza, un'eccezione lascia
 *        il bottone spento per sempre: è il difetto che QuickAddTask ha avuto);
 *      ③ il guard di smontaggio dopo l'`await`.
 *
 * Un form validato che si chiude subito non ha per forza uno stato di invio, e
 * una conferma senza campi digitati non importa `validaCampi` pur avendone
 * uno. Fonderli avrebbe fatto perdere metà dei casi a ciascuno.
 *
 * ⚠️ QUESTO controllo NON solleva sul presupposto vuoto, a differenza di tutti
 * gli altri di questo file, e la ragione è che qui il presupposto È il difetto.
 * `validaCampi` è un marcatore: se sparisce, «zero form senza attesa» e «zero
 * form» diventano la stessa cifra e due affermazioni diverse, quindi lì il
 * throw serve. Un `const [saving, …]` su una scrittura non è un marcatore: è
 * la cosa da eliminare, e il suo stato finale corretto è ZERO occorrenze —
 * sollevare su un perimetro vuoto significherebbe far fallire lo script il
 * giorno in cui il debito è pagato.
 *
 * Chi protegge allora questo controllo dal restringersi in silenzio? Il
 * perimetro dichiarato di `formSenzaAttesaEsito`, che condivide
 * `scriveDavvero`: se un verbo di scrittura smette di essere riconosciuto,
 * quel numero cala e il controllo lo dice — per entrambi.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @param {string[]} azioni
 * @returns {string[]} i percorsi con lo stato di invio scritto a mano
 */
export function statoInvioScrittoAMano(sorgenti, azioni) {
  // Qualunque nome: il progetto ne ha usati tre (`saving` nel modulo Liste,
  // `busy` nelle modali admin, `inVolo` nel contratto).
  const STATO_INVIO = /const\s*\[\s*(?:saving|busy|inVolo|salvando|invio)\s*,/;
  return (sorgenti || [])
    .filter(f => STATO_INVIO.test(f.testo) && scriveDavvero(f.testo, azioni))
    .filter(f => !ATTENDE_ESITO.test(f.testo))
    .map(f => f.path);
}

/**
 * Il numero di file che i due controlli di A-1 hanno DAVVERO guardato, come
 * dichiarato in docs/CLAUDE.md.
 *
 * PERCHÉ UN NUMERO E NON SOLO LO ZERO. Un controllo che pretende 0 non scade
 * quando l'app cresce, ed è per questo che i tre controlli «che negano» sono
 * scritti così (vedi 5-bis/ter/quater in index.js). Ma non protegge da ciò che
 * ha prodotto A-1: un perimetro che si RESTRINGE. Se domani una form nuova
 * scrivesse in un modo che `scriveDavvero` non riconosce, il rosso non
 * arriverebbe — arriverebbe uno zero su un insieme più piccolo, cioè
 * esattamente la fotografia rassicurante da cui questo rilievo è nato. Il
 * numero dichiarato è ciò che rende visibile quel restringimento.
 */
export function leggiPerimetroContratto(testo) {
  const m = /il contratto «salva e chiudi» guarda\s+(\d+)\s+form\b/.exec(testo);
  if (!m) {
    throw new LetturaFallita(
      'docs/CLAUDE.md: non trovo la frase «il contratto «salva e chiudi» ' +
      'guarda N form». Se è stata riscritta, aggiorna QUESTO script insieme ' +
      'al documento.');
  }
  return Number(m[1]);
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
/**
 * A-4 · I file che superano il tetto FISICO.
 *
 * PERCHÉ ESISTE, ed è il rilievo in due righe. `max-lines` in eslint.config.js
 * è configurato `{ max: 500, skipBlankLines: true, skipComments: true }`, e nel
 * repository i commenti sono il 28% delle righe — il 61% in quello che era
 * `src/lib/api.js`. Il tetto di 500 su quella metrica lasciava passare un file
 * da 1001 righe: uno sviluppatore che lo apre le legge tutte. La regola diceva
 * il vero («nessun file supera la soglia») su una grandezza che non è quella
 * che si apre.
 *
 * Questo controllo misura ciò che si apre. Non sostituisce `max-lines`: gli sta
 * accanto, come `verifica:tipi` sta accanto al lint.
 *
 * ⚠️ LA SOGLIA NON È 500, ED È DELIBERATO. Non chiede di scrivere meno
 * commenti — quelli che spiegano PERCHÉ il codice è così sono il patrimonio di
 * questo repository, e una regola che li penalizzasse otterrebbe di farli
 * cancellare invece che spostare. Chiede che oltre un certo punto la parte
 * NARRATIVA (il resoconto di com'era prima, quale audit lo ha cambiato) esca
 * dal file e vada in `docs/`, dove `INDEX.md` sa distinguere ciò che è vigente
 * da ciò che è storia.
 *
 * È un RATCHET, come lo scope di jsconfig.json: si abbassa quando l'elenco è a
 * zero, mai prima. Parte da 850 perché è appena sopra il file più grande di
 * oggi (`src/state/persistence.js`, 806 righe; `reducer.js` 805): il valore di
 * questo controllo è impedire che un file RICRESCA fino a 1001 senza che
 * nessuno se ne accorga, non condannare retroattivamente due macchine a stati
 * che il loro "perché" ce l'hanno scritto dentro.
 *
 * ⛔ La soglia NON si alza. Se un file la supera, le due risposte legittime
 * sono spostare la narrativa in `docs/` o spezzare il file lungo un confine che
 * esisteva già — come ha fatto `lib/api.js`, che aveva tredici sezioni
 * separate da anni e ha dovuto solo trasformarle in moduli. Alzare il numero è
 * il modo in cui questo controllo smette di controllare.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @param {number} [tetto]
 * @returns {{path: string, righe: number}[]} i file oltre soglia, dal più grande
 */
export function fileOltreTettoFisico(sorgenti, tetto = 850) {
  return (sorgenti || [])
    .map(f => ({ path: f.path, righe: f.testo.split('\n').length }))
    .filter(f => f.righe > tetto)
    .sort((a, b) => b.righe - a.righe);
}

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

/**
 * ─── B-3 · DUE NOMI PER UN CONCETTO SOLO ──────────────────────────────────
 * (audit del 25 agosto)
 *
 * `docs/CLAUDE.md` decide la lingua degli identificatori: inglese solo dove lo
 * impongono React e lo schema del database, italiano per tutto ciò che
 * scegliamo noi. Il difetto che questo controllo misura NON è il bilinguismo
 * dell'app — è il suo caso peggiore: **la stessa cosa chiamata in due modi
 * dentro lo stesso file**. `caricaApp` otto righe sopra `loadingScreen` non è
 * una preferenza di stile: è un lettore che deve fermarsi a verificare se siano
 * la stessa cosa, e a volte lo sono.
 *
 * ⚠️ NESSUNA EURISTICA SULLA LINGUA, e la scelta è deliberata. Un
 * riconoscitore automatico di «questo nome è inglese» sbaglia su `contacts`,
 * su `ORDINAMENTI` e su ogni sigla, e un controllo con falsi positivi diventa
 * il rumore che si impara a saltare — è l'argomento con cui questo repo ha
 * reso `max-lines` un errore invece di un warning. Qui l'elenco delle coppie è
 * ESPLICITO: copre i concetti che nella codebase compaiono davvero in due
 * lingue, e cresce quando ne emerge un altro.
 */
export const COPPIE_SINONIME = [
  { concetto: 'errore',     it: /^error[ei]$|^errore[A-Z]\w*$/,      en: /^errors$|^[a-z]\w*Error$/ },
  { concetto: 'bozza',      it: /^bozza\w*$/,                        en: /^draft\w*$/ },
  { concetto: 'salvare',    it: /^salva\w*$|^salvataggio\w*$/,       en: /^handleSave$|^save[A-Z]\w*$|^saving$/ },
  { concetto: 'confermare', it: /^conferm[ae]\w*$/,                  en: /^confirm\w*$/ },
  { concetto: 'caricare',   it: /^caric[ao]\w*$|^caricando\w*$/,     en: /^loading\w*$|^load[A-Z]\w*$/ },
  { concetto: 'eliminare',  it: /^elimin[ao]\w*$/,                   en: /^handleDelete$|^remove[A-Z]\w*$/ },
  { concetto: 'aggiungere', it: /^aggiungi\w*$/,                     en: /^add[A-Z]\w*$/ },
  { concetto: 'chiudere',   it: /^chiud[io]\w*$/,                    en: /^handleClose$|^close[A-Z]\w*$/ },
  { concetto: 'aprire',     it: /^apri\w*$|^apert[oa]\w*$/,          en: /^open[A-Z]\w*$/ },
  { concetto: 'cercare',    it: /^ricerc\w+$|^cerca\w*$/,            en: /^search[A-Z]\w*$/ },
  { concetto: 'finestra',   it: /^finestra\w*$/,                     en: /^window[A-Z]\w*$/ },
];

/**
 * ⚠️ ESENTI, e non per pigrizia: sono nomi del LIVELLO 1 della regola in
 * `docs/CLAUDE.md` — quelli che non scegliamo noi. `error` nudo è la forma in
 * cui supabase-js restituisce l'esito (`const { data, error } = await …`) e in
 * cui il linguaggio consegna un `catch`: rinominarlo significherebbe
 * ribattezzare il contratto di una libreria dentro casa nostra, che è più
 * confondente del bilinguismo che questo controllo esiste per togliere. Senza
 * questa riga il controllo segnalerebbe 40 file e sarebbe rumore.
 */
const NOMI_DELLA_PIATTAFORMA = new Set(['error', 'err', 'errore']);
// Gli identificatori DICHIARATI in un file: `const`/`let`/`function`, incluse
// le destrutturazioni (`const { salva, inVolo } = …`), che è dove finisce metà
// del vocabolario di un componente. Non i riferimenti: un nome che il file
// IMPORTA da altrove non è una scelta di questo file.
function nomiDichiarati(testo) {
  const senzaCommenti = testo
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
  const re = /\b(?:const|let|var|function)\s+(?:\{([^}]*)\}|\[([^\]]*)\]|([A-Za-z_$][\w$]*))/g;
  const out = new Set();
  for (const m of senzaCommenti.matchAll(re)) {
    const blocco = m[1] || m[2];
    if (!blocco) { out.add(m[3]); continue; }
    for (const pezzo of blocco.split(',')) {
      let nome = pezzo.split('=')[0].trim();
      if (nome.includes(':')) nome = nome.split(':')[1].trim();
      nome = nome.replace(/^\.\.\./, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(nome)) out.add(nome);
    }
  }
  return [...out];
}

/**
 * I file che dichiarano DUE nomi, uno per lingua, per lo stesso concetto.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {string[]} righe pronte da mostrare, una per collisione
 */
export function doppioNome(sorgenti) {
  if (sorgenti.length === 0) {
    throw new LetturaFallita(
      'Nessun sorgente da esaminare: questo controllo passerebbe a vuoto.');
  }
  const fuori = [];
  for (const { path, testo } of sorgenti) {
    const nomi = nomiDichiarati(testo);
    const nostri = nomi.filter((n) => !NOMI_DELLA_PIATTAFORMA.has(n));
    for (const { concetto, it, en } of COPPIE_SINONIME) {
      const a = nostri.filter((n) => it.test(n)).sort();
      const b = nostri.filter((n) => en.test(n)).sort();
      if (a.length && b.length) {
        fuori.push(`${path}: "${concetto}" è ${a.join('/')} e anche ${b.join('/')}`);
      }
    }
  }
  return fuori;
}
