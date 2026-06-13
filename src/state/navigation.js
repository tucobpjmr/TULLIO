import { getRoleType } from "./permissions.js";

// ─── NAV (sidebar + bottom nav) ────────────────────────────────────────────
export const NAV_ITEMS = [
  { id: "dashboard", icon: "📊", label: "Dashboard", roles: ["admin", "manager", "agent", "driver"] },
  { id: "calendar", icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "team", icon: "👥", label: "Team", roles: ["admin", "manager", "agent"] },
  { id: "trash", icon: "🗑️", label: "Cestino", roles: ["admin"] },
  { id: "admin", icon: "⚙️", label: "Admin", roles: ["admin"] },
];

// Filtra NAV_ITEMS in base al ruolo dell'utente loggato
export const getNavItemsForUser = (userId, team) => {
  const role = getRoleType(userId, team);
  return NAV_ITEMS.filter(it => !it.roles || it.roles.includes(role));
};

// Calcola i contatori per i badge sidebar/bottom-nav (Step F).
export function getNavBadges(state) {
  const pending = (state.team || []).filter(m => m.pending).length;
  const queue = (state.tasks || []).filter(
    t => !t.deletedAt && (!Array.isArray(t.assignees) || t.assignees.length === 0)
  ).length;
  return { admin: pending, dashboard: queue };
}
