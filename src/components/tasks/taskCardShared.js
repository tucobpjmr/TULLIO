// Helper puri condivisi da TaskCard.jsx, TaskRow.jsx e CategoryPill.jsx
// (estratti da TaskCard.jsx — B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.

// Fallback per una categoria non più presente nel dizionario (categoria
// eliminata dall'admin mentre dei task la usavano ancora): senza, l'accesso a
// `.icon`/`.label` esploderebbe. Era ripetuto verbatim in ogni call site.
// Funzione pura (dizionario esplicito): i componenti la chiamano passando
// `categories` dal contesto app.
export const catMeta = (categories, category) =>
  (categories || {})[category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: category };
