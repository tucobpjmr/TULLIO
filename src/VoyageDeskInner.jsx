// src/VoyageDeskInner.jsx
// L'orchestratore: compone hook e viste. VoyageDesk.jsx è il wrapper che
// fornisce ViewportProvider.

import { useReducer, useEffect, useCallback, lazy, Suspense, Profiler } from "react";

// ── Stato ──────────────────────────────────────────────────────────────────
import { registraSinkErrori } from "./lib/errorReporting.js";
import { getActiveTasks } from "./lib/taskUtils.js";
import { canAccessAdmin } from "./lib/permissions.js";
import { reducer, makeInitialState } from "./state/reducer.js";
// M-3 · L'annidamento dei provider ha un file suo.
import { AppProviders } from "./state/AppProviders.jsx";
import { demoState } from "./state/demoState.js";

// ── Hook di dominio ────────────────────────────────────────────────────────
// Ogni hook possiede un pezzo di ciclo di vita (idratazione, notifiche,
// presenza, push, chat): qui si compone, non si implementa.
import { useSyncedDispatch } from "./hooks/useSyncedDispatch.js";
import { useCodaScritture } from "./hooks/useCodaScritture.js";
import { useAppHydration } from "./hooks/useAppHydration.js";
import { useNotifications } from "./hooks/useNotifications.js";
import { usePresence } from "./hooks/usePresence.js";
import { usePushNavigation } from "./hooks/usePushNavigation.js";
import { useUrlStato } from "./hooks/useUrlStato.js";
import { useChatData } from "./hooks/useChatData.js";
// M-3 · UI effimera del guscio (pannelli, ricerca) con callback stabili.
import { useShellUi } from "./hooks/useShellUi.js";

// ── Guscio e primitive ─────────────────────────────────────────────────────
import { ViewErrorBoundary } from "./components/errors/ViewErrorBoundary.jsx";
import { ToastStack } from "./components/ui/Toast.jsx";
import { LazyFallback } from "./components/ui/LazyFallback.jsx";
import { StatoEntita } from "./components/ui/StatoEntita.jsx";
import { LazyPanel } from "./components/ui/LazyPanel.jsx";
import { KeyboardHelpOverlay } from "./components/ui/KeyboardHelpOverlay.jsx";
import { Topbar, ID_RICERCA_GLOBALE } from "./components/shell/Topbar.jsx";
import { Sidebar } from "./components/shell/Sidebar.jsx";
import { BottomNav } from "./components/shell/BottomNav.jsx";
import { FAB } from "./components/shell/FAB.jsx";
import { AdminRollbackBanner } from "./components/shell/AdminRollbackBanner.jsx";
import { OfflineBanner } from "./components/shell/OfflineBanner.jsx";

// ── Viste ──────────────────────────────────────────────────────────────────
import { QuickAddTask } from "./components/tasks/QuickAddTask.jsx";

// Stili costanti: allocati una volta, non a ogni render.
const col = { display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" };
const rowFlex1 = { display: "flex", flex: 1, overflow: "hidden" };
const flex1 = { flex: 1, overflowY: "auto", overflowX: "hidden" };

// Chunk async: viste scaricate on-demand. Anche Dashboard e ClientiView (B-1):
// gli scheletri rendono il fallback innocuo.
const Dashboard = lazy(() =>
  import("./components/dashboard/Dashboard.jsx").then(m => ({ default: m.Dashboard }))
);
const ClientiView = lazy(() =>
  import("./components/clients/ClientiView.jsx").then(m => ({ default: m.ClientiView }))
);
// ST-12 · La chat è lazy. ⚠️ `getUnreadCount` si importa da chat/chatFormat.js,
// non da ChatPanel: un ri-export terrebbe il modulo nel chunk eager (una
// regola di lint chiude il percorso).
const ChatPanel = lazy(() =>
  import("./components/chat/ChatPanel.jsx").then(m => ({ default: m.ChatPanel }))
);
const BulkTaskCreator = lazy(() =>
  import("./components/tasks/bulk/BulkTaskCreator.jsx").then(m => ({ default: m.BulkTaskCreator }))
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
// Viste secondarie, ciascuna dietro una voce di navigazione: lazy.
const CalendarPlanner = lazy(() =>
  import("./components/calendar/CalendarPlanner.jsx").then(m => ({ default: m.CalendarPlanner }))
);
const Trash = lazy(() =>
  import("./components/tasks/Trash.jsx").then(m => ({ default: m.Trash }))
);
const Archive = lazy(() =>
  import("./components/tasks/Archive.jsx").then(m => ({ default: m.Archive }))
);
// React.Profiler attorno alla vista attiva, per misurare un render. Solo con
// VITE_PROFILE_VIEWS=true in dev: in produzione il ramo esce dal bundle.
const PROFILE_VIEWS = import.meta.env.DEV && import.meta.env.VITE_PROFILE_VIEWS === 'true';
const onViewRender = (id, phase, actualDuration, baseDuration) => {
  console.log(`[profile] ${id} ${phase}: actual=${actualDuration.toFixed(2)}ms base=${baseDuration.toFixed(2)}ms`);
};

// ─── A-3 · quali entità idratate alimentano ciascuna vista ─────────────────
// Qui perché è l'unico file che le conosce tutte. Liste e chat hanno un
// caricamento loro. L'etichetta completa la frase «Non è stato possibile
// caricare ___».
const ENTITA_PER_VISTA = {
  dashboard: [["tasks", "le task"], ["notices", "la bacheca avvisi"]],
  calendar: [["tasks", "le task"]],
  clienti: [["clients", "l'anagrafica clienti"]],
  archivio: [["tasks", "l'archivio"]],
  trash: [["tasks", "il cestino"]],
  admin: [["team", "il team"], ["categories", "le categorie"]],
};


export function VoyageDeskInner({ initialTeam, initialCurrentUserId }) {
  const [state, rawDispatch] = useReducer(
    reducer,
    { team: initialTeam, currentUserId: initialCurrentUserId },
    makeInitialState
  );

  // ─── B-1 del 4 novembre · la demo è un FLAG, non una deduzione ──────────────
  // Solo in sviluppo e solo senza utente loggato. Un team vuoto con una session
  // valida non arriva qui: AuthGate mostra un errore (prima spegneva in silenzio
  // la persistenza).
  const modalitaDemo = import.meta.env.DEV && !initialCurrentUserId;
  const useSupabase = !modalitaDemo;

  // Dati demo per useChatData: in produzione il ramo esce dal bundle. Il DEV
  // resta nell'`if`: è la costante che il bundler sa piegare.
  let demo = null;
  if (import.meta.env.DEV && modalitaDemo) demo = demoState();

  // M-2 · La coda delle scritture offline, passata a `dispatch`. `api` ha
  // identità stabile, quindi `dispatch` resta stabile.
  const { api: codaScritture, inAttesa: scrittureInAttesa } = useCodaScritture({
    enabled: useSupabase,
    uid: state.currentUserId,
    state,
    rawDispatch,
  });

  // Il registry (state/persistence.js) orchestrato da questo hook: ritorna
  // Promise<{ error }> e ha identità stabile.
  const dispatch = useSyncedDispatch(state, rawDispatch, { enabled: useSupabase, coda: codaScritture });

  // Toast d'errore con una firma unica per tutti gli hook.
  const showError = useCallback(
    (message) => rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message } }), []);
  const showSuccess = useCallback(
    (message) => rawDispatch({ type: "SHOW_TOAST", payload: { type: "success", message } }), []);

  // Il canale con cui gli handler globali di main.jsx mostrano un errore.
  // Prima della registrazione si limitano alla console.
  useEffect(() => registraSinkErrori(showError), [showError]);

  // `caricamento`: un flag per entità (scheletro, non vuoto). A-3 ·
  // `erroriCaricamento` è il terzo stato, `entita → { messaggio, riprova }`:
  // un fetch fallito non deve sembrare un elenco vuoto.
  const { caricamento, erroriCaricamento, caricamentoClienti, storicoTask, clientiCompleti } = useAppHydration({
    enabled: useSupabase,
    currentUserId: initialCurrentUserId,
    dispatch: rawDispatch,
    onError: showError,
    // B-1 · Il team già letto da AuthContext: l'idratazione non lo rilegge.
    teamIniziale: initialTeam,
  });

  const notif = useNotifications({ enabled: useSupabase, onError: showError });

  const { presenceMap, myBusy, toggleMyBusy } = usePresence({
    enabled: useSupabase, userId: initialCurrentUserId, team: initialTeam,
  });

  // Navigazione da notifica → TaskSlideOver. Task non più raggiungibile: si
  // chiude il pannello e si dice perché con un toast.
  // La dipendenza da `state.tasks` NON va tolta con un ref: la Topbar è già
  // iscritta a TasksContext e si ri-renderizza comunque (verificato).
  const apriTaskDaId = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) {
      dispatch({ type: "SET_SELECTED_TASK", payload: t });
    } else {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Task non più disponibile (spostato nel cestino o riassegnato)" } });
    }
  }, [state.tasks, dispatch]);

  // Spegne la notifica in campanella della conversazione aperta: la possiede
  // `useNotifications` (A-2), qui c'è solo il collegamento.
  // ⚠️ Si estrae PER NOME: `notif` è un oggetto nuovo a ogni render, e passarlo
  // romperebbe il `memo` di ChatPanel (misurato da src/test/chat/chatMemo.test.jsx).
  const { markReadForConversation: markChatNotificationsRead } = notif;

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

  // UI effimera del guscio: il perché delle scelte sta in hooks/useShellUi.js.
  const ui = useShellUi();
  // Estratte per nome: `ui` è nuovo a ogni render, queste tre sono stabili.
  const { apriFAB, alternaScorciatoie, chiudiPannelli } = ui;

  usePushNavigation({
    enabled: useSupabase,
    currentUserId: state.currentUserId,
    tasks: state.tasks,
    dispatch,
    onOpenChat: ui.apriConversazione,
  });

  // A-2 · Vista e task aperto vivono anche nell'URL (link, Indietro, refresh).
  // ⚠️ DOPO `usePushNavigation`: quello consuma `?task=`/`?chat=` al mount, e
  // gli effetti girano nell'ordine degli hook. Vedi hooks/useUrlStato.js.
  useUrlStato({
    vista: state.activeView,
    taskId: state.selectedTask?.id ?? null,
    tasks: state.tasks,
    dispatch,
  });

  useEffect(() => {
    const handler = (e) => {
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById(ID_RICERCA_GLOBALE)?.focus();
        return;
      }
      if (inInput) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        apriFAB();
      } else if (e.key === "?") {
        e.preventDefault();
        alternaScorciatoie();
      }
      // Esc non è gestito qui: lo consegna ui/Modal.jsx al solo modale in cima.
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [apriFAB, alternaScorciatoie]);

  // Al cambio utente il reducer riporta la vista a dashboard se serve; qui si
  // chiudono i pannelli.
  useEffect(() => {
    chiudiPannelli();
  }, [state.currentUserId, chiudiPannelli]);

  // A-3 · Le voci di ENTITA_PER_VISTA in errore.
  const vociStato = (chiavi) => chiavi
    .map(([chiave, etichetta]) => ({ chiave, etichetta, stato: erroriCaricamento[chiave] }))
    .filter(v => v.stato);

  // Le viste NON ricevono `state` (cambia identità a ogni azione): leggono dai
  // provider e ricevono solo prop stabili, così il loro `memo` funziona.
  const renderView = () => {
    switch (state.activeView) {
      case "dashboard":  return <Dashboard onOpenChat={ui.apriChatCon} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={caricamento.tasks} noticesLoading={caricamento.notices} />;
      case "calendar":   return <CalendarPlanner loading={caricamento.tasks} />;
      case "clienti":    return <ClientiView loading={caricamentoClienti} />;
      case "archivio":   return <Archive loading={caricamento.tasks} />;
      case "trash":      return <Trash loading={caricamento.tasks} />;
      // Ridondante col reducer per costruzione, ed è voluto: è l'ultimo punto prima
      // del montaggio della vista più sensibile, e non dipende da come activeView
      // verrà impostata domani.
      case "admin":      return canAccessAdmin(state.team, state.currentUserId)
        ? <AdminView agencyName={state.agencyName} notices={state.notices}
                     activityLog={state.activityLog} messageTemplates={state.messageTemplates} />
        : <Dashboard onOpenChat={ui.apriChatCon} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={caricamento.tasks} noticesLoading={caricamento.notices} />;
      case "liste":      return <ListeViaggio listeTarget={state.listeTarget} />;
      default:           return <Dashboard onOpenChat={ui.apriChatCon} notices={state.notices} dashboardQueue={state.dashboardQueue} tasksLoading={caricamento.tasks} noticesLoading={caricamento.notices} />;
    }
  };

  return (
    // I provider sono alimentati dallo STESSO state del reducer (vedi
    // state/AppProviders.jsx).
    <AppProviders
      dispatch={dispatch}
      team={state.team}
      categories={state.categories}
      currentUserId={state.currentUserId}
      tasks={state.tasks}
      clients={state.clients}
      richiediStorico={storicoTask.richiedi}
      storicoInCorso={storicoTask.caricando}
      richiediClienti={clientiCompleti.richiedi}
      clientiInCorso={clientiCompleti.caricando}
    >
      {/* vd-app-shell = 100dvh (fallback 100vh): su iOS "vh" è il viewport grande e
         la bottom-nav finirebbe fuori schermo. */}
      <div className="vd-app-shell" style={col}>
        {/* Il guscio riceve solo le fette che usa (ST-2): team, categorie e utente da
           AppDataContext, i task da TasksContext. */}
        <Topbar
          activeView={state.activeView}
          ricerca={ui.ricerca}
          onSearchChange={ui.impostaRicerca}
          notifications={notif.notifications}
          nonLetteOltreFinestra={notif.nonLetteOltreFinestra}
          onMarkRead={notif.markRead}
          onMarkAllRead={notif.markAllRead}
          onRemoveNotification={notif.remove}
          onClearAllNotifications={notif.clearAll}
          onOpenTask={apriTaskDaId}
          onOpenChat={ui.apriConversazione}
        />
        {/* Banner offline: sopra a tutto, perché invalida tutto il resto. Si
           nasconde da sé. */}
        <OfflineBanner inAttesa={scrittureInAttesa} />
        {/* Solo per il cambio-utente demo: in produzione il ramo esce dal bundle. */}
        {import.meta.env.DEV && state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner
            rollbackTo={state.adminRollbackTo}
            switchedAt={state.adminSwitchedAt}
          />
        )}
        <div style={rowFlex1}>
          <Sidebar activeView={state.activeView} onOpenBulk={ui.apriBulk} onOpenChat={ui.apriChat} unreadChat={chat.unreadChat} />
          <main className="vd-main-scroll" style={flex1}>
            {/* Suspense + ViewErrorBoundary: un errore di render resta confinato alla vista. */}
            <Suspense fallback={<LazyFallback />}>
              <ViewErrorBoundary
                viewKey={state.activeView}
                onReset={() => dispatch({ type: "SET_VIEW", payload: "dashboard" })}
              >
                {/* A-3 · Il riquadro d'errore si aggiunge alla vista, non la sostituisce. */}
                <StatoEntita voci={vociStato(ENTITA_PER_VISTA[state.activeView] ?? [])}>
                  {PROFILE_VIEWS
                    ? <Profiler id={state.activeView} onRender={onViewRender}>{renderView()}</Profiler>
                    : renderView()}
                </StatoEntita>
              </ViewErrorBoundary>
            </Suspense>
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav activeView={state.activeView} onOpenBulk={ui.apriBulk} onOpenChat={ui.apriChat} unreadChat={chat.unreadChat} />

        {/* Slide-over lazy in LazyPanel (Suspense + boundary). `resetKey` = id del
           task: il pannello resta montato passando da un task all'altro. */}
        {state.selectedTask && (
          <LazyPanel
            resetKey={state.selectedTask?.id}
            onReset={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
            overlay
          >
            <TaskSlideOver task={state.selectedTask} />
          </LazyPanel>
        )}

        {/* Chat montata solo da aperta (ST-12), altrimenti il chunk si scaricherebbe
           comunque. I dati restano in useChatData; il badge si calcola lì. */}
        {ui.chatAperta && (
          <LazyPanel resetKey="chat" onReset={ui.chiudiChat} overlay>
            <ChatPanel
              open
              onClose={ui.chiudiChat}
              conversations={chat.conversations}
              messages={chat.messages}
              commands={chat.commands}
              storiaMessaggi={chat.storiaMessaggi}
              onDeleteConversation={chat.commands.removeConversation}
              intent={ui.intentoChat}
              tasks={state.tasks}
              currentUserId={state.currentUserId}
              presenceMap={presenceMap}
              messageTemplates={state.messageTemplates}
              loading={chat.loading}
              myBusy={myBusy}
              onToggleBusy={toggleMyBusy}
            />
          </LazyPanel>
        )}

        {/* FAB principale (singolo task). La creazione in blocco è in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "archivio" && state.activeView !== "admin" && (
          <FAB onClick={ui.apriFAB} />
        )}
        {ui.fabAperto && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={ui.chiudiFAB} />}

        {/* Overlay scorciatoie tastiera */}
        {ui.scorciatoieAperte && <KeyboardHelpOverlay onClose={ui.chiudiScorciatoie} />}

        {/* Bulk Task Creator lazy: un crash non porta via l'app. */}
        {ui.bulkAperto && (
          <LazyPanel resetKey="bulk" onReset={ui.chiudiBulk} overlay>
            <BulkTaskCreator
              existingTasks={getActiveTasks(state.tasks)}
              onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
              onClose={ui.chiudiBulk}
            />
          </LazyPanel>
        )}

        {/* Toast */}
        <ToastStack toasts={state.toasts} />
      </div>
    </AppProviders>
  );
}
