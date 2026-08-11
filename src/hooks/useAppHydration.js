// src/hooks/useAppHydration.js
// Idratazione + realtime dei dati di dominio che vivono nel reducer: task
// (con commenti e cronologia), avvisi, categorie, team e clienti.
//
// Tutte le sottoscrizioni seguono lo stesso pattern — ricarico la lista intera
// a ogni evento postgres, debounced, con un gen-counter che scarta le risposte
// obsolete: vedi useDebouncedTableSubscription (caveat #10). È volutamente più
// semplice di un merge incrementale per-riga, ed è robusto al duplicato
// dell'eco locale.
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

import { useState, useCallback, useRef } from "react";
import {
  Tasks as TasksAPI, Notices as NoticesAPI, Users as UsersAPI,
  Clients as ClientsAPI, Categories as CategoriesAPI, TaskThreads as TaskThreadsAPI,
} from "../lib/api.js";
import {
  fromDbTask, fromDbNotice, fromDbClient, fromDbCategory,
  fromDbComment, fromDbHistory,
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
const ENTITA = ["tasks", "notices", "categories", "team", "clients"];

export function useAppHydration({ enabled, currentUserId, dispatch, onError }) {
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

  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  // Caveat #10: il pattern reload+debounce+gen-counter vive in
  // useDebouncedTableSubscription; le tasks ascoltano anche comments e
  // task_history (cronologia per-task, sessione 42).
  useDebouncedTableSubscription(["tasks", "comments", "task_history"], async (isCurrent, tabelle) => {
    // Un commento aggiunto o una riga di cronologia NON cambiano i campi del
    // task: cambiano solo il thread appeso al task. Finché il reload non
    // sapeva quale tabella avesse generato l'evento era costretto a
    // riscaricare tutto per costruzione, e `TASK_SELECT_WITH_COMMENTS` non è
    // una query leggera — porta con sé commenti e cronologia con i join sui
    // nomi, include il cestino (includeDeleted) e non è paginata. Con tre
    // tabelle sottoscritte, il caso più frequente (qualcuno commenta) era
    // anche il più caro.
    //
    // `tabelle === null` è l'idratazione iniziale (nessun evento): serve tutto.
    // Stesso schema di useListeData (A-1).
    const soloThread = tabelle !== null && tabelle.size > 0 && !tabelle.has("tasks");

    if (soloThread) {
      // Ricarica SOLO le tabelle che hanno davvero emesso: chi commenta non
      // fa riscaricare la cronologia, e viceversa.
      const [rCommenti, rCronologia] = await Promise.all([
        tabelle.has("comments") ? TaskThreadsAPI.comments() : Promise.resolve(null),
        tabelle.has("task_history") ? TaskThreadsAPI.history() : Promise.resolve(null),
      ]);
      if (!isCurrent()) return;
      const fallita = [rCommenti, rCronologia].find(r => r?.error);
      if (fallita) {
        console.error("[VoyageDesk] TaskThreads", fallita.error);
        onError(`Caricamento commenti fallito: ${fallita.error.message || ""}`);
        return;
      }
      dispatch({
        type: "SET_TASK_THREADS",
        payload: {
          comments: rCommenti ? perTaskId(rCommenti.data, fromDbComment) : undefined,
          history: rCronologia ? perTaskId(rCronologia.data, fromDbHistory) : undefined,
        },
      });
      return;
    }

    // includeDeleted: true → portiamo anche le task soft-deleted nello stato,
    // altrimenti la ri-idratazione realtime (che parte subito dopo un DELETE_TASK)
    // le filtrerebbe via, svuotando il Cestino. Le viste attive (Dashboard,
    // Calendario) filtrano comunque con getActiveTasks/isActiveTask, quindi le
    // cestinate restano confinate alla vista Cestino.
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      onError(`Caricamento task fallito: ${error.message || ""}`);
      segnaCaricata("tasks");
      return;
    }
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
    segnaCaricata("tasks");
  }, { enabled, deps: [enabled] });

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
  }, { enabled, deps: [enabled] });

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
  }, { enabled, deps: [enabled] });

  // `crmLoading` resta esposto come alias di `loading.clients`: è il nome con
  // cui ClientiView e i suoi test conoscono questo flag da sessione 23, e
  // rinominarlo non aggiungerebbe nulla.
  return { loading, crmLoading: loading.clients };
}
