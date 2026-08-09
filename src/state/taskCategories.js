// src/state/taskCategories.js
// Valore iniziale di state.categories, prima che SET_CATEGORIES idrati dal
// database (src/hooks/useAppHydration.js). A differenza del resto di
// mockData.js questo NON è un dato demo: serve incondizionatamente, anche in
// produzione con login reale, come valore di partenza di makeInitialState —
// per questo vive in un modulo proprio invece che tra i mock, e resta nel
// bundle di produzione a differenza di mockData.js (vedi state/demoState.js).
export const INITIAL_CATEGORIES = {
  booking:     { label: "Booking",               icon: "✈️",  color: "#3B82F6", bg: "#EFF6FF" },
  itinerary:   { label: "Preventivo",            icon: "📝",  color: "#F97316", bg: "#FFF7ED" },
  visa:        { label: "Visa & Doc.",           icon: "🛂",  color: "#EF4444", bg: "#FEF2F2" },
  client:      { label: "Scadenza OPT",          icon: "⏳",  color: "#06B6D4", bg: "#ECFEFF" },
  payment:     { label: "Pagamenti & Fornitori", icon: "💰",  color: "#F59E0B", bg: "#FFFBEB" },
  marketing:   { label: "Marketing",             icon: "📣",  color: "#EC4899", bg: "#FDF2F8" },
  admin:       { label: "Check-in",              icon: "✅",  color: "#6B7280", bg: "#F9FAFB" },
  appointment: { label: "Appuntamento",          icon: "📅",  color: "#6366F1", bg: "#EEF2FF" },
  transfer:    { label: "Transfer",              icon: "🚐",  color: "#7B4F9E", bg: "#F3F0F9" },
};
