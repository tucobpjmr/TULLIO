// src/components/admin/adminStyles.js
// Stili condivisi dall'area Admin.
//
// Era uno dei TRE sistemi di stile paralleli della codebase (con
// tasks/bulk/bulkStyles.js e liste/liste.css): lo stesso bottone
// primario esisteva in quattro varianti non intercambiabili. Ora le forme che
// coincidono derivano da styles/tokens.js; restano qui solo le varianti
// specifiche dell'area e i pochi delta, che sono ESPLICITI invece di essere
// una copia divergente che nessuno sa più se sia voluta.
//
// Nota: i `#fff` hardcoded sono stati sostituiti da `var(--card)`. È lo stesso
// colore (--card: #ffffff in styles/global.css), ma passa dalla variabile di tema
// come il resto dell'app — un tema scuro non dovrà rincorrere questi valori.
import { btn, field } from "../../styles/tokens.js";

export const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
export const cardStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
export const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--heading)" };
export const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
export const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };

export const fieldStyle = field;

export const btnPrimary = btn.primary;
export const btnGold    = { ...btn.gold, fontWeight: 700 };
// Le tre varianti "outline": fondo card e testo colorato, non il contrario.
export const btnGhost   = { ...btn.ghost,  padding: "8px 12px", fontWeight: 500 };
export const btnDanger  = { ...btn.ghost,  padding: "8px 12px", border: "1px solid var(--danger)",  color: "var(--danger)" };
export const btnWarning = { ...btn.ghost,  padding: "8px 12px", border: "1px solid var(--warning)", color: "var(--warning)" };

// Il contenuto delle modali admin: velo, card, Esc e focus li dà ui/Modal.jsx
// (M-4 dell'analisi UX del 15 novembre: prima erano ricostruiti a mano).
export const modalCardContenuto = { padding: 24 };
