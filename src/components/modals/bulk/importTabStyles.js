// src/components/modals/bulk/importTabStyles.js
// Gli stili costanti di ImportTab.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const boxTxtCenterR12 = {
  border: "2px dashed var(--border)", borderRadius: 12,
  padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
  transition: "all 0.15s",
};
export const txtF40Mb10 = { fontSize: 40, marginBottom: 10 };
export const txtF14Bold = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
export const boxF12Bold = {
  marginTop: 14, background: "transparent", border: "1px solid var(--border)",
  borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
  color: "var(--navy)", fontFamily: "inherit",
};
export const boxF13Danger = { background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 };
export const boxF12Warning = { background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)", color: "var(--warning)", padding: "12px 14px", borderRadius: 10, fontSize: 12, lineHeight: 1.6 };
export const txtBoldMb2 = { fontWeight: 700, marginBottom: 2 };
export const mt4Op085 = { marginTop: 4, opacity: 0.85 };
export const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" };
export const rowCenterBetween3 = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 };
export const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 };
export const rowCenterGap5 = { fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 };
export const boxW8H8 = { width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" };
export const gridGap8 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 };
export const txtF10Bold3 = { fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
export const txtSuccess = { color: "var(--success)", marginLeft: 4 };
export const boxR8 = { maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 };
export const txt = { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
export const rowGap8F10 = { fontSize: 10, color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 };
export const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", marginTop: 6 };
export const boxR82 = { overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto" };
export const txtF11WFull = { width: "100%", borderCollapse: "collapse", fontSize: 11 };
export const boxStickyBold = { padding: "8px 10px", background: "var(--surface2)", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", position: "sticky", top: 0 };
export const maxW180 = { padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" };
