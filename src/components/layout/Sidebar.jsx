// ─── SIDEBAR ───────────────────────────────────────────────────────────────
import React from "react";
import { useViewport } from "../../contexts/ViewportContext.jsx";
import { getAssignableTeam } from "../../utils/helpers.js";
import { getNavItemsForUser } from "../../utils/permissions.js";

const Sidebar = ({ state, dispatch }) => {
  const { isDesktop } = useViewport();
  if (!isDesktop) return null;
  const col = state.sidebarCollapsed;
  const navItems = getNavItemsForUser(state.currentUserId);
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
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
              {!col && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
            </button>
          );
        })}
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

export default Sidebar;
