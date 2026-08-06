// ─── Conferma generica (distruttiva o meno) ────────────────────────────────
// Estratta dal dettaglio lista (chiusura/cestinazione/eliminazione movimento)
// per essere riusata anche dall'eliminazione definitiva dal cestino e dal
// reset totale: stessa impalcatura, tre proprietà diverse.
export function ConfirmModal({ title, body, cta = "Conferma", danger = false, onCancel, onConfirm }) {
  return (
    <div className="lv-overlay" onClick={onCancel}>
      <div className="lv-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p style={{ fontSize: 14, color: "var(--lv-muted)" }}>{body}</p>
        <div className="actions">
          <button className="lv-btn" onClick={onCancel}>Annulla</button>
          <button className={`lv-btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>{cta}</button>
        </div>
      </div>
    </div>
  );
}
