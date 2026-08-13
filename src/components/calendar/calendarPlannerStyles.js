// src/components/calendar/calendarPlannerStyles.js
// Gli stili costanti di CalendarPlanner.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const rowCenterGap82 = {
  display: "flex", alignItems: "center", gap: 8,
  background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 10, padding: "8px 12px",
  fontSize: 12, color: "var(--text-muted)", fontWeight: 600,
};
export const boxW14H14 = { width: 14, height: 14, borderRadius: "50%" };
export const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
export const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", fontWeight: 500 };
export const rowCenterGap6 = { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" };
export const rowGap4P3 = { display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 };
export const boxF14W34 = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  width: 34, height: 34, cursor: "pointer", fontSize: 14
};
export const boxF12Bold = {
  background: "var(--gold)", color: "var(--navy)", border: "none",
  borderRadius: 8, padding: "0 14px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 700
};
export const boxF12Bold2 = {
  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600,
  color: "var(--heading)",
};
export const rowGap6MtNeg8 = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: -8 };
export const boxR14 = { background: "var(--card)", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" };
export const grid2 = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", background: "var(--navy)", padding: "10px 0" };
export const txtF12Bold = { textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", minWidth: 0 };
export const grid3 = { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };
export const rowMiddleGap3 = { display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" };
export const colGap2MinW0 = { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 };
export const txtF10Muted = { fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 };
export const txtF16Bold = { fontWeight: 600, fontSize: 16, marginBottom: 12 };
export const colGap8 = { display: "flex", flexDirection: "column", gap: 8 };
export const colGap4 = { padding: "8px 6px", display: "flex", flexDirection: "column", gap: 4, minHeight: 160 };
export const txtF16Bold2 = { fontSize: 16, fontWeight: 600, marginBottom: 14 };
export const overflowX2 = { overflowX: "auto" };
export const txtF12WFull = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
export const boxF11Bold = { textAlign: "left", padding: "8px 12px", background: "var(--surface2)", borderRadius: "8px 0 0 0", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", width: 150 };
export const boxF11Bold2 = { padding: "8px 6px", background: "var(--surface2)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderRadius: "0 8px 0 0" };
export const padding2 = { padding: "10px 12px", borderBottom: "1px solid var(--border)" };
export const txt = { fontWeight: 500 };
export const txtBoldHeading = { padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--heading)" };
