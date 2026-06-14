
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
import { AddTeamMemberModal } from "./components/modals/AddTeamMemberModal.jsx";
import { AddCategoryModal } from "./components/modals/AddCategoryModal.jsx";

// Step P Phase 2f: dashboard estratto in src/components/dashboard/.
import { Dashboard } from "./components/dashboard/Dashboard.jsx";

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

// Presence (Step H): mappa userId → 'online'|'away'|'offline'
// calcolata dal last_seen_at (online <60s, away <5min, altrimenti offline).
function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) return user.status === 'away' ? 'away' : 'online';
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}
const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  offline: '#94a3b8',
};


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
const TaskSlideOver = ({ task, dispatch }) => {
  const { isMobile } = useViewport();
  const [newComment, setNewComment] = useState("");

  if (!task) return null;

  const handleComment = () => {
    if (!newComment.trim()) return;
    const authorName = getMember(CURRENT_USER)?.name || "Utente";
    dispatch({
      type: "ADD_COMMENT", payload: {
        taskId: task.id,
        comment: { user: authorName, text: newComment, time: new Date().toISOString() }
      }
    });
    setNewComment("");
  };

  const handleStatusChange = (e) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: e.target.value } });
  };

  const handleDelete = () => {
    if (window.confirm(`Spostare nel cestino "${task.title}"?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
  };

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 500 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480, height: "100vh",
        background: "#fff", zIndex: 600, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--navy)", padding: "18px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <CategoryChip category={task.category} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 }}>⚠️ Scaduto</span>}
            </div>
            <div className="playfair" style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={handleDelete} title="Sposta nel cestino" style={{
              background: "rgba(220,38,38,0.15)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
              transition: "background 0.2s"
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.4)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(220,38,38,0.15)"}
            >🗑️</button>
            <button onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Status select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>STATO</div>
              <select value={task.status} onChange={handleStatusChange} style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                background: "white", cursor: "pointer"
              }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>SCADENZA</div>
              <div style={{ fontSize: 13, fontWeight: 500, padding: "7px 10px", background: "var(--surface2)", borderRadius: 8 }}>
                {formatDate(task.dueDate)} {formatTime(task.dueDate) && `ore ${formatTime(task.dueDate)}`}
              </div>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ASSEGNATI</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {task.assignees?.map(id => {
                  const m = getMember(id);
                  return m ? (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", padding: "4px 8px", borderRadius: 99 }}>
                      <Avatar memberId={id} size={20} />
                      <span style={{ fontSize: 12 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  ) : null;
                })}
                {!task.assignees?.length && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Non assegnato</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>CLIENTE</div>
              <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
              </div>
            </div>
          </div>

          {/* ORE */}
          {task.estimatedHours && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>ORE STIMATE</div>
              <div style={{ fontSize: 13 }}>{task.estimatedHours}h</div>
            </div>
          )}

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>DESCRIZIONE</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 }}>
              {task.description || <span style={{ color: "var(--text-muted)" }}>Nessuna descrizione.</span>}
            </div>
          </div>

          {/* Attachments placeholder */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ALLEGATI</div>
            <div style={{
              border: "2px dashed var(--border)", borderRadius: 8, padding: "20px",
              textAlign: "center", color: "var(--text-muted)", fontSize: 13, cursor: "pointer"
            }}>📎 Trascina file qui o clicca per caricare</div>
          </div>

          {/* Comments */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
              ATTIVITÀ & COMMENTI ({task.comments?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(task.comments || []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--navy)",
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#fff", flexShrink: 0
                  }}>
                    {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(c.time)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                </div>
              ))}

              {/* New comment */}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: "var(--gold)",
                  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--navy)", flexShrink: 0
                }}>MF</div>
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="Aggiungi un commento..."
                    style={{
                      flex: 1, border: "1px solid var(--border)", borderRadius: 8,
                      padding: "7px 10px", fontSize: 12, fontFamily: "inherit"
                    }} />
                  <button onClick={handleComment} style={{
                    background: "var(--navy)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13
                  }}>↑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── CALENDAR PLANNER (unificato: mese + settimana + distribuzione agenti) ──
// ─── iCal export (Step G) ────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }
function icsDate(d) {
  // YYYYMMDDTHHmmssZ (UTC)
  const u = new Date(d);
  return (
    u.getUTCFullYear() + pad2(u.getUTCMonth() + 1) + pad2(u.getUTCDate()) +
    "T" + pad2(u.getUTCHours()) + pad2(u.getUTCMinutes()) + pad2(u.getUTCSeconds()) + "Z"
  );
}
function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function buildIcs(tasks) {
  const now = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoyageDesk//Tasks//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const start = new Date(t.dueDate);
    const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@voyagedesk`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(t.title || "Task")}`,
      `DESCRIPTION:${icsEscape((t.description || "") + (t.priority ? "\nPriorità: " + t.priority : ""))}`,
      `CATEGORIES:${icsEscape(t.category || "task")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function exportTasksToIcs(allTasks, uid) {
  const tasks = (allTasks || []).filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate);
  if (tasks.length === 0) return;
  const ics = buildIcs(tasks);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `voyagedesk-tasks-${ts}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const CalendarPlanner = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "week-full" | "day"
  const [dayDate, setDayDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const uid = state.currentUserId;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate && new Date(t.dueDate).toDateString() === d);
  };

  // ── Week helpers ──
  const getWeekDays = (offset) => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const getTasksForDay = (day) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString());

  // ── Distribuzione agenti (settimana corrente in vista week, settimana del mese selezionato in vista month) ──
  const agentWeekDays = viewMode === "week" ? weekDays : (() => {
    // In vista mese, usiamo la settimana corrente
    return getWeekDays(0);
  })();

  // ── Toggle style ──
  const toggleBtn = (mode, label) => (
    <button
      onClick={() => { setViewMode(mode); setSelectedDay(null); }}
      style={{
        background: viewMode === mode ? "var(--navy)" : "transparent",
        color: viewMode === mode ? "#fff" : "var(--text)",
        border: viewMode === mode ? "none" : "1px solid var(--border)",
        borderRadius: 8, padding: isMobile ? "6px 12px" : "6px 16px",
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ─── Header con toggle + navigazione ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, textTransform: viewMode === "month" ? "capitalize" : "none" }}>
            {viewMode === "month" && monthName}
            {viewMode === "week" && "Settimana"}
            {viewMode === "week-full" && "Settimana piena"}
            {viewMode === "day" && dayDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {(viewMode === "week" || viewMode === "week-full") && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              {weekDays[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
            {toggleBtn("day", isMobile ? "Gior." : "🕒 Giorno")}
            {toggleBtn("week", isMobile ? "Sett." : "📆 Settimana")}
            {toggleBtn("week-full", isMobile ? "Sett.+" : "🗓️ Sett. piena")}
            {toggleBtn("month", isMobile ? "Mese" : "📅 Mese")}
          </div>
          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month - 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; });
              else setWeekOffset(w => w - 1);
            }} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>←</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date());
              else if (viewMode === "day") setDayDate(new Date());
              else setWeekOffset(0);
              setSelectedDay(null);
            }} style={{
              background: "var(--gold)", color: "var(--navy)", border: "none",
              borderRadius: 8, padding: "0 14px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 700
            }}>Oggi</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month + 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; });
              else setWeekOffset(w => w + 1);
            }} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>→</button>
            <button onClick={() => exportTasksToIcs(state.tasks, uid)} title="Esporta calendario in iCal (.ics)" style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "var(--navy)",
            }}>⤓ iCal</button>
          </div>
        </div>
      </div>

      {/* ─── VISTA MESE ─── */}
      {viewMode === "month" && (
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--navy)", padding: "10px 0" }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayTasks = getTasksForCalDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  padding: isMobile ? "5px 3px" : "8px 6px", cursor: dayTasks.length ? "pointer" : "default",
                  background: selectedDay === day ? "rgba(212,168,67,0.08)" : "#fff",
                  transition: "background 0.15s", display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "stretch",
                }}>
                  <div style={{
                    width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? "var(--navy)" : "transparent",
                    color: isToday ? "#fff" : "var(--text)", marginBottom: 4
                  }}>{day}</div>
                  {isMobile ? (
                    dayTasks.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
                        {dayTasks.slice(0, 4).map(t => (
                          <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORIES[t.category]?.color || "var(--navy)" }} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_TASK", payload: t }); }} style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                          background: CATEGORIES[t.category]?.color + "20",
                          color: CATEGORIES[t.category]?.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}>{CATEGORIES[t.category]?.icon} {t.title}</div>
                      ))}
                      {dayTasks.length > 3 && <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>+{dayTasks.length - 3} altri</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Day detail (month view) ─── */}
      {viewMode === "month" && selectedDay && (() => {
        const dayTasks = getTasksForCalDay(selectedDay);
        if (!dayTasks.length) return null;
        return (
          <div className="slide-up" style={{
            background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
          }}>
            <div className="playfair" style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Task del {selectedDay} {monthName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayTasks.map(t => {
                const row = (
                  <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.15s", background: "#fff",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.client ? `${t.client} • ` : ""}{formatTime(t.dueDate)}</div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                );
                return (
                  <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                    {row}
                  </SwipeActions>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA ─── */}
      {viewMode === "week" && (
        <div style={{ overflowX: isMobile ? "auto" : "visible", scrollSnapType: isMobile ? "x mandatory" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(7, 60vw)" : "repeat(7, 1fr)", gap: 10 }}>
            {weekDays.map((day, i) => {
              const dayTasks = getTasksForDay(day);
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} style={{
                  background: isToday ? "var(--navy)" : "#fff",
                  borderRadius: 10, border: `1px solid ${isToday ? "transparent" : "var(--border)"}`,
                  overflow: "hidden", scrollSnapAlign: isMobile ? "start" : "none",
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: "10px 10px 6px",
                    background: isToday ? "var(--gold)" : "var(--surface2)",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? "var(--navy)" : "var(--text-muted)" }}>{dayNames[i]}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? "var(--navy)" : "var(--text)" }}>
                      {day.getDate()}
                    </div>
                  </div>
                  <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 4, minHeight: 160 }}>
                    {dayTasks.length === 0 ? (
                      <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center", marginTop: 20 }}>Nessun task</div>
                    ) : dayTasks.slice(0, 6).map(t => (
                      <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                        background: isToday ? "rgba(255,255,255,0.12)" : CATEGORIES[t.category]?.color + "18",
                        borderLeft: `3px solid ${CATEGORIES[t.category]?.color}`,
                        borderRadius: "0 4px 4px 0", padding: "4px 6px", cursor: "pointer",
                        fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                        color: isToday ? "#fff" : "var(--text)",
                      }}>
                        {CATEGORIES[t.category]?.icon} {t.title.slice(0, 30)}{t.title.length > 30 ? "…" : ""}
                        <div style={{ fontSize: 9, color: isToday ? "rgba(255,255,255,0.5)" : "var(--text-muted)", marginTop: 1 }}>{formatTime(t.dueDate)}</div>
                      </div>
                    ))}
                    {dayTasks.length > 6 && <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center" }}>+{dayTasks.length - 6} altri</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── VISTA GIORNO (Step G) ─── */}
      {viewMode === "day" && (() => {
        const dayTasks = state.tasks
          .filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate &&
            new Date(t.dueDate).toDateString() === dayDate.toDateString())
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 44; // px per ora
        const isToday = dayDate.toDateString() === new Date().toDateString();
        const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
        return (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px", background: "var(--surface2)",
              fontSize: 12, color: "var(--text-muted)", fontWeight: 600,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{dayTasks.length} task in agenda</span>
              {isToday && <span style={{ color: "var(--gold)" }}>● Oggi</span>}
            </div>
            <div style={{ position: "relative", display: "flex", maxHeight: 640, overflowY: "auto" }}>
              {/* Colonna ore */}
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, padding: "2px 8px", fontSize: 10, color: "var(--text-muted)",
                    textAlign: "right", borderBottom: "1px solid var(--surface2)",
                  }}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>
              {/* Colonna eventi */}
              <div style={{ flex: 1, position: "relative" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                  }} />
                ))}
                {/* Linea ora corrente */}
                {nowMinutes != null && (
                  <div style={{
                    position: "absolute", left: 0, right: 0,
                    top: (nowMinutes / 60) * SLOT_H,
                    height: 2, background: "var(--gold)", zIndex: 2,
                  }}>
                    <div style={{
                      position: "absolute", left: -4, top: -4, width: 10, height: 10,
                      borderRadius: "50%", background: "var(--gold)",
                    }} />
                  </div>
                )}
                {/* Eventi */}
                {dayTasks.map(t => {
                  const d = new Date(t.dueDate);
                  const startMin = d.getHours() * 60 + d.getMinutes();
                  const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                  const top = (startMin / 60) * SLOT_H;
                  const height = Math.max(28, hours * SLOT_H - 2);
                  const cat = CATEGORIES[t.category] || {};
                  return (
                    <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                      position: "absolute", top, left: 6, right: 6, height,
                      background: (cat.color || "#94a3b8") + "22",
                      borderLeft: `3px solid ${cat.color || "#94a3b8"}`,
                      borderRadius: "0 6px 6px 0", padding: "4px 8px",
                      cursor: "pointer", overflow: "hidden", fontSize: 12,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", zIndex: 1,
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cat.icon} {t.title}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                        {formatTime(t.dueDate)} · {hours}h
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA PIENA (Step G) ─── */}
      {viewMode === "week-full" && (() => {
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 36;
        const today = new Date().toDateString();
        return (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            {/* Header giorni */}
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, background: "var(--surface2)" }}>
              <div />
              {weekDays.map((d, i) => {
                const isToday = d.toDateString() === today;
                return (
                  <div key={i} style={{
                    padding: "8px 4px", textAlign: "center", fontSize: 11,
                    color: isToday ? "var(--gold)" : "var(--text-muted)",
                    fontWeight: 600, borderLeft: "1px solid var(--border)",
                  }}>
                    {dayNames[i]} {d.getDate()}
                  </div>
                );
              })}
            </div>
            {/* Griglia oraria scrollabile */}
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, position: "relative" }}>
                {/* Colonna ore */}
                <div>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      height: SLOT_H, padding: "2px 6px", fontSize: 9, color: "var(--text-muted)",
                      textAlign: "right", borderBottom: "1px solid var(--surface2)",
                    }}>{String(h).padStart(2, "0")}:00</div>
                  ))}
                </div>
                {weekDays.map((day, di) => {
                  const dayTasks = getTasksForDay(day).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                  const isToday = day.toDateString() === today;
                  return (
                    <div key={di} style={{
                      position: "relative", borderLeft: "1px solid var(--border)",
                      background: isToday ? "rgba(212,168,67,0.04)" : "transparent",
                    }}>
                      {HOURS.map(h => (
                        <div key={h} style={{
                          height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                        }} />
                      ))}
                      {dayTasks.map(t => {
                        const d = new Date(t.dueDate);
                        const startMin = d.getHours() * 60 + d.getMinutes();
                        const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                        const top = (startMin / 60) * SLOT_H;
                        const height = Math.max(20, hours * SLOT_H - 2);
                        const cat = CATEGORIES[t.category] || {};
                        return (
                          <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                            position: "absolute", top, left: 2, right: 2, height,
                            background: (cat.color || "#94a3b8") + "22",
                            borderLeft: `2px solid ${cat.color || "#94a3b8"}`,
                            borderRadius: "0 4px 4px 0", padding: "2px 5px",
                            cursor: "pointer", overflow: "hidden", fontSize: 10, lineHeight: 1.2,
                          }}>
                            <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cat.icon} {t.title}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatTime(t.dueDate)}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── DISTRIBUZIONE AGENTI (sempre visibile) ─── */}
      <div style={{ background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
        <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Distribuzione Settimanale per Agente</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--surface2)", borderRadius: "8px 0 0 0", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", width: 150 }}>Agente</th>
                {agentWeekDays.map((d, i) => (
                  <th key={i} style={{
                    padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                    color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                    textAlign: "center", minWidth: 70
                  }}>
                    {dayNames[i]}<br />{d.getDate()}
                  </th>
                ))}
                <th style={{ padding: "8px 6px", background: "var(--surface2)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderRadius: "0 8px 0 0" }}>TOT</th>
              </tr>
            </thead>
            <tbody>
              {getAssignableTeam().map(m => (
                <tr key={m.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={{ fontWeight: 500 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {agentWeekDays.map((day, i) => {
                    const count = state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      new Date(t.dueDate).toDateString() === day.toDateString()
                    ).length;
                    return (
                      <td key={i} style={{
                        padding: "8px 6px", textAlign: "center", borderBottom: "1px solid var(--border)",
                        background: count > 0 ? m.color + "12" : "transparent",
                      }}>
                        {count > 0 ? (
                          <span style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{count}</span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--navy)" }}>
                    {state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      agentWeekDays.some(d => new Date(t.dueDate).toDateString() === d.toDateString())
                    ).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
const Team = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [selectedMember, setSelectedMember] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const uid = state.currentUserId;

  const memberTasks = (memberId) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.assignees?.includes(memberId));

  const filtered = selectedMember
    ? memberTasks(selectedMember).filter(t => !filterStatus || t.status === filterStatus)
    : [];

  const roleColors = { Manager: "#0F2044", "Senior Agent": "#2D7A4F", "Junior Agent": "#C8832A", Driver: "#7B4F9E", Admin: "#C0392B" };

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28 }}>
      <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 22 }}>Team & Assegnazioni</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginBottom: 28 }}>
        {getAssignableTeam().map(m => {
          const tasks = memberTasks(m.id);
          const active = tasks.filter(t => t.status !== "done");
          const done = tasks.filter(t => t.status === "done");
          const pct = Math.min(100, Math.round((active.length / m.capacity) * 100));
          const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
          const isSelected = selectedMember === m.id;

          return (
            <div key={m.id} className="hover-lift" onClick={() => setSelectedMember(isSelected ? null : m.id)} style={{
              background: "#fff", borderRadius: 12, padding: "20px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `2px solid ${isSelected ? m.color : "var(--border)"}`,
              cursor: "pointer", textAlign: "center", transition: "all 0.2s",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: m.color,
                fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", margin: "0 auto 10px"
              }}>{m.avatar}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
                background: roleColors[m.role] + "15", color: roleColors[m.role], marginTop: 4, display: "inline-block"
              }}>{m.role}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, marginBottom: 8 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{active.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Attivi</div>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{done.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Completati</div>
                </div>
              </div>

              <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{active.length}/{m.capacity} capacità</div>
            </div>
          );
        })}
      </div>

      {selectedMember && (() => {
        const m = getMember(selectedMember);
        if (!m) return null;
        return (
          <div className="slide-up" style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar memberId={selectedMember} size={40} />
                <div>
                  <div className="playfair" style={{ fontSize: 16, fontWeight: 700 }}>Task di {m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer"
              }}>
                <option value="">Tutti gli stati</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 14 }}>
                  Nessun task trovato per questo filtro
                </div>
              ) : filtered.map(t => (
                <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                  transition: "background 0.15s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {t.client && `👤 ${t.client} • `}📅 {formatDate(t.dueDate)}
                    </div>
                  </div>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── CHAT: MOCK DATA ───────────────────────────────────────────────────────
// CURRENT_USER è dichiarato in cima al file (sezione MOCK DATA)

// Context per condividere tasks/dispatch (per messaggi con taskLink — v0.8)
const ChatContext = createContext({ tasks: [], dispatch: () => {} });

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

// ─── CHAT: UTILS ───────────────────────────────────────────────────────────
const formatChatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

const formatMsgTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getConversationName = (conv) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== CURRENT_USER);
  return getMember(other)?.name || "Sconosciuto";
};

const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

const getUnreadCount = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)).length;
};

// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

const ReactionPicker = ({ onPick, onClose }) => (
  <div onClick={e => e.stopPropagation()} style={{
    position: "absolute", bottom: "calc(100% + 4px)", left: 0,
    background: "#fff", borderRadius: 20, padding: "6px 8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
    display: "flex", gap: 2, zIndex: 100,
  }}>
    {EMOJI_REACTIONS.map(e => (
      <button key={e} onClick={() => { onPick(e); onClose(); }} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 18, padding: 4, borderRadius: 6, transition: "background 0.15s",
      }}
        onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
      >{e}</button>
    ))}
  </div>
);

// ─── CHAT: VOICE PLAYER ────────────────────────────────────────────────────
const VoicePlayer = ({ duration, waveform, isMine }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { setPlaying(false); return 0; }
        return p + (100 / (duration * 10));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, duration]);

  const color = isMine ? "rgba(255,255,255,0.9)" : "var(--navy)";
  const dimColor = isMine ? "rgba(255,255,255,0.35)" : "var(--text-light)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
      <button onClick={() => setPlaying(!playing)} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMine ? "rgba(255,255,255,0.2)" : "var(--gold)",
        border: "none", cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: isMine ? "#fff" : "var(--navy)", fontSize: 12,
        flexShrink: 0,
      }}>{playing ? "⏸" : "▶"}</button>

      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, height: 28 }}>
        {waveform.map((h, i) => {
          const barProgress = (i / waveform.length) * 100;
          const filled = barProgress <= progress;
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`, minHeight: 3,
              background: filled ? color : dimColor,
              borderRadius: 1, transition: "background 0.1s",
            }} />
          );
        })}
      </div>

      <span style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.8)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {formatDuration(Math.floor((100 - progress) / 100 * duration))}
      </span>
    </div>
  );
};

// Parsing task link nel testo dei messaggi (Step H).
// Riconosce il pattern generato da openChatTo+intent.taskLink:
//   🔗 Riferimento task: "TITLE"\n📅 Scadenza: DATE TIME\n\nRESTO
// Ritorna { taskTitle, taskDue, rest } o null se non match.
const TASK_LINK_RE = /^🔗 Riferimento task: "([^"]+)"\n📅 Scadenza:([^\n]*)\n\n([\s\S]*)$/;
function parseTaskLink(text) {
  if (typeof text !== "string") return null;
  const m = TASK_LINK_RE.exec(text);
  if (!m) return null;
  return { taskTitle: m[1], taskDue: m[2].trim(), rest: m[3] };
}

// Renderizza testo del messaggio con eventuale pill task cliccabile.
// Step K: lookup preferito per `taskRef` (UUID) se presente sul messaggio;
// fallback per titolo (compat messaggi vecchi senza taskRef).
const MessageTextContent = ({ text, isMine, taskRef }) => {
  const { tasks, dispatch } = useContext(ChatContext);
  const link = parseTaskLink(text);
  if (!link) {
    return <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>{text}</div>;
  }
  // Step K: prima cerca per UUID, poi fallback al match titolo.
  const tByRef = taskRef ? (tasks || []).find(x => x.id === taskRef && !x.deletedAt) : null;
  const t = tByRef || (tasks || []).find(x => x.title === link.taskTitle && !x.deletedAt);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!t) return;
    dispatch?.({ type: "SET_SELECTED_TASK", payload: t });
  };
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!t}
        title={t ? "Apri task" : "Task non disponibile"}
        style={{
          display: "block", textAlign: "left", width: "100%",
          background: isMine ? "rgba(255,255,255,0.12)" : "var(--surface2)",
          border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--border)",
          color: "inherit",
          padding: "6px 10px", borderRadius: 8, marginBottom: link.rest ? 6 : 0,
          cursor: t ? "pointer" : "not-allowed", opacity: t ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 0.5 }}>
          🔗 RIFERIMENTO TASK
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
          {link.taskTitle}
        </div>
        {link.taskDue && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            📅 {link.taskDue}
          </div>
        )}
      </button>
      {link.rest && <div>{link.rest}</div>}
    </div>
  );
};

// ─── CHAT: FILE HELPERS (Step M) ───────────────────────────────────────────
// Limite bucket 'chat-files' (vedi migration 20260611_chat_files_storage.sql).
// Replicato qui per validazione client prima di iniziare l'upload.
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Deduce il "kind" UI (icona) dall'estensione del file caricato.
const fileKindFromName = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "img";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "default";
};

// fileSize reale è in byte (bigint su DB); i vecchi mock usano stringhe
// già formattate ("245 KB") → passthrough.
const formatFileSize = (size) => {
  if (typeof size !== "number") return size || "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

// ─── CHAT: MESSAGE ─────────────────────────────────────────────────────────
const ChatMessage = ({ msg, prevMsg, conv, allMessages, onReact, onReply, onContextMenu }) => {
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMine = msg.sender === CURRENT_USER;
  const sender = getMember(msg.sender);
  const showAvatar = !prevMsg || prevMsg.sender !== msg.sender;
  const showName = conv.type === "group" && !isMine && showAvatar;

  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replyAuthor = replyMsg ? getMember(replyMsg.sender) : null;

  // Read indicator
  const otherParticipants = conv.participants.filter(p => p !== CURRENT_USER);
  const readByAll = isMine && otherParticipants.every(p => msg.readBy?.includes(p));
  const readBySome = isMine && otherParticipants.some(p => msg.readBy?.includes(p));

  const fileIcons = { pdf: "📄", doc: "📝", img: "🖼️", xls: "📊", default: "📎" };

  // Step M: apre l'allegato con una signed URL temporanea dal bucket privato.
  const [fileOpening, setFileOpening] = useState(false);
  const openFile = async () => {
    if (!msg.fileUrl || fileOpening) return;
    setFileOpening(true);
    const { url, error } = await MessagesAPI.getFileUrl(msg.fileUrl);
    setFileOpening(false);
    if (error || !url) { console.error("[chat] signed url", error); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReactions(false); }}
      style={{
        display: "flex", flexDirection: isMine ? "row-reverse" : "row",
        gap: 8, marginTop: showAvatar ? 12 : 2, alignItems: "flex-end",
        position: "relative",
      }}>
      {/* Avatar */}
      <div style={{ width: 28, flexShrink: 0 }}>
        {!isMine && showAvatar && <Avatar memberId={msg.sender} size={28} />}
      </div>

      {/* Message bubble */}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", position: "relative" }}>
        {showName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: sender?.color, marginBottom: 3, marginLeft: 12 }}>
            {sender?.name}
          </div>
        )}

        <div style={{
          background: isMine ? "var(--navy)" : "#fff",
          color: isMine ? "#fff" : "var(--text)",
          padding: msg.type === "voice" ? "8px 12px" : "8px 12px",
          borderRadius: 14,
          borderTopRightRadius: isMine && showAvatar ? 4 : 14,
          borderTopLeftRadius: !isMine && showAvatar ? 4 : 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}>
          {/* Reply preview */}
          {replyMsg && (
            <div style={{
              borderLeft: `3px solid ${isMine ? "var(--gold)" : replyAuthor?.color || "var(--navy)"}`,
              padding: "4px 8px", marginBottom: 6, borderRadius: 4,
              background: isMine ? "rgba(255,255,255,0.1)" : "var(--surface2)",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: isMine ? "var(--gold)" : replyAuthor?.color }}>
                {replyAuthor?.name}
              </div>
              <div style={{ opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                {replyMsg.type === "voice" ? "🎙️ Vocale" : replyMsg.type === "file" ? `📎 ${replyMsg.fileName}` : replyMsg.text}
              </div>
            </div>
          )}

          {/* Content */}
          {msg.type === "text" && (
            <MessageTextContent text={msg.text} isMine={isMine} taskRef={msg.taskRef} />
          )}

          {msg.type === "voice" && (
            <VoicePlayer duration={msg.duration} waveform={msg.waveform} isMine={isMine} />
          )}

          {msg.type === "file" && (
            <div
              onClick={openFile}
              title={msg.fileUrl ? "Scarica file" : "File di esempio (nessun contenuto)"}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                minWidth: 220, cursor: msg.fileUrl ? "pointer" : "default",
              }}>
              <div style={{
                width: 40, height: 40, background: isMine ? "rgba(255,255,255,0.15)" : "var(--surface2)",
                borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{fileIcons[msg.fileType] || fileIcons.default}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.fileName}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{formatFileSize(msg.fileSize)}</div>
              </div>
              {msg.fileUrl && <div style={{ fontSize: 16, opacity: 0.7 }}>{fileOpening ? "⏳" : "⬇"}</div>}
            </div>
          )}

          {/* Timestamp + read indicator inside bubble */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end",
            marginTop: 3, fontSize: 10, opacity: 0.7,
          }}>
            <span>{formatMsgTime(msg.time)}</span>
            {isMine && (
              <span style={{ fontSize: 12, lineHeight: 1, color: readByAll ? "var(--gold-light)" : "currentColor" }}>
                {readByAll ? "✓✓" : readBySome ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: "flex", gap: 3, marginTop: 4,
            marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
          }}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <div key={emoji} style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: 99, padding: "2px 7px", fontSize: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{users.length}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons (hover) */}
        {hovered && (
          <div style={{
            position: "absolute", top: -8, [isMine ? "left" : "right"]: -8,
            display: "flex", gap: 2, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 99,
            padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}>
            <button onClick={() => setShowReactions(s => !s)} style={iconBtn}>😊</button>
            <button onClick={() => onReply(msg)} style={iconBtn}>↩</button>
          </div>
        )}

        {showReactions && (
          <ReactionPicker
            onPick={(e) => onReact(msg.id, e)}
            onClose={() => setShowReactions(false)}
          />
        )}
      </div>
    </div>
  );
};

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
const VoiceRecorder = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)",
      flex: 1,
    }}>
      <div className="record-pulse" style={{
        width: 10, height: 10, borderRadius: "50%", background: "var(--danger)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center", height: 20 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, background: "var(--navy)",
            height: `${30 + Math.random() * 70}%`, minHeight: 3,
            borderRadius: 1,
            animation: `wave 0.${4 + (i % 5)}s ease infinite`,
            animationDelay: `${i * 0.05}s`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        {formatDuration(seconds)}
      </span>
      <button onClick={onCancel} style={{
        background: "var(--surface2)", border: "none", borderRadius: "50%",
        width: 30, height: 30, cursor: "pointer", fontSize: 14,
      }}>✕</button>
      <button onClick={() => onSend(seconds)} style={{
        background: "var(--gold)", color: "var(--navy)", border: "none",
        borderRadius: "50%", width: 30, height: 30, cursor: "pointer",
        fontSize: 14, fontWeight: 700,
      }}>↑</button>
    </div>
  );
};

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
const ConversationView = ({ conv, messages, setMessages, markConversationRead, onBack, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const [typing, setTyping] = useState(false);
  // Step K: taskRef UUID "armato" finché il prossimo invio non lo consuma.
  const [pendingTaskRef, setPendingTaskRef] = useState(null);
  const scrollRef = useRef(null);
  // Step M: upload allegati reale
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const { dispatch } = useContext(ChatContext);
  // Guardia unmount: setState dopo unmount (utente chiude la chat mid-upload)
  // genera un warning React e perde la callback di errore.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Se è arrivato un prefill (es. da "contatta agente" su urgenti altrui), popolalo
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
      if (initialTaskRef) setPendingTaskRef(initialTaskRef);
      if (onInitialInputConsumed) onInitialInputConsumed();
    }
  }, [initialInput, initialTaskRef]);

  const msgs = messages[conv.id] || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // Mark as read on open (Step Q.4: 1 RPC bulk invece di N UPDATE per msg)
  useEffect(() => {
    if (markConversationRead) {
      markConversationRead(conv.id);
      return;
    }
    // Fallback per i call site che non passano il callback (eg. test)
    setMessages(prev => ({
      ...prev,
      [conv.id]: (prev[conv.id] || []).map(m => {
        if (m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)) {
          return { ...m, readBy: [...(m.readBy || []), CURRENT_USER] };
        }
        return m;
      })
    }));
  }, [conv.id]);

  // Simulate someone typing
  useEffect(() => {
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.sender === CURRENT_USER) {
      const timer = setTimeout(() => setTyping(true), 800);
      const stop = setTimeout(() => setTyping(false), 3500);
      return () => { clearTimeout(timer); clearTimeout(stop); };
    }
  }, [msgs.length]);

  const sendText = () => {
    if (!input.trim()) return;
    // Step K: se il testo che sta partendo contiene un pattern "🔗 Riferimento task: ..."
    // (perché viene da prefill o l'utente l'ha mantenuto), allega taskRef UUID.
    const textOut = input.trim();
    const stillHasLink = parseTaskLink(textOut) !== null;
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "text",
      text: textOut, time: new Date().toISOString(),
      readBy: [CURRENT_USER],
      replyTo: replyingTo?.id,
      ...(stillHasLink && pendingTaskRef ? { taskRef: pendingTaskRef } : {}),
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setInput("");
    setReplyingTo(null);
    setPendingTaskRef(null);
  };

  const sendVoice = (duration) => {
    const waveform = Array.from({ length: 30 }, () => 0.3 + Math.random() * 0.6);
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "voice",
      duration, waveform, time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setRecording(false);
  };

  // Step M: il picker nativo viene aperto con un accept diverso per tipo;
  // l'upload va sul bucket privato 'chat-files' e il messaggio porta il path.
  const pickFile = (accept) => {
    setShowAttach(false);
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  const sendFile = async (file) => {
    if (!file || uploading) return;
    // Validazione client del limite del bucket (vedi migration
    // 20260611_chat_files_storage.sql): senza, l'utente vede l'errore
    // solo dopo aver caricato fino al rifiuto Storage.
    if (file.size > MAX_FILE_SIZE) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` } });
      return;
    }
    // Conv mock (id non-uuid, smoke-test senza login): nessuno storage,
    // il messaggio resta solo locale senza fileUrl.
    let fileUrl = null;
    if (isUuid(conv.id)) {
      setUploading(true);
      const { path, error } = await MessagesAPI.uploadFile(file, conv.id);
      if (!mountedRef.current) return;
      setUploading(false);
      if (error || !path) {
        console.error("[chat] upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Upload fallito: ${error?.message || "errore sconosciuto"}` } });
        return;
      }
      fileUrl = path;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "file",
      fileName: file.name, fileSize: file.size,
      fileType: fileKindFromName(file.name), fileUrl,
      time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
  };

  const handleReact = (msgId, emoji) => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: prev[conv.id].map(m => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(CURRENT_USER)) {
          reactions[emoji] = users.filter(u => u !== CURRENT_USER);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, CURRENT_USER];
        }
        return { ...m, reactions };
      })
    }));
  };

  const otherTypingMember = conv.participants.find(p => p !== CURRENT_USER);
  const otherMember = conv.type === "direct" ? getMember(otherTypingMember) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface2)" }}>
      {/* Header */}
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
        borderBottom: "1px solid rgba(212,168,67,0.2)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>

        {conv.type === "direct" ? (
          <Avatar memberId={otherTypingMember} size={36} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>{conv.icon || "👥"}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {getConversationName(conv)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            {typing ? (
              <span style={{ color: "var(--gold-light)" }}>
                {conv.type === "group" ? `${getMember(otherTypingMember)?.name.split(" ")[0]} sta scrivendo` : "sta scrivendo"}
                <span style={{ animation: "typing 1s infinite", animationDelay: "0s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.2s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.4s", display: "inline-block" }}>.</span>
              </span>
            ) : conv.type === "direct" ? (
              <>● Online</>
            ) : (
              `${conv.participants.length} membri`
            )}
          </div>
        </div>

        <button style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 12,
        }}>⋮</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        background: "var(--surface2)",
      }}>
        {msgs.map((m, i) => (
          <ChatMessage
            key={m.id}
            msg={m}
            prevMsg={msgs[i - 1]}
            conv={conv}
            allMessages={msgs}
            onReact={handleReact}
            onReply={setReplyingTo}
          />
        ))}
        {typing && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
            <Avatar memberId={otherTypingMember} size={28} />
            <div style={{
              background: "#fff", border: "1px solid var(--border)",
              borderRadius: 14, borderTopLeftRadius: 4, padding: "8px 12px",
              display: "flex", gap: 3, alignItems: "center",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div style={{
          padding: "8px 14px", background: "#fff", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-dark)" }}>
              Rispondi a {getMember(replyingTo.sender)?.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replyingTo.type === "voice" ? "🎙️ Vocale" : replyingTo.type === "file" ? `📎 ${replyingTo.fileName}` : replyingTo.text}
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "var(--text-muted)",
          }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        position: "relative",
      }}>
        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <>
            <div style={{ position: "relative" }}>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  sendFile(f);
                }}
              />
              <button onClick={() => setShowAttach(s => !s)} disabled={uploading} style={{
                background: "var(--surface2)", border: "none", borderRadius: "50%",
                width: 36, height: 36, cursor: uploading ? "wait" : "pointer", fontSize: 18, flexShrink: 0,
              }}>{uploading ? "⏳" : "📎"}</button>
              {showAttach && (
                <div className="slide-up" style={{
                  position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                  background: "#fff", borderRadius: 12, padding: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 4, minWidth: 160, zIndex: 100,
                }}>
                  {[
                    { kind: "pdf", icon: "📄", label: "Documento PDF", accept: "application/pdf" },
                    { kind: "img", icon: "🖼️", label: "Immagine", accept: "image/*" },
                    { kind: "doc", icon: "📝", label: "Word/Excel", accept: ".doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt" },
                  ].map(opt => (
                    <button key={opt.kind} onClick={() => pickFile(opt.accept)} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", border: "none", background: "transparent",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, textAlign: "left",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
              placeholder="Scrivi un messaggio..."
              style={{
                flex: 1, border: "1px solid var(--border)", borderRadius: 22,
                padding: "10px 16px", fontSize: 13.5, fontFamily: "inherit",
                outline: "none", background: "var(--surface)",
              }}
            />

            {input.trim() ? (
              <button onClick={sendText} style={{
                background: "var(--navy)", color: "#fff", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>↑</button>
            ) : (
              <button onClick={() => setRecording(true)} style={{
                background: "var(--gold)", color: "var(--navy)", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 16, flexShrink: 0,
              }}>🎙️</button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── CHAT: LIST OF CONVERSATIONS ───────────────────────────────────────────
const ConversationList = ({ conversations, messages, onSelect, onNew }) => {
  const { presenceMap } = useContext(ChatContext);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const lastA = getLastMessage(messages, a.id);
    const lastB = getLastMessage(messages, b.id);
    if (!lastA) return 1;
    if (!lastB) return -1;
    return new Date(lastB.time) - new Date(lastA.time);
  });

  const matchesSearch = (c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    // 1) nome conversazione
    if (getConversationName(c).toLowerCase().includes(q)) return true;
    // 2) nomi partecipanti
    const partNames = (c.participants || [])
      .map(id => getMember(id)?.name || "")
      .join(" ")
      .toLowerCase();
    if (partNames.includes(q)) return true;
    // 3) ultimi 30 messaggi della conversazione (testo)
    const msgs = (messages[c.id] || []).slice(-30);
    for (const m of msgs) {
      if (m.type === "text" && m.text && m.text.toLowerCase().includes(q)) return true;
      if (m.type === "file" && m.fileName && m.fileName.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  const filtered = sorted.filter(c => {
    if (filter === "direct" && c.type !== "direct") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && getUnreadCount(messages, c.id) === 0) return false;
    if (!matchesSearch(c)) return false;
    return true;
  });

  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(messages, c.id), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>🔍</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
              outline: "none", background: "var(--surface)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[
            { id: "all", label: "Tutti" },
            { id: "unread", label: `Non letti${totalUnread ? ` (${totalUnread})` : ""}` },
            { id: "direct", label: "Diretti" },
            { id: "group", label: "Gruppi" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              border: "1px solid var(--border)", borderRadius: 99,
              background: filter === f.id ? "var(--navy)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--text-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(c => {
          const last = getLastMessage(messages, c.id);
          const unread = getUnreadCount(messages, c.id);
          const lastSender = last ? getMember(last.sender) : null;
          const otherUser = c.type === "direct" ? c.participants.find(p => p !== CURRENT_USER) : null;

          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              borderBottom: "1px solid var(--border)", cursor: "pointer",
              transition: "background 0.15s",
              background: unread > 0 ? "rgba(212,168,67,0.05)" : "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = unread > 0 ? "rgba(212,168,67,0.05)" : "transparent"}
            >
              {c.type === "direct" ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar memberId={otherUser} size={42} />
                  {(() => {
                    const u = (presenceMap || {})[otherUser];
                    const p = u ? computePresence(u) : 'offline';
                    return (
                      <div title={p} style={{
                        position: "absolute", bottom: 0, right: 0, width: 11, height: 11,
                        borderRadius: "50%", background: PRESENCE_COLORS[p],
                        border: "2px solid #fff",
                      }} />
                    );
                  })()}
                </div>
              ) : (
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", background: "var(--gold)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>{c.icon || "👥"}</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                    {c.pinned && <span style={{ fontSize: 10, color: "var(--gold)" }}>📌</span>}
                    <span style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getConversationName(c)}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {last && formatChatTime(last.time)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <div style={{
                    fontSize: 12, color: unread > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: unread > 0 ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
                  }}>
                    {last ? (
                      <>
                        {last.sender === CURRENT_USER && <span style={{ color: "var(--text-muted)" }}>Tu: </span>}
                        {c.type === "group" && last.sender !== CURRENT_USER && (
                          <span style={{ color: lastSender?.color, fontWeight: 600 }}>
                            {lastSender?.name.split(" ")[0]}:{" "}
                          </span>
                        )}
                        {last.type === "voice" ? "🎙️ Messaggio vocale" :
                          last.type === "file" ? `📎 ${last.fileName}` :
                            last.text}
                      </>
                    ) : "Nessun messaggio"}
                  </div>
                  {unread > 0 && (
                    <div style={{
                      background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
                      borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0,
                    }}>{unread}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Nessuna conversazione trovata</div>
          </div>
        )}
      </div>

      <button onClick={onNew} style={{
        margin: 14, padding: "10px", background: "var(--navy)", color: "#fff",
        border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>✏️ Nuova chat</button>
    </div>
  );
};

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");

  const available = TEAM.filter(m => m.id !== CURRENT_USER);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const createDirect = (memberId) => {
    const found = existing.find(c => c.type === "direct" && c.participants.includes(memberId));
    if (found) { onCreate(found); return; }
    const newConv = {
      id: "c" + Date.now(), type: "direct",
      participants: [CURRENT_USER, memberId], name: null,
    };
    onCreate(newConv, true);
  };

  const createGroup = () => {
    if (!groupName.trim() || selected.length < 2) return;
    const newConv = {
      id: "c" + Date.now(), type: "group",
      participants: [CURRENT_USER, ...selected],
      name: groupName.trim(), icon: "👥",
    };
    onCreate(newConv, true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>
        <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <button onClick={() => setMode("group")} style={{
              width: "100%", padding: "10px 14px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div key={m.id} onClick={() => createDirect(m.id)} style={{
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "group" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome del gruppo..."
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              SELEZIONA MEMBRI ({selected.length} selezionati)
            </div>
            {available.map(m => {
              const isSel = selected.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(m.id)} style={{
                  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                  cursor: "pointer", background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <Avatar memberId={m.id} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`,
                    background: isSel ? "var(--gold)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: "var(--navy)", fontWeight: 700,
                  }}>{isSel && "✓"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <button onClick={() => setMode("select")} style={{
              flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
            }}>Indietro</button>
            <button onClick={createGroup} disabled={!groupName.trim() || selected.length < 2} style={{
              flex: 2, padding: "10px", background: "var(--navy)", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: (!groupName.trim() || selected.length < 2) ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              opacity: (!groupName.trim() || selected.length < 2) ? 0.5 : 1,
            }}>Crea gruppo</button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── CHAT: MAIN PANEL ──────────────────────────────────────────────────────
const ChatPanel = ({ open, onClose, conversations, setConversations, messages, setMessages, markConversationRead, intent, tasks, currentUserId, dispatch, presenceMap, loading = false }) => {
  const { isMobile } = useViewport();
  const [activeConv, setActiveConv] = useState(null);
  const [newMode, setNewMode] = useState(false);
  const [prefillText, setPrefillText] = useState("");
  // Step K: taskRef UUID da precompilare insieme al testo del riferimento task.
  const [prefillTaskRef, setPrefillTaskRef] = useState(null);

  // Gestione intent: apertura chat verso utente specifico con link a task
  useEffect(() => {
    if (!open || !intent || !intent.toUser) return;
    const me = currentUserId || CURRENT_USER;
    // Cerca conversazione diretta esistente
    let direct = conversations.find(c =>
      c.type === "direct" &&
      c.participants.includes(me) &&
      c.participants.includes(intent.toUser)
    );
    if (!direct) {
      direct = {
        id: "c" + Date.now(),
        type: "direct",
        participants: [me, intent.toUser],
        name: null,
      };
      setConversations(prev => [direct, ...prev]);
    }
    setActiveConv(direct);
    setNewMode(false);
    // Precompila il messaggio con riferimento al task
    if (intent.taskLink) {
      const t = (tasks || []).find(x => x.id === intent.taskLink);
      if (t) {
        const text = `🔗 Riferimento task: "${t.title}"\n📅 Scadenza: ${formatDate(t.dueDate)} ${formatTime(t.dueDate)}\n\n`;
        setPrefillText(text);
        // Step K: salva l'UUID del task per popolare messages.task_ref alla send.
        setPrefillTaskRef(t.id);
      }
    }
  }, [open, intent, currentUserId]);

  if (!open) return null;

  const handleCreate = (conv, addNew = false) => {
    if (addNew) setConversations(c => [conv, ...c]);
    setActiveConv(conv);
    setNewMode(false);
  };

  return (
    <ChatContext.Provider value={{ tasks: tasks || [], currentUserId: currentUserId || CURRENT_USER, dispatch: dispatch || (() => {}), presenceMap: presenceMap || {} }}>
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.3)", zIndex: 700,
      }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 420, height: "100vh",
        background: "#fff", zIndex: 800, boxShadow: "-20px 0 60px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>💬</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                Messaggi
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12, color: "var(--navy)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "3px solid rgba(15,32,68,0.15)", borderTopColor: "var(--gold)",
                animation: "spin 0.8s linear infinite",
              }} />
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>
                Caricamento chat…
              </div>
            </div>
          ) : newMode ? (
            <NewConversationView
              onCreate={handleCreate}
              onCancel={() => setNewMode(false)}
              existing={conversations}
            />
          ) : activeConv ? (
            <ConversationView
              conv={activeConv}
              messages={messages}
              setMessages={setMessages}
              markConversationRead={markConversationRead}
              onBack={() => { setActiveConv(null); setPrefillText(""); setPrefillTaskRef(null); }}
              initialInput={prefillText}
              initialTaskRef={prefillTaskRef}
              onInitialInputConsumed={() => { setPrefillText(""); setPrefillTaskRef(null); }}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              messages={messages}
              onSelect={setActiveConv}
              onNew={() => setNewMode(true)}
            />
          )}
        </div>
      </div>
    </>
    </ChatContext.Provider>
  );
};

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
const Trash = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [restoring, setRestoring] = useState(null); // task being restored/edited
  const me = state.currentUserId;
  // Ogni utente vede nel cestino solo i task che può gestire (admin: tutti; manager/agent:
  // propri + coda globale; driver: solo transfer propri/globali) — prerogativa di status.
  const trashed = getTrashedTasks(state.tasks)
    .filter(t => canEditTask(t, me))
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  const handleRestore = (task) => {
    setRestoring({ ...task });
  };

  const handleConfirmRestore = () => {
    if (!restoring) return;
    const { deletedAt, ...updates } = restoring;
    dispatch({ type: "UPDATE_TASK", payload: updates });
    dispatch({ type: "RESTORE_TASK", payload: restoring.id });
    setRestoring(null);
  };

  const handlePurge = (task) => {
    if (window.confirm(`Eliminare definitivamente "${task.title}"?\n\nQuesta azione è irreversibile.`)) {
      dispatch({ type: "PURGE_TASK", payload: task.id });
    }
  };

  const handleEmpty = () => {
    if (trashed.length === 0) return;
    if (window.confirm(`Svuotare il cestino?\n\n${trashed.length} task verranno eliminati definitivamente. Azione irreversibile.`)) {
      dispatch({ type: "EMPTY_TRASH" });
    }
  };

  const updateField = (field, value) => setRestoring(prev => ({ ...prev, [field]: value }));

  return (
    <div className="vd-pad" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="playfair" style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
            🗑️ Cestino
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashed.length === 0
              ? "Nessun task nel cestino"
              : `${trashed.length} task ${trashed.length === 1 ? "eliminato" : "eliminati"}. Ripristinali o rimuovili definitivamente.`
            }
          </div>
        </div>
        {trashed.length > 0 && (
          <button onClick={handleEmpty} style={{
            background: "var(--danger)", color: "#fff", border: "none",
            padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(220,38,38,0.25)",
          }}>🔥 Svuota cestino</button>
        )}
      </div>

      {/* Empty state */}
      {trashed.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗑️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
            Cestino vuoto
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : (
        /* Trash table */
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>TASK</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CATEGORIA</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CLIENTE</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ASSEGNATI</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ELIMINATO</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {trashed.map(task => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--navy)", marginBottom: 2 }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                      <PriorityBadge priority={task.priority} />
                      <span>• {STATUS_LABELS[task.status]}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <CategoryChip category={task.category} />
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text)" }}>
                    {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {formatDate(task.deletedAt)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => handleRestore(task)} title="Ripristina con modifica" style={{
                        background: "var(--navy)", color: "#fff", border: "none",
                        padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>↻ Ripristina</button>
                      <button onClick={() => handlePurge(task)} title="Elimina definitivamente" style={{
                        background: "#fff", color: "var(--danger)", border: "1px solid var(--danger)",
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODALE RIPRISTINO CON MODIFICA ─── */}
      {restoring && (
        <>
          <div onClick={() => setRestoring(null)} style={{
            position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 1000,
          }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 16, zIndex: 1001,
            width: isMobile ? "calc(100vw - 32px)" : 520, maxWidth: "100%",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Modal header */}
            <div style={{
              background: "var(--navy)", padding: "18px 22px",
              borderRadius: "16px 16px 0 0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ color: "#fff" }}>
                <div className="playfair" style={{ fontSize: 18, fontWeight: 700 }}>↻ Ripristina task</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Modifica i campi se necessario, poi conferma</div>
              </div>
              <button onClick={() => setRestoring(null)} style={{
                background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
                width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
              }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Titolo */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>TITOLO</label>
                <input
                  value={restoring.title}
                  onChange={e => updateField("title", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Categoria + Priorità */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CATEGORIA</label>
                  <select
                    value={restoring.category}
                    onChange={e => updateField("category", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>PRIORITÀ</label>
                  <select
                    value={restoring.priority}
                    onChange={e => updateField("priority", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stato + Scadenza */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>STATO</label>
                  <select
                    value={restoring.status}
                    onChange={e => updateField("status", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>SCADENZA</label>
                  <input
                    type="datetime-local"
                    value={restoring.dueDate ? restoring.dueDate.slice(0, 16) : ""}
                    onChange={e => updateField("dueDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CLIENTE</label>
                <input
                  value={restoring.client || ""}
                  onChange={e => updateField("client", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  placeholder="Nome cliente"
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Assegnatari */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>ASSEGNATARI</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {getAssignableTeam().map(m => {
                    const sel = restoring.assignees?.includes(m.id);
                    return (
                      <button key={m.id}
                        onClick={() => {
                          const curr = restoring.assignees || [];
                          updateField("assignees", sel ? curr.filter(x => x !== m.id) : [...curr, m.id]);
                        }}
                        style={{
                          padding: "6px 12px", borderRadius: 99,
                          border: sel ? "2px solid var(--navy)" : "1px solid var(--border)",
                          background: sel ? "var(--navy)" : "#fff",
                          color: sel ? "#fff" : "var(--text)",
                          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 5,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 99,
                          background: sel ? "rgba(255,255,255,0.2)" : m.color, color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700,
                        }}>{m.avatar}</span>
                        {m.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>DESCRIZIONE</label>
                <textarea
                  value={restoring.description || ""}
                  onChange={e => updateField("description", e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    resize: "vertical", outline: "none",
                  }}
                  placeholder="Descrizione task..."
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "flex-end", gap: 10,
            }}>
              <button onClick={() => setRestoring(null)} style={{
                background: "#fff", color: "var(--text)", border: "1px solid var(--border)",
                padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                fontWeight: 600, fontFamily: "inherit",
              }}>Annulla</button>
              <button
                onClick={handleConfirmRestore}
                disabled={!restoring.title?.trim()}
                style={{
                  background: restoring.title?.trim() ? "var(--navy)" : "var(--surface3)",
                  color: restoring.title?.trim() ? "#fff" : "var(--text-muted)",
                  border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: restoring.title?.trim() ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  boxShadow: restoring.title?.trim() ? "0 4px 14px rgba(15,32,68,0.3)" : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >↻ Conferma ripristino</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
const AdminView = ({ state, dispatch }) => {
  const [tab, setTab] = useState("team");

  const tabs = [
    { id: "team", icon: "👥", label: "Team" },
    { id: "io", icon: "📤", label: "Import / Export" },
    { id: "stats", icon: "📊", label: "Sistema" },
    { id: "cats", icon: "🏷️", label: "Categorie" },
    { id: "log", icon: "📋", label: "Log attività" },
  ];

  return (
    <div className="vd-pad" style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="playfair" style={{ fontSize: 28, color: "var(--navy)", margin: 0, fontWeight: 700 }}>
          ⚙️ Amministrazione
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
          Gestione team, categorie, import/export, statistiche e log attività
        </p>
      </div>

      {/* Tab nav */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto", whiteSpace: "nowrap",
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                color: active ? "var(--navy)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-in" key={tab}>
        {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
        {tab === "io" && <AdminIOTab state={state} dispatch={dispatch} />}
        {tab === "stats" && <AdminStatsTab state={state} />}
        {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
        {tab === "log" && <AdminLogTab state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
};

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
const AdminTeamTab = ({ state, dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const pending = state.team.filter(m => m.pending);
  const active = state.team.filter(m => !m.pending && m.active);
  const disabled = state.team.filter(m => !m.pending && !m.active);

  const taskCount = (id) => state.tasks.filter(t => !t.deletedAt && (t.assignees || []).includes(id)).length;

  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.name?.trim()) return;
    dispatch({ type: "UPDATE_TEAM_MEMBER", payload: draft });
    cancelEdit();
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    return (
      <div key={m.id} style={{
        background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex", alignItems: "center", gap: 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: m.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{m.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                placeholder="Ruolo" style={fieldStyle} />
              <input type="number" min="1" max="50" value={draft.capacity}
                onChange={e => setDraft({...draft, capacity: parseInt(e.target.value) || 1})}
                placeholder="Cap" style={fieldStyle} />
              <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                style={{ ...fieldStyle, padding: 2, height: 32 }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {m.role} • Capacità {m.capacity} task • {count} task assegnati
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isEditing ? (
            <>
              <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
              <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
            </>
          ) : (
            <>
              {opts.canApprove && (
                <button onClick={() => dispatch({ type: "APPROVE_TEAM_MEMBER", payload: m.id })} style={btnGold}>
                  ✓ Approva
                </button>
              )}
              {!m.pending && (
                <>
                  <button onClick={() => startEdit(m)} style={btnGhost} title="Modifica">✏️</button>
                  <button onClick={() => dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: m.id })}
                    style={m.active ? btnWarning : btnPrimary} title={m.active ? "Disattiva" : "Riattiva"}>
                    {m.active ? "⏸️ Disattiva" : "▶️ Riattiva"}
                  </button>
                </>
              )}
              <button onClick={() => {
                if (count > 0) {
                  alert(`Impossibile rimuovere: l'agente ha ${count} task assegnati. Riassegnali prima di procedere.`);
                  return;
                }
                if (window.confirm(`Rimuovere definitivamente "${m.name}"?`)) {
                  dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
                }
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header con pulsante aggiungi */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={{ color: "var(--gold-dark)" }}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={{ display: "grid", gap: 10 }}>
            {pending.map(m => card(m, { canApprove: true, dim: true }))}
          </div>
        </div>
      )}

      {/* Attivi */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={{ display: "grid", gap: 10 }}>
          {active.map(m => card(m))}
        </div>
      </div>

      {/* Disabilitati */}
      {disabled.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={{ display: "grid", gap: 10 }}>
            {disabled.map(m => card(m, { dim: true }))}
          </div>
        </div>
      )}

      {showAdd && <AddTeamMemberModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingIds={state.team.map(m => m.id)} />}
    </div>
  );
};

// AddTeamMemberModal → src/components/modals/AddTeamMemberModal.jsx (Step P Phase 2f)

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
const AdminIOTab = ({ state, dispatch }) => {
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? state.tasks : state.tasks.filter(t => !t.deletedAt);

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Ore","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "",
      t.estimatedHours || 0,
      (t.assignees || []).join("|"),
      (t.description || "").replace(/\n/g, " "),
      t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "",
      Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Ore: t.estimatedHours || 0,
      Assegnati: (t.assignees || []).map(a => getMember(a)?.name || a).join(", "),
      Descrizione: t.description || "",
      Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.5",
      exportedAt: new Date().toISOString(),
      agencyName: state.agencyName,
      tasks: state.tasks,
      team: state.team,
      categories: state.categories,
      notices: state.notices,
    };
    downloadFile(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`
    );
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("ATTENZIONE: il ripristino sovrascrive tutti i dati correnti (task, team, categorie). Continuare?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error("File backup non valido");
        dispatch({ type: "RESTORE_BACKUP", payload: data });
      } catch (err) {
        alert("Errore nel ripristino: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const total = tasksToExport().length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Export task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          📦 <b>{total}</b> task pronti per l'export
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      {/* Import task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Ore, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      {/* Backup completo */}
      <div style={cardStyle}>
        <h3 style={cardH}>💾 Backup &amp; Restore completo</h3>
        <p style={cardP}>Esporta o ripristina <b>tutto lo stato dell'applicazione</b> (task, team, categorie, impostazioni) come file JSON.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportBackup} style={btnPrimary}>⬇️ Esporta backup JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnWarning}>⬆️ Ripristina da backup</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 10 }}>
          ⚠️ Il ripristino sovrascrive completamente i dati correnti. Esporta prima un backup di sicurezza.
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: SISTEMA / STATS ────────────────────────────────────────────
const AdminStatsTab = ({ state }) => {
  const active = state.tasks.filter(t => !t.deletedAt);
  const trashed = state.tasks.filter(t => t.deletedAt);
  const overdue = active.filter(t => isOverdue(t));
  const done = active.filter(t => t.status === "done");
  const completionRate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const byStatus = STATUSES.map(s => ({
    s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: active.filter(t => t.status === s).length,
  }));

  const byCategory = Object.entries(state.categories).map(([k, c]) => ({
    k, label: c.label, color: c.color, icon: c.icon,
    count: active.filter(t => t.category === k).length,
  })).sort((a,b) => b.count - a.count);

  const byMember = state.team.filter(m => !m.pending).map(m => {
    const count = active.filter(t => (t.assignees || []).includes(m.id) && t.status !== "done").length;
    return { m, count, pct: m.capacity ? Math.min(100, Math.round((count / m.capacity) * 100)) : 0 };
  });

  const kpiCard = (label, value, sub, color) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--navy)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* KPI */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCard("Task attivi", active.length, `${trashed.length} nel cestino`)}
        {kpiCard("Completati", done.length, `${completionRate}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", state.team.filter(m => m.active && !m.pending).length, `${state.team.filter(m => m.pending).length} in attesa`)}
      </div>

      {/* Distribuzione per status */}
      <div style={cardStyle}>
        <h3 style={cardH}>📊 Distribuzione per status</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {byStatus.map(s => {
            const pct = active.length ? (s.count / active.length) * 100 : 0;
            return (
              <div key={s.s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 140, fontSize: 13, color: "var(--text)" }}>{s.label}</div>
                <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.3s" }} />
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carico team */}
      <div style={cardStyle}>
        <h3 style={cardH}>👥 Carico di lavoro per agente</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {byMember.map(({ m, count, pct }) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={{ width: 160, fontSize: 13 }}>{m.name}</div>
              <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct > 90 ? "var(--danger)" : pct > 70 ? "var(--warning)" : "var(--success)",
                  transition: "width 0.3s",
                }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                {count}/{m.capacity} • <b style={{ color: "var(--text)" }}>{pct}%</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorie */}
      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {byCategory.map(c => (
            <div key={c.k} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff",
              }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.count} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: CATEGORIE ──────────────────────────────────────────────────
const AdminCategoriesTab = ({ state, dispatch }) => {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const usageCount = (key) => state.tasks.filter(t => !t.deletedAt && t.category === key).length;

  const startEdit = (key, c) => { setEditingKey(key); setDraft({ key, ...c }); };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.label?.trim()) return;
    dispatch({ type: "UPDATE_CATEGORY", payload: draft });
    cancelEdit();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🏷️ <b>{Object.keys(state.categories).length}</b> categorie definite
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(state.categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
              padding: 14, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.bg, color: c.color, flexShrink: 0,
              }}>{isEditing ? draft.icon : c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 }}>
                    <input value={draft.label} onChange={e => setDraft({...draft, label: e.target.value})}
                      placeholder="Etichetta" style={fieldStyle} />
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})}
                      placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Chiave: <code>{key}</code> • {count} task usano questa categoria
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
                    <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={() => {
                      if (count > 0) {
                        alert(`Impossibile rimuovere: ${count} task usano questa categoria.`);
                        return;
                      }
                      if (window.confirm(`Rimuovere categoria "${c.label}"?`)) {
                        dispatch({ type: "REMOVE_CATEGORY", payload: key });
                      }
                    }} style={btnDanger}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddCategoryModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingKeys={Object.keys(state.categories)} />}
    </div>
  );
};

// AddCategoryModal → src/components/modals/AddCategoryModal.jsx (Step P Phase 2f)

// ─── ADMIN TAB: LOG ATTIVITÀ ───────────────────────────────────────────────
const AdminLogTab = ({ state, dispatch }) => {
  const [filter, setFilter] = useState("all");

  const groups = {
    all: () => state.activityLog,
    task: () => state.activityLog.filter(l => ["ADD_TASK","ADD_TASKS_BULK","UPDATE_TASK","MOVE_TASK","ADD_COMMENT"].includes(l.type)),
    trash: () => state.activityLog.filter(l => ["DELETE_TASK","RESTORE_TASK","PURGE_TASK","EMPTY_TRASH"].includes(l.type)),
    admin: () => state.activityLog.filter(l => l.type.includes("TEAM_MEMBER") || l.type.includes("CATEGORY") || l.type === "RESTORE_BACKUP"),
  };
  const list = groups[filter]();

  const iconFor = (type) => {
    if (type.includes("DELETE") || type.includes("PURGE") || type.includes("EMPTY")) return "🗑️";
    if (type.includes("RESTORE")) return "↻";
    if (type.includes("ADD_TASK")) return "➕";
    if (type.includes("UPDATE_TASK")) return "✏️";
    if (type === "MOVE_TASK") return "🔄";
    if (type === "ADD_COMMENT") return "💬";
    if (type.includes("TEAM")) return "👤";
    if (type.includes("CATEGORY")) return "🏷️";
    if (type.includes("BACKUP")) return "💾";
    return "•";
  };

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "all", label: "Tutte" },
            { id: "task", label: "Task" },
            { id: "trash", label: "Cestino" },
            { id: "admin", label: "Admin" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "#fff",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <button onClick={() => {
            if (window.confirm("Svuotare il log attività? Non è reversibile.")) {
              dispatch({ type: "CLEAR_ACTIVITY_LOG" });
            }
          }} style={btnDanger}>🔥 Svuota log</button>
        )}
      </div>

      <div style={cardStyle}>
        {list.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>Nessuna attività registrata{filter !== "all" ? " in questo filtro" : " ancora"}</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Le azioni effettuate appariranno qui (ultime 100)</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {list.map(l => (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
              }}>
                <div style={{ fontSize: 16, width: 24, textAlign: "center" }}>{iconFor(l.type)}</div>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{l.text}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatRel(l.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN: STILI CONDIVISI ────────────────────────────────────────────────
const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
const cardStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--navy)" };
const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
const fieldStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "var(--text)" };
const btnPrimary = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--navy)", background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGold = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--gold)", background: "var(--gold)", color: "var(--navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnDanger = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--danger)", background: "#fff", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnWarning = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--warning)", background: "#fff", color: "var(--warning)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 };
const modalCard = { background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };

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
