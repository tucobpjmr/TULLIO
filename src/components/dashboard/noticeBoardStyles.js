// src/components/dashboard/noticeBoardStyles.js
// Gli stili costanti di NoticeBoard.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
import * as stiliComuni from "../../styles/common.js";
export const rowCenterBetween = stiliComuni.rowCenterBetween;
export const rowCenterMiddle = {
  width: 34, height: 34, borderRadius: 8,
  background: "var(--navy)", color: "var(--gold)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 18,
};
export const txtF17Bold = { fontSize: 17, fontWeight: 700, color: "var(--heading)" };
export const rowCenterGap5 = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  fontSize: 12, fontWeight: 700, fontFamily: "inherit",
  display: "flex", alignItems: "center", gap: 5,
  boxShadow: "0 2px 8px rgba(15,32,68,0.3)",
};
export const rowCenterGap6 = {
  display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
  marginBottom: 14, padding: "0 2px",
};
export const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "#8b6f3a", textTransform: "uppercase", letterSpacing: 1, marginRight: 2 };
export const boxF11Bold = {
  background: "none", border: "none", color: "#8b6f3a",
  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  marginLeft: 4, textDecoration: "underline",
};
export const padding2 = { padding: "6px 4px" };
export const txtF13TxtCenter = {
  padding: "30px 20px", textAlign: "center", color: "#8b6f3a",
  fontSize: 13, fontStyle: "italic",
};
export const gridGap16 = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
  gap: 16, padding: "6px 4px",
};
export const txtAbsoluteF18 = {
  position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
  fontSize: 18, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
};
export const rowAbsoluteGap2 = {
  position: "absolute", top: 6, right: 6,
  display: "flex", gap: 2, opacity: 0.6,
};
export const boxF16R4 = {
  background: "none", border: "none", padding: "2px 4px",
  cursor: "pointer", fontSize: 16, lineHeight: 1,
  borderRadius: 4,
};
export const txtFlex1F13 = {
  fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
  whiteSpace: "pre-wrap", wordBreak: "break-word",
  flex: 1, marginTop: 10, marginRight: 50,
};
export const rowGap4Mt8 = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 };
export const rowCenterGap62 = {
  marginTop: 10, paddingTop: 8,
  borderTop: "1px dashed rgba(61,47,16,0.2)",
  display: "flex", alignItems: "center", gap: 6,
  fontSize: 10, color: "#5d4920",
};
export const txtBold = { fontWeight: 600 };
export const marginLeft2 = { marginLeft: "auto" };
