// src/styles/common.js
// Gli oggetti di stile costanti che ricorrono in tre o più file.
//
// PERCHÉ ESISTE (M-1, audit del 12 agosto). Erano `style={{…}}` riscritti a
// mano in ogni punto d'uso: la stessa forma ridefinita decine di volte, e un
// oggetto NUOVO a ogni render — quindi una prop sempre diversa, e un `memo`
// che non poteva mai saltare il lavoro. Qui la forma è una sola, allocata una
// volta per l'intera vita del modulo.
//
// I valori sono copiati alla lettera dagli originali, non normalizzati: il
// passaggio che ha creato questo file non cambia una virgola di ciò che il
// browser disegna, ed è verificabile riga per riga leggendo il diff. Chi ne
// aggiunge uno faccia lo stesso: è un registro delle forme GIÀ IN USO, non un
// design system — quello, se servirà, è `tokens.js`, e ci si arriva
// promuovendo di qui, non scrivendo qui una forma nuova.
//
// Sui nomi: descrivono il ruolo quando ne hanno uno riconoscibile
// (`btnChiudi`, `cardVuota`, `cella`), altrimenti la forma in modo meccanico e
// prevedibile (`rowCenterGap8` = flex, allineato al centro, gap 8;
// `txtF13Muted` = testo 13px in --text-muted). Un nome meccanico è un segnale
// utile: dice che quella forma non ha ancora un significato nell'app.

// ─── BOTTONI ─────────────────────────────────────────────────────────────────
export const btnChiudi = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 16, color: "var(--text-muted)",
};
// La ✕ delle testate scure: toast, header navy dei modali a tutto schermo.
export const btnChiudiSuScuro = {
  background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
  width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
};
export const btnOutlineMini = { background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 };
export const btnDangerMini = {
  background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
  padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
export const btnNavyMini = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
  fontWeight: 600, fontFamily: "inherit",
};
export const btnGhostMini = {
  marginTop: 8, padding: "6px 14px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--card)",
  color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit",
};

// ─── CARD E SUPERFICI ────────────────────────────────────────────────────────
export const card = { background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" };
// Come `card` ma con un'ombra e un raggio più ampio: le griglie del calendario.
// Era `boxR14` in tre file — un nome che descriveva il raggio e taceva l'ombra.
export const cardElevata = {
  background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
};
// Lo stato vuoto di una lista: stessa card, testo centrato. La variante "alta"
// è quella delle viste a tutta pagina (cestino, archivio).
export const cardVuota = { background: "var(--card)", borderRadius: 12, padding: "40px 20px", textAlign: "center", border: "1px solid var(--border)" };
export const cardVuotaAlta = {
  background: "var(--card)", borderRadius: 12, padding: "60px 20px",
  textAlign: "center", border: "1px solid var(--border)",
};

// ─── TABELLE ─────────────────────────────────────────────────────────────────
export const tabella = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
export const rigaIntestazione = { background: "var(--surface2)", borderBottom: "1px solid var(--border)" };
export const cella = { padding: "12px 8px", color: "var(--text)" };
export const cellaMuted = { padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 };
export const cellaAzioni = { padding: "12px 16px", textAlign: "right" };

// ─── LAYOUT: RIGHE ───────────────────────────────────────────────────────────
export const rowGap4 = { display: "flex", gap: 4 };
export const rowGap6 = { display: "flex", gap: 6, flexShrink: 0 };
// M-3 · La coppia di bottoni-azione in fondo a una riga di tabella
// (Ripristina / ✕). Si chiamava `rowGap62`, che non è «gap 62»: era «la
// seconda forma che somigliava a rowGap6», e dai tre call site non c'era
// modo di saperlo.
export const rowAzioniInLinea = { display: "flex", gap: 6, justifyContent: "flex-end" };
export const rowGap8 = { display: "flex", gap: 8 };
export const rowGap8Mt20 = { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 };
export const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8 };
// M-3 · La barra dei filtri sopra un elenco: etichetta più una fila di chip
// che va a capo (Trash, Archive, ArchivedListe). Era `rowCenterGap82`.
export const rowFiltri = { display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" };
export const rowCenterGap10 = { display: "flex", alignItems: "center", gap: 10 };
export const rowCenterGap12 = { display: "flex", alignItems: "center", gap: 12 };
export const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 };
// M-3 · Il piede di una sezione: riepilogo a sinistra, azioni a destra,
// separato dal contenuto da un bordo. Era `rowCenterBetween2`.
export const piedeSezione = { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" };
// Promosse qui il 23 agosto (A-5, secondo passaggio): erano definite alla
// lettera in tre file ciascuna, cioè oltre la soglia che questo registro
// dichiara in cima ("ricorrono in tre o più file"). Non erano visibili come
// duplicati perché il criterio era applicato a occhio: nessuno confrontava i
// VALORI. Ora lo fa `npm run verifica:stili`, ed è il motivo per cui queste
// tre chiudono la lista invece di essere le prime di una serie.
//
// La testata di un modale o di un overlay: titolo a sinistra, ✕ a destra.
// Era `rowCenterBetween` in ClienteModal, QuickAddTask e KeyboardHelpOverlay —
// stesso nome di quello qui sopra ma con `marginBottom: 20`, che è esattamente
// il tipo di omonimia per cui da questo file si importa il namespace.
export const testataModale = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 };
// Fila di chip/badge che va a capo quando lo spazio finisce. I tre call site la
// chiamavano `rowCenterGap6`: il nome qui dice anche il `flexWrap`, perché
// accanto a `rowCenterGap8` (che non va a capo) la differenza conta.
export const rowCenterWrapGap6 = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 };
// Titolo di sezione dentro un pannello: icona + etichetta, sopra il contenuto.
export const intestazioneSezione = {
  padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
  color: "var(--text-muted)", fontSize: 13,
};

// ─── LAYOUT: COLONNE, GRIGLIE, POSIZIONAMENTO ────────────────────────────────
export const colGap10 = { display: "flex", flexDirection: "column", gap: 10 };
export const colGap14 = { display: "flex", flexDirection: "column", gap: 14 };
export const colGap2F12 = { fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 };
export const gridGap10 = { display: "grid", gap: 10 };
export const gridGap12 = { display: "grid", gap: 12 };
export const grid2ColGap12 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
// M-3 · La griglia di schede che si riempie da sola, larghezza minima 280px
// (le quattro code della Dashboard). Era `gridGap102`.
// ⚠️ Non è la griglia dei CAMPI di un form: quella è `grid2ColGap12`.
export const grigliaSchede = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
  gap: 10,
};
export const hidden = { display: "none" };
export const flex1 = { flex: 1 };
// Il corpo scorrevole di un pannello: prende tutto lo spazio che avanza fra
// testata e piede, e scorre da solo invece di allungare la pagina. Era `flex1`
// / `flex12` in tre file della chat, dove il nome diceva metà della forma.
export const areaScorrevole = { flex: 1, overflowY: "auto" };
export const relative = { position: "relative" };

// ─── TESTO ───────────────────────────────────────────────────────────────────
export const txtMuted = { color: "var(--text-muted)" };
export const txtBoldDanger = { color: "var(--danger)", fontWeight: 600 };
export const txtF10Muted = { fontSize: 10, color: "var(--text-muted)" };
export const txtF10Bold = { fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 };
// M-3 · L'INTESTAZIONE IN MAIUSCOLO di un blocco dentro un pannello.
// Era `txtF10Bold2`, accanto a `txtF10Bold` che è un'altra cosa.
export const etichettaSezione = { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 };
export const txtF11Muted = { fontSize: 11, color: "var(--text-muted)" };
export const txtF11Bold = { fontSize: 11, color: "var(--text-muted)", fontWeight: 600 };
export const txtF12Muted = { fontSize: 12, color: "var(--text-muted)" };
// M-3 · La riga di dettaglio subito sotto un titolo. Era `txtF12Muted2`.
export const sottotitolo = { fontSize: 12, color: "var(--text-muted)", marginTop: 2 };
export const txtF13 = { fontSize: 13 };
export const txtF13Muted = { fontSize: 13, color: "var(--text-muted)" };
export const txtF13Bold = { fontSize: 13, fontWeight: 600 };
export const txtF14 = { fontSize: 14 };
export const txtF14Bold = { fontSize: 14, fontWeight: 600, color: "var(--heading)", marginBottom: 4 };
export const txtF15 = { fontSize: 15 };
export const txtF16 = { fontSize: 16, flexShrink: 0 };
export const txtF16Bold = { fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 };
export const txtF18 = { fontSize: 18 };
export const txtHeadingMb16 = { margin: 0, marginBottom: 16, color: "var(--heading)" };
// Un nome che deve stare su una riga sola: il troncamento è parte della forma.
export const nomeTroncato = { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
// Le emoji grandi degli stati vuoti.
export const txtF36Mb12 = { fontSize: 36, marginBottom: 12, opacity: 0.3 };
export const txtF40Mb12 = { fontSize: 40, marginBottom: 12 };
export const txtF48Mb16 = { fontSize: 48, marginBottom: 16, opacity: 0.3 };

// A-2 dell'audit sicurezza del 26 agosto · promosse qui dal controllo
// relazionale di `verifica:convenzioni`, che le ha viste comparire in un terzo
// file appena la tab «Log attività» si è divisa in due componenti. Erano
// entrambe già duplicate in due punti: la terza copia è solo quella che le ha
// rese visibili.
// Il paragrafo esplicativo sotto il titolo di una sezione di pannello.
export const txtF12MutedMb12 = { fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 12 };
// Il corpo centrato di uno stato vuoto dentro una card.
export const statoVuotoCentrato = { padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" };

// ─── SPAZIATURE ──────────────────────────────────────────────────────────────
export const mb14 = { marginBottom: 14 };
export const mt12 = { marginTop: 12 };
