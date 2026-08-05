// src/components/ui/LazyFallback.jsx
// ─── LAZY FALLBACK ─────────────────────────────────────────────────────────
// Spinner mostrato mentre un chunk lazy (Step P Phase 2g: AdminView,
// BulkTaskCreator, TaskSlideOver) viene scaricato. `overlay` lo centra a tutto
// schermo per i modali; altrimenti riempie l'area della vista.
export const LazyFallback = ({ overlay = false }) => {
  const ring = (size, track, top) => (
    <div style={{
      width: size, height: size,
      border: `3px solid ${track}`, borderTopColor: top,
      borderRadius: "50%", animation: "spin 0.8s linear infinite",
    }} />
  );
  if (overlay) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,21,45,0.35)",
      }}>
        {ring(40, "rgba(255,255,255,0.3)", "var(--gold)")}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      {ring(34, "var(--surface3)", "var(--gold)")}
    </div>
  );
};
