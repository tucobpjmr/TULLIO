// src/components/modals/profileEditorStyles.js
// Gli stili costanti di ProfileEditor.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const rowCenterBetween = {
  background: "var(--navy)", padding: "20px 22px",
  borderRadius: "16px 16px 0 0",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
export const rowCenterGap14 = { display: "flex", alignItems: "center", gap: 14 };
export const boxW52H52 = { width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.3)" };
export const txtF18Bold = { fontSize: 18, fontWeight: 700, color: "#fff" };
export const txtF11Mt2 = { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 };
export const colGap18 = { padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 };
export const colCenterGap12 = { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 };
export const boxW100H100 = { width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--border)" };
export const rowCenterMiddle = {
  position: "absolute", top: -4, right: -4,
  width: 24, height: 24, borderRadius: "50%", background: "var(--danger)", color: "#fff",
  border: "2px solid #fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center",
};
export const rowCenterMiddle2 = {
  width: 100, height: 100, borderRadius: "50%", border: "2px dashed var(--border)",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "var(--text-muted)", fontSize: 12,
};
export const boxF13Bold = {
  background: "var(--surface2)", border: "1px solid var(--border)",
  padding: "8px 20px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit", color: "var(--text)",
};
export const boxF14Muted = {
  padding: "10px 12px", borderRadius: 8, background: "var(--surface2)",
  fontSize: 14, color: "var(--text-muted)", fontWeight: 500,
};
export const rowCenterGap8 = {
  display: "flex", alignItems: "center", gap: 8,
  background: "none", border: "none", cursor: "pointer",
  color: "var(--navy)", fontSize: 13, fontWeight: 600,
  padding: "6px 0", fontFamily: "inherit",
};
export const txtF11Muted2 = { fontSize: 11, color: "var(--text-muted)", marginLeft: 2 };
export const colGap10Mt10 = { marginTop: 10, display: "flex", flexDirection: "column", gap: 10 };
export const row = { display: "flex", justifyContent: "flex-end" };
export const mt2 = {
  borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 2,
};
export const rowCenterGap82 = {
  display: "flex", alignItems: "center", gap: 8,
  background: "none", border: "none", cursor: "pointer",
  color: "var(--danger)", fontSize: 13, fontWeight: 600,
  padding: "6px 0", fontFamily: "inherit",
};
export const colGap10Mt102 = {
  marginTop: 10, padding: "14px 16px", borderRadius: 10,
  background: "rgba(192,57,43,0.05)", border: "1px solid rgba(192,57,43,0.25)",
  display: "flex", flexDirection: "column", gap: 10,
};
export const txtF13Text = { fontSize: 13, color: "var(--text)", margin: 0, lineHeight: 1.5 };
export const boxF125Danger = {
  fontSize: 12.5, borderRadius: 8, padding: "8px 10px",
  background: "rgba(192,57,43,0.08)", border: "1px solid var(--danger)",
  color: "var(--danger)",
};
export const rowGap10 = {
  padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
  display: "flex", justifyContent: "flex-end", gap: 10,
};
export const boxF13Bold2 = {
  background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
  padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
  fontWeight: 600, fontFamily: "inherit",
};
export const boxF13Bold3 = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "10px 20px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  boxShadow: "0 4px 14px rgba(15,32,68,0.3)",
};
