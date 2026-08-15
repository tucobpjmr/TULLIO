// src/VoyageDeskInner.jsx
// Estratto da VoyageDesk.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento:
// VoyageDesk.jsx resta il thin wrapper che fornisce ViewportProvider (letto
// da useViewport() qui dentro e nei discendenti), questo file è tutto il
// resto dell'orchestratore.

import { useState, useReducer, useEffect, useCallback, lazy, Suspense, Profiler } from "react";

// ── Stato ──────────────────────────────────────────────────────────────────
import { Notifications as NotificationsAPI } from "./lib/api.js";
import { isUuid } from "./lib/mappers.js";
import { registraSinkErrori } from "./lib/errorReporting.js";
import { getActiveTasks } from "./lib/taskUtils.js";
import { canAccessAdmin } from "./lib/permissions.js";
import { reducer, makeInitialState } from "./state/reducer.js";
import { AppDataProvider } from "./state/AppDataContext.jsx";
import { TasksProvider } from "./state/TasksContext.jsx";
import { ClientsProvider } from "./state/ClientsContext.jsx";
import { ConfirmProvider } from "./state/ConfirmContext.jsx";
import { demoState } from "./state/demoState.js";

// ── Hook di dominio ────────────────────────────────────────────────────────
// Questo file è un ORCHESTRATORE: compone hook e viste, non implementa.
// Ogni hook possiede un pezzo di ciclo di vita che prima viveva qui in linea —
// idratazione, notifiche, presenza, push, chat — per un totale di ~800 righe
// che rendevano impossibile toccare una feature senza aprire il file di tutte.
import { useSyncedDispatch } from "./hooks/useSyncedDispatch.js";
import { useAppHydration } from "./hooks/useAppHydration.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { usePresence } from "./hooks/usePresence.js";
import { usePushNavigation } from "./hooks/usePushNavigation.js";
import { useChatData } from "./hooks/useChatData.js";

// ── Guscio e primitive ─────────────────────────────────────────────────────
import { ViewErrorBoundary } from "./components/ViewErrorBoundary.jsx";
import { OverlayErrorBoundary } from "./components/OverlayErrorBoundary.jsx";
import { ToastStack } from "./components/ui/Toast.jsx";
import { LazyFallback } from "./components/ui/LazyFallback.jsx";
import { KeyboardHelpOverlay } from "./components/ui/KeyboardHelpOverlay.jsx";
import { Topbar } from "./components/shell/Topbar.jsx";
import { Sidebar } from "./components/shell/Sidebar.jsx";
import { BottomNav } from "./components/shell/BottomNav.jsx";
import { FAB } from "./components/shell/FAB.jsx";
import { AdminRollbackBanner } from "./components/shell/AdminRollbackBanner.jsx";
import { OfflineBanner } from "./components/shell/OfflineBanner.jsx";

// ── Viste ──────────────────────────────────────────────────────────────────
// Dashboard e ClientiView restano eager: sono le due viste d'ingresso più
// frequenti (l'app apre su Dashboard, ClientiView è la seconda per uso), e
// renderle lazy sposterebbe il costo dal caricamento a un flash di fallback
// su ogni sessione invece di risparmiarlo davvero.
import { Dashboard } from "./components/dashboard/Dashboard.jsx";
import { ClientiView } from "./components/clients/ClientiView.jsx";
import { QuickAddTask } from "./components/modals/QuickAddTask.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const col = { display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" };
const rowFlex1 = { display: "flex", flex: 1, overflow: "hidden" };
const flex1 = { flex: 1, overflowY: "auto", overflowX: "hidden" };

// Chunk async: viste pesanti o riservate a un ruolo, scaricate on-demand.
// ST-12 · La chat era l'ultimo gruppo differibile grande rimasto: ~54 kB
// (pannello, conversazioni, composer, vocali) nel chunk iniziale di OGNI
// sessione, benché il pannello chiuso ritorni null. Attenzione al dettaglio
// che rendeva questo rilievo non banale: ChatPanel ri-esportava
// `getUnreadCount` per il badge dei non letti, che si calcola FUORI dal
// pannello (in useChatData) — con quel ri-export in piedi il modulo sarebbe
// rimasto agganciato al chunk eager e il lazy() non avrebbe spostato niente.
// È esattamente il difetto di P2-1. Ora chi serve `getUnreadCount` lo importa
// da chat/chatFormat.js, e una regola di lint tiene chiuso il percorso.
const ChatPanel = lazy(() =>
  import("./components/chat/ChatPanel.jsx").then(m => ({ default: m.ChatPanel }))
);
const BulkTaskCreator = lazy(() =>
  import("./components/modals/BulkTaskCreator.jsx").then(m => ({ default: m.BulkTaskCreator }))
);
const TaskSlideOver = lazy(() =>
  import("./components/tasks/TaskSlideOver.jsx").then(m => ({ default: m.TaskSlideOver }))
);
const AdminView = lazy(() =>
  import("./components/admin/AdminView.jsx").then(m => ({ default: m.AdminView }))
);
const ListeViaggio = lazy(() =>
  import("./components/liste/ListeViaggio.jsx").then(m => ({ default: m.ListeViaggio }))
);
// Viste secondarie: aperte da una minoranza di sessioni, ciascuna dietro un
// item di navigazione — differirle sposta ~55 kB fuori dal chunk iniziale
// senza cambiare cosa vede l'utente, solo quando lo scarica.
const CalendarPlanner = lazy(() =>
  import("./components/calendar/CalendarPlanner.jsx").then(m => ({ default: m.CalendarPlanner }))
);
const Trash = lazy(() =>
  import("./components/views/Trash.jsx").then(m => ({ default: m.Trash }))
);
const Archive = lazy(() =>
  import("./components/views/Archive.jsx").then(m => ({ default: m.Archive }))
);
// Suggerimento strategico #3 (docs/AUDIT_PERFORMANCE_2026-08.md): un
// React.Profiler attorno alla vista attiva, per rispondere "quanto costa un
// render" con un numero invece che a sensazione — la stessa domanda a cui
// `npm run misura:render` risponde per la sola `expandRecurring`, qui estesa
// al render React completo (reconciliation e commit inclusi, non solo il
// calcolo). Dietro VITE_PROFILE_VIEWS=true in dev: fuori da quel guard
// `import.meta.env.DEV` è `false` a build time e il ramo — Profiler incluso —
// esce dal bundle di produzione (stessa tecnica di demoState.js).
const PROFILE_VIEWS = import.meta.env.DEV && import.meta.env.VITE_PROFILE_VIEWS === 'true';
const onViewRender = (id, phase, actualDuration, baseDuration) => {
  console.log(`[profile] ${id} ${phase}: actual=${actualDuration.toFixed(2)}ms base=${baseDuration.toFixed(2)}ms`);
};

// Dove è finito il resto del monolite:
//   utility pure          → src/lib/{taskUtils,permissions,chatUtils,mappers}.js
//   reducer + persistenza → src/state/{reducer,persistence}.js
//   CSS globale e tema    → src/styles/global.css (importato da main.jsx)
//   dati demo             → src/state/mockData.js
//   viste e primitive     → src/components/**

export function VoyageDeskInner({ initialTeam, initialCurrentUserId }) {
  const [state, rawDispatch] = useReducer(
    reducer,
    { team: initialTeam, currentUserId: initialCurrentUserId },
    makeInitialState
  );

  // Modalità DB: attiva solo se AuthContext ha fornito un team reale.
  // Senza, l'app resta sui mock (dev/preview senza login).
  const useSupabase = Array.isArray(initialTeam) && initialTeam.length > 0;

  // Conversazioni/messaggi demo per useChatData sotto: stessa tecnica di
  // reducer.js/makeInitialState. `import.meta.env.DEV` collassa a `false` in
  // produzione, quindi il ramo — e con esso demoState()/mockData.js — esce
  // dal bundle invece di restare solo irraggiungibile.
  let demo = null;
  if (import.meta.env.DEV && !useSupabase) demo = demoState();

  // Il wrapper dispatch (283 righe di switch: permessi + mapping + chiamate DB
  // + rollback) è stato sostituito dal registry dichiarativo in
  // state/persistence.js, orchestrato da questo hook. Stessa firma di prima:
  // ritorna Promise<{ error }> e ha identità stabile tra i render.
  const dispatch = useSyncedDispatch(state, rawDispatch, { enabled: useSupabase });

  // Toast d'errore: firma unica per tutti gli hook, che così non conoscono né
  // il reducer né la forma dell'azione.
  const showError = useCallback(
    (message) => rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message } }), []);
  const showSuccess = useCallback(
    (message) => rawDispatch({ type: "SHOW_TOAST", payload: { type: "success", message } }), []);

  // Gli handler globali installati in main.jsx sanno intercettare gli errori
  // ma non hanno modo di mostrarli: qui diamo loro il canale. Finché nessuno
  // è registrato si limitano alla console — è la fase in cui l'app non è
  // montata e un toast non avrebbe dove comparire. Il cleanup di useEffect è
  // la funzione di deregistrazione ritornata da registraSinkErrori.
  useEffect(() => registraSinkErrori(showError), [showError]);

  // `loading` porta un flag per ENTITÀ (criticità #6): finché il primo fetch
  // di una di esse non è tornato, le viste che la mostrano devono dire "sto
  // caricando" e non "non c'è niente". `crmLoading` è l'alias storico di
  // `loading.clients`.
  const { loading, crmLoading } = useAppHydration({
    enabled: useSupabase,
    currentUserId: initialCurrentUserId,
    dispatch: rawDispatch,
    onError: showError,
  });

  const notif = useNotifications({ enabled: useSupabase, onError: showError });

  const { presenceMap, myBusy, toggleMyBusy } = usePresence({
    enabled: useSupabase, userId: initialCurrentUserId, team: initialTeam,
  });

  // Step J: navigazione da notifica → TaskSlideOver
  // Se il task referenziato dalla notifica non è (più) raggiungibile — cestinato,
  // purgato o non più visibile per riassegnazione/permessi — il pannello si
  // chiude comunque e la notifica viene marcata come letta lato chiamante: senza
  // un toast esplicito l'utente clicca e non vede succedere nulla, in silenzio.
  //
  // Le dipendenze includono `state.tasks`, quindi questa callback cambia
  // identità a ogni mutazione dei task e la prop `onOpenTask` invalida il
  // `memo` di <Topbar>. NON è un difetto da correggere con un ref, ed è stato
  // verificato invece che dedotto (audit del 14 agosto, terzo passaggio): la
  // Topbar chiama `useTasks()` (Topbar.jsx:89), cioè è ISCRITTA a
  // TasksContext, il cui value è memoizzato su `[tasks]` — la stessa
  // identità. Si ri-renderizza quando i task cambiano comunque, con o senza
  // questa dipendenza. Stabilizzare la callback aggiungerebbe un ref e
  // toglierebbe zero render.
  const openTaskById = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) {
      dispatch({ type: "SET_SELECTED_TASK", payload: t });
    } else {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Task non più disponibile (spostato nel cestino o riassegnato)" } });
    }
  }, [state.tasks, dispatch]);

  // Spegne la notifica in campanella della conversazione che si sta aprendo:
  // bookkeeping delle notifiche, non della chat, quindi vive qui.
  const markChatNotificationsRead = useCallback((convId) => {
    notif.setNotifications(prev => prev.map(n => (
      n.type === "chat_message" && n.payload?.conversation_id === convId && !n.read
        ? { ...n, read: true }
        : n
    )));
    if (!useSupabase || !isUuid(convId)) return;
    NotificationsAPI.markReadForConversation(convId).then(r => {
      if (r?.error) console.error("[notifications] markReadForConversation", r.error);
    });
  }, [useSupabase, notif]);

  const chat = useChatData({
    enabled: useSupabase,
    team: state.team,
    currentUserId: state.currentUserId,
    mockConversations: demo?.conversations || [],
    mockMessages: demo?.messages || {},
    onError: showError,
    onSuccess: showSuccess,
    onConversationRead: markChatNotificationsRead,
  });

  // Stato di UI effimero che il reducer di dominio non deve conoscere (audit
  // ST-2 parte 2): non è persistito, non sopravvive al reload, e portarlo nel
  // reducer globale invalidava l'identità di `state` — e quindi ri-renderizzava
  // l'intero guscio — a ogni carattere digitato. Resta qui (invece che
  // `useState` locale della Topbar) perché è candidato a diventare un filtro
  // cross-view: il giorno in cui dovrà farlo, il guscio è già il punto giusto
  // da cui distribuirlo.
  const [searchQuery, setSearchQuery] = useState("");
  const [showFABModal, setShowFABModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false); // v2.8 Round 10
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // Apre la chat verso un utente specifico, opzionalmente con link a task.
  //
  // ⚠️ useCallback e non una funzione nuda: questa prop arriva a <Dashboard>,
  // che è `memo`. Una funzione ricreata a ogni render è una prop diversa a
  // ogni render, quindi il memo non ha MAI potuto saltare un render — ed è
  // stato così per diverse sessioni, mentre tutto il lavoro attorno (provider
  // di dominio, prop a identità stabile, `memo` su sei viste) veniva fatto
  // proprio per ottenere quel bail-out. Misurato prima della correzione: un
  // render completo della Dashboard per OGNI carattere digitato nella ricerca
  // della Topbar; dopo: zero. Blindato da src/test/memoViste.test.jsx.
  //
  // Le due setState non entrano nelle dipendenze: React ne garantisce
  // l'identità stabile per tutta la vita del componente.
  const openChatTo = useCallback((intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  }, []);

  // Apre una conversazione già esistente (tap su una notifica di chat).
  const openConversationById = useCallback((conversationId) => {
    if (!conversationId) return;
    setChatIntent({ convId: conversationId });
    setShowChat(true);
  }, []);

  // I due callback della navigazione (ST-2). Erano arrow inline nel JSX di
  // Sidebar e BottomNav: con quelli, rendere `memo` i due componenti non
  // avrebbe saltato un solo render — è lo stesso difetto di openChatTo qui
  // sopra, e va corretto nello stesso momento in cui si aggiunge il memo,
  // altrimenti si aggiunge un confronto che non può mai riuscire.
  const openBulk = useCallback(() => setShowBulkModal(true), []);
  const openChatPanel = useCallback(() => {
    setChatIntent(null);
    setShowChat(true);
  }, []);

  usePushNavigation({
    enabled: useSupabase,
    currentUserId: state.currentUserId,
    tasks: state.tasks,
    dispatch,
    onOpenChat: openConversationById,
  });

  useEffect(() => {
    const handler = (e) => {
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
        return;
      }
      if (inInput) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setShowFABModal(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowKeyHelp(p => !p);
      }
      // Escape NON è più gestito qui: da quando l'overlay delle scorciatoie è
      // un ui/Modal.jsx, la chiusura con Esc arriva dal guscio — e passa dalla
      // pila dei modali aperti, che la consegna solo a quello in cima. Un
      // secondo handler globale la chiuderebbe anche quando le sta sopra
      // qualcos'altro, e comunque non scattava affatto mentre il focus era in
      // un campo (il guard `inInput` qui sopra).
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Quando l'utente cambia, se la view corrente non è permessa il reducer la riporta a dashboard.
  // Inoltre chiudo eventuali pannelli aperti.
  useEffect(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
  }, [state.currentUserId]);

  // Le viste NON ricevono più `state`: leggono task e clienti dai provider e si
  // fanno passare solo le fette piccole che consumano davvero (notices, la tab
  // coda richiesta, la lista da aprire). `state` cambia identità dopo qualunque
  // azione — un toast, un carattere nella ricerca — e finché era una prop
  // costringeva la vista attiva a ri-renderizzarsi per intero ogni volta. Le
  // prop rimaste hanno identità stabile, quindi il `memo` sulle viste può
  // davvero saltare il render (vedi state/TasksContext.jsx: senza memo il
  // provider da solo non basta).
  const renderView = () => {
    switch (state.activeView) {
      case "dashboard":  return <Dashboard dispatch={dispatch} onOpenChat={openChatTo} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={loading.tasks} noticesLoading={loading.notices} />;
      case "calendar":   return <CalendarPlanner dispatch={dispatch} loading={loading.tasks} />;
      case "clienti":    return <ClientiView dispatch={dispatch} loading={crmLoading} />;
      case "archivio":   return <Archive dispatch={dispatch} loading={loading.tasks} />;
      case "trash":      return <Trash dispatch={dispatch} loading={loading.tasks} />;
      // Il guard qui è ridondante per costruzione — il reducer rifiuta
      // SET_VIEW → "admin" per i non-admin (reducer.js:95) e riporta la vista
      // a dashboard al cambio utente (reducer.js:145) — ma è la ridondanza che
      // serve: è l'ultimo punto prima del montaggio, e non dipende dal fatto
      // che ogni percorso futuro verso activeView passi da quei due controlli.
      // Costa una riga; senza, la protezione della vista più sensibile
      // dell'app poggia interamente sul fatto che nessuno scriva mai un terzo
      // modo di impostare activeView.
      case "admin":      return canAccessAdmin(state.team, state.currentUserId)
        ? <AdminView dispatch={dispatch} agencyName={state.agencyName} notices={state.notices}
                     activityLog={state.activityLog} messageTemplates={state.messageTemplates} />
        : <Dashboard dispatch={dispatch} onOpenChat={openChatTo} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={loading.tasks} noticesLoading={loading.notices} />;
      case "liste":      return <ListeViaggio dispatch={dispatch} listeTarget={state.listeTarget} />;
      default:           return <Dashboard dispatch={dispatch} onOpenChat={openChatTo} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={loading.tasks} noticesLoading={loading.notices} />;
    }
  };

  return (
    // Il provider è alimentato dallo STESSO state del reducer: non esiste più
    // una seconda copia di team/categorie/utente da tenere allineata a mano.
    // Sostituisce syncLegacyGlobals(), che scriveva tre variabili di modulo nel
    // corpo di questo render — cosa non sicura sotto Concurrent Rendering e che
    // teneva le decisioni di permesso fuori dal ciclo di render di React.
    <AppDataProvider
      team={state.team}
      categories={state.categories}
      currentUserId={state.currentUserId}
    >
     {/* Task e clienti viaggiano per contesto, non come prop: due provider
         distinti e non uno solo, così l'arrivo di un cliente importato non
         invalida le viste che guardano i task (vedi state/ClientsContext.jsx). */}
     <TasksProvider tasks={state.tasks}>
      <ClientsProvider clients={state.clients}>
      {/* Criticità #8: le conferme distruttive passano da qui — `useConfirm()`
          al posto dei `window.confirm` bloccanti. Sta dentro i provider di
          dominio perché la finestra di conferma è parte dell'app, non della
          shell del browser. */}
      <ConfirmProvider>
      {/* vd-app-shell = height 100dvh con fallback 100vh (vedi FontLoader): su iOS
          "vh" è il viewport GRANDE, con la barra del browser visibile il guscio
          sfora in basso e la bottom-nav finisce fuori schermo. */}
      <div className="vd-app-shell" style={col}>
        {/* Il guscio dichiara le fette che consuma, come le viste (ST-2):
            `state` cambia identità dopo qualunque azione, e finché era una
            prop ri-renderizzava Topbar, Sidebar e BottomNav a ogni toast e a
            ogni carattere digitato. Team, categorie e utente corrente non
            compaiono qui: i tre componenti li leggono da AppDataContext, e la
            Topbar prende i task da TasksContext per il pannello di ricerca. */}
        <Topbar
          activeView={state.activeView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          dispatch={dispatch}
          notifications={notif.notifications}
          onMarkRead={notif.markRead}
          onMarkAllRead={notif.markAllRead}
          onRemoveNotification={notif.remove}
          onClearAllNotifications={notif.clearAll}
          onOpenTask={openTaskById}
          onOpenChat={openConversationById}
        />
        {/* Banner offline (criticità #7). Sopra a tutto il resto perché è la
            condizione che invalida tutto il resto: senza rete i numeri a
            schermo sono l'ultimo stato noto, non lo stato attuale, e ogni
            salvataggio fallirà. Il componente si nasconde da sé quando la rete
            c'è, quindi non ha un guard qui. */}
        <OfflineBanner />
        {/* Il banner esiste solo per il cambio-utente demo, che il reducer
            accetta solo in DEV (reducer.js, case SET_CURRENT_USER). In
            produzione `import.meta.env.DEV` è la costante `false`: il ramo
            collassa a build time e l'import di AdminRollbackBanner resta senza
            referenti, quindi il modulo esce dal bundle invece di restarci
            semplicemente irraggiungibile. */}
        {import.meta.env.DEV && state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner
            rollbackTo={state.adminRollbackTo}
            switchedAt={state.adminSwitchedAt}
            dispatch={dispatch}
          />
        )}
        <div style={rowFlex1}>
          <Sidebar activeView={state.activeView} dispatch={dispatch} onOpenBulk={openBulk} onOpenChat={openChatPanel} unreadChat={chat.unreadChat} />
          <main className="vd-main-scroll" style={flex1}>
            {/* Suspense per la vista attiva: Dashboard e ClientiView risolvono
                sincronicamente (viste d'ingresso, aperte da ogni sessione);
                Admin, Liste viaggio, Calendario, Cestino e Archivio sono lazy.
                ViewErrorBoundary confina alla vista un eventuale errore di
                render: senza, l'unico boundary è quello in main.jsx, che
                sostituisce tutta l'app con una schermata di errore a tutta
                pagina anche quando la shell è perfettamente integra. */}
            <Suspense fallback={<LazyFallback />}>
              <ViewErrorBoundary
                viewKey={state.activeView}
                onReset={() => dispatch({ type: "SET_VIEW", payload: "dashboard" })}
              >
                {PROFILE_VIEWS
                  ? <Profiler id={state.activeView} onRender={onViewRender}>{renderView()}</Profiler>
                  : renderView()}
              </ViewErrorBoundary>
            </Suspense>
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav activeView={state.activeView} dispatch={dispatch} onOpenBulk={openBulk} onOpenChat={openChatPanel} unreadChat={chat.unreadChat} />

        {/* Slide-over (lazy, Phase 2g). OverlayErrorBoundary confina un
            eventuale errore (chunk 404 dopo un deploy, o crash di render) al
            pannello: senza, l'unico boundary sarebbe quello di main.jsx, che
            sostituirebbe l'intera app mentre la dashboard sotto è integra. */}
        {state.selectedTask && (
          <Suspense fallback={<LazyFallback overlay />}>
            <OverlayErrorBoundary
              resetKey={state.selectedTask?.id}
              onReset={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
            >
              <TaskSlideOver task={state.selectedTask} dispatch={dispatch} />
            </OverlayErrorBoundary>
          </Suspense>
        )}

        {/* Chat Panel — montato solo da aperto (ST-12). Prima era sempre nel
            render e si limitava a ritornare `null` da chiuso: con `lazy()` il
            chunk si scaricherebbe comunque al primo render, cioè il rilievo
            resterebbe aperto con il codice che sembra chiuderlo. Il prezzo è
            che chiudendo la chat si torna all'elenco invece di ritrovare la
            conversazione aperta — lo stato di navigazione del pannello vive in
            `chatPanelReducer`, dentro il pannello. I dati non si ricaricano:
            conversazioni e messaggi stanno in useChatData, che resta montato.
            `chat.unreadChat` per il badge si calcola lì, fuori dal chunk. */}
        {showChat && (
          <Suspense fallback={<LazyFallback overlay />}>
            <ChatPanel
              open
              onClose={() => { setShowChat(false); setChatIntent(null); }}
              conversations={chat.conversations}
              messages={chat.messages}
              commands={chat.commands}
              onDeleteConversation={chat.commands.removeConversation}
              intent={chatIntent}
              tasks={state.tasks}
              currentUserId={state.currentUserId}
              dispatch={dispatch}
              presenceMap={presenceMap}
              messageTemplates={state.messageTemplates}
              loading={chat.loading}
              myBusy={myBusy}
              onToggleBusy={toggleMyBusy}
            />
          </Suspense>
        )}

        {/* FAB principale (singolo task). La creazione bulk/multi-task è ora in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "archivio" && state.activeView !== "admin" && (
          <FAB onClick={() => setShowFABModal(true)} />
        )}
        {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Overlay scorciatoie tastiera (v2.8 Round 10) */}
        {showKeyHelp && <KeyboardHelpOverlay onClose={() => setShowKeyHelp(false)} />}

        {/* Bulk Task Creator (lazy, Phase 2g). Stessa ragione dello slide-over
            qui sopra: un crash non deve portare via l'intera app. */}
        {showBulkModal && (
          <Suspense fallback={<LazyFallback overlay />}>
            <OverlayErrorBoundary resetKey="bulk" onReset={() => setShowBulkModal(false)}>
              <BulkTaskCreator
                existingTasks={getActiveTasks(state.tasks)}
                onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
                onClose={() => setShowBulkModal(false)}

              />
            </OverlayErrorBoundary>
          </Suspense>
        )}

        {/* Toast */}
        <ToastStack toasts={state.toasts} dispatch={dispatch} />
      </div>
      </ConfirmProvider>
      </ClientsProvider>
     </TasksProvider>
    </AppDataProvider>
  );
}
