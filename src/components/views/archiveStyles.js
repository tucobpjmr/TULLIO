// src/components/views/archiveStyles.js
// Gli stili costanti di Archive.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const mb20 = { marginBottom: 20 };
export const rowGap8Mt12 = { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" };
export const txtF13Muted2 = { fontSize: 13, color: "var(--text-muted)", marginBottom: 20 };
export const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" };
export const boxF13MinW0 = {
  flex: "1 1 100%", minWidth: 0, padding: "8px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
};
export const rowCenterGap6 = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
export const txtF11Bold2 = { fontSize: 11, color: "var(--success)", fontWeight: 600 };
export const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" };
export const rowCenterGap10 = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
export const rowGap3 = { display: "flex", gap: 3 };
export const boxF12Bold = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
export const boxF12Bold2 = {
  background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
  padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
export const borderBottom2 = { borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "pointer" };
export const padding2 = { padding: "12px 16px" };
export const txtBoldHeading = { fontWeight: 600, color: "var(--heading)", marginBottom: 2 };
export const rowCenterGap62 = { display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" };
export const txtBoldSuccess = { color: "var(--success)", fontWeight: 600 };
export const padding3 = { padding: "12px 8px" };
