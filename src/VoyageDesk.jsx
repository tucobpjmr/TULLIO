
import { useState, useReducer, useContext, createContext, useRef, useEffect, useCallback, useMemo } from "react";
// xlsx (SheetJS, ~430KB) è caricato on-demand via import() dinamico solo
// quando l'utente importa o esporta un file (vedi loadXLSX). Tenerlo fuori
// dal bundle iniziale è il singolo guadagno più grande sul chunk principale.
import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Conversations as ConversationsAPI, Messages as MessagesAPI,
  Notifications as NotificationsAPI, Users as UsersAPI,
  subscribeToTable,
} from "./lib/api.js";
import {
  toDbTask, toDbTaskPatch, fromDbTask,
  toDbNotice, toDbNoticePatch, fromDbNotice,
  toDbConversation, fromDbConversation,
  toDbMessage, fromDbMessage,
  fromDbNotification,
  newId, isUuid,
} from "./lib/mappers.js";
// Step O: logout UI — signOut vive in AuthContext, qui viene solo cablato.
import { useAuth } from "./auth/AuthContext.jsx";
// Step P Phase 2a: costanti e utility pure estratte dal monolite.
import {
  PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS,
  NOTICE_COLORS, TASK_TEMPLATES,
} from "./lib/taskConstants.js";
import {
  formatDate, formatTime, getDayKey,
  isOverdue, isUrgent,
  isActiveTask, getActiveTasks, getTrashedTasks,
  isMyTask, isInGlobalQueue,
} from "./lib/taskUtils.js";
// Step P Phase 2b: dati mock (solo le notifiche, le altre seed vivono nel reducer).
import { MOCK_NOTIFICATIONS } from "./state/mockData.js";
// Step P Phase 2c: globals mutabili e helper permessi estratti.
import {
  TEAM, CATEGORIES, CURRENT_USER,
  getMember, getAssignableTeam,
  getRoleType, isAdmin, isDriver,
  canViewTask, canEditTask, canCreateTaskCategory,
  canAccessAdmin, getAvailableCategories, getVisibleTasks,
} from "./state/appGlobals.js";
// Step P Phase 2d: reducer e factory dell'initial state estratti.
import { reducer, makeInitialState } from "./state/reducer.js";
// Step P Phase 2e: foundation + UI primitives estratti in src/components/.
import { useViewport, ViewportProvider } from "./components/Viewport.jsx";
// Step P Phase 2f: loader xlsx condiviso estratto in lib/xlsx.js.
import { loadXLSX } from "./lib/xlsx.js";
import { SwipeActions } from "./components/SwipeActions.jsx";
import { Avatar } from "./components/ui/Avatar.jsx";
import { PriorityBadge } from "./components/ui/PriorityBadge.jsx";
import { CategoryChip } from "./components/ui/CategoryChip.jsx";
import { StatusBadge } from "./components/ui/StatusBadge.jsx";
import { Toast } from "./components/ui/Toast.jsx";
// Step P Phase 2f: modali estratti in src/components/modals/.
import { ProfileEditor } from "./components/modals/ProfileEditor.jsx";
import { BulkTaskCreator } from "./components/modals/BulkTaskCreator.jsx";
// AIDayPlanner e NoticeEditorModal sono ora consumati direttamente dai
// componenti dashboard (Dashboard.jsx / NoticeBoard.jsx), non più da qui.
import { QuickAddTask } from "./components/modals/QuickAddTask.jsx";

// Step P Phase 2f: dashboard estratto in src/components/dashboard/.
import { Dashboard } from "./components/dashboard/Dashboard.jsx";

// Step P Phase 2f: calendar estratto in src/components/calendar/.
import { CalendarPlanner } from "./components/calendar/CalendarPlanner.jsx";

// Step P Phase 2f: chat estratto in src/components/chat/.
import { ChatPanel, getUnreadCount } from "./components/chat/ChatPanel.jsx";

// Step P Phase 2f: tasks estratto in src/components/tasks/.
import { TaskSlideOver } from "./components/tasks/TaskSlideOver.jsx";

// Step P Phase 2f: views estratte in src/components/views/.
import { Team } from "./components/views/Team.jsx";
import { Trash } from "./components/views/Trash.jsx";

// Step P Phase 2f: admin estratto in src/components/admin/.
import { AdminView } from "./components/admin/AdminView.jsx";

// ─── XLSX LAZY LOADER ──────────────────────────────────────────────────────
// loadXLSX → src/lib/xlsx.js (Step P Phase 2f)

// ─── GOOGLE FONTS ──────────────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0F2044;
      --navy-light: #1a3060;
      --navy-dark: #08152d;
      --gold: #D4A843;
      --gold-light: #e8c46a;
      --gold-dark: #b8902e;
      --surface: #FAFAF7;
      --surface2: #F0EEE8;
      --surface3: #E8E5DC;
      --success: #2D7A4F;
      --warning: #C8832A;
      --danger: #C0392B;
      --text: #1A1A2E;
      --text-muted: #6B6B80;
      --text-light: #9999AA;
      --border: #E0DDD5;
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--text); }
    .playfair { font-family: 'Playfair Display', serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold-dark); }
    .drag-over { outline: 2px dashed var(--gold); background: rgba(212,168,67,0.07) !important; }
    .dragging { opacity: 0.4; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    @keyframes toastIn { from { transform:translateY(80px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes toastOut { to { transform:translateY(80px); opacity:0; } }
    @keyframes recordPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.5); } 50% { box-shadow: 0 0 0 12px rgba(192,57,43,0); } }
    @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
    @keyframes typing { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .record-pulse { animation: recordPulse 1.5s ease infinite; }
    .fade-in { animation: fadeIn 0.3s ease forwards; }
    .slide-right { animation: slideRight 0.3s ease forwards; }
    .slide-up { animation: slideUp 0.35s ease forwards; }
    .skeleton { animation: pulse 1.5s ease infinite; background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%); background-size: 200% 100%; }
    .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(15,32,68,0.12); }

    /* ─── RESPONSIVE ─── */
    /* Griglie adattive: collassano su tablet/mobile via media query.
       Gli stili inline restano il default desktop; queste regole hanno la priorità grazie a !important. */
    @media (max-width: 1024px) {
      .vd-grid-kpi { grid-template-columns: repeat(2, 1fr) !important; }
      .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main { grid-template-columns: 1fr 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 18px !important; }
    }
    @media (max-width: 640px) {
      .vd-grid-kpi, .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main,
      .vd-grid-collapse { grid-template-columns: 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 14px !important; }
      .vd-hide-mobile { display: none !important; }
      .vd-row-wrap { flex-wrap: wrap !important; }
    }
    /* Bottom nav: solo mobile/tablet */
    .vd-bottom-nav { display: none; }
    @media (max-width: 1024px) {
      .vd-bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 450;
        background: var(--navy-dark); border-top: 1px solid rgba(212,168,67,0.2);
        padding: 6px 4px env(safe-area-inset-bottom, 6px);
        justify-content: space-around; align-items: stretch;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
      }
      .vd-main-scroll { padding-bottom: 70px !important; }
    }
  `}</style>
);

// ─── VIEWPORT (responsive) ─────────────────────────────────────────────────
// ViewportContext, useViewport, ViewportProvider → src/components/Viewport.jsx (Step P Phase 2e)

// ─── CONTEXT ───────────────────────────────────────────────────────────────
const AppContext = createContext(null);
// reducer, makeInitialState (+ baseReducer, buildLogEntry, LOGGED_ACTIONS,
// ADMIN_ONLY_ACTIONS) → src/state/reducer.js

// ─── UTILS ─────────────────────────────────────────────────────────────────
// formatDate, formatTime, getDayKey, isOverdue, isUrgent, isActiveTask,
// getActiveTasks, getTrashedTasks, isMyTask, isInGlobalQueue → src/lib/taskUtils.js
// getMember, getAssignableTeam, getRoleType, isAdmin, isDriver,
// canViewTask, canEditTask, canCreateTaskCategory, canAccessAdmin,
// getAvailableCategories, getVisibleTasks → src/state/appGlobals.js

// ─── SWIPE ACTIONS / UI PRIMITIVES ─────────────────────────────────────────
// SwipeActions → src/components/SwipeActions.jsx (Step P Phase 2e)
// Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast → src/components/ui/

// ─── ADVANCED SEARCH PANEL ─────────────────────────────────────────────────
// Pannello di ricerca unificato: la keyword è controllata dall'input lente nella
// Topbar (props keyword / onKeyword), i filtri avanzati restano locali al pannello.
const AdvancedSearchPanel = ({ tasks, dispatch, onClose, keyword = "", onKeyword }) => {
  const { isMobile } = useViewport();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cats, setCats] = useState([]);
  const [stats, setStats] = useState([]);
  const [agents, setAgents] = useState([]);
  const [includeTrashed, setIncludeTrashed] = useState(false);

  // La chiusura su click esterno è gestita dal wrapper di ricerca nella Topbar
  // (l'input keyword vive lì). Qui resta solo la chiusura con Escape.
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const toggle = (arr, setArr, val) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const resetAll = () => {
    onKeyword?.(""); setDateFrom(""); setDateTo("");
    setCats([]); setStats([]); setAgents([]); setIncludeTrashed(false);
  };

  const hasFilters = keyword.trim() || dateFrom || dateTo || cats.length || stats.length || agents.length || includeTrashed;

  const results = useMemo(() => {
    if (!hasFilters) return [];
    const k = keyword.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? (() => { const d = new Date(dateTo); d.setHours(23,59,59,999); return d; })() : null;

    return tasks.filter(t => {
      if (!includeTrashed && t.deletedAt) return false;
      if (cats.length && !cats.includes(t.category)) return false;
      if (stats.length && !stats.includes(t.status)) return false;
      if (agents.length && !(t.assignees || []).some(a => agents.includes(a))) return false;
      if (from) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) < from) return false;
      }
      if (to) {
        if (!t.dueDate) return false;
        if (new Date(t.dueDate) > to) return false;
      }
      if (k) {
        const hay = [
          t.title || "",
          t.description || "",
          t.client || "",
          ...(t.comments || []).map(c => c.text || ""),
        ].join(" ").toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    }).sort((a,b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [tasks, keyword, dateFrom, dateTo, cats, stats, agents, includeTrashed, hasFilters]);

  const openTask = (t) => {
    dispatch({ type: "SET_SELECTED_TASK", payload: t });
    onClose();
  };

  const chipBase = (active, color) => ({
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
    cursor: "pointer", border: `1px solid ${active ? color : "var(--border)"}`,
    background: active ? color : "#fff",
    color: active ? "#fff" : "var(--text)",
    transition: "all 0.15s", userSelect: "none",
  });

  const sectionTitle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };

  return (
    <div
      className="fade-in"
      style={{
        position: isMobile ? "fixed" : "absolute",
        top: isMobile ? 64 : "calc(100% + 8px)",
        left: isMobile ? 8 : 0,
        right: isMobile ? 8 : "auto",
        width: isMobile ? "auto" : 680, maxHeight: "calc(100vh - 80px)", overflow: "hidden",
        background: "var(--surface)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        zIndex: 200,
      }}
    >
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#fff",
      }}>
        <div className="playfair" style={{ fontSize: 15, fontWeight: 700, color: "var(--navy)" }}>
          🔍 Ricerca
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasFilters && (
            <button onClick={resetAll} style={{
              background: "transparent", border: "1px solid var(--border)",
              borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "var(--text-muted)",
              cursor: "pointer", fontWeight: 500,
            }}>Reset</button>
          )}
          <button onClick={onClose} style={{
            background: "transparent", border: "none", fontSize: 18,
            cursor: "pointer", color: "var(--text-muted)", lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", overflowY: "auto", maxHeight: 380 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Scadenza</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Da</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>A</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
              }} />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Categoria</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(CATEGORIES).map(([key, c]) => {
              const active = cats.includes(key);
              return (
                <div key={key} onClick={() => toggle(cats, setCats, key)} style={chipBase(active, c.color)}>
                  <span>{c.icon}</span>{c.label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Status</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {STATUSES.map(s => {
              const active = stats.includes(s);
              return (
                <div key={s} onClick={() => toggle(stats, setStats, s)} style={chipBase(active, STATUS_COLORS[s])}>
                  {STATUS_LABELS[s]}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={sectionTitle}>Agente</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {TEAM.filter(m => !m.pending).map(m => {
              const active = agents.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(agents, setAgents, m.id)} style={chipBase(active, m.color)}>
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: active ? "rgba(255,255,255,0.25)" : m.color,
                    color: "#fff", fontSize: 9, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>{m.avatar}</span>
                  {m.name.split(" ")[0]}
                </div>
              );
            })}
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          🗑️ Includi task nel cestino
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "#fff", maxHeight: 320 }}>
        {!hasFilters && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Digita una parola chiave o imposta un filtro per iniziare la ricerca
          </div>
        )}
        {hasFilters && results.length === 0 && (
          <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            Nessun task corrisponde ai filtri
          </div>
        )}
        {hasFilters && results.length > 0 && (
          <>
            <div style={{
              padding: "8px 18px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: 1, background: "var(--surface2)",
              borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
            }}>
              {results.length} {results.length === 1 ? "risultato" : "risultati"}
            </div>
            {results.map(t => {
              const cat = CATEGORIES[t.category];
              const prio = PRIORITIES[t.priority];
              const overdue = isOverdue(t);
              return (
                <div
                  key={t.id}
                  onClick={() => openTask(t)}
                  style={{
                    padding: "10px 18px", borderBottom: "1px solid var(--border)",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                    transition: "background 0.15s",
                    opacity: t.deletedAt ? 0.6 : 1,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: cat.bg, color: cat.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {t.deletedAt && <span style={{ color: "var(--danger)", marginRight: 6 }}>🗑️</span>}
                      {t.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 }}>
                      <span>{STATUS_LABELS[t.status]}</span>
                      {t.client && <span>• {t.client}</span>}
                      {t.dueDate && (
                        <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)" }}>
                          • {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, flexShrink: 0,
                  }}>{prio.label}</div>
                  <div style={{ display: "flex", marginLeft: 4 }}>
                    {(t.assignees || []).slice(0, 3).map((aid, i) => (
                      <div key={aid} style={{ marginLeft: i ? -6 : 0 }}>
                        <Avatar memberId={aid} size={22} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

// ─── TOPBAR ────────────────────────────────────────────────────────────────
const Topbar = ({ state, dispatch, onOpenChat, unreadChat, notifications: notificationsProp, onMarkRead, onMarkAllRead, onOpenTask }) => {
  const { isMobile } = useViewport();
  // Fix #11: notifiche mock gate-ate dietro env var (default off in prod)
  const SHOW_MOCK_NOTIFS = import.meta.env.DEV && import.meta.env.VITE_SHOW_MOCK_NOTIFICATIONS === 'true';
  const realNotifs = Array.isArray(notificationsProp) ? notificationsProp : [];
  const notifList = SHOW_MOCK_NOTIFS ? [...realNotifs, ...MOCK_NOTIFICATIONS] : realNotifs;
  const unread = notifList.filter(n => !n.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef(null);

  // Chiude il pannello di ricerca al click fuori dal wrapper (input + pannello)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);
  return (
    <div style={{
      height: 58, background: "var(--navy)", display: "flex", alignItems: "center",
      padding: isMobile ? "0 12px" : "0 20px", gap: isMobile ? 8 : 16, position: "sticky", top: 0, zIndex: 100,
      borderBottom: "1px solid rgba(212,168,67,0.2)", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: isMobile ? 0 : 12 }}>
        <div style={{
          width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0
        }}>✈️</div>
        <div className="vd-hide-mobile">
          <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>VoyageDesk</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 1.5 }}>TRAVEL MANAGEMENT</div>
        </div>
      </div>

      {/* Ricerca unificata (testuale + filtri avanzati) */}
      <div ref={searchWrapRef} style={{ flex: 1, maxWidth: 520, position: "relative" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>🔍</div>
          <input
            value={state.searchQuery}
            onChange={e => { dispatch({ type: "SET_SEARCH", payload: e.target.value }); setSearchOpen(true); }}
            onFocus={e => { setSearchOpen(true); e.target.style.background = "rgba(255,255,255,0.13)"; e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            aria-label="Cerca"
            style={{
              width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "7px 12px 7px 36px", color: "#fff", fontSize: 13,
              outline: "none", transition: "all 0.2s", boxSizing: "border-box",
            }}
          />
        </div>
        {searchOpen && (
          <AdvancedSearchPanel
            tasks={state.tasks}
            dispatch={dispatch}
            keyword={state.searchQuery}
            onKeyword={v => dispatch({ type: "SET_SEARCH", payload: v })}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </div>

      <div className="vd-hide-mobile" style={{ flex: 1 }} />

      {/* Chat */}
      <button onClick={onOpenChat} title="Messaggi team" style={{
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8, width: 36, height: 36, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
      }}>
        💬
        {unreadChat > 0 && <span style={{
          position: "absolute", top: -4, right: -4, background: "var(--gold)",
          borderRadius: "50%", minWidth: 16, height: 16, fontSize: 10, fontWeight: 700,
          color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px",
        }}>{unreadChat}</span>}
      </button>

      {/* Notifications */}
      <div style={{ position: "relative" }}>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, width: 36, height: 36, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
        }}>
          🔔
          {unread > 0 && <span style={{
            position: "absolute", top: -4, right: -4, background: "var(--gold)",
            borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
            color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center"
          }}>{unread}</span>}
        </button>
        {state.showNotif && <NotificationsPanel
          dispatch={dispatch}
          notifications={notifList}
          isReal={!SHOW_MOCK_NOTIFS}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
          onOpenTask={onOpenTask}
        />}
      </div>

      {/* User switcher (v0.8) */}
      <UserSwitcher state={state} dispatch={dispatch} />
    </div>
  );
};

// ─── USER SWITCHER (v0.8) ──────────────────────────────────────────────────
// Dropdown nella Topbar per cambiare l'utente loggato (mock multi-utente).
// ProfileEditor (+ AVATAR_EMOJIS/AVATAR_COLORS) → src/components/modals/ProfileEditor.jsx (Step P Phase 2f)

const UserSwitcher = ({ state, dispatch }) => {
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const ref = useRef(null);

  // Step O (caveat #16): logout reale. Prima marca l'utente offline (best
  // effort: dopo signOut le RLS bloccherebbero l'update), poi chiude la
  // sessione — l'AuthGate in main.jsx ri-renderizza LoginScreen da solo.
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await UsersAPI.setPresence(state.currentUserId, "offline"); } catch { /* best effort */ }
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Logout fallito: ${error.message}` } });
    }
  };
  const curr = getMember(state.currentUserId) || { name: "—", role: "—", avatar: "??", color: "#999" };
  // Fix #14: demo switch gate-ato dietro env var (default off in prod e in dev)
  // Cambia solo currentUser lato UI; auth.uid() server-side resta l'utente reale → confonde RLS.
  // Attivare con VITE_DEMO_SWITCH=true in .env.local solo per test multi-ruolo.
  const SHOW_DEMO_SWITCH = import.meta.env.DEV && import.meta.env.VITE_DEMO_SWITCH === 'true';

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h, { passive: true });
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  // Tutti i membri non-pending, ordinati per ruolo (Admin, Manager, Senior, Junior, Driver)
  const order = { admin: 0, manager: 1, "senior agent": 2, "junior agent": 3, driver: 4 };
  const candidates = TEAM
    .filter(m => !m.pending)
    .slice()
    .sort((a, b) => (order[(a.role || "").toLowerCase()] ?? 99) - (order[(b.role || "").toLowerCase()] ?? 99));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Cambia utente"
        aria-label="Cambia utente loggato"
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "3px 8px 3px 4px", fontFamily: "inherit",
        }}
      >
        {curr.photoUrl ? (
          <img src={curr.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: curr.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>{curr.avatar}</div>
        )}
        <div className="vd-hide-mobile" style={{ textAlign: "left" }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{curr.name}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{curr.role}</div>
        </div>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)", zIndex: 200,
          minWidth: 240, padding: 6,
        }}>
          {/* Profilo personale */}
          <button
            onClick={() => { setShowProfile(true); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "var(--navy)", textAlign: "left", borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontWeight: 600 }}>Modifica profilo</span>
          </button>

          {SHOW_DEMO_SWITCH && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "8px 10px 4px", letterSpacing: 1 }}>
                ACCEDI COME (DEMO MULTI-RUOLO)
              </div>
              {candidates.map(m => {
                const active = m.id === state.currentUserId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: m.id }); setOpen(false); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", background: active ? "var(--surface2)" : "transparent",
                      border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                      color: "var(--text)", textAlign: "left",
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", background: m.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>{m.avatar}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                    </div>
                    {active && <span style={{ color: "var(--success)", fontSize: 14 }}>✓</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* Step O: logout reale (caveat #16) */}
          <button
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: signingOut ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 13,
              color: "var(--danger)", textAlign: "left",
              borderTop: "1px solid var(--border)", marginTop: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>🚪</span>
            <span style={{ fontWeight: 600 }}>{signingOut ? "Uscita…" : "Esci"}</span>
          </button>
        </div>
      )}

      {/* Profile Editor Modal */}
      {showProfile && <ProfileEditor member={curr} dispatch={dispatch} onClose={() => setShowProfile(false)} />}
    </div>
  );
};

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
// Helpers per il rendering delle notifiche reali (Step F).
const NOTIF_ICONS = {
  task_assigned: "📋",
  task_due: "📅",
  comment: "💬",
  mention: "@",
  queue_stale: "⏳",
  // Compat con mock
  overdue: "⚠️", assigned: "📋", deadline: "📅",
};

function notifTitle(n) {
  // Notifiche reali (DB): titolo derivato da type + payload
  if (n.payload) {
    const p = n.payload || {};
    switch (n.type) {
      case "task_assigned":
        return `Nuovo task assegnato: ${p.task_title ?? "—"}`;
      case "task_due":
        return `Scadenza task: ${p.task_title ?? "—"}`;
      case "comment":
        return `Nuovo commento su: ${p.task_title ?? "—"}`;
      case "mention":
        return p.task_title
          ? `Menzionato in: ${p.task_title}`
          : `Sei stato menzionato${p.where ? " in " + p.where : ""}`;
      case "queue_stale":
        return p.task_title
          ? `Task in coda da > 4h: ${p.task_title}`
          : `Task in coda da troppo tempo`;
      default:
        return n.type || "Notifica";
    }
  }
  // Mock legacy
  return n.title || n.type;
}

function notifTime(n) {
  if (n.time) return n.time; // mock
  if (!n.createdAt) return "";
  const ms = Date.now() - new Date(n.createdAt).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "giorno" : "giorni"} fa`;
}

// computePresence + PRESENCE_COLORS (usati solo dalla chat) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)


const NotificationsPanel = ({ dispatch, notifications, isReal, onMarkRead, onMarkAllRead, onOpenTask }) => {
  const { isMobile } = useViewport();
  const list = Array.isArray(notifications) ? notifications : MOCK_NOTIFICATIONS;
  const hasUnread = list.some(n => !n.read);
  // Step J: la notifica è "navigabile" se ha un task_id nel payload
  const isNavigable = (n) => isReal && n.payload && n.payload.task_id;
  const handleClick = (n) => {
    if (isNavigable(n)) {
      onOpenTask?.(n.payload.task_id);
      dispatch({ type: "TOGGLE_NOTIF" });
    }
    if (isReal && !n.read) onMarkRead?.(n.id);
  };
  return (
    <div className="slide-right" style={{
      position: isMobile ? "fixed" : "absolute",
      top: isMobile ? 56 : "calc(100% + 8px)",
      right: isMobile ? 12 : 0,
      left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : "min(360px, calc(100vw - 24px))",
      background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
      border: "1px solid var(--border)", overflow: "hidden", zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isReal && hasUnread && (
            <button onClick={() => onMarkAllRead?.()} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
            }}>Segna tutte lette</button>
          )}
          <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {list.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            Nessuna notifica
          </div>
        )}
        {list.map(n => (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            style={{
              padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
              background: n.read ? "transparent" : "rgba(212,168,67,0.07)",
              borderBottom: "1px solid var(--border)",
              transition: "background 0.2s",
              cursor: isNavigable(n) || (isReal && !n.read) ? "pointer" : "default",
            }}
            onMouseEnter={e => { if (isNavigable(n)) e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(212,168,67,0.07)"; }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || "🔔"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{notifTitle(n)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{notifTime(n)}</div>
            </div>
            {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0, marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard", icon: "📊", label: "Dashboard", roles: ["admin", "manager", "agent", "driver"] },
  { id: "calendar", icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "team", icon: "👥", label: "Team", roles: ["admin", "manager", "agent"] },
  { id: "trash", icon: "🗑️", label: "Cestino", roles: ["admin", "manager", "agent", "driver"] },
  { id: "admin", icon: "⚙️", label: "Admin", roles: ["admin"] },
];

// Filtra NAV_ITEMS in base al ruolo dell'utente loggato
const getNavItemsForUser = (userId) => {
  const role = getRoleType(userId);
  return NAV_ITEMS.filter(it => !it.roles || it.roles.includes(role));
};

// Calcola i contatori per i badge sidebar/bottom-nav (Step F).
function getNavBadges(state) {
  const pending = (state.team || []).filter(m => m.pending).length;
  const queue = (state.tasks || []).filter(
    t => !t.deletedAt && (!Array.isArray(t.assignees) || t.assignees.length === 0)
  ).length;
  return { admin: pending, dashboard: queue };
}

// Componente helper per renderizzare il badge numerico
const NavBadge = ({ count, collapsed = false, mobile = false }) => {
  if (!count) return null;
  const base = {
    background: "var(--gold)", color: "var(--navy)", fontWeight: 700,
    borderRadius: 999, fontSize: 10, padding: "1px 6px", minWidth: 16,
    height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
  };
  if (mobile) {
    return <span style={{
      ...base, position: "absolute", top: 2, right: "calc(50% - 18px)",
    }}>{count > 99 ? "99+" : count}</span>;
  }
  if (collapsed) {
    return <span style={{
      ...base, position: "absolute", top: 4, right: 4,
    }}>{count > 9 ? "9+" : count}</span>;
  }
  return <span style={{ ...base, marginLeft: "auto" }}>{count > 99 ? "99+" : count}</span>;
};

const Sidebar = ({ state, dispatch, onOpenBulk }) => {
  const { isDesktop } = useViewport();
  if (!isDesktop) return null;
  const col = state.sidebarCollapsed;
  const navItems = getNavItemsForUser(state.currentUserId);
  const badges = getNavBadges(state);
  return (
    <div style={{
      width: col ? 60 : 210, background: "var(--navy-dark)", color: "#fff",
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease", flexShrink: 0,
      borderRight: "1px solid rgba(212,168,67,0.15)", position: "relative",
    }}>
      <button onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })} style={{
        position: "absolute", top: 12, right: col ? "50%" : 8,
        transform: col ? "translateX(50%)" : "none",
        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: "rgba(255,255,255,0.5)",
        fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>{col ? "→" : "←"}</button>

      <div style={{ marginTop: 48, padding: col ? "0 8px" : "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map(item => {
          const active = state.activeView === item.id;
          return (
            <button key={item.id} onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: col ? "10px 8px" : "10px 12px",
              borderRadius: 8, cursor: "pointer", border: "none",
              background: active ? "rgba(212,168,67,0.18)" : "transparent",
              color: active ? "var(--gold)" : "rgba(255,255,255,0.6)",
              fontSize: 14, fontWeight: active ? 600 : 400,
              transition: "all 0.2s", textAlign: "left",
              borderLeft: active ? "2px solid var(--gold)" : "2px solid transparent",
              position: "relative",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!col && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
              <NavBadge count={badges[item.id] || 0} collapsed={col} />
            </button>
          );
        })}

        {/* Azione: crea più task / import / template (spostata dal FAB secondario) */}
        <button
          onClick={onOpenBulk}
          title="Crea più task / Import / Template"
          aria-label="Crea più task"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: col ? "10px 8px" : "10px 12px", marginTop: 8,
            borderRadius: 8, cursor: "pointer",
            border: "1px solid rgba(212,168,67,0.4)",
            background: "rgba(212,168,67,0.12)",
            color: "var(--gold)", fontSize: 14, fontWeight: 600,
            transition: "all 0.2s", textAlign: "left",
            justifyContent: col ? "center" : "flex-start",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(212,168,67,0.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
        >
          <span style={{ fontSize: 16, flexShrink: 0 }}>📑</span>
          {!col && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>Più task</span>}
        </button>
      </div>

      {!col && (
        <div style={{ marginTop: "auto", padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1, marginBottom: 8 }}>TEAM ONLINE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {getAssignableTeam().slice(0, 4).map(m => (
              <div key={m.id} title={m.name} style={{
                width: 26, height: 26, borderRadius: "50%", background: m.color,
                fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", border: "2px solid var(--navy-dark)",
                position: "relative"
              }}>
                {m.avatar}
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: "#2D7A4F", border: "1px solid var(--navy-dark)" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── BOTTOM NAV (mobile/tablet) ────────────────────────────────────────────
const BottomNav = ({ state, dispatch, onOpenBulk }) => {
  const navItems = getNavItemsForUser(state.currentUserId);
  const badges = getNavBadges(state);
  return (
    <nav className="vd-bottom-nav" aria-label="Navigazione principale">
      {navItems.map(item => {
        const active = state.activeView === item.id;
        const badge = badges[item.id] || 0;
        return (
          <button
            key={item.id}
            onClick={() => dispatch({ type: "SET_VIEW", payload: item.id })}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, padding: "6px 2px",
              background: "transparent", border: "none", cursor: "pointer",
              color: active ? "var(--gold)" : "rgba(255,255,255,0.55)",
              borderTop: active ? "2px solid var(--gold)" : "2px solid transparent",
              transition: "color 0.2s", position: "relative",
            }}
          >
            <span style={{ fontSize: 19, lineHeight: 1, position: "relative" }}>
              {item.icon}
              <NavBadge count={badge} mobile />
            </span>
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, whiteSpace: "nowrap" }}>
              {item.label.split(" ")[0]}
            </span>
          </button>
        );
      })}

      {/* Azione: crea più task (spostata dal FAB secondario) */}
      <button
        onClick={onOpenBulk}
        aria-label="Crea più task"
        style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 3, padding: "6px 2px",
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--gold)", borderTop: "2px solid transparent",
          transition: "color 0.2s", position: "relative",
        }}
      >
        <span style={{ fontSize: 19, lineHeight: 1 }}>📑</span>
        <span style={{ fontSize: 9, fontWeight: 600, whiteSpace: "nowrap" }}>Più task</span>
      </button>
    </nav>
  );
};

// BulkTaskCreator cluster → src/components/modals/BulkTaskCreator.jsx (Step P Phase 2f)
//   include: ManualTab, DuplicateTab, ImportTab, TemplateTab, BulkTaskCreator
//   (+ stili helper bulkInputStyle/bulkBtnPrimary/bulkBtnGhost/bulkIconBtnSmall)

// AIDayPlanner → src/components/modals/AIDayPlanner.jsx (Step P Phase 2f)

// NoticeBoard (+ noticeBtnStyle) → src/components/dashboard/NoticeBoard.jsx (Step P Phase 2f)

// NoticeEditorModal → src/components/modals/NoticeEditorModal.jsx (Step P Phase 2f)

// Dashboard (+ queues PersonalQueue/UnassignedQueue/UrgentOthersQueue/OverdueQueue, QueueTab) → src/components/dashboard/Dashboard.jsx (Step P Phase 2f)

// ─── QUICK ADD TASK FORM ───────────────────────────────────────────────────
// QuickAddTask → src/components/modals/QuickAddTask.jsx (Step P Phase 2f)

// ─── TASK DETAIL SLIDE-OVER ────────────────────────────────────────────────
// TaskSlideOver → src/components/tasks/TaskSlideOver.jsx (Step P Phase 2f)

// CalendarPlanner (+ iCal export helpers) → src/components/calendar/CalendarPlanner.jsx (Step P Phase 2f)
// Team → src/components/views/Team.jsx (Step P Phase 2f)

// ─── CHAT: MOCK DATA ───────────────────────────────────────────────────────
// CURRENT_USER è dichiarato in cima al file (sezione MOCK DATA)
// ChatContext spostato in src/components/chat/ChatPanel.jsx (Step P Phase 2f)

const initialConversations = [
  {
    id: "c1", type: "direct", participants: ["marco", "sofia"], name: null,
    pinned: true,
  },
  {
    id: "c2", type: "direct", participants: ["marco", "roberto"], name: null,
  },
  {
    id: "c3", type: "direct", participants: ["marco", "luca"], name: null,
  },
  {
    id: "c4", type: "group", participants: ["marco", "sofia", "luca", "roberto", "giulia"],
    name: "Team VoyageDesk", icon: "🌍",
  },
  {
    id: "c5", type: "group", participants: ["marco", "sofia", "roberto"],
    name: "Pratica Maldive - Rossi", icon: "🏝️",
  },
  {
    id: "c6", type: "group", participants: ["marco", "sofia", "luca"],
    name: "Marketing & Promo", icon: "📣",
  },
  {
    id: "c7", type: "direct", participants: ["marco", "giulia"], name: null,
  },
];

const t = (minAgo) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minAgo);
  return d.toISOString();
};

const initialMessages = {
  c1: [
    { id: "m1", sender: "sofia", type: "text", text: "Ciao Marco, ho contattato Four Seasons per i Rossi 🌊", time: t(180), readBy: ["marco", "sofia"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto! Hanno confermato i bungalow?", time: t(175), readBy: ["marco", "sofia"], replyTo: "m1" },
    { id: "m3", sender: "sofia", type: "text", text: "Sì, 2 overwater bungalow disponibili dal 15 al 22. Aspetto conferma sul prezzo finale.", time: t(170), readBy: ["marco", "sofia"], reactions: { "👍": ["marco"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 28, time: t(120), readBy: ["marco", "sofia"], waveform: [0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.5, 0.9, 0.7, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.4, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5, 0.3, 0.6, 0.8, 0.5, 0.4, 0.6, 0.7] },
    { id: "m5", sender: "marco", type: "text", text: "Ok ricevuto, ascolto subito", time: t(115), readBy: ["marco", "sofia"] },
    { id: "m6", sender: "sofia", type: "file", fileName: "Preventivo_Maldive_Rossi.pdf", fileSize: "342 KB", fileType: "pdf", time: t(45), readBy: ["marco", "sofia"], reactions: { "🔥": ["marco"], "✅": ["marco"] } },
    { id: "m7", sender: "sofia", type: "text", text: "Ti ho mandato il preventivo aggiornato 📎", time: t(44), readBy: ["marco", "sofia"] },
    { id: "m8", sender: "marco", type: "text", text: "Grande, lo guardo nel pomeriggio 👍", time: t(30), readBy: ["marco", "sofia"] },
    { id: "m9", sender: "sofia", type: "text", text: "Una cosa, il cliente chiede transfer privato in idrovolante - lo includiamo?", time: t(5), readBy: ["sofia"] },
  ],
  c2: [
    { id: "m1", sender: "roberto", type: "text", text: "Marco, ho emesso la polizza Allianz per la famiglia Rossi", time: t(360), readBy: ["marco", "roberto"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto Roberto, importo finale?", time: t(355), readBy: ["marco", "roberto"] },
    { id: "m3", sender: "roberto", type: "text", text: "€342 totali per 4 persone, annullamento + medica", time: t(350), readBy: ["marco", "roberto"] },
    { id: "m4", sender: "roberto", type: "file", fileName: "Polizza_Rossi_Allianz.pdf", fileSize: "186 KB", fileType: "pdf", time: t(348), readBy: ["marco", "roberto"] },
    { id: "m5", sender: "marco", type: "text", text: "Ricevuto, archiviato nel CRM ✓", time: t(60), readBy: ["marco", "roberto"] },
  ],
  c3: [
    { id: "m1", sender: "luca", type: "text", text: "Ciao! Newsletter giugno al 60%, ti mando bozza?", time: t(240), readBy: ["marco", "luca"] },
    { id: "m2", sender: "marco", type: "text", text: "Sì certo, mandala", time: t(235), readBy: ["marco", "luca"] },
    { id: "m3", sender: "luca", type: "voice", duration: 42, time: t(200), readBy: ["marco", "luca"], waveform: [0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.9, 0.6, 0.4, 0.5, 0.8, 0.7, 0.3, 0.6, 0.9, 0.5, 0.4, 0.7, 0.6, 0.8, 0.5, 0.3, 0.6, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4, 0.3] },
    { id: "m4", sender: "marco", type: "text", text: "Buona idea per la sezione Grecia 🇬🇷", time: t(190), readBy: ["marco", "luca"] },
  ],
  c4: [
    { id: "m1", sender: "marco", type: "text", text: "Buongiorno team! Ricordo la riunione operativa di venerdì alle 10 ☕", time: t(480), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m2", sender: "sofia", type: "text", text: "Confermo presenza", time: t(475), readBy: ["marco", "sofia", "luca", "roberto"], reactions: { "👍": ["marco", "luca"] } },
    { id: "m3", sender: "luca", type: "text", text: "Ci sarò ✋", time: t(470), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m4", sender: "roberto", type: "text", text: "Presente. Porto il report Q1 stampato", time: t(465), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m5", sender: "giulia", type: "text", text: "Io arrivo alle 10:15, ho transfer Bianchi alle 9", time: t(450), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m6", sender: "marco", type: "text", text: "Nessun problema Giulia, ti aggiorniamo dopo", time: t(440), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m7", sender: "sofia", type: "file", fileName: "Agenda_Riunione_Venerdi.docx", fileSize: "24 KB", fileType: "doc", time: t(120), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m8", sender: "sofia", type: "text", text: "Ecco l'agenda della riunione, date un'occhiata 📋", time: t(119), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m9", sender: "luca", type: "text", text: "Aggiungo un punto sul nuovo template newsletter?", time: t(20), readBy: ["marco", "luca"] },
  ],
  c5: [
    { id: "m1", sender: "sofia", type: "text", text: "Aggiornamento Pratica Rossi: voli confermati, hotel in conferma", time: t(360), readBy: ["marco", "sofia", "roberto"] },
    { id: "m2", sender: "roberto", type: "text", text: "Polizza emessa oggi ✓", time: t(300), readBy: ["marco", "sofia", "roberto"], reactions: { "🎉": ["sofia", "marco"] } },
    { id: "m3", sender: "marco", type: "text", text: "Ottimo lavoro squadra, cliente molto contento al telefono ieri", time: t(280), readBy: ["marco", "sofia", "roberto"], reactions: { "❤️": ["sofia"], "🙌": ["roberto"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 15, time: t(180), readBy: ["marco", "sofia", "roberto"], waveform: [0.5, 0.7, 0.9, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.8, 0.5, 0.4, 0.7, 0.6] },
    { id: "m5", sender: "roberto", type: "text", text: "Acconto del 30% richiesto via mail", time: t(10), readBy: ["marco", "roberto"] },
  ],
  c6: [
    { id: "m1", sender: "luca", type: "text", text: "Ho qualche idea per la campagna autunno 2025 🍁", time: t(720), readBy: ["marco", "sofia", "luca"] },
    { id: "m2", sender: "sofia", type: "text", text: "Sparami!", time: t(715), readBy: ["marco", "sofia", "luca"] },
    { id: "m3", sender: "luca", type: "text", text: "Pensavo: Foliage Canada, Halloween NYC, Dolomiti d'oro. Cosa ne dite?", time: t(710), readBy: ["marco", "sofia", "luca"], reactions: { "🔥": ["sofia"], "💡": ["marco"] } },
    { id: "m4", sender: "marco", type: "text", text: "Mi piacciono tutte e tre. Iniziamo con Foliage che è il più richiesto", time: t(700), readBy: ["marco", "sofia", "luca"] },
  ],
  c7: [
    { id: "m1", sender: "giulia", type: "text", text: "Marco, transfer Bianchi confermato per martedì 6:45", time: t(60), readBy: ["marco", "giulia"] },
    { id: "m2", sender: "marco", type: "text", text: "Grazie Giulia. NCC stesso autista?", time: t(55), readBy: ["marco", "giulia"] },
    { id: "m3", sender: "giulia", type: "text", text: "Sì, Antonio. Sa già del volo ANA", time: t(50), readBy: ["marco", "giulia"] },
  ],
};

// ChatPanel + sotto-componenti chat (ChatContext, ConversationView/List, ChatMessage, VoicePlayer, ...) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)

// ─── FLOATING ACTION BUTTON ────────────────────────────────────────────────
const FAB = ({ onClick }) => {
  const { isDesktop } = useViewport();
  return (
  <button onClick={onClick} style={{
    position: "fixed", bottom: isDesktop ? 28 : 80, right: isDesktop ? 28 : 16, width: 52, height: 52,
    borderRadius: "50%", background: "var(--gold)", border: "none",
    boxShadow: "0 8px 24px rgba(212,168,67,0.5)", cursor: "pointer",
    fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--navy)", fontWeight: 700, zIndex: 400,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,168,67,0.6)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,168,67,0.5)"; }}
  >+</button>
  );
};

// ─── TRASH (CESTINO) ───────────────────────────────────────────────────────
// Trash → src/components/views/Trash.jsx (Step P Phase 2f)

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
// AdminView + tab (Team/IO/Stats/Categories/Log) → src/components/admin/AdminView.jsx (Step P Phase 2f)

// stili admin condivisi (sectionH/cardStyle/btnPrimary/modalOverlay/...) → src/components/admin/adminStyles.js (Step P Phase 2f)

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

  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    // Generation counter: scarta risposte stale quando un evento realtime
    // ri-triggera reload mentre uno è ancora in volo (caveat #21, finding #2).
    let tasksGen = 0;
    let noticesGen = 0;

    const reloadTasks = () => {
      const my = ++tasksGen;
      TasksAPI.list({ withComments: true }).then(({ data, error }) => {
        if (cancelled || my !== tasksGen) return;
        if (error) {
          console.error("[VoyageDesk] Tasks.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento task fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
      });
    };
    const reloadNotices = () => {
      const my = ++noticesGen;
      NoticesAPI.list().then(({ data, error }) => {
        if (cancelled || my !== noticesGen) return;
        if (error) {
          console.error("[VoyageDesk] Notices.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento avvisi fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
      });
    };

    reloadTasks();
    reloadNotices();

    // Debounce: gli eventi arrivano a raffica durante inserimenti bulk.
    let tasksTimer = null;
    let noticesTimer = null;
    const debouncedTasks = () => {
      clearTimeout(tasksTimer);
      tasksTimer = setTimeout(reloadTasks, 200);
    };
    const debouncedNotices = () => {
      clearTimeout(noticesTimer);
      noticesTimer = setTimeout(reloadNotices, 200);
    };

    const unsubTasks = subscribeToTable("tasks", debouncedTasks);
    const unsubComments = subscribeToTable("comments", debouncedTasks);
    const unsubNotices = subscribeToTable("notices", debouncedNotices);

    return () => {
      cancelled = true;
      clearTimeout(tasksTimer);
      clearTimeout(noticesTimer);
      unsubTasks?.();
      unsubComments?.();
      unsubNotices?.();
    };
  }, [useSupabase]);

  // Loading state chat: true finché non completa il primo reload da Supabase.
  // Evita il flash "nessun messaggio" mentre l'idratazione è in volo.
  const [chatLoading, setChatLoading] = useState(useSupabase);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    let loadGen = 0;
    const reload = () => {
      const my = ++loadGen;
      NotificationsAPI.list({ limit: 100 }).then(({ data, error }) => {
        if (cancelled || my !== loadGen) return;
        if (error) {
          console.error("[notifications] list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: caricamento fallito: ${error.message || ""}` } });
          return;
        }
        setNotifications((data || []).map(fromDbNotification));
      });
    };
    reload();
    let timer = null;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(reload, 200); };
    const unsub = subscribeToTable("notifications", debounced);
    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
  }, [useSupabase]);

  const markNotificationRead = useCallback((id) => {
    if (!useSupabase) return;
    // Ottimistico
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    NotificationsAPI.markRead(id).then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifica: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // currentUserId vivo, per persistere i comments con l'autore giusto.
  const currentUserIdRef = useRef(state.currentUserId);
  useEffect(() => { currentUserIdRef.current = state.currentUserId; }, [state.currentUserId]);

  // Wrapper dispatch: applica al reducer (UI istantanea) e poi sincronizza
  // su Supabase fire-and-forget. Per ADD_TASK normalizza l'id in uuid in
  // modo coerente tra reducer e DB.
  const dispatch = useCallback((action) => {
    if (!useSupabase) { rawDispatch(action); return; }

    let toDispatch = action;
    let dbOps = null;

    switch (action.type) {
      case "ADD_TASK": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => TasksAPI.create(toDbTask(payload));
        break;
      }
      case "ADD_TASKS_BULK": {
        const payload = (action.payload || []).map(t => ({
          ...t, id: isUuid(t?.id) ? t.id : newId(),
        }));
        toDispatch = { ...action, payload };
        dbOps = () => Promise.all(payload.map(t => TasksAPI.create(toDbTask(t))));
        break;
      }
      case "UPDATE_TASK":
        dbOps = () => TasksAPI.update(action.payload.id, toDbTaskPatch(action.payload));
        break;
      case "MOVE_TASK":
        dbOps = () => TasksAPI.update(action.payload.taskId, { status: action.payload.newStatus });
        break;
      case "DELETE_TASK":
        dbOps = () => TasksAPI.softDelete(action.payload);
        break;
      case "RESTORE_TASK":
        dbOps = () => TasksAPI.restore(action.payload);
        break;
      case "PURGE_TASK":
        dbOps = () => TasksAPI.hardDelete(action.payload);
        break;
      case "EMPTY_TRASH": {
        const ids = state.tasks.filter(t => t.deletedAt).map(t => t.id);
        dbOps = () => Promise.all(ids.map(id => TasksAPI.hardDelete(id)));
        break;
      }
      case "ADD_COMMENT": {
        const uid = currentUserIdRef.current;
        dbOps = () => CommentsAPI.create({
          task_id: action.payload.taskId,
          user_id: uid,
          text: action.payload.comment?.text ?? "",
        });
        break;
      }
      case "ADD_NOTICE": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id, author: action.payload.author ?? currentUserIdRef.current };
        toDispatch = { ...action, payload };
        dbOps = () => NoticesAPI.create(toDbNotice(payload));
        break;
      }
      case "UPDATE_NOTICE":
        dbOps = () => NoticesAPI.update(action.payload.id, toDbNoticePatch(action.payload));
        break;
      case "DELETE_NOTICE":
        dbOps = () => NoticesAPI.remove(action.payload);
        break;
      case "TOGGLE_PIN_NOTICE": {
        const prev = state.notices.find(n => n.id === action.payload);
        const pinned = !(prev?.pinned);
        dbOps = () => NoticesAPI.togglePin(action.payload, pinned);
        break;
      }
      default:
        break;
    }

    rawDispatch(toDispatch);
    if (dbOps) {
      Promise.resolve()
        .then(dbOps)
        .then((res) => {
          const err = Array.isArray(res) ? res.find(r => r?.error)?.error : res?.error;
          if (err) {
            console.error(`[VoyageDesk] sync ${action.type}`, err);
            rawDispatch({
              type: "SHOW_TOAST",
              payload: {
                type: "error",
                message: `Salvataggio fallito: ${err.message || "errore sconosciuto"}`,
              },
            });
          }
        })
        .catch((e) => {
          console.error(`[VoyageDesk] sync ${action.type}`, e);
          rawDispatch({
            type: "SHOW_TOAST",
            payload: {
              type: "error",
              message: `Salvataggio fallito: ${e?.message || "errore di rete"}`,
            },
          });
        });
    }
  }, [useSupabase, state.tasks, state.notices]);

  // Step J: navigazione da notifica → TaskSlideOver
  const openTaskById = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) dispatch({ type: "SET_SELECTED_TASK", payload: t });
  }, [state.tasks, dispatch]);

  const markAllNotificationsRead = useCallback(() => {
    if (!useSupabase) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    NotificationsAPI.markAllRead().then(r => {
      if (r?.error) {
        console.error("[notifications] markAllRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // Presence (Step H): heartbeat + subscribe a users
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  useEffect(() => {
    if (!useSupabase) return;
    const myId = initialCurrentUserId;
    let cancelled = false;
    let hbTimer = null;

    // Snapshot iniziale di tutti gli utenti
    const reload = () => {
      // Non passare per UsersAPI.list (filtra active=true): vogliamo tutti
      // gli utenti del team. initialTeam è già lo snapshot completo; uso quello
      // più aggiornamenti via realtime.
      const map = {};
      for (const u of initialTeam || []) map[u.id] = u;
      setPresenceMap(prev => ({ ...map, ...prev }));
    };
    reload();

    const beat = (status = 'online') => {
      if (!myId) return;
      UsersAPI.setPresence(myId, status).then(r => {
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat('online');
    hbTimer = setInterval(() => beat('online'), 45 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat('away');
      else beat('online');
    };
    const onBeforeUnload = () => beat('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Realtime: aggiorna presenceMap quando un altro utente cambia status
    const unsub = subscribeToTable("users", (payload) => {
      const row = payload?.new || payload?.record;
      if (!row || !row.id) return;
      setPresenceMap(prev => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), ...row } }));
    });

    // Tick di re-render: ogni 30s ricomputo presenza per ageing
    const tick = setInterval(() => {
      if (cancelled) return;
      setPresenceMap(prev => ({ ...prev })); // shallow rerender
    }, 30 * 1000);

    return () => {
      cancelled = true;
      clearInterval(hbTimer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsub?.();
      // Best-effort: segnala offline
      if (myId) UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [useSupabase, initialCurrentUserId, initialTeam]);

  // Idratazione chat (conversations + messages) + realtime.
  useEffect(() => {
    if (!useSupabase) { setChatLoading(false); return; }
    let cancelled = false;
    // Generation counter: durante il primo reload può arrivare un evento
    // realtime che fa partire un secondo reload. Senza guardia, l'ordine di
    // completamento delle due fetch non è garantito → un load più vecchio
    // sovrascrive uno più nuovo (caveat #21, finding #2).
    let loadGen = 0;

    const reload = async () => {
      const my = ++loadGen;
      const [convsRes, msgsRes] = await Promise.all([
        ConversationsAPI.listMine(),
        MessagesAPI.listAll(),
      ]);
      if (cancelled || my !== loadGen) return;
      if (convsRes.error) {
        console.error("[chat] convs.list", convsRes.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento conversazioni fallito: ${convsRes.error.message || ""}` } });
      }
      if (msgsRes.error) {
        console.error("[chat] msgs.list", msgsRes.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento messaggi fallito: ${msgsRes.error.message || ""}` } });
      }
      const convs = (convsRes.data || []).map(fromDbConversation);
      const msgsByConv = {};
      for (const r of msgsRes.data || []) {
        const m = fromDbMessage(r);
        (msgsByConv[m.conversation_id] ||= []).push(m);
      }
      setConversationsRaw(convs);
      setMessagesRaw(msgsByConv);
      setChatLoading(false);
    };

    reload();

    let timer = null;
    const debouncedReload = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 200);
    };
    const unsubConvs = subscribeToTable("conversations", debouncedReload);
    const unsubMsgs = subscribeToTable("messages", debouncedReload);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubConvs?.();
      unsubMsgs?.();
    };
  }, [useSupabase]);

  const [showFABModal, setShowFABModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // In modalità Supabase partiamo da stato vuoto e idratiamo dal DB.
  // Senza login i mock restano per smoke-test rapido.
  const [conversations, setConversationsRaw] = useState(
    useSupabase ? [] : initialConversations
  );
  const [messages, setMessagesRaw] = useState(
    useSupabase ? {} : initialMessages
  );

  // Wrapper di setConversations: diff vs prev e persiste create/update(pinned).
  const setConversations = useCallback((updater) => {
    setConversationsRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;
      const prevById = new Map(prev.map(c => [c.id, c]));
      return nextRaw.map(c => {
        if (!prevById.has(c.id)) {
          const id = isUuid(c.id) ? c.id : newId();
          const normalized = { ...c, id };
          ConversationsAPI.create(toDbConversation(normalized))
            .then(r => { if (r?.error) { console.error('[chat] conv.create', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: creazione conversazione fallita: ${r.error.message || ''}` } }); } });
          return normalized;
        }
        const prevC = prevById.get(c.id);
        if (prevC.pinned !== c.pinned || prevC.name !== c.name || prevC.icon !== c.icon) {
          ConversationsAPI.update(c.id, {
            pinned: !!c.pinned, name: c.name ?? null, icon: c.icon ?? null,
          }).then(r => { if (r?.error) { console.error('[chat] conv.update', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento conversazione fallito: ${r.error.message || ''}` } }); } });
        }
        return c;
      });
    });
  }, [useSupabase]);

  // Wrapper di setMessages: diff per conv e persiste insert + reactions + readBy.
  const setMessages = useCallback((updater) => {
    setMessagesRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;

      const eqArr = (a, b) => {
        if (a === b) return true;
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const eqReactions = (a, b) => {
        const ka = Object.keys(a || {}), kb = Object.keys(b || {});
        if (ka.length !== kb.length) return false;
        for (const k of ka) if (!eqArr(a[k], b[k])) return false;
        return true;
      };

      const next = {};
      for (const convId of Object.keys(nextRaw)) {
        const prevArr = prev[convId] || [];
        const nextArr = nextRaw[convId] || [];
        const prevById = new Map(prevArr.map(m => [m.id, m]));
        next[convId] = nextArr.map(m => {
          if (!prevById.has(m.id)) {
            const id = isUuid(m.id) ? m.id : newId();
            const normalized = { ...m, id };
            MessagesAPI.send(toDbMessage(normalized, convId))
              .then(r => { if (r?.error) { console.error('[chat] msg.send', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: invio messaggio fallito: ${r.error.message || ''}` } }); } });
            return normalized;
          }
          const prevM = prevById.get(m.id);
          if (!eqReactions(prevM.reactions, m.reactions)) {
            MessagesAPI.setReactions(m.id, m.reactions || {})
              .then(r => { if (r?.error) { console.error('[chat] msg.reactions', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento reazione fallito: ${r.error.message || ''}` } }); } });
          }
          if (!eqArr(prevM.readBy, m.readBy)) {
            MessagesAPI.markRead(m.id, m.readBy || [])
              .then(r => { if (r?.error) { console.error('[chat] msg.readBy', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } }); } });
          }
          return m;
        });
      }
      return next;
    });
  }, [useSupabase]);

  // Step Q.4: markRead bulk all'apertura conversazione.
  // Bypassa il wrapper setMessages (che farebbe N UPDATE) e fa:
  // 1) update locale ottimistico via setMessagesRaw, 2) una sola RPC che
  // marca letti tutti i messaggi non letti della conv. origin_client è
  // tagged così l'eco realtime viene filtrata sul nostro client.
  const markConversationRead = useCallback((convId) => {
    const uid = currentUserIdRef.current;
    if (!convId || !uid) return;
    setMessagesRaw(prev => {
      const list = prev[convId] || [];
      let changed = false;
      const next = list.map(m => {
        if (m.sender !== uid && !m.readBy?.includes(uid)) {
          changed = true;
          return { ...m, readBy: [...(m.readBy || []), uid] };
        }
        return m;
      });
      return changed ? { ...prev, [convId]: next } : prev;
    });
    if (!useSupabase || !isUuid(convId)) return;
    MessagesAPI.markReadBulk(convId, uid).then(r => {
      if (r?.error) {
        console.error('[chat] markReadBulk', r.error);
        rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } });
      }
    });
  }, [useSupabase]);

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
        <Topbar
          state={state}
          dispatch={dispatch}
          onOpenChat={() => { setChatIntent(null); setShowChat(true); }}
          unreadChat={unreadChat}
          notifications={notifications}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
          onOpenTask={openTaskById}
        />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {renderView()}
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} />

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
          markConversationRead={markConversationRead}
          intent={chatIntent}
          tasks={state.tasks}
          currentUserId={state.currentUserId}
          dispatch={dispatch}
          presenceMap={presenceMap}
          loading={chatLoading}
        />

        {/* FAB principale (singolo task). La creazione bulk/multi-task è ora in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <FAB onClick={() => setShowFABModal(true)} />
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
// Step J — touched
