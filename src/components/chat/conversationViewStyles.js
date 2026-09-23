// src/components/chat/conversationViewStyles.js
// Gli stili costanti di ConversationView.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
import * as stiliComuni from "../../styles/common.js";
export const colHFull = { display: "flex", flexDirection: "column", height: "100%", background: "var(--surface2)" };
export const rowCenterGap10 = {
  ...stiliComuni.testataBarra, padding: "12px 16px", display: "flex",
  alignItems: "center", gap: 10, flexShrink: 0,
};
export const rowCenterMiddle = {
  width: 36, height: 36, borderRadius: "50%", background: "var(--gold)",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 18, flexShrink: 0,
};
export const txtF14Bold = { color: "var(--heading)", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
export const txtF11 = stiliComuni.txtF11Muted;
export const txtGoldLight = { color: "var(--gold-dark)" };
export const animation2 = { animation: "typing 1s infinite", animationDelay: "0s", display: "inline-block" };
export const animation3 = { animation: "typing 1s infinite", animationDelay: "0.2s", display: "inline-block" };
export const animation4 = { animation: "typing 1s infinite", animationDelay: "0.4s", display: "inline-block" };
export const rowCenterGap5 = { display: "inline-flex", alignItems: "center", gap: 5 };
export const boxF13White = {
  background: "var(--card)", border: "1px solid var(--border)", color: "var(--heading)",
  width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
};
export const rowCenterGap8 = {
  ...stiliComuni.testataBarra, padding: "8px 12px",
  display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
};
export const boxFlex1F12 = {
  flex: 1, background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--heading)",
  outline: "none", fontFamily: "inherit",
};
export const txtF112 = stiliComuni.txtF11MutedNowrap;
export const boxF16 = stiliComuni.btnChiudi;
export const boxFlex1 = {
  flex: 1, overflowY: "auto", padding: "12px 14px",
  background: "var(--surface2)",
};
export const rowEndGap8 = { display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" };
export const rowCenterGap3 = {
  background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 14, borderTopLeftRadius: 4, padding: "8px 12px",
  display: "flex", gap: 3, alignItems: "center",
};
export const boxW6H6 = { width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite" };
export const boxW6H62 = { width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.2s" };
export const boxW6H63 = { width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.4s" };
