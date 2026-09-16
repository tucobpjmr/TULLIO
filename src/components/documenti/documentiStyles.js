// src/components/documenti/documentiStyles.js
// Gli stili costanti del modulo Documenti, a livello di modulo invece che nel
// JSX: un oggetto letterale dentro `style={{…}}` è nuovo a ogni render, e la
// regola ESLint `no-restricted-syntax` (STILE_INLINE_COSTANTE in
// eslint.config.js) lo rifiuta — vedi M-1 dell'audit del 12 agosto.
//
// Qui stanno SOLO le forme proprie di questo modulo. Tutto ciò che ricorre in
// tre o più file del progetto vive in `styles/common.js`, da cui si importa il
// namespace (`stiliComuni.card`, vedi VIETATO_COMMON_NOMINATO).
import { field, btn } from "../../styles/tokens.js";

// ─── VISTA ───────────────────────────────────────────────────────────────────
export const contenitore = { maxWidth: 1100, margin: "0 auto" };
export const testata = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  marginBottom: 20, flexWrap: "wrap", gap: 12,
};
export const titolo = { margin: 0, color: "var(--heading)" };
export const sottotitoloTestata = { fontSize: 13, color: "var(--text-muted)", marginTop: 4 };
export const azioniTestata = { display: "flex", gap: 8, flexWrap: "wrap" };
// La barra dei filtri è `stiliComuni.rowFiltri`: la vista la importa da lì,
// non la ridefinisce qui — riscriverla sarebbe la quarta copia della stessa
// forma, che `verifica:convenzioni` conta apposta.
export const campoRicerca = { ...field, flex: "1 1 240px", minWidth: 200, padding: "9px 12px", fontSize: 14 };

// Il chip di filtro ha due forme (attivo/inattivo) e sono DUE costanti, non
// una funzione: una funzione restituirebbe un oggetto nuovo a ogni render,
// cioè il difetto che questo file esiste per evitare.
//
// La forma ATTIVA parte da `btn.primary` invece di riscriverne i colori: il
// bianco su navy è già dichiarato lì, e ridichiararlo qui sarebbe un colore
// scritto in duro fuori da `src/styles/` — cioè un pezzo di interfaccia che al
// tema scuro resterebbe fermo (M-4 dell'audit del 10 settembre).
const chipBase = {
  padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)",
};
export const chip = { ...chipBase, background: "var(--card)", color: "var(--text-muted)" };
export const chipAttivo = { ...chipBase, ...btn.primary, borderRadius: 999, padding: "6px 12px", fontSize: 12 };

export const griglia = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
  gap: 12,
};
export const contatore = { fontSize: 12, color: "var(--text-muted)", marginTop: 16, textAlign: "center" };

// ─── SCHEDA ──────────────────────────────────────────────────────────────────
export const scheda = {
  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
  padding: 14, cursor: "pointer", textAlign: "left", width: "100%",
  fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 8,
};
export const schedaTestata = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 };
export const nomePasseggero = {
  fontWeight: 700, fontSize: 15, color: "var(--heading)",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
export const rigaMeta = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" };
// La pastiglia dello stato di scadenza prende il colore da `scadenze.js`:
// qui c'è la forma, là il significato.
export const pastigliaStato = {
  padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
  border: "1px solid currentColor", whiteSpace: "nowrap", flexShrink: 0,
};

// ─── MODALE DI DETTAGLIO ─────────────────────────────────────────────────────
export const anteprima = {
  width: "100%", maxHeight: "48vh", objectFit: "contain",
  borderRadius: 8, background: "var(--surface2)", display: "block",
};
export const anteprimaVuota = {
  padding: "48px 16px", textAlign: "center", color: "var(--text-muted)",
  background: "var(--surface2)", borderRadius: 8, fontSize: 13,
};
export const grigliaCampi = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 };
export const campo = { ...field };
export const etichetta = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };
export const campoLargo = { gridColumn: "1 / -1" };
export const piedeModale = { display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20, flexWrap: "wrap" };

// ─── IMPORT MASSIVO ──────────────────────────────────────────────────────────
export const zonaFile = {
  border: "2px dashed var(--border)", borderRadius: 12, padding: "28px 16px",
  textAlign: "center", color: "var(--text-muted)", fontSize: 13,
};
export const tabellaImport = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
export const corpoScorrevole = { maxHeight: "42vh", overflowY: "auto", marginTop: 12, border: "1px solid var(--border)", borderRadius: 8 };
export const cellaNome = { padding: "6px 8px" };
export const campoNomeRiga = { ...field, padding: "5px 8px", fontSize: 12 };
// Riga la cui deduzione del nome NON è riuscita: va completata a mano, e
// l'unico modo perché qualcuno lo faccia su una tabella da mille righe è che
// si veda senza cercarla.
export const rigaDaCompletare = { background: "var(--surface3)" };
export const riepilogo = { fontSize: 13, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 };
export const barraAvanzamento = { height: 6, borderRadius: 999, background: "var(--surface3)", overflow: "hidden", marginTop: 12 };
export const riquadroAvviso = {
  background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
  padding: "10px 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5,
  marginTop: 12,
};
