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
// Il flag esisteva per i soli clienti (`crmLoading`). Tutte le altre entità
// partivano da un array vuoto nel reducer e restavano tali finché il primo
// fetch non tornava: nel frattempo la Dashboard mostrava "Nessuna task aperta
// a tuo nome. Buon lavoro!", la bacheca "Nessun avviso", l'Archivio "Archivio
// vuoto". Non è un dettaglio estetico — è l'app che afferma con sicurezza
// qualcosa di falso su dati operativi, in una finestra in cui l'unica risposta
// vera è "non lo so ancora", e chi legge (persona o agente) può agirci sopra.
//
// `loading` è un oggetto con una chiave per entità. Chiude a `false` sia sul
// successo sia sull'ERRORE del primo fetch: uno scheletro che gira per sempre
// è disonesto quanto un vuoto — dopo un errore il canale è il toast, e sotto
// va mostrato lo stato reale (vuoto) di ciò che si è riusciti a caricare.
//
// Come già per `crmLoading`, il valore iniziale è `enabled` valutato al primo
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
// cinque `useState`: i consumatori leggono `loading.tasks`, e aggiungere
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

export function useAppHydration({ enabled, currentUserId, dispatch, onError, teamIniziale = null }) {
  const [loading, setLoading] = useState(
    () => Object.fromEntries(ENTITA.map(k => [k, enabled])));
  // Idempotente e stabile: chiude il flag di un'entità la prima volta e poi
  // non tocca più l'oggetto, così l'identità di `loading` non cambia a ogni
  // reload realtime (le viste sono `memo`: un oggetto nuovo le sveglierebbe
  // tutte per nulla).
  const segnaCaricata = useCallback((entita) => {
    setLoading(prev => (prev[entita] ? { ...prev, [entita]: false } : prev));
  }, []);

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
  useDebouncedTableSubscription(["tasks", "comments"], async (isCurrent, tabelle) => {
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
      const rCommenti = await TaskThreadsAPI.comments();
      if (!isCurrent()) return;
      if (rCommenti?.error) {
        console.error("[VoyageDesk] TaskThreads", rCommenti.error);
        onError(`Caricamento commenti fallito: ${rCommenti.error.message || ""}`);
        return;
      }
      dispatch({
        type: "SET_TASK_THREADS",
        payload: { comments: perTaskId(rCommenti.data, fromDbComment) },
      });
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
    const { data, error } = await TasksAPI.list({
      withComments: true,
      includeDeleted: completo,
      completeDal: completo ? null : inizioFinestra(),
    });
    if (!isCurrent()) return;
    // Una vista ha chiesto il corpus intero mentre questa richiesta era in
    // volo: la risposta che abbiamo in mano è più STRETTA di ciò che lo stato
    // deve contenere. `isCurrent()` non basta a scartarla — è il gen-counter
    // delle richieste concorrenti dello stesso tipo, e queste due non lo sono.
    if (!completo && storicoCompleto.current) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      onError(`Caricamento task fallito: ${error.message || ""}`);
      segnaCaricata("tasks");
      return;
    }
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
    segnaCaricata("tasks");
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
      if (tbl !== "tasks") return false;
      if (payload.eventType === "DELETE") {
        // Reale solo per PURGE_TASK/EMPTY_TRASH: il soft-delete (DELETE_TASK)
        // è un UPDATE che valorizza deleted_at, gestito dal ramo sotto — la
        // task resta in stato con deletedAt impostato, come già faceva
        // `includeDeleted: true` sul reload completo.
        const id = payload.old?.id;
        if (!id) return false; // rete di sicurezza: senza id, reload completo
        dispatch({ type: "MERGE_TASK_ROW", payload: { eventType: "DELETE", id } });
        return true;
      }
      const row = fromDbTask(payload.new);
      if (!row?.id) return false;
      dispatch({ type: "MERGE_TASK_ROW", payload: { eventType: payload.eventType, row } });
      return true;
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
  // Chiude anche `loading.tasks`: se questa richiesta ha scartato la risposta
  // dell'idratazione iniziale (il ramo `!completo && storicoCompleto.current`
  // qui sopra), è l'unica rimasta a poterlo fare, e uno scheletro che gira per
  // sempre è disonesto quanto un vuoto dichiarato troppo presto.
  const caricaStorico = useCallback(async () => {
    if (!enabled || storicoCompleto.current) return;
    storicoCompleto.current = true;
    setCaricandoStorico(true);
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
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
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
    setCaricandoStorico(false);
    segnaCaricata("tasks");
  }, [enabled, dispatch, onError, segnaCaricata]);

  useDebouncedTableSubscription(["notices"], async (isCurrent) => {
    const { data, error } = await NoticesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Notices.list", error);
      onError(`Caricamento avvisi fallito: ${error.message || ""}`);
      segnaCaricata("notices");
      return;
    }
    dispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
    segnaCaricata("notices");
  }, {
    enabled, deps: [enabled],
    // Suggerimento strategico n.1 dell'audit del 16 agosto: `notices` è una
    // tabella piatta — nessun join, nessuna riga figlia — quindi `fromDbNotice`
    // sul payload realtime è già la stessa forma di una riga di `Notices.list()`
    // per quel che serve all'app (ignora `row.users`, mai letto: vedi
    // NoticeBoard.jsx). L'ordinamento (pinned prima, poi più recenti) lo
    // ricalcola NoticeBoard da solo a ogni render — l'array in stato non deve
    // essere già ordinato, quindi push/replace/filter bastano.
    applyRow: (tbl, payload) => {
      if (payload.eventType === "DELETE") {
        const id = payload.old?.id;
        if (!id) return false;
        dispatch({ type: "MERGE_NOTICE_ROW", payload: { eventType: "DELETE", id } });
        return true;
      }
      const row = fromDbNotice(payload.new);
      if (!row?.id) return false;
      dispatch({ type: "MERGE_NOTICE_ROW", payload: { eventType: payload.eventType, row } });
      return true;
    },
  });

  // Idratazione + realtime categorie task (Admin → Categorie). Prima di questa
  // sub, ADD_CATEGORY/UPDATE_CATEGORY/REMOVE_CATEGORY toccavano solo lo stato
  // React in memoria: una categoria creata spariva al primo reload perché non
  // veniva mai scritta su Supabase (vedi migration 20260630_categories_table).
  useDebouncedTableSubscription(["categories"], async (isCurrent) => {
    const { data, error } = await CategoriesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Categories.list", error);
      onError(`Caricamento categorie fallito: ${error.message || ""}`);
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
    segnaCaricata("categories");
  }, { enabled, deps: [enabled] });

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

  useDebouncedTableSubscription(["users"], async (isCurrent) => {
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
  // niente fetch e niente subscription. Il flag si chiude qui perché
  // useDebouncedTableSubscription esegue l'idratazione iniziale al mount.
  useDebouncedTableSubscription(["clients"], async (isCurrent) => {
    const { data, error } = await ClientsAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[CRM] hydration", error);
      onError(`Caricamento clienti fallito: ${error.message || ""}`);
      segnaCaricata("clients");
      return;
    }
    dispatch({ type: "SET_CLIENTS", payload: (data || []).map(fromDbClient) });
    segnaCaricata("clients");
  }, {
    enabled, deps: [enabled],
    // Suggerimento strategico n.1 dell'audit del 16 agosto. `clients` è
    // l'entità con la finestra di rischio più alta descritta in
    // pendingWrites.js — l'unica con PII di persone esterne al team — ed era
    // anche l'unica delle tre a ricaricare l'INTERA anagrafica (818+ righe
    // storiche, prima di ST-3) per un singolo campo cambiato da un altro
    // agente. `fromDbClient` è flat come `fromDbNotice`: nessun join da
    // perdere applicando la sola riga.
    applyRow: (tbl, payload) => {
      if (payload.eventType === "DELETE") {
        const id = payload.old?.id;
        if (!id) return false;
        dispatch({ type: "MERGE_CLIENT_ROW", payload: { eventType: "DELETE", id } });
        return true;
      }
      const row = fromDbClient(payload.new);
      if (!row?.id) return false;
      dispatch({ type: "MERGE_CLIENT_ROW", payload: { eventType: payload.eventType, row } });
      return true;
    },
  });

  // Idratazione + realtime dei template di messaggio chat (A-1 dell'audit
  // dell'11 agosto). Stesso trattamento di `categories`: prima non c'era
  // alcuna subscription perché non c'era alcuna tabella da cui idratare — i
  // quattro template di makeInitialState erano l'unico stato possibile, e
  // ADD/UPDATE/DELETE_MESSAGE_TEMPLATE scrivevano solo lo state React.
  useDebouncedTableSubscription(["message_templates"], async (isCurrent) => {
    const { data, error } = await MessageTemplatesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] MessageTemplates.list", error);
      onError(`Caricamento template messaggio fallito: ${error.message || ""}`);
      segnaCaricata("messageTemplates");
      return;
    }
    dispatch({ type: "SET_MESSAGE_TEMPLATES", payload: (data || []).map(fromDbMessageTemplate) });
    segnaCaricata("messageTemplates");
  }, { enabled, deps: [enabled] });

  // `crmLoading` resta esposto come alias di `loading.clients`: è il nome con
  // cui ClientiView e i suoi test conoscono questo flag da sessione 23, e
  // rinominarlo non aggiungerebbe nulla.
  //
  // `storicoTask` è la coppia che alimenta <StoricoTaskProvider>: la richiesta
  // e il flag di attesa. Non è un terzo flag di `loading` perché non descrive
  // un'ENTITÀ che si sta idratando — le task ci sono già — ma una porzione di
  // quell'entità che una vista specifica sta aspettando.
  return { loading, crmLoading: loading.clients, storicoTask: { richiedi: caricaStorico, caricando: caricandoStorico } };
}
