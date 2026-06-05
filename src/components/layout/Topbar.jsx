import { useState } from "react";
import { useViewport } from "../../hooks/useViewport.jsx";
import { NOTIFICATIONS } from "../../data/mockData.js";
import AdvancedSearchPanel from "../search/AdvancedSearchPanel.jsx";
import NotificationsPanel from "../NotificationsPanel.jsx";
import UserSwitcher from "../ProfileEditor.jsx";

// ─── TOPBAR ────────────────────────────────────────────────────────────────
const Topbar = ({ state, dispatch, onOpenChat, unreadChat }) => {
  const { isMobile } = useViewport();
  const unread = NOTIFICATIONS.filter(n => !n.read).length;
  const [advOpen, setAdvOpen] = useState(false);
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

      {/* Search + Advanced */}
      <div style={{ flex: 1, maxWidth: 520, position: "relative", display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>🔍</div>
          <input
            value={state.searchQuery}
            onChange={e => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            style={{
              width: "100%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "7px 12px 7px 36px", color: "#fff", fontSize: 13,
              outline: "none", transition: "all 0.2s", boxSizing: "border-box",
            }}
            onFocus={e => { e.target.style.background = "rgba(255,255,255,0.13)"; e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.background = "rgba(255,255,255,0.08)"; e.target.style.borderColor = "rgba(255,255,255,0.15)"; }}
          />
        </div>
        <button
          onClick={() => setAdvOpen(o => !o)}
          title="Ricerca avanzata"
          aria-label="Apri ricerca avanzata"
          style={{
            background: advOpen ? "var(--gold)" : "rgba(255,255,255,0.08)",
            border: `1px solid ${advOpen ? "var(--gold)" : "rgba(255,255,255,0.15)"}`,
            borderRadius: 8, width: 36, height: 34, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, flexShrink: 0, transition: "all 0.2s",
          }}
        >🎛️</button>
        {advOpen && (
          <AdvancedSearchPanel
            tasks={state.tasks}
            dispatch={dispatch}
            onClose={() => setAdvOpen(false)}
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
        {state.showNotif && <NotificationsPanel dispatch={dispatch} />}
      </div>

      {/* User switcher (v0.8) */}
      <UserSwitcher state={state} dispatch={dispatch} />
    </div>
  );
};

export default Topbar;
