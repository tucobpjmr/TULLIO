// ─── SIDEBAR / BOTTOM NAV ────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f). NAV_ITEMS/getNavItemsForUser/
// getNavBadges + NavBadge (module-local) + Sidebar e BottomNav (esportati).
import { useEffect, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { CURRENT_USER, getAssignableTeam, getRoleType } from "../../state/appGlobals.js";

const NAV_ITEMS = [
  { id: "dashboard",  icon: "📊", label: "Dashboard",  roles: ["admin", "manager", "agent", "driver"] },
  { id: "calendar",   icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "clienti",    icon: "👤", label: "Clienti",    roles: ["admin", "manager", "agent"] },
  { id: "fornitori",  icon: "🤝", label: "Fornitori",  roles: ["admin", "manager", "agent"] },
  { id: "pratiche",   icon: "📁", label: "Pratiche",   roles: ["admin", "manager", "agent"] },
  { id: "team",       icon: "👥", label: "Team",       roles: ["admin", "manager", "agent"] },
  { id: "trash",      icon: "🗑️", label: "Cestino",    roles: ["admin", "manager", "agent", "driver"] },
  { id: "admin",      icon: "⚙️", label: "Admin",      roles: ["admin"] },
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
  // Badge pratiche: partenze nei prossimi 7 giorni (status attivo)
  const now = Date.now();
  const in7d = now + 7 * 24 * 60 * 60 * 1000;
  const imminentDossiers = (state.dossiers || []).filter(d => {
    if (!d.departureDate || d.status === "completata" || d.status === "annullata") return false;
    const ts = new Date(d.departureDate).getTime();
    return ts >= now && ts <= in7d;
  }).length;
  return { admin: pending, dashboard: queue, pratiche: imminentDossiers };
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

export const Sidebar = ({ state, dispatch, onOpenBulk }) => {
  const { isDesktop, width } = useViewport();
  // Auto-collassa la sidebar nella fascia "desktop stretto" (1025–1280px) dove
  // 210px di nav rubano troppo spazio orizzontale; si ri-espande sopra i 1280px.
  // Guardia per banda: agisce solo sulle transizioni, così il toggle manuale
  // dentro la stessa banda non viene contrastato.
  const prevBandRef = useRef(null);
  useEffect(() => {
    if (!isDesktop) { prevBandRef.current = null; return; }
    const band = width <= 1280 ? "narrow" : "wide";
    const prev = prevBandRef.current;
    prevBandRef.current = band;
    if (prev === band) return;
    if (band === "narrow" && !state.sidebarCollapsed) {
      dispatch({ type: "TOGGLE_SIDEBAR" });
    } else if (band === "wide" && prev !== null && state.sidebarCollapsed) {
      dispatch({ type: "TOGGLE_SIDEBAR" });
    }
  }, [width, isDesktop, state.sidebarCollapsed, dispatch]);
  if (!isDesktop) return null;
  const col = state.sidebarCollapsed;
  const navItems = getNavItemsForUser(state.currentUserId);
  const badges = getNavBadges(state);
  return (
    <div style={{
      width: col ? 60 : 210, background: "var(--sky)", color: "var(--navy)",
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease", flexShrink: 0,
      borderRight: "1px solid rgba(212,168,67,0.3)", position: "relative",
    }}>
      <button onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })} style={{
        position: "absolute", top: 12, right: col ? "50%" : 8,
        transform: col ? "translateX(50%)" : "none",
        background: "rgba(15,32,68,0.07)", border: "1px solid rgba(15,32,68,0.12)",
        borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: "rgba(15,32,68,0.5)",
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
              color: active ? "var(--navy)" : "rgba(15,32,68,0.6)",
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
        <div style={{ marginTop: "auto", padding: "16px 12px", borderTop: "1px solid rgba(15,32,68,0.12)" }}>
          <div style={{ fontSize: 10, color: "rgba(15,32,68,0.45)", letterSpacing: 1, marginBottom: 8 }}>TEAM ONLINE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {getAssignableTeam().slice(0, 4).map(m => (
              <div key={m.id} title={m.name} style={{
                width: 26, height: 26, borderRadius: "50%", background: m.color,
                fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", border: "2px solid var(--sky)",
                position: "relative"
              }}>
                {m.avatar}
                <div style={{ position: "absolute", bottom: 0, right: 0, width: 7, height: 7, borderRadius: "50%", background: "#2D7A4F", border: "1px solid var(--sky)" }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── BOTTOM NAV (mobile/tablet) ────────────────────────────────────────────
export const BottomNav = ({ state, dispatch, onOpenBulk }) => {
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
              color: active ? "var(--navy)" : "rgba(15,32,68,0.55)",
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
          color: "var(--navy)", borderTop: "2px solid transparent",
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
