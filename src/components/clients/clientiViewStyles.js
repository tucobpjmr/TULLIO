// src/components/clients/clientiViewStyles.js
// Gli stili costanti di ClientiView.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const maxW1100 = { maxWidth: 1100, margin: "0 auto" };
export const rowCenterBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 };
export const rowCenterGap6 = {
  padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--navy)", cursor: "pointer",
  fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
};
export const rowCenterGap62 = {
  padding: "10px 18px", borderRadius: 9, border: "none",
  background: "var(--navy)", color: "#fff", cursor: "pointer",
  fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
};
export const mb20 = { marginBottom: 20 };
export const rowGap6Mt10 = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 };
export const rowCenterGap63 = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" };
export const txtMutedTxtCenter = { textAlign: "center", padding: "64px 24px", color: "var(--text-muted)" };
export const txtBoldMb6 = { fontWeight: 600, marginBottom: 6 };
export const colCenterGap6 = { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 18 };
export const boxF13Bold = {
  background: "var(--card)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: 10,
  padding: "10px 22px", cursor: "pointer",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
};
export const txtF115Muted = { fontSize: 11.5, color: "var(--text-muted)" };
export const txtF16Bold = { fontWeight: 700, fontSize: 16, color: "var(--heading)", marginBottom: 8 };
export const txtF14Muted = { fontSize: 14, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.5 };
export const mt8 = { marginTop: 8 };
export const txtF14Muted2 = { fontSize: 14, color: "var(--text-muted)", marginBottom: 20 };
export const rowGap10 = { display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" };
export const boxF14Muted = {
  padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)",
  cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
};
export const boxF14Bold = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
export const boxF14Bold2 = {
  padding: "8px 16px", borderRadius: 8, border: "none",
  background: "var(--danger)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
};
