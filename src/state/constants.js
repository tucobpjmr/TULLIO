// ─── PRIORITY / STATUS ─────────────────────────────────────────────────────
export const PRIORITIES = {
  critical: { label: "Critico", color: "#C0392B", bg: "#FEE2E2" },
  high: { label: "Alto", color: "#C8832A", bg: "#FEF3C7" },
  medium: { label: "Medio", color: "#D4A843", bg: "#FFFBEB" },
  low: { label: "Basso", color: "#2D7A4F", bg: "#D1FAE5" },
};

export const STATUSES = ["todo", "inprogress", "awaiting_client", "awaiting_supplier", "done"];

export const STATUS_LABELS = {
  todo: "Da Fare",
  inprogress: "In Corso",
  awaiting_client: "Attesa Cliente",
  awaiting_supplier: "Attesa Fornitore",
  done: "Completato",
};

export const STATUS_COLORS = {
  todo: "#6B7280",
  inprogress: "#3B82F6",
  awaiting_client: "#F59E0B",
  awaiting_supplier: "#8B5CF6",
  done: "#2D7A4F",
};
