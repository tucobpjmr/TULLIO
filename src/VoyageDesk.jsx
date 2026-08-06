
import { useState, useReducer, useEffect, useCallback, lazy, Suspense } from "react";

// ── Stato ──────────────────────────────────────────────────────────────────
import { Notifications as NotificationsAPI } from "./lib/api.js";
import { isUuid } from "./lib/mappers.js";
import { getActiveTasks } from "./lib/taskUtils.js";
import { reducer, makeInitialState } from "./state/reducer.js";
import { AppDataProvider } from "./state/AppDataContext.jsx";
import { INITIAL_CONVERSATIONS, INITIAL_MESSAGES } from "./state/mockData.js";

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
import { GlobalStyles } from "./styles/GlobalStyles.jsx";
import { ViewportProvider } from "./components/Viewport.jsx";
import { ViewErrorBoundary } from "./components/ViewErrorBoundary.jsx";
import { Toast } from "./components/ui/Toast.jsx";
import { LazyFallback } from "./components/ui/LazyFallback.jsx";
import { KeyboardHelpOverlay } from "./components/ui/KeyboardHelpOverlay.jsx";
import { Topbar } from "./components/shell/Topbar.jsx";
import { Sidebar, BottomNav } from "./components/shell/Sidebar.jsx";
import { FAB } from "./components/shell/FAB.jsx";
import { AdminRollbackBanner } from "./components/shell/AdminRollbackBanner.jsx";

// ── Viste ──────────────────────────────────────────────────────────────────
import { Dashboard } from "./components/dashboard/Dashboard.jsx";
import { CalendarPlanner } from "./components/calendar/CalendarPlanner.jsx";
import { ClientiView } from "./components/clients/ClientiView.jsx";
import { Trash } from "./components/views/Trash.jsx";
import { Archive } from "./components/views/Archive.jsx";
import { ChatPanel } from "./components/chat/ChatPanel.jsx";
import { QuickAddTask } from "./components/modals/QuickAddTask.jsx";

// Chunk async: viste pesanti o riservate a un ruolo, scaricate on-demand.
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
// Dove è finito il resto del monolite:
//   utility pure          → src/lib/{taskUtils,permissions,chatUtils,mappers}.js
//   reducer + persistenza → src/state/{reducer,persistence}.js
//   CSS globale e tema    → src/styles/GlobalStyles.jsx
//   dati demo             → src/state/mockData.js
//   viste e primitive     → src/components/**

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function VoyageDesk({ initialTeam, initialCurrentUserId } = {}) {
  return (
    <ViewportProvider>
      <VoyageDeskInner
        initialTeam={initialTeam}
        initialCurrentUserId={initialCurrentUserId}
      />
    </ViewportProvider>
  );
}

function VoyageDeskInner({ initialTeam, initialCurrentUserId }) {
  const [state, rawDispatch] = useReducer(
    reducer,
    { team: initialTeam, currentUserId: initialCurrentUserId },
    makeInitialState
  );

  // Modalità DB: attiva solo se AuthContext ha fornito un team reale.
  // Senza, l'app resta sui mock (dev/preview senza login).
  const useSupabase = Array.isArray(initialTeam) && initialTeam.length > 0;

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

  const { crmLoading } = useAppHydration({
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
    mockConversations: INITIAL_CONVERSATIONS,
    mockMessages: INITIAL_MESSAGES,
    onError: showError,
    onSuccess: showSuccess,
    onConversationRead: markChatNotificationsRead,
  });

  const [showFABModal, setShowFABModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false); // v2.8 Round 10
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // Apre la chat verso un utente specifico, opzionalmente con link a task
  const openChatTo = (intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  };

  // Apre una conversazione già esistente (tap su una notifica di chat).
  const openConversationById = useCallback((conversationId) => {
    if (!conversationId) return;
    setChatIntent({ convId: conversationId });
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
      } else if (e.key === "Escape") {
        setShowKeyHelp(false);
      }
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

  const renderView = () => {
    switch (state.activeView) {
      case "dashboard":  return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar":   return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "clienti":    return <ClientiView state={state} dispatch={dispatch} loading={crmLoading} />;
      case "archivio":   return <Archive state={state} dispatch={dispatch} />;
      case "trash":      return <Trash state={state} dispatch={dispatch} />;
      case "admin":      return <AdminView state={state} dispatch={dispatch} />;
      case "liste":      return <ListeViaggio state={state} dispatch={dispatch} />;
      default:           return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
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
      <GlobalStyles />
      {/* vd-app-shell = height 100dvh con fallback 100vh (vedi FontLoader): su iOS
          "vh" è il viewport GRANDE, con la barra del browser visibile il guscio
          sfora in basso e la bottom-nav finisce fuori schermo. */}
      <div className="vd-app-shell" style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
        <Topbar
          state={state}
          dispatch={dispatch}
          notifications={notif.notifications}
          onMarkRead={notif.markRead}
          onMarkAllRead={notif.markAllRead}
          onRemoveNotification={notif.remove}
          onClearAllNotifications={notif.clearAll}
          onOpenTask={openTaskById}
          onOpenChat={openConversationById}
        />
        {state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner
            rollbackTo={state.adminRollbackTo}
            switchedAt={state.adminSwitchedAt}
            dispatch={dispatch}
          />
        )}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={chat.unreadChat} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {/* Suspense per la vista attiva: solo AdminView (Phase 2g) e il
                modulo Liste viaggio sono lazy, le altre viste risolvono
                sincronicamente.
                ViewErrorBoundary confina alla vista un eventuale errore di
                render: senza, l'unico boundary è quello in main.jsx, che
                sostituisce tutta l'app con una schermata di errore a tutta
                pagina anche quando la shell è perfettamente integra. */}
            <Suspense fallback={<LazyFallback />}>
              <ViewErrorBoundary
                viewKey={state.activeView}
                onReset={() => dispatch({ type: "SET_VIEW", payload: "dashboard" })}
              >
                {renderView()}
              </ViewErrorBoundary>
            </Suspense>
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={chat.unreadChat} />

        {/* Slide-over (lazy, Phase 2g) */}
        {state.selectedTask && (
          <Suspense fallback={<LazyFallback overlay />}>
            <TaskSlideOver task={state.selectedTask} dispatch={dispatch} clients={state.clients || []} />
          </Suspense>
        )}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={chat.conversations}
          setConversations={chat.setConversations}
          messages={chat.messages}
          setMessages={chat.setMessages}
          commands={chat.commands}
          markConversationRead={chat.commands.markConversationRead}
          onToggleReaction={chat.commands.toggleReaction}
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

        {/* FAB principale (singolo task). La creazione bulk/multi-task è ora in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "archivio" && state.activeView !== "admin" && (
          <FAB onClick={() => setShowFABModal(true)} />
        )}
        {showFABModal && <QuickAddTask clients={state.clients || []} onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Overlay scorciatoie tastiera (v2.8 Round 10) */}
        {showKeyHelp && <KeyboardHelpOverlay onClose={() => setShowKeyHelp(false)} />}

        {/* Bulk Task Creator (lazy, Phase 2g) */}
        {showBulkModal && (
          <Suspense fallback={<LazyFallback overlay />}>
            <BulkTaskCreator
              existingTasks={getActiveTasks(state.tasks)}
              onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
              onClose={() => setShowBulkModal(false)}
              clients={state.clients || []}
            />
          </Suspense>
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </AppDataProvider>
  );
}
// Step J — touched
