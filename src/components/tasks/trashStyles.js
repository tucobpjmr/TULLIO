// src/components/tasks/trashStyles.js
// Gli stili costanti di Trash.jsx, estratti dal componente (M-1,
// audit del 12 agosto): oggetti allocati una volta a livello di modulo
// invece che ricostruiti a ogni render, e altrettante righe di sola
// presentazione fuori dal JSX — che è il motivo per cui il componente
// sembrava più grande di quanto non sia. I valori sono copiati alla
// lettera dagli originali.
export const maxW1200 = { padding: "24px 32px", maxWidth: 1200, margin: "0 auto" };
export const rowStartBetween = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" };
export const txtF28Bold = { fontSize: 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 };
export const boxF13Bold = {
  background: "var(--danger)", color: "#fff", border: "none",
  padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
  fontWeight: 600, fontFamily: "inherit",
  boxShadow: "0 2px 8px rgba(220,38,38,0.25)",
};
export const txtF11Bold2 = { padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 };
export const txtF11Bold3 = { padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 };
export const txtF11Bold4 = { padding: "12px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 };
export const borderBottom2 = { borderBottom: "1px solid var(--border)", transition: "background 0.15s" };
export const padding2 = { padding: "12px 16px" };
export const txtBoldHeading = { fontWeight: 600, color: "var(--heading)", marginBottom: 2 };
export const rowCenterGap6 = { display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" };
export const padding3 = { padding: "12px 8px" };
export const rowCenterBetween = {
  background: "var(--navy)", padding: "18px 22px",
  borderRadius: "16px 16px 0 0",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
export const txtWhite = { color: "#fff" };
export const txtF18Bold = { fontSize: 18, fontWeight: 700 };
export const txtF11Mt2 = { fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 };
export const colGap16 = { padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 };
export const boxF14WFull = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
  outline: "none",
};
export const boxF13WFull = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
  background: "var(--card)", cursor: "pointer",
};
export const rowGap6 = { display: "flex", flexWrap: "wrap", gap: 6 };
export const boxF13WFull2 = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
  resize: "vertical", outline: "none",
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

// B-3 · Il comando di conferma del ripristino. Era uno `style={{…}}` inline
// che cambiava fondo, colore, cursore e ombra a seconda che il titolo fosse
// compilato — cioè la variante "bottone spento" respinta dalla regola sulla
// validazione: adesso il comando è sempre premibile e a dire cosa manca è il
// messaggio sotto il campo.
export const boxF13Conferma = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "10px 20px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  boxShadow: "0 4px 14px rgba(15,32,68,0.3)",
  display: "flex", alignItems: "center", gap: 6,
};
