// src/hooks/useAppHydration.js
// Idratazione + realtime delle entità che vivono nel reducer: task (con i
// commenti, senza la cronologia), avvisi, categorie, team, clienti, template.
//
// Base comune: reload debounced con gen-counter (useDebouncedTableSubscription).
// `tasks`, `notices` e `clients` applicano la riga del payload (`applyRow`);
// le tabelle piccole restano al reload completo. Il reload completo resta per
// l'idratazione iniziale e la ripresa dopo un buco di connessione.
//
// `dispatch` è quello grezzo del reducer: qui si legge soltanto.
//
// `caricamento` ha un flag per entità, chiuso sia sul successo sia sull'ERRORE
// del primo fetch: le viste mostrano uno scheletro, mai un vuoto che non si
// conosce, e mai uno scheletro che gira per sempre.
//
// La finestra (A-3): l'avvio chiede le task non completate più le completate
// degli ultimi FINESTRA_COMPLETATE_GG giorni, senza cestino. Chi vuole il resto
// lo chiede con `caricaStorico`. `storicoCompleto` è un REF perché è il
// parametro dei reload futuri (anche quello di riconnessione): una volta
// chiesto il corpus, resta completo per la sessione.

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


// A-3 · Finestra sulle task COMPLETATE, in giorni: larga abbastanza da coprire
// il periodo in cui una task chiusa si riapre o si consulta ancora.
const FINESTRA_COMPLETATE_GG = 60;

// ⚠️ Senza millisecondi: il valore va dentro `or=(…)` di PostgREST, dove il
// punto è un separatore. Con `.000Z` la query diventa ambigua (400).
const inizioFinestra = () =>
  new Date(Date.now() - FINESTRA_COMPLETATE_GG * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");

// M-3 · L'ordine delle scritture su UNA fetta. `emesse` conta le richieste
// partite, `scritte` l'ultimo turno che ha scritto lo stato. Il turno lo
// consuma CHI SCRIVE (`vinceIlTurno` dopo aver gestito l'errore): una
// richiesta più recente che fallisce non deve scartare quella più vecchia
// che i dati li ha.
const ordineDiScrittura = () => ({ emesse: 0, scritte: 0 });
const prendiTurno = (ordine) => ++ordine.emesse;
const vinceIlTurno = (ordine, turno) => {
  // `<=` e non `<`: due richieste non possono avere lo stesso turno, e un
  // turno già scritto è per definizione più vecchio di ciò che c'è a schermo.
  if (turno <= ordine.scritte) return false;
  ordine.scritte = turno;
  return true;
};

// M-1 · Le due forme ricorrenti: `idratazione` (leggi, scarta se tardiva,
// dispatcha, segna il flag) e `applicaRiga` (DELETE / mappa / dispatcha).
// ⚠️ `categories` (mappa con `stessaMappa`) e `users` (due query + contatti)
// non entrano nella fabbrica: sono programmi diversi, non varianti.

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
    // A-3 · il toast annuncia, questo stato dura: vedi hooks/useErroriIdratazione.js.
    segnaEsito?.(entita, testo);
    // FUORI dal ramo del successo: uno scheletro che gira per sempre è disonesto
    // quanto un vuoto. Per lo stesso motivo `alTermine` è chiamata qui.
    segnaCaricata(entita);
    alTermine?.();
    return;
  }
  // Il turno si consuma qui, sul percorso che scrive: vedi `vinceIlTurno`.
  if (gen && !vinceIlTurno(gen.current, turno)) return;
  dispatch({ type: action, payload: (data || []).map(mapper) });
  // Una richiesta riuscita spegne l'errore precedente, anche se a rimediare è
  // il reload di una riconnessione.
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
  dispatch({ type: action, payload: { eventType: payload.eventType, id: row.id, row } }); // senza `id`: doppione (4/11)
  return true;
};

export function useAppHydration({ enabled, currentUserId, dispatch, onError, teamIniziale = /** @type {any[]|null} */ (null) }) {
  // M-1 · `clients` parte da `false`: all'avvio nessuno ha chiesto l'anagrafica.
  // Il flag si alza in `caricaClienti`.
  const [caricamento, impostaCaricamento] = useState(
    () => Object.fromEntries(ENTITA.map(k => [k, k === "clients" ? false : enabled])));
  // Idempotente e stabile: l'identità di `caricamento` non cambia a ogni reload
  // (le viste sono `memo`).
  const segnaCaricata = useCallback((entita) => {
    impostaCaricamento(prev => (prev[entita] ? { ...prev, [entita]: false } : prev));
  }, []);

  // A-3 · Il terzo stato: «questa entità non si è caricata». La politica sta in
  // hooks/useErroriIdratazione.js.
  const { segnaEsito, componi: componiErrori } = useErroriIdratazione();

  // ST-15 · L'ultimo payload consegnato per team e categorie: si confronta prima
  // di dispatchare, così un evento innocuo su `users` non invalida AppDataContext.
  const ultimoTeam = useRef(null);
  const ultimeCategorie = useRef(null);

  // A-3 · «Lo stato deve contenere il corpus intero». Si alza PRIMA della
  // richiesta e si riabbassa se fallisce: un reload concorrente parte già
  // completo e non può potare ciò che una vista mostra.
  const storicoCompleto = useRef(false);
  const [caricandoStorico, setCaricandoStorico] = useState(false);


  // M-1 · Come `storicoCompleto`, per l'anagrafica: una volta chiesta, resta
  // idratata per la sessione.
  const clientiCompleti = useRef(false);
  const [caricandoClienti, setCaricandoClienti] = useState(false);

  // M-3 · UNA generazione per FETTA, non per effetto. `state.tasks` e
  // `state.clients` hanno due scrittori (il reload della sottoscrizione e il
  // caricamento su richiesta), e `isCurrent()` non li ordina fra loro. La
  // generazione conta l'ordine di PARTENZA, in AND con `isCurrent()`.
  const genTask = useRef(ordineDiScrittura());
  const genClienti = useRef(ordineDiScrittura());

  // ⚠️ Chi consegna il corpus chiude l'attesa, chiunque dei due sia: per questo
  // il ramo «sono stale» dei `carica*` non tocca il flag.
  const chiudiAttesaStorico = useCallback(() => setCaricandoStorico(false), []);
  const chiudiAttesaClienti = useCallback(() => setCaricandoClienti(false), []);

  // Task + commenti: idratazione e realtime. La cronologia (`task_history`) non
  // è qui: la legge e la sottoscrive solo TaskHistoryPanel, per il task aperto.
  //
  // A-1 · Gli id dei task toccati dagli eventi `comments` del debounce, raccolti
  // in `applyRow` e consumati dal ramo `soloThread`. Un ref: è il parametro della
  // prossima query, non un dato da disegnare.
  const taskConCommentiNuovi = useRef(new Set());

  // M-1 · La coda dell'applyRow dei task è quella comune; la testa (`comments`)
  // è sua.
  const applicaRigaTask = applicaRiga({
    action: "MERGE_TASK_ROW", mapper: fromDbTask, dispatch,
  });

  const ricaricaTasks = useDebouncedTableSubscription(["tasks", "comments"], async (isCurrent, tabelle) => {
    // Un commento cambia solo il thread: se l'evento viene solo da `comments`
    // si ricaricano i thread, non i task. `tabelle === null` è l'idratazione
    // iniziale: serve tutto.
    const soloThread = tabelle !== null && tabelle.size > 0 && !tabelle.has("tasks");

    if (soloThread) {
      // Presi e azzerati PRIMA dell'await: un evento che arriva durante la query
      // appartiene al giro successivo.
      const ids = [...taskConCommentiNuovi.current];
      taskConCommentiNuovi.current = new Set();
      // Nessun id leggibile: si ricade sul corpus. È ciò che rende il ramo
      // fail-safe (si scarica troppo, mai un thread vuoto).
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

    // A-3 · La finestra, o il corpus intero se una vista l'ha chiesto. Il cestino
    // non serve più ai reload: il soft-delete è un UPDATE applicato per riga.
    const completo = storicoCompleto.current;
    // M-3 · Generazione condivisa con `caricaStorico`: entrambi scrivono SET_TASKS.
    const turno = prendiTurno(genTask.current);
    const { data, error } = await TasksAPI.list({
      withComments: true,
      includeDeleted: completo,
      completeDal: completo ? null : inizioFinestra(),
    });
    // Due guardie diverse: `isCurrent()` = l'effetto è ancora vivo; `genTask` =
    // sono l'ultima partita fra tutti gli scrittori della fetta.
    if (!isCurrent()) return;
    // Una vista ha chiesto il corpus mentre questa richiesta era in volo: la
    // risposta è più STRETTA di ciò che lo stato deve contenere.
    if (!completo && storicoCompleto.current) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      const testo = `Caricamento task fallito: ${error.message || ""}`;
      onError(testo);
      segnaEsito("tasks", testo);
      segnaCaricata("tasks");
      // Se ha superato un `caricaStorico`, solo lei può chiuderne l'attesa (anche
      // sul fallimento).
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
    // Un evento su `tasks` porta la riga intera: si applica, senza reload.
    // `comments` resta fuori (`return false`). Sincrono: nessuna risposta può
    // arrivare in ritardo, quindi niente `isCurrent()`.
    applyRow: (tbl, payload) => {
      // A-1 · Gli eventi `comments` dicono QUALE task è cambiato: si raccoglie l'id
      // per `soloThread`. ⚠️ Su una DELETE `old` non porta `task_id` (con la RLS il
      // pre-image è la sola chiave): l'id manca e si ricade sul corpus.
      if (tbl === "comments") {
        const tid = payload.new?.task_id ?? payload.old?.task_id;
        if (tid) taskConCommentiNuovi.current.add(tid);
        return false;
      }
      if (tbl !== "tasks") return false;
      // Il ramo DELETE vale solo per PURGE_TASK/EMPTY_TRASH: il soft-delete è un
      // UPDATE e la task resta in stato con `deletedAt`.
      return applicaRigaTask(tbl, payload);
    },
  });

  // A-3 · Il corpus intero, su richiesta delle viste che lo guardano (elenco
  // in state/StoricoTaskContext.jsx). `SET_TASKS` e non un merge: il corpus è
  // un sovrainsieme della finestra. Chiude anche `caricamento.tasks`.
  const caricaStorico = useCallback(async () => {
    if (!enabled || storicoCompleto.current) return;
    storicoCompleto.current = true;
    setCaricandoStorico(true);
    const turno = prendiTurno(genTask.current);
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
    // M-3 · Una richiesta è partita dopo la nostra e chiede lo stesso corpus:
    // consegna lei, compresa la chiusura dell'attesa.
    if (error) {
      // Non arrivato: si torna alla finestra, e un rimontaggio riprova.
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

  // M-1 · L'anagrafica intera, su richiesta (ClientiView, ListeViaggio: vedi
  // state/ClientiCompletiContext.jsx). Stessa sequenza di `caricaStorico`.
  const caricaClienti = useCallback(async () => {
    if (!enabled || clientiCompleti.current) return;
    clientiCompleti.current = true;
    setCaricandoClienti(true);
    const turno = prendiTurno(genClienti.current);
    const { data, error } = await ClientsAPI.list();
    // M-3 · Come in `caricaStorico`: consegna chi è partito per ultimo.
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
    // `notices` è piatta: il payload mappato è già una riga di `Notices.list()`.
    // L'ordinamento lo fa NoticeBoard.
    applyRow: applicaRiga({ action: "MERGE_NOTICE_ROW", mapper: fromDbNotice, dispatch }),
  });

  // Categorie task (Admin → Categorie): idratazione e reload di ripresa.
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
      if (c) categories[c.key] = { label: c.label, icon: c.icon, color: c.color, bg: c.bg };
    }
    if (!stessaMappa(ultimeCategorie.current, categories)) {
      ultimeCategorie.current = categories;
      dispatch({ type: "SET_CATEGORIES", payload: categories });
    }
    segnaEsito("categories", null);
    segnaCaricata("categories");
    // B-1 · Niente canale permanente per ~10 righe gestite dall'admin: una
    // categoria nuova compare sugli altri client al ritorno in primo piano.
  }, { enabled, deps: [enabled], senzaCanale: true });

  // Team: idratazione e realtime su `users` (pending e disattivati compresi:
  // l'admin deve vederli). `filterEvent` salta gli UPDATE di sola presenza.
  //
  // B-1 · Il team non si rilegge al mount: `AuthContext.loadProfile` l'ha già
  // letto nella stessa forma (`teamIniziale`). L'effetto qui sotto semina
  // `ultimoTeam` e chiude il flag al posto del primo fetch.
  const abbiamoGiaIlTeam = enabled && Array.isArray(teamIniziale) && teamIniziale.length > 0;
  useEffect(() => {
    if (!abbiamoGiaIlTeam) return;
    ultimoTeam.current = teamIniziale;
    segnaCaricata("team");
  }, [abbiamoGiaIlTeam, teamIniziale, segnaCaricata]);

  const ricaricaTeam = useDebouncedTableSubscription(["users"], async (isCurrent) => {
    // `listAll()` non porta email/telefono (stanno in `user_contacts`): si
    // reinnestano nella entry dell'utente loggato, come in AuthContext, o il
    // ProfileEditor li mostrerebbe vuoti.
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
      // ⚠️ A-3 · Anche il team annuncia l'errore: i permessi lato client si
      // calcolano su `state.team`.
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
    // Righe identiche: non si sostituisce l'array (vedi `ultimoTeam`).
    // `segnaCaricata` resta fuori dal ramo.
    if (!stessaLista(ultimoTeam.current, team)) {
      ultimoTeam.current = team;
      dispatch({ type: "SET_TEAM", payload: team });
    }
    // Fuori dal ramo `stessaLista`: un reload riuscito spegne l'errore anche se
    // non è cambiato niente.
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

  // Clienti: la sottoscrizione tiene allineate le schede che arrivano dal
  // realtime (un cliente creato da un collega, anche dal modulo Liste, deve
  // comparire subito: altrimenti si crea il doppione).
  //
  // M-1 · L'anagrafica non si scarica all'avvio: la chiede `caricaClienti`.
  // Reload e applyRow valgono solo dopo (`clientiCompleti`).
  const ricaricaClienti = useDebouncedTableSubscription(["clients"], idratazione({
    entita: "clients", tag: "[CRM] hydration", etichetta: "clienti",
    list: () => ClientsAPI.list(), mapper: fromDbClient, action: "SET_CLIENTS",
    dispatch, onError, segnaCaricata, segnaEsito,
    // Nessuno ha chiesto l'anagrafica: niente da ricaricare.
    quandoSaltare: () => !clientiCompleti.current,
    // M-3 · L'anagrafica ha due scrittori: questo reload e `caricaClienti`.
    gen: genClienti,
    alTermine: chiudiAttesaClienti,
  }), {
    enabled, deps: [enabled],
    // `clients` è piatta come `notices`: si applica la riga.
    // ⚠️ M-1 · Finché nessuno ha chiesto l'anagrafica, applicare la riga sarebbe
    // peggio che ignorarla: su un elenco vuoto costruirebbe un'anagrafica
    // parziale. `quandoIgnorare` → `true`: gestito, non serve fare nulla.
    applyRow: applicaRiga({
      action: "MERGE_CLIENT_ROW", mapper: fromDbClient, dispatch,
      quandoIgnorare: () => !clientiCompleti.current,
    }),
  });

  // Template dei messaggi chat: come `categories`, quattro righe gestite
  // dall'admin, senza canale permanente.
  const ricaricaTemplate = useDebouncedTableSubscription(["message_templates"], idratazione({
    entita: "messageTemplates", tag: "[VoyageDesk] MessageTemplates.list",
    etichetta: "template messaggio",
    list: () => MessageTemplatesAPI.list(), mapper: fromDbMessageTemplate,
    action: "SET_MESSAGE_TEMPLATES",
    dispatch, onError, segnaCaricata, segnaEsito,
  }), { enabled, deps: [enabled], senzaCanale: true });

  // `storicoTask` alimenta <StoricoTaskProvider>: richiesta e flag di attesa
  // di una porzione dei task, non di un'entità.
  // `caricamentoClienti` vale `caricandoClienti`: l'idratazione iniziale dei
  // clienti non esiste più.
  // A-3 · Le sei entità con l'handle che le ricarica; la politica sta nell'hook.
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
