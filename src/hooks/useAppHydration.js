// src/hooks/useAppHydration.js
// Idratazione + realtime dei dati di dominio che vivono nel reducer: task
// (con i commenti; la cronologia no — vedi A-3 passo 3 sotto), avvisi,
// categorie, team e clienti.
//
// Tutte le sottoscrizioni condividono la stessa base — reload debounced con un
// gen-counter che scarta le risposte obsolete: vedi useDebouncedTableSubscription
// (caveat #10) — ma non tutte ricaricano più la lista intera a ogni evento.
// `tasks`, `notices` e `clients` applicano la riga arrivata nel payload
// (`applyRow`, suggerimento strategico n.1 dell'audit del 16 agosto: la riga è
// già nell'evento, ricaricare l'entità intera per applicarne una era il costo
// che cresce col prodotto fra righe e frequenza di scrittura). `categories`,
// `team` e `messageTemplates` restano al reload completo — tabelle piccole,
// dove il merge per riga non avrebbe risparmiato nulla di misurabile; `tasks`
// lo fa SOLO per la tabella `tasks` in senso stretto, non per `comments`, che
// restano sul reload selettivo esistente (SET_TASK_THREADS).
// Il reload intero resta comunque l'unica via per l'idratazione iniziale e per
// la ripresa dopo un buco di connessione (`tabelle = null` in entrambi i casi):
// lì non c'è un payload da applicare, solo l'incertezza su cosa si è perso.
//
// Il chiamante passa `dispatch` (quello grezzo del reducer: qui non si scrive
// nulla su DB, si legge soltanto) e riceve i flag di caricamento che le viste
// usano per mostrare gli scheletri invece di un vuoto ingannevole.
//
// ─── CRITICITÀ #6 · un flag per ENTITÀ, non solo per il CRM ────────────────
// Il flag esisteva per i soli clienti (`caricamentoClienti`). Tutte le altre entità
// partivano da un array vuoto nel reducer e restavano tali finché il primo
// fetch non tornava: nel frattempo la Dashboard mostrava "Nessuna task aperta
// a tuo nome. Buon lavoro!", la bacheca "Nessun avviso", l'Archivio "Archivio
// vuoto". Non è un dettaglio estetico — è l'app che afferma con sicurezza
// qualcosa di falso su dati operativi, in una finestra in cui l'unica risposta
// vera è "non lo so ancora", e chi legge (persona o agente) può agirci sopra.
//
// `caricamento` è un oggetto con una chiave per entità. Chiude a `false` sia sul
// successo sia sull'ERRORE del primo fetch: uno scheletro che gira per sempre
// è disonesto quanto un vuoto — dopo un errore il canale è il toast, e sotto
// va mostrato lo stato reale (vuoto) di ciò che si è riusciti a caricare.
//
// Come già per `caricamentoClienti`, il valore iniziale è `enabled` valutato al primo
// render: senza login non c'è idratazione (si usano i mock) e i flag nascono
// già chiusi.
//
// ─── A-3 · LA FINESTRA SULLE TASK COMPLETATE ───────────────────────────────
// L'idratazione chiedeva `{ withComments: true, includeDeleted: true }` senza
// alcun filtro temporale: TUTTO lo storico, a ogni avvio a freddo, a ogni
// ripresa dopo un buco di connessione e in memoria per l'intera sessione. È
// corretto (nessun troncamento silenzioso, C-1) ed è esattamente il tipo di
// correttezza che peggiora da sola: la quota di quel payload che serve alle
// viste d'ingresso cala man mano che l'agenzia usa il gestionale, cioè il
// tempo di avvio cresce con l'anzianità dell'installazione.
//
// Ora l'idratazione chiede una FINESTRA — task non completate, più le
// completate degli ultimi `FINESTRA_COMPLETATE_GG` giorni — e NON chiede il
// cestino. Le due metà sono inseparabili: senza la seconda (le viste che
// vogliono il resto se lo caricano da sé, `caricaStorico` qui sotto) la prima
// non sarebbe una finestra ma una perdita di dati.
//
// `storicoCompleto` è un REF e non uno stato perché non è un dato da
// disegnare: è il parametro con cui il prossimo reload — incluso quello di
// riconnessione, che parte da dentro `useDebouncedTableSubscription` e non
// rilegge le dipendenze — deve interrogare il server. Una volta che una vista
// ha chiesto il corpus intero, l'idratazione resta completa per il resto della
// sessione: altrimenti il primo `visibilitychange` svuoterebbe l'Archivio
// sotto gli occhi di chi lo sta guardando.

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Tasks as TasksAPI, Notices as NoticesAPI, Users as UsersAPI,
  Clients as ClientsAPI, Categories as CategoriesAPI, TaskThreads as TaskThreadsAPI,
  MessageTemplates as MessageTemplatesAPI,
} from "../lib/api.js";
import {
  fromDbTask, fromDbNotice, fromDbClient, fromDbCategory,
  fromDbComment, fromDbMessageTemplate,
} from "../lib/mappers.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";
import { useErroriIdratazione, useErroriComposti } from "./useErroriIdratazione.js";
import { stessaLista, stessaMappa } from "../lib/confrontoIdratazione.js";

// Indicizza per task_id le righe di una tabella figlia dei task, applicando il
// mapper della sua entità. Fuori dall'hook perché è pura.
const perTaskId = (righe, mapper) => {
  const out = {};
  for (const row of righe || []) {
    (out[row.task_id] ||= []).push(mapper(row));
  }
  return out;
};

// Entità idratate qui, nell'ordine in cui compaiono sotto. Una lista e non
// cinque `useState`: i consumatori leggono `caricamento.tasks`, e aggiungere
// un'entità non richiede di ricordarsi di propagare un sesto flag.
const ENTITA = ["tasks", "notices", "categories", "team", "clients", "messageTemplates"];


// A-3 · Ampiezza della finestra, in giorni, sulle task COMPLETATE.
//
// Sessanta e non trenta perché il numero non deve essere scelto contando i
// byte risparmiati oggi: deve essere abbastanza largo da coprire il periodo in
// cui una task chiusa viene ancora riaperta o consultata di riflesso da chi
// lavora, così che la strada normale non passi mai dal caricamento dello
// storico. Misurato in produzione il 17 agosto 2026: con 60 giorni restano
// fuori 33 righe su 292 (le sole cestinate — la prima task è dell'11 giugno,
// nessuna completata ha ancora sessanta giorni); con 30 ne resterebbero fuori
// 109. Cioè oggi questa correzione non fa quasi nulla, ed è il momento giusto
// per farla: fra dodici mesi, al ritmo attuale (~5,6 task/giorno), la parte
// esclusa è la maggioranza del payload.
const FINESTRA_COMPLETATE_GG = 60;

// I MILLISECONDI SONO TOLTI DI PROPOSITO, e non per estetica. Questo valore
// finisce dentro l'espressione `or=(…)` di PostgREST, dove il punto è il
// separatore fra colonna, operatore e valore: `toISOString()` produce
// `…T08:00:00.000Z`, cioè un valore che contiene il separatore. Le due letture
// possibili di quella stringa (il valore è tutto ciò che segue il secondo
// punto / il valore va citato perché contiene un carattere riservato) danno
// risultati diversi, e sbagliare significa una 400 su OGNI idratazione.
// Senza millisecondi il valore non contiene punti e le due letture coincidono:
// non c'è una domanda a cui rispondere. La precisione persa è irrilevante —
// il confine di una finestra di sessanta giorni.
const inizioFinestra = () =>
  new Date(Date.now() - FINESTRA_COMPLETATE_GG * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");

// ─── M-3 (audit del 28 agosto) · l'ordine delle scritture su UNA fetta ─────
//
// Un contatore in due metà, e le due metà sono il punto. `emesse` conta le
// richieste PARTITE, `scritte` l'ultimo turno che ha davvero scritto lo stato.
//
// La prima metà da sola — «vince chi è partito per ultimo» — è la correzione
// che M-3 chiede, e sbaglia un caso: una richiesta più recente che FALLISCE non
// porta dati, ma avendo già preso il turno scarterebbe la risposta più vecchia
// che invece i dati ce li ha. Si butterebbe via un'anagrafica arrivata per
// intero perché una seconda richiesta, partita dopo, ha trovato la rete giù.
//
// Il turno lo consuma quindi CHI SCRIVE, non chi parte: `vinceIlTurno` va
// chiamata DOPO aver gestito l'errore, sul solo percorso che dispatcha.
const ordineDiScrittura = () => ({ emesse: 0, scritte: 0 });
const prendiTurno = (ordine) => ++ordine.emesse;
const vinceIlTurno = (ordine, turno) => {
  // `<=` e non `<`: due richieste non possono avere lo stesso turno, e un
  // turno già scritto è per definizione più vecchio di ciò che c'è a schermo.
  if (turno <= ordine.scritte) return false;
  ordine.scritte = turno;
  return true;
};

// ─── M-1 (audit del 26 agosto) · le due forme ricorrenti di questo file ────
//
// Le sottoscrizioni qui sotto sono sei, ma i loro corpi non sono sei programmi
// diversi: tre idratano un'entità intera con lo STESSO programma a tre token di
// distanza (leggi, scarta se tardiva, dispatcha, segna il flag) e tre applicano
// una riga realtime con lo stesso identico ciclo `DELETE / mappa / dispatcha`.
//
// Il lato REDUCER di questo problema è già convergente da tempo:
// `applicaRigaRealtime` in state/pendingWrites.js è una funzione sola che i tre
// `case MERGE_*_ROW` chiamano. Il lato CHIAMANTE no, ed è quello che si copia:
// chi aggiunge la settima sottoscrizione parte dalla vicina, e la vicina
// potrebbe essere `clients`, che ha una riga in più (`clientiCompleti`) il cui
// significato non è generale.
//
// ⚠️ NON tutte e sei entrano qui, e le eccezioni non sono dimenticanze:
//   · `categories` costruisce una MAPPA (non un array) e la confronta con
//     `stessaMappa` prima di dispatchare;
//   · `users` fa due query in parallelo, reinnesta i contatti dell'utente
//     loggato e confronta con `stessaLista`;
//   · l'`applyRow` di `tasks` ha davanti il ramo `comments`, che raccoglie gli
//     id per il reload selettivo e non applica niente.
// Sono programmi diversi, non varianti: forzarli nella fabbrica vorrebbe dire
// riaprire il caso per caso dentro la fabbrica, cioè spostare il problema.
// `tasks` la fabbrica la usa comunque, ma per la CODA del suo applyRow — che
// quella sì è la stessa.

/**
 * Il corpo di un refetch d'entità: legge, scarta se tardivo, dispatcha, segna
 * il flag di caricamento. `tag` è il prefisso di console (`[VoyageDesk] …`,
 * `[CRM] …`), `etichetta` il nome che l'utente legge nel toast: sono due cose
 * diverse e i sei call site le avevano già diverse.
 * `quandoSaltare` è per `clients`, la cui idratazione non parte finché una
 * vista non l'ha chiesta.
 *
 * M-3 (28 agosto) · `gen`/`alTermine` servono a un'entità con PIÙ DI UNO
 * SCRITTORE (oggi solo `clients`, scritta anche da `caricaClienti`): `gen` è
 * il ref di generazione condiviso fra gli scrittori, in AND con `isCurrent()`
 * (che ordina le richieste dello stesso effetto, questo tutte quelle della
 * stessa `action`); `alTermine` chiude l'attesa oltre al flag di entità — con
 * due scrittori, quello di chi non ha vinto resterebbe alzato per sempre
 * (vedi `chiudiAttesaClienti`). Assenti insieme = scrittore unico, il caso di
 * `notices`/`message_templates`.
 * @param {{ entita: string, tag: string, etichetta: string, list: () => Promise<{data: object[]|null, error: object|null}>, mapper: (row: object) => object, action: string, dispatch: (action: object) => void, onError: (messaggio: string) => void, segnaCaricata: (entita: string) => void, segnaEsito?: (entita: string, messaggio?: string|null) => void, quandoSaltare?: () => boolean, gen?: {current: number}, alTermine?: () => void }} opts
 */
const idratazione = ({
  entita, tag, etichetta, list, mapper, action,
  dispatch, onError, segnaCaricata, segnaEsito, quandoSaltare, gen, alTermine,
}) => async (isCurrent) => {
  if (quandoSaltare?.()) return;
  const turno = gen ? prendiTurno(gen.current) : 0;
  const { data, error } = await list();
  if (!isCurrent()) return;
  if (error) {
    console.error(tag, error);
    const testo = `Caricamento ${etichetta} fallito: ${error.message || ""}`;
    onError(testo);
    // A-3 · il toast ANNUNCIA, questo stato DURA. Servono entrambi, e il
    // perché sta in hooks/useErroriIdratazione.js.
    segnaEsito?.(entita, testo);
    // FUORI dal ramo del successo per costruzione: uno scheletro che gira per
    // sempre è disonesto quanto un vuoto dichiarato troppo presto (criticità
    // #6 nel preambolo). Vale per entrambe le attese, ed è il motivo per cui
    // `alTermine` è chiamata qui e non solo sotto.
    segnaCaricata(entita);
    alTermine?.();
    return;
  }
  // Il turno si consuma QUI, sul percorso che scrive: vedi `vinceIlTurno`.
  // Perderlo significa che una richiesta partita dopo ha già scritto, e ciò
  // che abbiamo in mano è più vecchio di quello che c'è a schermo.
  if (gen && !vinceIlTurno(gen.current, turno)) return;
  dispatch({ type: action, payload: (data || []).map(mapper) });
  // A-3 · una richiesta riuscita SPEGNE l'errore precedente, e va fatto sul
  // percorso che scrive e non dentro il «Riprova»: chi rimedia può essere il
  // reload di una riconnessione, e un allarme che resta acceso dopo che i dati
  // sono tornati è la cosa che rende ignorabili tutti gli altri.
  segnaEsito?.(entita, null);
  segnaCaricata(entita);
  alTermine?.();
};

/**
 * `applyRow` per una tabella la cui riga è AUTOSUFFICIENTE — nessun join da
 * perdere applicando il solo payload. Ritorna `true` se l'evento è stato
 * gestito (il chiamante non ricarica), `false` per cadere sul reload completo.
 * `quandoIgnorare` è la terza risposta possibile: gestito, e la cosa giusta da
 * fare è nulla.
 * @param {{ action: string, mapper: (row: object) => object, dispatch: (action: object) => void, quandoIgnorare?: () => boolean }} opts
 */
const applicaRiga = ({ action, mapper, dispatch, quandoIgnorare }) => (_tbl, payload) => {
  if (quandoIgnorare?.()) return true;
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    if (!id) return false; // rete di sicurezza: senza id, reload completo
    dispatch({ type: action, payload: { eventType: "DELETE", id } });
    return true;
  }
  const row = mapper(payload.new);
  if (!row?.id) return false;
  dispatch({ type: action, payload: { eventType: payload.eventType, row } });
  return true;
};

export function useAppHydration({ enabled, currentUserId, dispatch, onError, teamIniziale = null }) {
  // M-1 (passo 2): `clients` parte da `false` e non da `enabled`, perché
  // all'avvio l'anagrafica NON si sta caricando — nessuno l'ha chiesta. Il
  // flag si alza quando una vista la chiede (`caricaClienti`), che è il solo
  // momento in cui uno scheletro dice la verità. Le altre cinque entità
  // partono da `enabled` come prima.
  const [caricamento, impostaCaricamento] = useState(
    () => Object.fromEntries(ENTITA.map(k => [k, k === "clients" ? false : enabled])));
  // Idempotente e stabile: chiude il flag di un'entità la prima volta e poi
  // non tocca più l'oggetto, così l'identità di `caricamento` non cambia a ogni
  // reload realtime (le viste sono `memo`: un oggetto nuovo le sveglierebbe
  // tutte per nulla).
  const segnaCaricata = useCallback((entita) => {
    impostaCaricamento(prev => (prev[entita] ? { ...prev, [entita]: false } : prev));
  }, []);

  // A-3 · Il TERZO stato, accanto a `caricamento`: «questa entità NON si è
  // caricata», che prima si travestiva da elenco vuoto. Il perché e la
  // politica stanno in hooks/useErroriIdratazione.js — qui resta il solo
  // punto di chiamata, che è ciò che di A-3 riguarda l'idratazione.
  const { segnaEsito, componi: componiErrori } = useErroriIdratazione();

  // ST-15 · L'ultimo payload consegnato al reducer per team e categorie.
  //
  // `SET_TEAM` sostituisce l'array anche quando i dati sono identici, quindi un
  // evento realtime innocuo su `users` invalidava il value di AppDataContext e
  // con esso i venti metodi che espone, per tutti i consumatori. Qui si
  // confronta prima di dispatchare. Il ref ricorda ciò che ABBIAMO consegnato,
  // non ciò che c'è nello state: è la stessa cosa nel caso che conta (siamo
  // l'unico scrittore di questi due campi durante l'idratazione), e nel caso in
  // cui non lo sia — una mutazione ottimistica del registry sul team — il
  // payload che arriva dal server è diverso da quello di prima, quindi il
  // dispatch parte comunque.
  const ultimoTeam = useRef(null);
  const ultimeCategorie = useRef(null);

  // A-3 · «lo stato deve contenere il corpus intero delle task», non «lo
  // contiene». È il parametro dei reload futuri (vedi il commento in testa), e
  // per questo si alza PRIMA della richiesta e si riabbassa se quella fallisce:
  // fra i due momenti qualunque reload concorrente parte già completo, ed è
  // l'unica sequenza in cui una risposta più stretta non può arrivare in
  // ritardo e potare ciò che una vista sta mostrando.
  const storicoCompleto = useRef(false);
  const [caricandoStorico, setCaricandoStorico] = useState(false);


  // M-1 (passo 2) · Lo stesso meccanismo di `storicoCompleto`, per
  // l'anagrafica: un REF e non uno stato perché è il parametro con cui i
  // reload futuri — compreso quello di riconnessione, che parte da dentro
  // `useDebouncedTableSubscription` e non rilegge le dipendenze — devono
  // decidere se c'è qualcosa da ricaricare. Una volta che una vista ha chiesto
  // l'anagrafica, resta idratata per il resto della sessione: altrimenti il
  // primo `visibilitychange` la svuoterebbe sotto gli occhi di chi la sta
  // guardando.
  const clientiCompleti = useRef(false);
  const [caricandoClienti, setCaricandoClienti] = useState(false);

  // ─── M-3 (audit del 28 agosto) · UNA generazione per FETTA, non per effetto ─
  //
  // `state.tasks` e `state.clients` hanno DUE scrittori ciascuno: il reload
  // della sottoscrizione e il caricamento su richiesta (`caricaStorico`,
  // `caricaClienti`). `isCurrent()` non li mette in ordine fra loro — è il
  // gen-counter *dell'effetto* di `useDebouncedTableSubscription`, e queste due
  // richieste non nascono dallo stesso effetto — quindi fra le loro risposte
  // vinceva quella che ARRIVAVA per ultima, non quella partita per ultima. Con
  // due corpus interi la perdita è di freschezza e non di righe, ed è per
  // questo che il rilievo è Medio; resta il last-write-wins fra due fetch
  // concorrenti che tutto il resto di questo file esiste per escludere, e la
  // finestra si allarga proprio quando si aprono Archivio o Cestino su una
  // connessione lenta.
  //
  // La correzione è quella che `useListeData` ha già in piedi, e il suo
  // commento la dice meglio di così: «incrementando il ref a OGNI reload, da
  // qualunque origine, l'ordine di ARRIVO delle risposte smette di contare —
  // conta solo l'ordine di PARTENZA». Le due condizioni si COMPONGONO in AND
  // con `isCurrent()`, non lo sostituiscono: quella dice «l'effetto che mi ha
  // lanciata è ancora vivo», questa «sono ancora io l'ultima partita».
  const genTask = useRef(ordineDiScrittura());
  const genClienti = useRef(ordineDiScrittura());

  // ⚠️ CHI CONSEGNA IL CORPUS CHIUDE L'ATTESA, chiunque dei due sia.
  //
  // `caricandoStorico`/`caricandoClienti` non descrivono «la MIA richiesta è in
  // volo» ma «il corpus non è ancora in stato»: con due scrittori, il primo
  // significato lascerebbe uno scheletro acceso per sempre ogni volta che a
  // vincere è l'altro — cioè esattamente nei casi che la generazione qui sopra
  // introduce. Ed è il motivo per cui il ramo «sono stale» dei due
  // `carica*` NON tocca il flag: a chiuderlo sarà chi consegna, su OGNI suo
  // esito, riuscito o fallito.
  const chiudiAttesaStorico = useCallback(() => setCaricandoStorico(false), []);
  const chiudiAttesaClienti = useCallback(() => setCaricandoClienti(false), []);

  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  // Caveat #10: il pattern reload+debounce+gen-counter vive in
  // useDebouncedTableSubscription; le tasks ascoltano anche `comments`.
  //
  // ─── `task_history` NON È PIÙ QUI (A-3, passo 3) ──────────────────────────
  // Era la terza tabella sottoscritta, e il suo evento faceva rileggere la
  // cronologia INTERA di TUTTI i task. Era l'unica tabella dell'app che cresce
  // e non si pota mai (660 righe il 17 agosto, ~14,8 al giorno), letta su un
  // percorso che scatta a ogni modifica di stato/priorità/scadenza/assegnatario
  // fatta da chiunque — con la proiezione a dodici mesi, sei round-trip
  // SERIALI dentro `fetchAllRows` per aggiornare un pannello che quasi sempre
  // non è aperto.
  //
  // La cronologia ha un lettore solo e guarda un task per volta: ora se la
  // carica e se la tiene aggiornata quel lettore, con una sottoscrizione che
  // vive solo mentre il pannello è montato e filtra sul proprio `task_id`
  // (components/tasks/TaskHistoryPanel.jsx). Qui non resta niente da fare:
  // togliere la tabella dall'elenco è la correzione, non una sua conseguenza.
  // A-1 dell'audit del 22 agosto. Gli id dei task toccati dagli eventi
  // `comments` coalescati da questo debounce, raccolti in `applyRow` (che il
  // payload ce l'ha già in mano) e consumati dal ramo `soloThread`.
  //
  // Un ref e non uno stato, per la stessa ragione di `storicoCompleto`: non è
  // un dato da disegnare, è il parametro con cui la prossima query interroga
  // il server. Metterlo in stato farebbe anche ripartire l'effetto della
  // sottoscrizione a ogni commento.
  const taskConCommentiNuovi = useRef(new Set());

  // M-1 · La CODA dell'applyRow dei task è la stessa di notices e clients; è
  // la testa (il ramo `comments`) a essere sua e a restare scritta qui sotto.
  const applicaRigaTask = applicaRiga({
    action: "MERGE_TASK_ROW", mapper: fromDbTask, dispatch,
  });

  const ricaricaTasks = useDebouncedTableSubscription(["tasks", "comments"], async (isCurrent, tabelle) => {
    // Un commento aggiunto NON cambia i campi del task: cambia solo il thread
    // appeso al task. Finché il reload non sapeva quale tabella avesse generato
    // l'evento era costretto a riscaricare tutto per costruzione, e
    // `TASK_SELECT_WITH_COMMENTS` non è una query leggera — porta con sé i
    // commenti con i join sui nomi e non è paginata. Il caso più frequente
    // (qualcuno commenta) era anche il più caro.
    //
    // `tabelle === null` è l'idratazione iniziale (nessun evento): serve tutto.
    // Stesso schema di useListeData (A-1).
    const soloThread = tabelle !== null && tabelle.size > 0 && !tabelle.has("tasks");

    if (soloThread) {
      // Gli id si prendono e si azzerano PRIMA dell'await: un evento che
      // arriva mentre la query è in volo appartiene al giro successivo, e
      // lasciarlo nel Set lo farebbe scartare insieme a questo.
      const ids = [...taskConCommentiNuovi.current];
      taskConCommentiNuovi.current = new Set();
      // Nessun id raccolto significa che l'evento non portava un `task_id`
      // leggibile: si ricade sul corpus, che è la risposta corretta quando non
      // si sa quali task siano cambiati. Il fallback NON è ridondanza
      // difensiva — è ciò che rende questa correzione fail-safe: se un giorno
      // il payload smettesse di portare `task_id` si tornerebbe a scaricare
      // troppo, non a mostrare un thread vuoto, che è il guasto silenzioso
      // descritto nel preambolo di TaskThreads.comments in lib/api.js.
      const rCommenti = ids.length
        ? await TaskThreadsAPI.commentsForTasks(ids)
        : await TaskThreadsAPI.comments();
      if (!isCurrent()) return;
      if (rCommenti?.error) {
        console.error("[VoyageDesk] TaskThreads", rCommenti.error);
        onError(`Caricamento commenti fallito: ${rCommenti.error.message || ""}`);
        return;
      }
      const perTask = perTaskId(rCommenti.data, fromDbComment);
      dispatch(ids.length
        ? { type: "MERGE_TASK_COMMENTS", payload: { taskIds: ids, comments: perTask } }
        : { type: "SET_TASK_THREADS", payload: { comments: perTask } });
      return;
    }

    // A-3 · La finestra, o il corpus intero se una vista l'ha già chiesto.
    //
    // `includeDeleted` non è più cablato a `true`. Lo era per una ragione che
    // oggi ha un'altra risposta: la ri-idratazione realtime partiva subito dopo
    // un DELETE_TASK e senza il cestino avrebbe svuotato la vista Cestino. Dal
    // suggerimento strategico n.1 il soft-delete è un UPDATE applicato per riga
    // (`applyRow` → MERGE_TASK_ROW), che la task cestinata la TIENE in stato:
    // nessun reload parte più per un cestinamento. I reload completi rimasti
    // sono l'idratazione iniziale e la ripresa dopo un buco di connessione, e
    // in entrambi il cestino lo porta il caricamento dello storico — che
    // `storicoCompleto` rende permanente per la sessione proprio perché la
    // riconnessione non deve potare ciò che il Cestino sta mostrando.
    const completo = storicoCompleto.current;
    // M-3 · La generazione è condivisa con `caricaStorico`: entrambi scrivono
    // `state.tasks` con un SET_TASKS, e senza questo l'ordine fra le loro
    // risposte era quello di arrivo.
    const turno = prendiTurno(genTask.current);
    const { data, error } = await TasksAPI.list({
      withComments: true,
      includeDeleted: completo,
      completeDal: completo ? null : inizioFinestra(),
    });
    // Le due guardie si compongono e dicono due cose diverse: `isCurrent()` è
    // «l'effetto che mi ha lanciata è ancora vivo e non l'ha già rifatto»,
    // `genTask` è «sono ancora io l'ultima partita fra TUTTI gli scrittori di
    // questa fetta». Nessuna delle due implica l'altra.
    if (!isCurrent()) return;
    // Una vista ha chiesto il corpus intero mentre questa richiesta era in
    // volo: la risposta che abbiamo in mano è più STRETTA di ciò che lo stato
    // deve contenere. Non è coperta dalle due guardie qui sopra — quelle
    // ordinano le richieste, questa confronta ciò che ciascuna ha CHIESTO.
    if (!completo && storicoCompleto.current) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      const testo = `Caricamento task fallito: ${error.message || ""}`;
      onError(testo);
      segnaEsito("tasks", testo);
      segnaCaricata("tasks");
      // Se questa richiesta è quella che ha superato un `caricaStorico`, è
      // anche l'unica rimasta a poter chiudere la sua attesa — vedi
      // `chiudiAttesaStorico`. Vale anche sul fallimento: uno scheletro che
      // gira per sempre è disonesto quanto un vuoto dichiarato troppo presto.
      if (completo) chiudiAttesaStorico();
      return;
    }
    if (!vinceIlTurno(genTask.current, turno)) return;
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
    segnaEsito("tasks", null);
    segnaCaricata("tasks");
    if (completo) chiudiAttesaStorico();
  }, {
    enabled, deps: [enabled],
    // Suggerimento strategico n.1 dell'audit del 16 agosto. Un evento sulla
    // tabella `tasks` porta la riga intera nel payload (`payload.new`): non
    // serve più il reload sopra, che scarica TASK_SELECT_WITH_COMMENTS —
    // join sui nomi, cestino incluso, non paginata — per aggiornare UN campo
    // di UN task. `comments` resta fuori (`return false`): quegli eventi non
    // portano righe di `tasks`, e il ramo `soloThread` qui sopra è già la
    // versione selettiva per loro.
    //
    // Sincrono e non async: a differenza del reload qui sopra non c'è alcuna
    // query di rete da attendere, quindi non serve `isCurrent()` — non esiste
    // una risposta che possa arrivare "in ritardo" rispetto a un'altra.
    applyRow: (tbl, payload) => {
      // A-1: gli eventi `comments` non portano una riga di `tasks` e restano
      // sul reload selettivo (`return false` → entrano nel debounce), ma il
      // loro payload dice QUALE task è cambiato. Raccoglierlo qui è ciò che
      // permette al ramo `soloThread` di chiedere i commenti di quei soli
      // task invece dell'intera tabella.
      //
      // `old` oltre a `new` perché su una DELETE la riga arriva solo lì; su
      // INSERT/UPDATE `new` è quella buona. Se non c'è nessuno dei due l'id
      // non si aggiunge, e il fallback sul corpus fa il resto.
      if (tbl === "comments") {
        const tid = payload.new?.task_id ?? payload.old?.task_id;
        if (tid) taskConCommentiNuovi.current.add(tid);
        return false;
      }
      if (tbl !== "tasks") return false;
      // Il ramo DELETE della fabbrica è reale solo per PURGE_TASK/EMPTY_TRASH:
      // il soft-delete (DELETE_TASK) è un UPDATE che valorizza deleted_at e
      // passa dal ramo normale — la task resta in stato con `deletedAt`
      // impostato, come già faceva `includeDeleted: true` sul reload completo.
      return applicaRigaTask(tbl, payload);
    },
  });

  // A-3, seconda metà · Il corpus intero, su richiesta di chi lo guarda.
  //
  // La chiamano — una volta sola, al mount — le viste per cui lo storico NON è
  // materiale d'archivio ma il contenuto: Archivio, Cestino, le statistiche di
  // sistema, l'export e la ricerca avanzata (vedi state/StoricoTaskContext.jsx
  // per l'elenco e il perché di ciascuna). Sono tutte già `lazy()` o dietro un
  // tab, cioè aperte da una minoranza di sessioni: è lo spostamento del costo
  // su chi lo usa, non la sua rimozione.
  //
  // `SET_TASKS` e non un merge: il corpus intero è un SOVRAINSIEME della
  // finestra, quindi sostituire è già la fusione giusta — e `fondiScrittureInVolo`
  // continua a proteggere gli id con una scrittura in volo, come per ogni
  // altro refetch.
  //
  // Chiude anche `caricamento.tasks`: se questa richiesta ha scartato la risposta
  // dell'idratazione iniziale (il ramo `!completo && storicoCompleto.current`
  // qui sopra), è l'unica rimasta a poterlo fare, e uno scheletro che gira per
  // sempre è disonesto quanto un vuoto dichiarato troppo presto.
  const caricaStorico = useCallback(async () => {
    if (!enabled || storicoCompleto.current) return;
    storicoCompleto.current = true;
    setCaricandoStorico(true);
    const turno = prendiTurno(genTask.current);
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
    // M-3 · Una richiesta è partita DOPO la nostra: la sua risposta è più
    // recente, e il corpus lo consegna lei — compresa la chiusura dell'attesa,
    // che per questo NON si tocca qui (vedi `chiudiAttesaStorico`). Chi è
    // partito dopo di noi ha letto `storicoCompleto.current` già alzato,
    // quindi sta chiedendo il corpus intero come noi: non c'è nessun caso in
    // cui cedergli il passo restringa ciò che finisce in stato.
    if (error) {
      // Non ce l'abbiamo: l'idratazione torna alla finestra e un rimontaggio
      // della vista riprova. Lasciare il ref alzato significherebbe chiedere
      // per sempre un corpus che non è mai arrivato.
      storicoCompleto.current = false;
      setCaricandoStorico(false);
      segnaCaricata("tasks");
      console.error("[VoyageDesk] Tasks.list (storico)", error);
      onError(`Caricamento dello storico task fallito: ${error.message || ""}`);
      return;
    }
    if (!vinceIlTurno(genTask.current, turno)) return;
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
    setCaricandoStorico(false);
    segnaCaricata("tasks");
  }, [enabled, dispatch, onError, segnaCaricata]);

  // M-1 (passo 2), seconda metà · L'anagrafica intera, su richiesta di chi la
  // guarda. La chiamano — una volta sola, al mount — `ClientiView` (dove
  // l'anagrafica È la vista) e `ListeViaggio` (i due selettori di titolare e
  // cointestatario): vedi `state/ClientiCompletiContext.jsx` per il perché di
  // ciascuna e per il perché l'elenco è corto.
  //
  // Stessa sequenza di `caricaStorico`: il ref si alza PRIMA della richiesta —
  // così ogni reload concorrente sa già che l'anagrafica va tenuta — e si
  // riabbassa se quella fallisce, perché lasciarlo alzato significherebbe
  // pretendere per sempre un corpus mai arrivato.
  const caricaClienti = useCallback(async () => {
    if (!enabled || clientiCompleti.current) return;
    clientiCompleti.current = true;
    setCaricandoClienti(true);
    const turno = prendiTurno(genClienti.current);
    const { data, error } = await ClientsAPI.list();
    // M-3 · Gemello del ramo in `caricaStorico`, e per la stessa ragione: a
    // consegnare l'anagrafica — e a chiudere l'attesa — è chi è partito per
    // ultimo. Il reload della sottoscrizione che ci ha superati sta chiedendo
    // esattamente la stessa `ClientsAPI.list()`.
    if (error) {
      clientiCompleti.current = false;
      setCaricandoClienti(false);
      segnaCaricata("clients");
      console.error("[CRM] anagrafica completa", error);
      onError(`Caricamento clienti fallito: ${error.message || ""}`);
      return;
    }
    if (!vinceIlTurno(genClienti.current, turno)) return;
    dispatch({ type: "SET_CLIENTS", payload: (data || []).map(fromDbClient) });
    setCaricandoClienti(false);
    segnaCaricata("clients");
  }, [enabled, dispatch, onError, segnaCaricata]);

  const ricaricaNotices = useDebouncedTableSubscription(["notices"], idratazione({
    entita: "notices", tag: "[VoyageDesk] Notices.list", etichetta: "avvisi",
    list: () => NoticesAPI.list(), mapper: fromDbNotice, action: "SET_NOTICES",
    dispatch, onError, segnaCaricata, segnaEsito,
  }), {
    enabled, deps: [enabled],
    // Suggerimento strategico n.1 dell'audit del 16 agosto: `notices` è una
    // tabella piatta — nessun join, nessuna riga figlia — quindi `fromDbNotice`
    // sul payload realtime è già la stessa forma di una riga di `Notices.list()`
    // per quel che serve all'app (ignora `row.users`, mai letto: vedi
    // NoticeBoard.jsx). L'ordinamento (pinned prima, poi più recenti) lo
    // ricalcola NoticeBoard da solo a ogni render — l'array in stato non deve
    // essere già ordinato, quindi push/replace/filter bastano.
    applyRow: applicaRiga({ action: "MERGE_NOTICE_ROW", mapper: fromDbNotice, dispatch }),
  });

  // Idratazione + realtime categorie task (Admin → Categorie). Prima di questa
  // sub, ADD_CATEGORY/UPDATE_CATEGORY/REMOVE_CATEGORY toccavano solo lo stato
  // React in memoria: una categoria creata spariva al primo reload perché non
  // veniva mai scritta su Supabase (vedi migration 20260630_categories_table).
  const ricaricaCategorie = useDebouncedTableSubscription(["categories"], async (isCurrent) => {
    const { data, error } = await CategoriesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Categories.list", error);
      const testo = `Caricamento categorie fallito: ${error.message || ""}`;
      onError(testo);
      segnaEsito("categories", testo);
      segnaCaricata("categories");
      return;
    }
    const categories = {};
    for (const row of data || []) {
      const c = fromDbCategory(row);
      categories[c.key] = { label: c.label, icon: c.icon, color: c.color, bg: c.bg };
    }
    if (!stessaMappa(ultimeCategorie.current, categories)) {
      ultimeCategorie.current = categories;
      dispatch({ type: "SET_CATEGORIES", payload: categories });
    }
    segnaEsito("categories", null);
    segnaCaricata("categories");
    // B-1 (audit del 19 agosto): niente canale permanente per una tabella da
    // ~10 righe che cambia quando un admin apre il pannello. L'idratazione e
    // il reload alla ripresa restano; il prezzo dichiarato è che una categoria
    // creata compaia sugli altri client al primo ritorno in primo piano invece
    // che nell'istante — vedi `senzaCanale` in useDebouncedTableSubscription.
  }, { enabled, deps: [enabled], senzaCanale: true });

  // Refresh team live (sessione 29). Senza questo sub, l'admin invita o
  // approva un utente e l'elenco Team non si aggiorna fino a un reload.
  // Risub-scrive ai change su `users` e ricarica la lista completa (inclusi
  // pending=true e active=false: l'admin deve vederli). normalize() allinea
  // photo_url → photoUrl, idem AuthContext.
  //
  // filterEvent (sessione 29 cleanup): saltiamo gli UPDATE che cambiano solo
  // i campi di presence (status, last_seen_at) — la presence ha già il suo
  // proprio canale (presenceMap), il team non ne ha bisogno. Senza filtro,
  // ogni heartbeat di un altro client (ogni 30s) provocava un reload del
  // team. REPLICA IDENTITY FULL su public.users (migration 20260612) ci
  // garantisce il pre-image in payload.old per fare il confronto.
  //
  // ─── B-1 · il team NON si rilegge al mount ───────────────────────────────
  // (audit di architettura del 16 agosto)
  //
  // `AuthContext.loadProfile` ha già letto `users` per intero — deve, perché
  // decide se montare l'app — e produce ESATTAMENTE questa forma: `normalize`
  // (photo_url → photoUrl) più i contatti dell'utente loggato reinnestati
  // nella sua sola entry, cioè le due righe qui sotto. Quel risultato arriva
  // fin qui come `teamIniziale`, quindi il primo fetch di questa sottoscrizione
  // era una seconda query identica a un round-trip di distanza.
  //
  // Le due responsabilità che il primo fetch assolveva e che ora vanno assolte
  // a mano (vedi il commento su `saltaPrimoCaricamento`): seminare
  // `ultimoTeam` — senza, il primo reload realtime vero crederebbe che il team
  // sia cambiato e sostituirebbe l'array, invalidando AppDataContext per
  // nulla — e chiudere il flag di caricamento, che è già `false` per
  // costruzione perché i dati ci sono. Sono nell'effetto qui sotto e non in un
  // `useState` iniziale perché `teamIniziale` non è garantito al primo render
  // in modalità demo (nessun login, nessun AuthContext).
  const abbiamoGiaIlTeam = enabled && Array.isArray(teamIniziale) && teamIniziale.length > 0;
  useEffect(() => {
    if (!abbiamoGiaIlTeam) return;
    ultimoTeam.current = teamIniziale;
    segnaCaricata("team");
  }, [abbiamoGiaIlTeam, teamIniziale, segnaCaricata]);

  const ricaricaTeam = useDebouncedTableSubscription(["users"], async (isCurrent) => {
    // listAll() legge solo public.users → NON contiene email/phone, che vivono
    // in public.user_contacts (RLS own+admin). Senza ri-merge, ad ogni refresh
    // del team (incluso quello iniziale al mount) i contatti dell'utente loggato
    // verrebbero azzerati nello stato: ProfileEditor li mostrerebbe vuoti dopo
    // il reload, facendo sembrare che le modifiche a mail/telefono non si
    // persistano (in realtà sono salvate, ma sovrascritte qui). Li recuperiamo
    // e li reinnestiamo nella sola entry dell'utente loggato, come fa
    // AuthContext.loadProfile alla prima idratazione.
    const [listRes, contactsRes] = await Promise.all([
      UsersAPI.listAll(),
      currentUserId
        ? UsersAPI.getContacts(currentUserId)
        : Promise.resolve({ data: null }),
    ]);
    const { data, error } = listRes;
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Users.listAll", error);
      // ⚠️ A-3 · questo ramo era l'unico dei sei a NON chiamare `onError`: un
      // team che non si carica non produceva alcun segnale, né toast né altro,
      // e la matrice dei permessi lato client si calcola su `state.team`. Ora
      // dice entrambe le cose — l'annuncio e la condizione che dura.
      const testo = `Caricamento team fallito: ${error.message || ""}`;
      onError(testo);
      segnaEsito("team", testo);
      segnaCaricata("team");
      return;
    }
    const myContacts = {
      email: contactsRes?.data?.email ?? null,
      phone: contactsRes?.data?.phone ?? null,
    };
    const team = (data || []).map(u => {
      const base = { ...u, photoUrl: u.photo_url ?? null };
      return u.id === currentUserId ? { ...base, ...myContacts } : base;
    });
    // Un reload che rilegge le stesse righe non deve sostituire l'array: vedi
    // il commento su `ultimoTeam`. `segnaCaricata` resta FUORI dal ramo — il
    // primo fetch chiude lo scheletro anche quando non cambia niente (team
    // vuoto che resta vuoto), altrimenti la vista girerebbe per sempre.
    if (!stessaLista(ultimoTeam.current, team)) {
      ultimoTeam.current = team;
      dispatch({ type: "SET_TEAM", payload: team });
    }
    // FUORI dal ramo `stessaLista`, come `segnaCaricata` e per la stessa
    // ragione: un reload riuscito che rilegge righe identiche ha comunque
    // rimediato all'errore precedente, e lasciarlo acceso perché «non è
    // cambiato niente» terrebbe a schermo un allarme falso.
    segnaEsito("team", null);
    segnaCaricata("team");
  }, {
    enabled,
    delay: 800,
    deps: [enabled],
    saltaPrimoCaricamento: abbiamoGiaIlTeam,
    filterEvent: (payload) => {
      if (payload?.eventType !== "UPDATE") return true; // INSERT/DELETE sempre
      const oldRow = payload.old;
      const newRow = payload.new;
      if (!oldRow || !newRow) return true; // pre-image mancante → safe-reload
      const PRESENCE_ONLY = new Set(["status", "last_seen_at", "origin_client"]);
      for (const key of Object.keys(newRow)) {
        if (PRESENCE_ONLY.has(key)) continue;
        if (oldRow[key] !== newRow[key]) return true; // campo "interessante" cambiato
      }
      return false; // solo presence → skip reload
    },
  });

  // I clienti erano l'unica entità di dominio senza subscription: una
  // useEffect al mount e nient'altro. Chi creava un cliente lo vedeva subito
  // (aggiornamento ottimistico del reducer), CHIUNQUE ALTRO no — fino a un
  // reload completo della pagina.
  //
  // Non è un caso di laboratorio, e il sintomo non è "un dato che manca": il
  // modulo Liste crea clienti per conto proprio (AggiungiBeneficiarioModal →
  // newClientName), quindi l'utente B non trovava nell'autocomplete un cliente
  // che l'utente A aveva appena creato, e lo ricreava a mano. Il risultato
  // osservabile era il DOPPIONE in anagrafica, che a posteriori non è banale
  // da deduplicare.
  //
  // Il gate `enabled` resta identico: senza login si usano i mock, quindi
  // niente fetch e niente subscription.
  // ─── M-1 (passo 2) · l'anagrafica NON si scarica più all'avvio ───────────
  // (audit performance/UX del 19 agosto)
  //
  // `ClientsAPI.list()` è ancora la lettura giusta — paginata, intera, senza
  // troncamenti silenziosi — ma non parte più da qui: parte da `caricaClienti`
  // qui sotto, quando una vista dichiara di averne bisogno. La sottoscrizione
  // resta, perché il suo `applyRow` è ciò che tiene allineate le schede che
  // arrivano dal realtime, e resta anche il reload di ripresa — ma entrambi
  // sono subordinati a `clientiCompleti`: ricaricare un'anagrafica che nessuno
  // ha chiesto sarebbe il difetto rimesso al suo posto per un'altra strada.
  const ricaricaClienti = useDebouncedTableSubscription(["clients"], idratazione({
    entita: "clients", tag: "[CRM] hydration", etichetta: "clienti",
    list: () => ClientsAPI.list(), mapper: fromDbClient, action: "SET_CLIENTS",
    dispatch, onError, segnaCaricata, segnaEsito,
    // Nessuno ha chiesto l'anagrafica: non c'è niente da ricaricare. Non è un
    // salto dell'idratazione — è che l'idratazione dei clienti ora la chiede
    // chi la guarda.
    quandoSaltare: () => !clientiCompleti.current,
    // M-3 · L'anagrafica ha due scrittori: questo reload e `caricaClienti`.
    gen: genClienti,
    alTermine: chiudiAttesaClienti,
  }), {
    enabled, deps: [enabled],
    // Suggerimento strategico n.1 dell'audit del 16 agosto. `clients` è
    // l'entità con la finestra di rischio più alta descritta in
    // pendingWrites.js — l'unica con PII di persone esterne al team — ed era
    // anche l'unica delle tre a ricaricare l'INTERA anagrafica (818+ righe
    // storiche, prima di ST-3) per un singolo campo cambiato da un altro
    // agente. `fromDbClient` è flat come `fromDbNotice`: nessun join da
    // perdere applicando la sola riga.
    // ⚠️ M-1 (passo 2) · Finché nessuno ha chiesto l'anagrafica non c'è niente
    // da tenere allineato, e applicare la riga sarebbe PEGGIO che ignorarla:
    // `applicaRigaRealtime` appende le righe che non conosce
    // (state/pendingWrites.js, `idx < 0`), quindi su un elenco vuoto ogni
    // evento costruirebbe un'anagrafica di uno, due, tre clienti — parziale e
    // indistinguibile da una vera per chiunque la legga. `quandoIgnorare`
    // ritorna `true`: l'evento È stato gestito, la decisione è che non serve
    // fare nulla; un `false` lo farebbe cadere nel debounce e nel reload.
    applyRow: applicaRiga({
      action: "MERGE_CLIENT_ROW", mapper: fromDbClient, dispatch,
      quandoIgnorare: () => !clientiCompleti.current,
    }),
  });

  // Idratazione + realtime dei template di messaggio chat (A-1 dell'audit
  // dell'11 agosto). Stesso trattamento di `categories`: prima non c'era
  // alcuna subscription perché non c'era alcuna tabella da cui idratare — i
  // quattro template di makeInitialState erano l'unico stato possibile, e
  // ADD/UPDATE/DELETE_MESSAGE_TEMPLATE scrivevano solo lo state React.
  // B-1: stesso trattamento di `categories` qui sopra, e per la stessa ragione
  // — quattro righe, gestite dall'admin.
  const ricaricaTemplate = useDebouncedTableSubscription(["message_templates"], idratazione({
    entita: "messageTemplates", tag: "[VoyageDesk] MessageTemplates.list",
    etichetta: "template messaggio",
    list: () => MessageTemplatesAPI.list(), mapper: fromDbMessageTemplate,
    action: "SET_MESSAGE_TEMPLATES",
    dispatch, onError, segnaCaricata, segnaEsito,
  }), { enabled, deps: [enabled], senzaCanale: true });

  // `storicoTask` è la coppia che alimenta <StoricoTaskProvider>: la richiesta
  // e il flag di attesa. Non è un terzo flag di `caricamento` perché non descrive
  // un'ENTITÀ che si sta idratando — le task ci sono già — ma una porzione di
  // quell'entità che una vista specifica sta aspettando.
  // `caricamentoClienti` è il flag che ClientiView conosce da sessione 23 (si
  // chiamava `crmLoading` fino a B-3 del 25 agosto, quando la lingua degli
  // identificatori è diventata una regola scritta). Vale `caricandoClienti` e
  // non `caricamento.clients`: quest'ultimo descriveva l'idratazione iniziale,
  // che per i clienti non esiste più.
  // A-3 · le sei entità con l'handle che le ricarica. Le coppie stanno qui —
  // l'unico punto che conosce sia i nomi passati a `segnaEsito` sia le
  // sottoscrizioni che li possiedono — e la politica sta nell'hook.
  const erroriCaricamento = useErroriComposti(componiErrori, [
    ["tasks", ricaricaTasks],
    ["notices", ricaricaNotices],
    ["categories", ricaricaCategorie],
    ["team", ricaricaTeam],
    ["clients", ricaricaClienti],
    ["messageTemplates", ricaricaTemplate],
  ]);

  return {
    caricamento,
    erroriCaricamento,
    caricamentoClienti: caricandoClienti,
    storicoTask: { richiedi: caricaStorico, caricando: caricandoStorico },
    clientiCompleti: { richiedi: caricaClienti, caricando: caricandoClienti },
  };
}
