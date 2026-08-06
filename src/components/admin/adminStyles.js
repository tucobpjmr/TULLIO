// src/components/admin/adminStyles.js
// Stili condivisi dall'area Admin.
//
// Era uno dei TRE sistemi di stile paralleli della codebase (con
// modals/bulk/bulkStyles.js e liste/listeStyles.jsx): lo stesso bottone
// primario esisteva in quattro varianti non intercambiabili. Ora le forme che
// coincidono derivano da styles/tokens.js; restano qui solo le varianti
// specifiche dell'area e i pochi delta, che sono ESPLICITI invece di essere
// una copia divergente che nessuno sa più se sia voluta.
//
// Nota: i `#fff` hardcoded sono stati sostituiti da `var(--card)`. È lo stesso
// colore (--card: #ffffff in GlobalStyles), ma passa dalla variabile di tema
// come il resto dell'app — un tema scuro non dovrà rincorrere questi valori.
import { btn, field, Z } from "../../styles/tokens.js";

export const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
export const cardStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
export const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--navy)" };
export const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
export const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };

export const fieldStyle = field;

export const btnPrimary = btn.primary;
export const btnGold    = { ...btn.gold, fontWeight: 700 };
// Le tre varianti "outline": fondo card e testo colorato, non il contrario.
export const btnGhost   = { ...btn.ghost,  padding: "8px 12px", fontWeight: 500 };
export const btnDanger  = { ...btn.ghost,  padding: "8px 12px", border: "1px solid var(--danger)",  color: "var(--danger)" };
export const btnWarning = { ...btn.ghost,  padding: "8px 12px", border: "1px solid var(--warning)", color: "var(--warning)" };

export const modalOverlay = {
  position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: Z.slideOver, padding: 16,
};
// maxHeight in dvh (viewport dinamico): su iOS Safari evita che il modale sfori
// sotto le barre del browser rendendo i pulsanti in fondo irraggiungibili.
export const modalCard = {
  background: "var(--card)", borderRadius: 12, padding: 24, width: "90%",
  maxHeight: "90dvh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
