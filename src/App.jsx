// ─── ROOT APP ──────────────────────────────────────────────────────────────
import { useState, useReducer, useEffect } from "react";
import { ViewportProvider, useViewport } from "./contexts/ViewportContext.jsx";
import { reducer, initialState } from "./contexts/AppContext.jsx";
import { getActiveTasks } from "./utils/helpers.js";
import { getUnreadCount } from "./components/chat/chatUtils.js";
import { initialConversations, initialMessages } from "./components/chat/chatMockData.js";

import FontLoader from "./styles/GlobalStyles.jsx";
import Topbar from "./components/layout/Topbar.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import BottomNav from "./components/layout/BottomNav.jsx";
import Dashboard from "./views/Dashboard.jsx";
import CalendarPlanner from "./views/CalendarPlanner.jsx";
import Team from "./views/Team.jsx";
import Trash from "./views/Trash.jsx";
import AdminView from "./components/admin/AdminView.jsx";
import Clienti from "./views/Clienti.jsx";
import TaskSlideOver from "./components/tasks/TaskSlideOver.jsx";
import QuickAddTask from "./components/tasks/QuickAddTask.jsx";
import BulkTaskCreator from "./components/bulk/BulkTaskCreator.jsx";
import ChatPanel from "./components/chat/ChatPanel.jsx";
import FAB from "./components/FAB.jsx";
import Toast from "./components/ui/Toast.jsx";

export default function App() {
  return (
    <ViewportProvider>
      <VoyageDeskInner />
    </ViewportProvider>
  );
}

function VoyageDeskInner() {
  const { isDesktop } = useViewport();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showFABModal, setShowFABModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat)
  const unreadChat = conversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id),
    0
  );

  // Apre la chat verso un utente specifico, opzionalmente con link a task
  const openChatTo = (intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
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
      case "dashboard": return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "clients": return <Clienti state={state} dispatch={dispatch} />;
      case "team": return <Team state={state} dispatch={dispatch} />;
      case "trash": return <Trash state={state} dispatch={dispatch} />;
      case "admin": return <AdminView state={state} dispatch={dispatch} />;
      default: return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  return (
    <>
      <FontLoader />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
        <Topbar state={state} dispatch={dispatch} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={unreadChat} />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {renderView()}
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} />

        {/* Slide-over */}
        {state.selectedTask && <TaskSlideOver task={state.selectedTask} dispatch={dispatch} />}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={conversations}
          setConversations={setConversations}
          messages={messages}
          setMessages={setMessages}
          intent={chatIntent}
          tasks={state.tasks}
          currentUserId={state.currentUserId}
        />

        {/* FAB principale (singolo task) + FAB secondario (bulk) */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <>
            <button
              onClick={() => setShowBulkModal(true)}
              title="Crea più task / Import / Template"
              style={{
                position: "fixed", bottom: isDesktop ? 32 : 84, right: isDesktop ? 92 : 76, width: 44, height: 44,
                borderRadius: "50%", background: "var(--navy)", border: "none",
                boxShadow: "0 6px 20px rgba(15,32,68,0.35)", cursor: "pointer",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", zIndex: 400,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >📑</button>
            <FAB onClick={() => setShowFABModal(true)} />
          </>
        )}
        {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Bulk Task Creator */}
        {showBulkModal && (
          <BulkTaskCreator
            existingTasks={getActiveTasks(state.tasks)}
            onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
            onClose={() => setShowBulkModal(false)}
          />
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </>
  );
}
