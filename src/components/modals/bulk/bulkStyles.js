// src/components/modals/bulk/bulkStyles.js
// Gli oggetti di stile condivisi dalle quattro tab del creatore in blocco.
// Erano in testa a un file da 1.366 righe: qui restano un posto solo da
// toccare quando la modale cambia aspetto, senza trascinarsi dietro il resto.

// ─── BULK TASK CREATOR (stili helper) ──────────────────────────────────────
export const bulkInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "var(--card)", outline: "none",
  minWidth: 0, boxSizing: "border-box",
};
// La descrizione di riga è facoltativa e può essere lunga: textarea bassa
// (2 righe) ma allargabile a mano, così una lista di più task non diventa
// altissima solo per un campo che spesso resta vuoto.
export const bulkTextareaStyle = {
  ...bulkInputStyle, resize: "vertical", lineHeight: 1.4, display: "block",
};
export const bulkBtnPrimary = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600,
};
export const bulkBtnGhost = {
  background: "transparent", border: "1px solid var(--border)",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 500,
};
export const bulkIconBtnSmall = {
  background: "var(--surface2)", border: "none", borderRadius: 6,
  width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};
export const bulkAttachBtn = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
  padding: "4px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)",
  fontFamily: "inherit", flexShrink: 0,
};
export const bulkFileChip = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 999,
  padding: "3px 7px 3px 9px", fontSize: 11, maxWidth: 240, minWidth: 0,
};
