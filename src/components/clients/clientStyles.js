// src/components/clients/clientStyles.js
// Stili e form vuoto condivisi dalla modale cliente e dal pannello di dettaglio.
export const EMPTY_FORM = { name: "", email: "", phone: "", address: "", city: "", notes: "" };

export const fieldStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--card)",
  fontSize: 14, color: "var(--text)", outline: "none",
  fontFamily: "inherit",
};
export const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };

// Riquadro d'avviso (ambra) riusato dalla modale di modifica: dice che cosa
// tocca una modifica prima che venga salvata, non dopo.
export const noticeStyle = {
  background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)",
  borderRadius: 10, padding: "10px 12px", fontSize: 12.5,
  color: "var(--text)", lineHeight: 1.45,
};
