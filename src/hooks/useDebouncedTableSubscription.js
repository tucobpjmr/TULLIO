// ─── useDebouncedTableSubscription (caveat #10) ─────────────────────────────
// Hook che astrae il pattern realtime ripetuto in VoyageDesk.jsx: idrata da
// Supabase al mount, poi si sottoscrive a una o più tabelle e ri-carica
// (debounced) ad ogni evento postgres. Gli eventi arrivano a raffica durante
// gli inserimenti bulk → il debounce coalesce le reload.
//
// `reload` riceve un predicato `isCurrent()`: ritorna false se l'effetto è
// stato smontato (cancelled) o se una reload più recente è già partita mentre
// questa era in volo (generation counter). Va chiamato DOPO ogni await, prima
// di scrivere nello stato, per scartare le risposte stale (caveat #21).
//
// SECONDO ARGOMENTO: `tabelle`. Un Set con i nomi delle tabelle che hanno
// generato gli eventi coalescati da questo debounce, oppure `null` per
// l'idratazione iniziale (dove non c'è nessun evento e va caricato tutto).
// Chi si sottoscrive a più tabelle può così ricaricare SOLO la parte che
// quegli eventi possono davvero aver invalidato, invece di ricaricare tutto
// per costruzione. Ignorarlo mantiene il comportamento precedente, quindi i
// consumatori che non lo leggono non cambiano di una virgola.
//
// Il nome della tabella arriva dalla closure creata al momento della
// sottoscrizione, non da `payload.table`: è vero che supabase-js lo espone,
// ma qui lo conosciamo già per costruzione e non c'è motivo di dipendere
// dalla forma del payload per un'informazione che abbiamo in mano.
//
// ─── S-2 · ripresa dopo un buco di connessione ─────────────────────────────
// Postgres Changes (Supabase Realtime) non offre ripresa da offset: se il
// socket cade — schermo bloccato, cambio rete, tab in background — il canale
// si riaggancia da solo (supabase-js lo fa internamente), ma gli eventi
// emessi nel frattempo non vengono MAI consegnati. Non c'è un ID di
// sequenza da cui ripartire: l'unico modo per sapere cosa si è perso è non
// saperlo, e ricaricare tutto — esattamente come all'idratazione iniziale
// (`tabelle = null`, stesso branch che ogni reload già gestisce).
//
// Due segnali, entrambi euristici e non affidabili al 100% ma correlati con
// un'interruzione: `online` (la rete è tornata) e `visibilitychange` verso
// `visible` (la scheda/app torna in primo piano — su iOS è il caso più
// comune: schermo bloccato per qualche minuto droppa il websocket). Nessuno
// dei due prova che qualcosa sia stato perso, ma il costo di un reload di
// troppo è una query; il costo di un reload mancato è dati muti finché
// l'utente non ricarica la pagina a mano.
//
// ─── M-3 · il ritorno in primo piano ha una SOGLIA ─────────────────────────
// "Il costo è una query" era vero per una sottoscrizione sola. Ma di questo
// hook ce ne sono NOVE istanze vive insieme (sei in useAppHydration, più chat,
// notifiche e liste viaggio), e ognuna ricarica le proprie tabelle INTERE: un
// singolo `visibilitychange` verso `visible` costava quindi nove SELECT
// complete, task e messaggi compresi. Su mobile quell'evento non significa
// affatto "sono stato via a lungo": lo emettono il commutatore di app, la
// tendina delle notifiche, il selettore di file, il picker della fotocamera —
// cioè proprio i gesti con cui si allega un file o si risponde a una notifica,
// più volte nella stessa manciata di secondi.
//
// Un buco di consegna richiede però che il websocket sia caduto, e non cade
// perché la tab è passata in secondo piano per due secondi. Teniamo quindi il
// momento in cui si è passati a `hidden` e ricarichiamo solo se la pausa è
// stata abbastanza lunga da poter aver droppato il socket. Sotto la soglia non
// si perde nulla: la sottoscrizione era viva per tutto il tempo e gli eventi
// sono arrivati normalmente. `online` resta invece senza soglia — lì la
// caduta della rete è un fatto, non un'euristica.
import { useCallback, useEffect, useRef } from "react";
import { subscribeToTable } from "../lib/api.js";
import { segnalaStatoCanale, dimenticaCanale } from "../lib/freschezzaRealtime.js";

// Identificatore univoco di SOTTOSCRIZIONE per il registro della freschezza.
// Non basta il nome della tabella: `users` è osservata due volte dalla stessa
// sessione (refresh del team e presenza), e due chiavi uguali farebbero
// sparire lo stato della prima sotto quello della seconda.
let seqSottoscrizione = 0;

// Quanto deve essere durata la permanenza in secondo piano perché il ritorno
// valga come possibile buco di consegna. Trenta secondi: sopra c'è il
// congelamento dei timer/socket che i browser mobili applicano alle tab
// nascoste, sotto ci sono i gesti di pochi secondi (allega file, leggi una
// notifica, cambia app e torna) durante i quali il canale resta agganciato.
export const SOGLIA_RIPRESA_MS = 30_000;

// ─── applyRow (suggerimento strategico n.1, audit del 16 agosto) ──────────
// `reload` ricarica un'ENTITÀ INTERA: la risposta giusta quando un evento può
// aver invalidato più righe (una lista creata cambia elenco E cestino) o
// quando non c'è altro modo di saperlo (l'idratazione iniziale, la ripresa
// dopo un buco di connessione — `tabelle = null` in entrambi i casi, MAI
// passato da qui). Ma un evento su una tabella "piatta" — nessun join
// annidato di cui perdere traccia, nessuna riga figlia da capire se
// invalidata — porta già tutto il necessario nel proprio payload
// (`payload.new`/`payload.old`), e ricaricare l'intera lista per applicarne
// UNA riga è il costo che questo parametro esiste per evitare.
//
// `applyRow(tabella, payload) => boolean`: se ritorna `true`, il chiamante ha
// già gestito l'evento (tipicamente dispatchando una `MERGE_*_ROW` che
// applica la riga allo state) e l'evento NON entra nel debounce — nessun
// reload, di nessun tipo. Se ritorna `false` (o non è passato), il
// comportamento è quello di sempre: l'evento alimenta il debounce e innesca
// `reload` con l'insieme di tabelle toccate. Una sottoscrizione a più
// tabelle può gestirne alcune per riga e lasciare le altre al reload
// (`applyRow` riceve `tabella` proprio per poter scegliere caso per caso).
// ─── saltaPrimoCaricamento (B-1, audit di architettura del 16 agosto) ─────
// Questo hook idrata al mount E si sottoscrive: sono due cose insieme perché
// nella stragrande maggioranza dei casi vanno insieme. In UN caso no.
//
// All'avvio `AuthContext.loadProfile` legge `users` per intero — deve, perché
// decide SE montare l'app (caveat #17: montarla con team vuoto congela i mock
// nel reducer) — e pochi millisecondi dopo l'idratazione la rileggeva
// identica. Due query uguali a un round-trip di distanza, su ogni avvio di
// sessione, per un dato che il chiamante aveva già in mano.
//
// `saltaPrimoCaricamento: true` salta il solo fetch iniziale: la
// sottoscrizione parte lo stesso, e ogni reload successivo — evento realtime,
// ripresa dopo un buco di connessione — si comporta esattamente come prima.
// ⚠️ Chi lo passa si assume DUE responsabilità che il primo fetch assolveva
// gratis: seminare lo stato con i dati che dice di avere già, e chiudere il
// proprio flag di caricamento. Ometterne una lascia una vista che gira per
// sempre sotto uno scheletro, che è il difetto peggiore dei due che questa
// opzione evita.
// M-5 dell'audit del 4 settembre: `filterEvent` e `applyRow` non hanno un
// valore di default, quindi senza questo JSDoc `checkJs` non li vede affatto
// nel tipo delle opzioni (li infersce solo dagli argomenti CON default) — e
// segnala «la proprietà non esiste» a ogni chiamante che li passa davvero,
// cioè `useAppHydration.js`.
/**
 * @param {string|string[]} tables
 * @param {(isCurrent: () => boolean, tabelle: Set<string>|null) => (void|Promise<void>)} reload
 * @param {object} [opts]
 * @param {boolean} [opts.enabled]
 * @param {number} [opts.delay]
 * @param {any[]} [opts.deps]
 * @param {(payload: object) => boolean} [opts.filterEvent]
 * @param {(tabella: string, payload: object) => boolean} [opts.applyRow]
 * @param {boolean} [opts.saltaPrimoCaricamento]
 * @param {boolean} [opts.senzaCanale]
 */
export function useDebouncedTableSubscription(
  tables,
  reload,
  {
    enabled = true, delay = 200, deps = [], filterEvent, applyRow,
    saltaPrimoCaricamento = false, senzaCanale = false,
  } = {}
) {
  // reload/filterEvent/applyRow possono catturare closure che cambiano ad ogni
  // render: li teniamo in ref così l'effetto non si ri-sottoscrive ad ogni
  // render, ma vedono sempre i valori freschi. Le dipendenze "vere" sono in `deps`.
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const filterRef = useRef(filterEvent);
  filterRef.current = filterEvent;
  const applyRowRef = useRef(applyRow);
  applyRowRef.current = applyRow;

  // ─── A-3 · il «Riprova» passa da QUI e non da una seconda chiamata ────────
  // (audit UX/errori del 31 agosto)
  //
  // Un caricamento fallito ora ha una via d'uscita (vedi `erroriCaricamento`
  // in useAppHydration), e quella via deve rifare la richiesta CON LO STESSO
  // ordinamento di tutte le altre. Richiamare a mano la funzione di reload da
  // fuori la farebbe partire con un `isCurrent` suo, cioè fuori dal
  // gen-counter di questo effetto: la sua risposta non saprebbe di essere
  // stale rispetto a un reload realtime partito nel frattempo, e potrebbe
  // sovrascriverlo. È esattamente la corsa che `run` esiste per ordinare.
  //
  // Il ref è riscritto a ogni ri-esecuzione dell'effetto e azzerato nel
  // cleanup: un «Riprova» premuto su una vista che nel frattempo è stata
  // smontata non deve far partire una richiesta di cui nessuno leggerà mai la
  // risposta.
  const ricaricaRef = useRef(null);
  const ricarica = useCallback(() => { ricaricaRef.current?.(); }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let gen = 0;

    const run = (tabelle) => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen, tabelle);
    };

    // `null` e non un insieme di tabelle: un «Riprova» dopo un errore non sa
    // quale parte sia mancata — la richiesta è fallita per intero — ed è lo
    // stesso caso dell'idratazione iniziale e della ripresa dopo un buco di
    // connessione, che passano da qui con lo stesso argomento.
    ricaricaRef.current = () => run(null);

    // Idratazione iniziale: `null`, non un Set vuoto. I due casi vanno
    // distinguibili — "nessun evento, carica tutto" non è "eventi da un
    // insieme vuoto di tabelle", che non esiste.
    //
    // `gen` viene incrementato comunque anche quando si salta (B-1): il
    // generation counter conta le richieste PARTITE, e saltarne una senza
    // avanzarlo lascerebbe il primo reload vero con `my === 1` — lo stesso
    // valore che avrebbe avuto senza il salto, il che è innocuo oggi ma smette
    // di esserlo il giorno in cui qualcuno legge `gen` come "quante ne sono
    // partite".
    if (saltaPrimoCaricamento) gen += 1;
    else run(null);

    let timer = null;
    // Tabelle accumulate dagli eventi che il debounce sta coalescendo. Si
    // svuota quando il timer scatta, così ogni reload vede esattamente le
    // tabelle della propria finestra e non quelle di quella precedente.
    let pending = new Set();

    // filterEvent (se passato) può ritornare false per scartare un evento
    // prima che alimenti il debounce: utile per la sub `users` (sessione 29),
    // dove gli UPDATE da heartbeat presence (status/last_seen_at) non
    // richiedono il reload del team.
    const debounced = (tbl, payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      // applyRow PRIMA di alimentare il debounce: se ha già gestito l'evento
      // (riga applicata allo state), non c'è nulla da coalescere né da
      // ricaricare — l'evento si ferma qui, non finisce mai in `pending`.
      //
      // ─── A-1 · una reload in volo non deve riportare indietro la riga ─────
      // (audit del 29 agosto)
      // `applyRow` scrive nello state SUBITO, ma una `reload` innescata da un
      // evento precedente può essere già in volo: la sua risposta riflette lo
      // stato di PRIMA di questa riga e, se scritta ora, la sovrascriverebbe
      // — senza che nessun secondo giro se ne accorga, perché questo evento
      // non alimenta mai `pending`. Incrementare `gen` qui (come fa già
      // `saltaPrimoCaricamento` più sopra) invalida quella reload: il suo
      // `isCurrent()` fallirà all'arrivo e la risposta stale verrà scartata
      // invece di rimpiazzare la riga appena applicata.
      if (applyRowRef.current?.(tbl, payload)) {
        gen += 1;
        return;
      }
      pending.add(tbl);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tabelle = pending;
        pending = new Set();
        run(tabelle);
      }, delay);
    };

    // ─── B-1 · `senzaCanale`: l'idratazione e la ripresa, senza il canale ───
    // (audit performance/UX del 19 agosto)
    //
    // Un canale realtime per tabella è la scelta giusta per le tabelle su cui
    // il realtime È la funzionalità — task, avvisi, clienti, chat, notifiche.
    // Non lo è per `categories` (~10 righe) e `message_templates` (4): cambiano
    // quando un admin apre il pannello, cioè poche volte l'anno, e tenevano
    // aperto un canale per sessione ciascuna, per sempre.
    //
    // Il resto di questo hook — idratazione iniziale, reload su `online` e sul
    // ritorno in primo piano oltre la soglia — NON dipende dai canali: è già
    // scritto sotto e continua a funzionare. `tables` resta dichiarato perché
    // dice a quali tabelle si riferisce il reload, che è informazione utile a
    // chi legge anche quando nessuno le ascolta.
    //
    // ⚠️ IL PREZZO, dichiarato: una categoria creata da un admin compare sugli
    // altri client al primo ritorno in primo piano (soglia 30 s) o al reload,
    // non nell'istante in cui viene creata. Per chi la crea è immediato
    // comunque — il reducer è ottimistico. È il compromesso che B-1 dichiara,
    // e vale per queste due tabelle soltanto: applicarlo a una tabella
    // operativa sarebbe un'altra cosa.
    const list = senzaCanale
      ? []
      : (Array.isArray(tables) ? tables : [tables]);

    // `online`/`visibilitychange` possono arrivare quasi insieme (sbloccare lo
    // schermo spesso significa anche riagganciare la rete): un piccolo debounce
    // dedicato coalesce i due in un solo reload, invece di due ravvicinati.
    let reconnectTimer = null;
    const onReconnectSignal = () => {
      // Un reload parziale può già essere in coda (con un `delay` di default
      // più corto dei 300ms qui sotto, scatterebbe per primo): il reload
      // completo che sta per partire lo copre comunque, quindi lo assorbiamo
      // SUBITO, non quando il timer di ripresa scatta — altrimenti la corsa
      // fra i due timer la vincerebbe il parziale ed entrambi girerebbero.
      clearTimeout(timer);
      pending = new Set();
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => run(null), 300);
    };
    const onOnline = () => onReconnectSignal();

    // ─── A-1 · lo stato del canale, segnalato E recuperato ──────────────────
    // (audit UX/errori del 31 agosto)
    //
    // Le due metà sono inseparabili, ed è la lezione di A-2/A-3 del 28 agosto:
    // segnalare senza recuperare lascerebbe una striscia che dice «ricarica»
    // anche dopo che il canale è tornato su da solo (supabase-js riaggancia in
    // autonomia); recuperare senza segnalare rimetterebbe i dati a posto senza
    // mai dire all'utente che per un po' non lo erano.
    //
    // ⚠️ Il riaggancio riuscito è un caso di `onReconnectSignal` come `online`
    // e non un evento a sé: Postgres Changes non ha ripresa da offset (vedi
    // S-2 in testa), quindi nella finestra in cui il canale era giù sono
    // passati eventi che non vedremo MAI. L'unico modo di sapere cosa si è
    // perso è non saperlo e ricaricare.
    const idSottoscrizione = ++seqSottoscrizione;
    const chiaviCanale = [];
    // `false` finché non si rompe qualcosa: il PRIMO 'SUBSCRIBED' è
    // l'aggancio iniziale, non un ritorno, e innescare lì un reload
    // significherebbe rifare l'idratazione appena fatta a ogni mount.
    let eraDegradato = false;

    const unsubs = list.map((tbl) => {
      const chiave = `${tbl}#${idSottoscrizione}`;
      chiaviCanale.push(chiave);
      return subscribeToTable(tbl, (p) => debounced(tbl, p), (stato) => {
        if (cancelled) return;
        segnalaStatoCanale(chiave, stato);
        if (stato === "SUBSCRIBED") {
          if (eraDegradato) onReconnectSignal();
          eraDegradato = false;
          return;
        }
        eraDegradato = true;
      });
    });

    // `null` = non siamo (mai stati) in secondo piano da quando l'effetto è
    // partito. Se il montaggio avviene a scheda già nascosta partiamo dal
    // momento del montaggio: prima non c'era nulla da perdere, la
    // sottoscrizione non esisteva.
    let nascostoDa = document.visibilityState === "hidden" ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        nascostoDa = Date.now();
        return;
      }
      const pausa = nascostoDa === null ? 0 : Date.now() - nascostoDa;
      nascostoDa = null;
      if (pausa < SOGLIA_RIPRESA_MS) return;
      onReconnectSignal();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(reconnectTimer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubs.forEach((u) => u?.());
      // A-1 · togliere i propri canali dal registro fa parte dello staccarli:
      // uno smontaggio (cambio vista, logout) che lasciasse dietro un canale
      // marcato rotto terrebbe accesa per sempre una striscia su una
      // condizione che non è più osservabile da nessuno.
      chiaviCanale.forEach(dimenticaCanale);
      ricaricaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, delay, ...deps]);

  // Identità STABILE fra i render: il chiamante la mette dentro l'oggetto che
  // passa alle viste memoizzate, e una funzione nuova a ogni render le
  // sveglierebbe tutte per nulla (stessa ragione del `dispatch` di
  // useSyncedDispatch).
  return ricarica;
}
