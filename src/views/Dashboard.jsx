import { useState } from "react";
import { useViewport } from "../hooks/useViewport.jsx";
import { CATEGORIES } from "../data/mockData.js";
import { getMember, getAssignableTeam, formatDate, isOverdue, getActiveTasks } from "../utils/core.js";
import { getRoleType, isInGlobalQueue, isMyTask, canViewTask, getVisibleTasks, isUrgent } from "../utils/permissions.js";
import NoticeBoard from "../components/NoticeBoard.jsx";
import QueueTab from "../components/QueueTab.jsx";
import PersonalQueue from "../components/queues/PersonalQueue.jsx";
import UnassignedQueue from "../components/queues/UnassignedQueue.jsx";
import OverdueQueue from "../components/queues/OverdueQueue.jsx";
import UrgentOthersQueue from "../components/queues/UrgentOthersQueue.jsx";
import AIDayPlanner from "../components/modals/AIDayPlanner.jsx";
import Avatar from "../components/primitives/Avatar.jsx";
import PriorityBadge from "../components/primitives/PriorityBadge.jsx";

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
const Dashboard = ({ state, dispatch, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [showAIPlanner, setShowAIPlanner] = useState(false);
  const [activeQueue, setActiveQueue] = useState("personal");
  const uid = state.currentUserId;
  const role = getRoleType(uid);
  const me = getMember(uid);
  const allTasks = getActiveTasks(state.tasks);
  const tasks = getVisibleTasks(allTasks, uid);

  const agentWorkload = getAssignableTeam().map(m => ({
    ...m,
    count: allTasks.filter(t => t.assignees?.includes(m.id) && t.status !== "done").length
  }));

  const next7 = tasks
    .filter(t => t.status !== "done" && t.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  // ─── 3 code distinte (v0.8) ───
  const showGlobalQueue = role !== "driver";
  const unassigned = showGlobalQueue
    ? allTasks.filter(t => isInGlobalQueue(t) && canViewTask(t, uid)).sort((a, b) => {
        const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const dp = prioOrder[a.priority] - prioOrder[b.priority];
        if (dp !== 0) return dp;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      })
    : [];

  const personalQueue = allTasks
    .filter(t => isMyTask(t, uid) && t.status !== "done")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

  const showUrgentOthers = role !== "driver" && role !== "admin";
  const urgentOthers = showUrgentOthers
    ? allTasks
      .filter(t => !isMyTask(t, uid) && !isInGlobalQueue(t) && isUrgent(t))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    : [];

  const overdueTasks = tasks
    .filter(t => t.status !== "done" && isOverdue(t))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const takeOwnership = (task) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, assignees: [uid] } });
  };

  const firstName = me?.name?.split(" ")[0] || "ciao";

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24, minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700 }}>
            Buongiorno, {firstName} ☀️
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2 }}>
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            {role !== "admin" && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", background: "var(--surface3)", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.3 }}>{me?.role}</span>}
          </div>
        </div>
        <button onClick={() => setShowAIPlanner(true)} style={{
          background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%)",
          color: "var(--navy)", border: "none",
          padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(212,168,67,0.4)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(212,168,67,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(212,168,67,0.4)"; }}
        >
          <span>✨</span> Pianifica la mia giornata
        </button>
      </div>

      <NoticeBoard notices={state.notices} dispatch={dispatch} />

      {/* Tab code */}
      <div style={{
        background: "#fff", borderRadius: 12, padding: isMobile ? 8 : 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: `repeat(${(showGlobalQueue ? 1 : 0) + 1 + 1 + (showUrgentOthers ? 1 : 0)}, 1fr)`,
        gap: isMobile ? 6 : 8,
      }}>
        {showGlobalQueue && (
          <QueueTab active={activeQueue === "global"} onClick={() => setActiveQueue("global")} icon="🌐" label="Coda Globale" count={unassigned.length} isMobile={isMobile} />
        )}
        <QueueTab active={activeQueue === "personal"} onClick={() => setActiveQueue("personal")} icon="👤" label="Coda Personale" count={personalQueue.length} isMobile={isMobile} />
        <QueueTab active={activeQueue === "overdue"} onClick={() => setActiveQueue("overdue")} icon="📅" label="Scadute" count={overdueTasks.length} isMobile={isMobile} dangerCount />
        {showUrgentOthers && (
          <QueueTab active={activeQueue === "urgent"} onClick={() => setActiveQueue("urgent")} icon="⚠️" label="Urgenti" count={urgentOthers.length} isMobile={isMobile} dangerCount />
        )}
      </div>

      {activeQueue === "personal" && <PersonalQueue tasks={personalQueue} dispatch={dispatch} me={me} />}
      {activeQueue === "global" && showGlobalQueue && <UnassignedQueue tasks={unassigned} dispatch={dispatch} onTake={takeOwnership} />}
      {activeQueue === "overdue" && <OverdueQueue tasks={overdueTasks} dispatch={dispatch} />}
      {activeQueue === "urgent" && showUrgentOthers && <UrgentOthersQueue tasks={urgentOthers} dispatch={dispatch} onOpenChat={onOpenChat} uid={uid} />}

      <div className="vd-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Scadenze prossime */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Scadenze Prossime</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {next7.map(t => (
              <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, cursor: "pointer", transition: "background 0.15s",
                  background: isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent",
                  border: `1px solid ${isOverdue(t) ? "rgba(192,57,43,0.15)" : "var(--border)"}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent"}
              >
                <span style={{ fontSize: 16 }}>{CATEGORIES[t.category]?.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: isOverdue(t) ? "var(--danger)" : "var(--text-muted)" }}>
                    {isOverdue(t) ? "⚠️ Scaduto • " : ""}{formatDate(t.dueDate)}
                  </div>
                </div>
                <PriorityBadge priority={t.priority} />
              </div>
            ))}
          </div>
        </div>

        {/* Carico team */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Carico di Lavoro Team</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {agentWorkload.map(m => {
              const pct = Math.min(100, Math.round((m.count / m.capacity) * 100));
              const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
              return (
                <div key={m.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                    <Avatar memberId={m.id} size={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{m.count}/{m.capacity}</div>
                  </div>
                  <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAIPlanner && <AIDayPlanner tasks={tasks} onClose={() => setShowAIPlanner(false)} />}
    </div>
  );
};

export default Dashboard;
