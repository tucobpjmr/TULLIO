// src/components/tasks/taskSlideOverStyles.js
// Gli stili costanti di TaskSlideOver.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const rowStartBetween = {
  background: "var(--navy)", padding: "calc(18px + var(--safe-top)) 22px 18px",
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0
};
export const rowGap8Mb8 = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 };
export const boxF11Bold = { fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 };
export const boxF18Bold = {
  color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3,
  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 6, padding: "4px 8px", width: "100%", fontFamily: "inherit", outline: "none",
};
export const txtF18Bold = { color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 };
export const boxF13White = {
  background: "rgba(220,38,38,0.15)", border: "none", color: "#fff",
  width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
  transition: "background 0.2s"
};
export const colFlex1Gap20 = {
  flex: 1, minHeight: 0, overflowY: "auto",
  WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
  // padding-bottom con safe-area: l'ultimo elemento (box commento) resta
  // sopra l'home-indicator / la toolbar inferiore di Safari/Chrome iOS.
  padding: "20px 22px",
  paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
  display: "flex", flexDirection: "column", gap: 20,
};
export const boxF13R8 = { fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" };
export const txtF11Bold = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 };
export const rowCenterGap6 = { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" };
export const rowCenterGap5 = { display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", padding: "4px 8px", borderRadius: 99 };
export const txtF12 = { fontSize: 12 };
export const boxF12Muted = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-muted)", fontSize: 12, lineHeight: 1, padding: 0,
  marginLeft: 2,
};
export const rowCenterGap8 = {
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: "6px 8px", borderRadius: 6, border: "none",
  background: "transparent", cursor: "pointer", fontSize: 13,
  fontFamily: "inherit", color: "var(--text)", textAlign: "left",
};
export const boxF13Text = { fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 };
export const txtF11Bold2 = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 };
export const rowGap10 = { display: "flex", gap: 10 };
export const rowCenterMiddle = {
  width: 28, height: 28, borderRadius: "50%", background: "var(--navy)",
  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
  justifyContent: "center", color: "#fff", flexShrink: 0
};
export const rowGap8 = { display: "flex", gap: 8, alignItems: "baseline" };
export const txtF12Bold = { fontSize: 12, fontWeight: 600 };
export const txtF13Text = { fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.5 };
export const rowGap8Mt6 = { display: "flex", gap: 8, marginTop: 6 };
export const rowCenterMiddle2 = {
  width: 28, height: 28, borderRadius: "50%", background: "var(--gold)",
  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
  justifyContent: "center", color: "var(--navy)", flexShrink: 0
};
export const rowFlex1Gap6 = { flex: 1, display: "flex", gap: 6 };
export const boxFlex1F12 = {
  flex: 1, border: "1px solid var(--border)", borderRadius: 8,
  padding: "7px 10px", fontSize: 12, fontFamily: "inherit"
};
export const boxF13White2 = {
  background: "var(--navy)", color: "#fff", border: "none",
  borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13
};
export const colGap8 = { display: "flex", flexDirection: "column", gap: 8 };
export const rowStartGap10 = { display: "flex", gap: 10, alignItems: "flex-start" };
export const txtF14TxtCenter = { width: 28, textAlign: "center", fontSize: 14, flexShrink: 0 };
export const rowGap82 = { display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" };
export const txtF12Light = { fontSize: 12, color: "var(--text-light)" };
