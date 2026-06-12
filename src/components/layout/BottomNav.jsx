import { getNavItemsForUser, getNavBadges } from "../../state/navigation.js";
import { NavBadge } from "./NavBadge.jsx";

export const BottomNav = ({ state, dispatch }) => {
  const navItems = getNavItemsForUser(state.currentUserId, state.team);
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
    </nav>
  );
};
