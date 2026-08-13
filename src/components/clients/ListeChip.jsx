// Estratto da ClienteCard.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
export function ListeChip({ liste }) {
  const n = liste?.totali || 0;
  if (!n) return null;
  const attive = liste.attive || 0;
  return (
    <span
      title={attive < n ? `${attive} attive, ${n - attive} nel cestino` : undefined}
      style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2,
        color: "var(--gold-dark)", background: "rgba(212,168,67,0.14)",
        border: "1px solid rgba(212,168,67,0.35)",
        borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
      }}
    >
      🧾 {n} {n === 1 ? "lista viaggio" : "liste viaggio"}
    </span>
  );
}
