// Placeholder "shimmer" per le liste CRM (Clienti/Fornitori/Pratiche) durante
// l'idratazione iniziale da Supabase. Usa la classe `.skeleton` (animazione
// pulse definita in FontLoader). Layout generico a card: va bene per tutte e
// tre le viste, che hanno card di forma simile.
import { useViewport } from "../Viewport.jsx";

export function SkeletonCards({ count = 6 }) {
  const { isMobile } = useViewport();
  return (
    <div
      aria-busy="true"
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))",
        gap: 14,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: "#fff", borderRadius: 12, padding: "16px 18px",
          border: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <div className="skeleton" style={{ width: 34, height: 34, borderRadius: "50%" }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4, marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 10, width: "35%", borderRadius: 4 }} />
            </div>
          </div>
          <div className="skeleton" style={{ height: 10, width: "80%", borderRadius: 4, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 10, width: "60%", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
