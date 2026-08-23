// src/components/search/advancedSearchPanelStyles.js
// Gli stili costanti di AdvancedSearchPanel.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
import * as stiliComuni from "../../styles/common.js";
export const rowCenterBetween = {
  padding: "14px 18px", borderBottom: "1px solid var(--border)",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  background: "#fff",
};
export const txtF15Bold = { fontSize: 15, fontWeight: 700, color: "var(--navy)" };
export const boxF12Muted = {
  background: "transparent", border: "1px solid var(--border)",
  borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "var(--text-muted)",
  cursor: "pointer", fontWeight: 500,
};
export const boxF18Muted = {
  background: "transparent", border: "none", fontSize: 18,
  cursor: "pointer", color: "var(--text-muted)", lineHeight: 1,
};
export const boxFlex1 = { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", background: "var(--surface)" };
export const padding2 = { padding: "16px 18px", borderBottom: "1px solid var(--border)" };
export const rowCenterGap10 = stiliComuni.rowCenterGap10;
export const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 };
export const boxF12WFull = {
  width: "100%", padding: "7px 10px", borderRadius: 6,
  border: "1px solid var(--border)", fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};
export const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "var(--text)" };
export const box2 = { background: "#fff" };
export const txtF13Muted = { padding: "32px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 };
export const boxStickyF11 = {
  padding: "8px 18px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: 1, background: "var(--surface2)",
  borderBottom: "1px solid var(--border)", position: "sticky", top: 0,
};
export const txtF13Bold = {
  fontSize: 13, fontWeight: 600, color: "var(--text)",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
export const txtDanger = { color: "var(--danger)", marginRight: 6 };
export const rowGap10F11 = { fontSize: 11, color: "var(--text-muted)", marginTop: 2, display: "flex", gap: 10 };
export const txtBoldNavyLight = { color: "var(--navy-light)", fontWeight: 600 };
export const row = { display: "flex", marginLeft: 4 };
export const rowCenterMiddle = {
  width: 28, height: 28, borderRadius: 6,
  background: "#F9FAFB", color: "#6B7280",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 14, flexShrink: 0,
};
