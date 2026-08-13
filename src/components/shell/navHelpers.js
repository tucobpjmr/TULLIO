// Helper puri condivisi da Sidebar.jsx e BottomNav.jsx (estratti da
// Sidebar.jsx — B-3 dell'audit del 13 agosto: un file, un componente — vedi
// docs/CLAUDE.md). Nessun cambiamento di comportamento.

// La Dashboard è raggiungibile dal logo aeroplano nella Topbar (la voce
// dedicata in sidebar/bottom-nav è stata rimossa per alleggerire la nav).
export const NAV_ITEMS = [
  { id: "calendar",   icon: "📅", label: "Calendario", roles: ["admin", "manager", "agent", "driver"] },
  { id: "clienti",    icon: "👤", label: "Clienti",    roles: ["admin", "manager", "agent"] },
  { id: "archivio",   icon: "📦", label: "Archivio",   roles: ["admin", "manager", "agent", "driver"] },
  { id: "trash",      icon: "🗑️", label: "Cestino",    roles: ["admin", "manager", "agent", "driver"] },
  { id: "admin",      icon: "⚙️", label: "Admin",      roles: ["admin"] },
];

// Filtra NAV_ITEMS in base al ruolo dell'utente loggato. Riceve il RUOLO già
// risolto (non l'userId) perché è una funzione pura di modulo: il lookup del
// ruolo richiede il team, che i componenti prendono da useAppData().
export const getNavItemsForRole = (role) =>
  NAV_ITEMS.filter(it => !it.roles || it.roles.includes(role));

// Calcola i contatori per i badge sidebar/bottom-nav (Step F).
// Il badge Dashboard (coda + urgenze) è migrato sul logo aeroplano in Topbar
// insieme alla voce; qui resta solo il badge "pending" della voce Admin.
//
// Riceve `team` e non `state` (ST-2): era l'unico campo che leggeva, ed è già
// in AppDataContext — chiederlo come state costringeva i due componenti a
// ricevere l'intero stato dell'app per contare gli utenti in attesa.
export function getNavBadges(team) {
  const pending = (team || []).filter(m => m.pending).length;
  return { admin: pending };
}
