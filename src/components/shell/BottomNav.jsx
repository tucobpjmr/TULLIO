// Estratto da Sidebar.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// ─── BOTTOM NAV (mobile/tablet) ────────────────────────────────────────────
// Stessa correzione di Sidebar (ST-2): una fetta sola invece di `state`, memo.
import { memo } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import { getNavItemsForRole, getNavBadges } from "./navHelpers.js";
import { NavBadge } from "./NavBadge.jsx";

export const BottomNav = memo(function BottomNav({ activeView, dispatch, onOpenBulk, onOpenChat, unreadChat = 0 }) {
  const { team, getRoleType, currentUserId } = useAppData();
  const navItems = getNavItemsForRole(getRoleType(currentUserId));
  const badges = getNavBadges(team);
  return (
    <nav className="vd-bottom-nav" aria-label="Navigazione principale">
      {navItems.map(item => {
        const active = activeView === item.id;
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
              color: active ? "var(--navy)" : "rgba(15,32,68,0.75)",
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

      {/* Chat team (spostata dalla Topbar) */}
      <button
        onClick={onOpenChat}
        aria-label="Messaggi team"
        style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 3, padding: "6px 2px",
          background: "transparent", border: "none", cursor: "pointer",
          color: "rgba(15,32,68,0.75)", borderTop: "2px solid transparent",
          transition: "color 0.2s", position: "relative",
        }}
      >
        <span style={{ fontSize: 19, lineHeight: 1, position: "relative" }}>
          💬
          <NavBadge count={unreadChat} mobile />
        </span>
        <span style={{ fontSize: 9, fontWeight: 500, whiteSpace: "nowrap" }}>Chat</span>
      </button>

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
});
