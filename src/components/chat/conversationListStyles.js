// src/components/chat/conversationListStyles.js
// Gli stili costanti di ConversationList.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
import * as stiliComuni from "../../styles/common.js";
export const colHFull = { display: "flex", flexDirection: "column", height: "100%" };
export const padding2 = { padding: "12px 14px", borderBottom: "1px solid var(--border)" };
export const txtAbsoluteF13 = { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 };
export const boxF13WFull = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
  padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
  outline: "none", background: "var(--surface)",
};
export const rowGap6Mt10 = { display: "flex", gap: 6, marginTop: 10 };
export const flex1 = stiliComuni.areaScorrevole;
export const relative2 = { position: "relative", flexShrink: 0 };
export const rowCenterMiddle = {
  width: 42, height: 42, borderRadius: "50%", background: "var(--gold)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 20, flexShrink: 0,
};
export const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 };
export const rowCenterFlex1 = { display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 };
export const txtF10Gold = { fontSize: 10, color: "var(--gold)" };
export const txtF10Muted = { fontSize: 10, color: "var(--text-muted)", flexShrink: 0 };
export const rowCenterBetween2 = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 };
export const rowCenterGap1 = {
  display: "flex", alignItems: "center", gap: 1,
  fontSize: 10, color: "var(--gold)", fontWeight: 700, flexShrink: 0,
};
export const boxF10Bold = {
  background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
  borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0,
};
export const boxF14Muted = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 14, color: "var(--text-muted)", padding: "6px 4px",
  borderRadius: 6, flexShrink: 0, opacity: 0.65,
};
// Era una copia locale di quella che oggi sta in common.js come
// `statoVuotoCentrato` (promossa lì da A-2 dell'audit sicurezza del 26
// agosto, quando una terza copia l'ha resa visibile al controllo).
export const txtMutedTxtCenter = stiliComuni.statoVuotoCentrato;
export const txtF40Mb8 = { fontSize: 40, marginBottom: 8 };
export const rowCenterMiddle2 = {
  margin: 14, padding: "10px", background: "var(--navy)", color: "#fff",
  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
};
