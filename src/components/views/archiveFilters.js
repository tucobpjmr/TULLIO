// src/components/views/archiveFilters.js
// Filtro per periodo e chip di selezione, condivisi dall'archivio task e
// dall'archivio liste viaggio: due viste diverse, la stessa domanda
// ("mostrami solo l'ultimo mese") e finora due copie della stessa logica.
export const PERIOD_OPTIONS = [
  { key: "all",       label: "Sempre" },
  { key: "week",      label: "Ultimi 7 gg" },
  { key: "month",     label: "Questo mese" },
  { key: "lastMonth", label: "Mese scorso" },
];

// Filtra elementi per una data (completamento task o chiusura lista). Gli
// elementi senza quella data (completati prima dell'introduzione del campo)
// restano fuori dai filtri temporali ma compaiono in "Sempre".
export const filterByPeriod = (items, period, dateField) => {
  if (period === "all") return items;
  const now = new Date();
  return items.filter(it => {
    if (!it[dateField]) return false;
    const d = new Date(it[dateField]);
    if (period === "week") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === "lastMonth") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= start && d < end;
    }
    return true;
  });
};

export const thStyle = (align, padX = "8px") => ({
  padding: `12px ${padX}`, textAlign: align, fontSize: 11, fontWeight: 700,
  color: "var(--text-muted)", letterSpacing: 0.5,
});

export const chipStyle = (active) => ({
  padding: "5px 12px", borderRadius: 999, cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--card)",
  color: active ? "#fff" : "var(--text-muted)",
  transition: "background 0.15s, color 0.15s",
});
