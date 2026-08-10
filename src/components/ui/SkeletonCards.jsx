// Placeholder "shimmer" per le griglie di card durante l'idratazione iniziale
// da Supabase. Usa la classe `.skeleton` (animazione pulse definita in
// FontLoader). Layout generico a card: va bene per le viste CRM
// (Clienti/Fornitori/Pratiche), per le code della Dashboard e per gli elenchi
// di task di Archivio e Cestino, che hanno card di forma simile.
//
// `minWidth` allinea la griglia a quella della lista che sta sostituendo — le
// code usano 280px, il CRM 340px — così il salto quando i dati arrivano è di
// contenuto e non di layout. `compact` toglie il blocco avatar: le card dei
// task non ne hanno uno, e uno scheletro che promette un cerchio inesistente è
// esso stesso una piccola bugia.
import { useViewport } from "../Viewport.jsx";

export function SkeletonCards({ count = 6, minWidth = 340, compact = false, label = "Caricamento in corso" }) {
  const { isMobile } = useViewport();
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: compact ? 10 : 14,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: "var(--card)", borderRadius: 12,
          padding: compact ? "13px 15px" : "16px 18px",
          border: "1px solid var(--border)",
        }}>
          {!compact && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div className="skeleton" style={{ width: 34, height: 34, borderRadius: "50%" }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 4, marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 10, width: "35%", borderRadius: 4 }} />
              </div>
            </div>
          )}
          {compact && (
            <div className="skeleton" style={{ height: 12, width: "70%", borderRadius: 4, marginBottom: 10 }} />
          )}
          <div className="skeleton" style={{ height: 10, width: "80%", borderRadius: 4, marginBottom: 6 }} />
          <div className="skeleton" style={{ height: 10, width: "60%", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
