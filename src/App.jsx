import { useState, useReducer, useEffect } from "react";
import { ViewportProvider, useViewport } from "./hooks/useViewport.jsx";
import { reducer, initialState } from "./reducers/appReducer.js";
import { getActiveTasks } from "./utils/core.js";
import { initialConversations, initialMessages, getUnreadCount } from "./modules/chat/chatData.js";
import Topbar from "./components/layout/Topbar.jsx";
import Sidebar from "./components/layout/Sidebar.jsx";
import BottomNav from "./components/layout/BottomNav.jsx";
import Dashboard from "./views/Dashboard.jsx";
import CalendarPlanner from "./views/CalendarPlanner.jsx";
import Team from "./views/Team.jsx";
import Trash from "./views/Trash.jsx";
import AdminView from "./views/AdminView.jsx";
import ChatPanel from "./modules/chat/ChatPanel.jsx";
import FAB from "./components/FAB.jsx";
import Toast from "./components/Toast.jsx";
import QuickAddTask from "./components/modals/QuickAddTask.jsx";
import BulkTaskCreator from "./components/modals/BulkTaskCreator.jsx";
import TaskSlideOver from "./components/TaskSlideOver.jsx";

// ─── APP INNER ─────────────────────────────────────────────────────────────
function AppInner() {
  const { isDesktop } = useViewport();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showFABModal, setShowFABModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);

  const unreadChat = conversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id),
    0
  );

  const openChatTo = (intent) => {
    if (intent && intent.toUser) setChatIntent(intent);
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

  useEffect(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
  }, [state.currentUserId]);

  const renderView = () => {
    switch (state.activeView) {
      case "dashboard": return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "team": return <Team state={state} dispatch={dispatch} />;
      case "trash": return <Trash state={state} dispatch={dispatch} />;
      case "admin": return <AdminView state={state} dispatch={dispatch} />;
      default: return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
      <Topbar state={state} dispatch={dispatch} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={unreadChat} />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar state={state} dispatch={dispatch} />
        <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
          {renderView()}
        </main>
      </div>

      <BottomNav state={state} dispatch={dispatch} />

      {state.selectedTask && <TaskSlideOver task={state.selectedTask} dispatch={dispatch} />}

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
              color: "#fff", zIndex: 400, transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          >📑</button>
          <FAB onClick={() => setShowFABModal(true)} />
        </>
      )}

      {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

      {showBulkModal && (
        <BulkTaskCreator
          existingTasks={getActiveTasks(state.tasks)}
          onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      <Toast toast={state.toast} dispatch={dispatch} />
    </div>
  );
}

// ─── APP ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ViewportProvider>
      <AppInner />
    </ViewportProvider>
  );
}
