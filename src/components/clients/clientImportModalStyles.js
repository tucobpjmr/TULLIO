// src/components/clients/clientImportModalStyles.js
// Gli stili costanti di ClientImportModal.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const rowCenterBetween = {
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
  padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
};
export const rowCenterMiddle = { width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 };
export const txtF17Bold = { color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 };
export const txtF10Mt2 = { color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 };
export const boxF14White = { background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 };
export const colFlex1Gap14 = { flex: 1, overflowY: "auto", padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 };
export const boxTxtCenterR12 = {
  border: "2px dashed var(--border)", borderRadius: 12,
  padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
  transition: "all 0.15s",
};
export const txtF40Mb10 = { fontSize: 40, marginBottom: 10 };
export const txtF14Bold = { fontSize: 14, fontWeight: 600, marginBottom: 4 };
export const boxF13Danger = { background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 };
export const rowCenterBetween2 = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px", flexWrap: "wrap", gap: 8 };
export const rowCenterBetween3 = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 };
export const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 };
export const rowCenterGap5 = { fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 };
export const boxW8H8 = { width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" };
export const txtF10Bold2 = { fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 };
export const txtSuccess = { color: "var(--success)", marginLeft: 4 };
export const rowStartGap8 = { display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", borderRadius: 8, padding: "10px 12px", cursor: "pointer" };
export const mt2 = { marginTop: 2, cursor: "pointer" };
export const txtText = { color: "var(--text)" };
export const boxF125Warning = { background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)", color: "var(--warning)", padding: "10px 14px", borderRadius: 10, fontSize: 12.5 };
export const rowCenterBetween4 = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 };
export const rowGap6 = { display: "flex", gap: 6 };
export const txtF115Bold = { fontSize: 11.5, color: "var(--warning)", fontWeight: 600, marginBottom: 8 };
export const boxR8 = { maxHeight: 280, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 };
export const txtF125Muted = { padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 };
export const cursor2 = { cursor: "pointer" };
export const rowCenterGap6 = { fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 };
export const boxF95Bold = { fontSize: 9.5, fontWeight: 700, color: "var(--warning)", background: "rgba(200,131,42,0.12)", borderRadius: 999, padding: "1px 6px" };
export const txtF105Muted = { fontSize: 10.5, color: "var(--text-muted)" };
export const rowCenterBetween5 = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 22px", borderTop: "1px solid var(--border)", flexShrink: 0 };
