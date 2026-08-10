// Variante a RIGHE dello scheletro di caricamento, per i pannelli che elencano
// voci in colonna invece che una griglia di card: "Scadenze Prossime" e
// "Carico di Lavoro Team" nella Dashboard.
//
// Sta in un file suo e non dentro SkeletonCards.jsx perché è un secondo
// componente con un layout diverso, non una variante del primo (vedi
// docs/CLAUDE.md, "Un file, una responsabilità").
export function SkeletonRows({ count = 4, avatar = true, label = "Caricamento in corso" }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {avatar && (
            <div className="skeleton" style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="skeleton" style={{ height: 11, width: "60%", borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 9, width: "35%", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
