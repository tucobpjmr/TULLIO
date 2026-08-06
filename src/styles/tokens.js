// src/styles/tokens.js
// I token di design condivisi: scala z-index, bottoni, campi.
//
// PERCHÉ ESISTE. Prima convivevano tre sistemi di stile paralleli e
// incompatibili — `admin/adminStyles.js`, `modals/bulk/bulkStyles.js` e
// `liste/listeStyles.jsx` — più stili inline ovunque. Lo stesso bottone
// primario esisteva in almeno quattro varianti non intercambiabili, e i
// `zIndex` erano 23 valori magici sparsi da 1 a 9999 senza alcuna scala
// documentata: la causa strutturale dei bug di sovrapposizione che i commenti
// nel codice descrivono a più riprese ("il modale finiva sotto la bottom-nav",
// "il picker spariva dietro il pannello").
//
// Qui la scala è UNA, ordinata e commentata: chi aggiunge un livello vede
// subito dove va e cosa scavalca.

// ─── SCALA Z-INDEX ───────────────────────────────────────────────────────────
// Ordinata dal basso verso l'alto. I valori sono quelli già in uso: questa
// costante non li cambia, li NOMINA — un rename mascherato da refactor visivo
// sarebbe stato il modo più rapido per rompere sovrapposizioni che oggi
// funzionano. Le fasce lasciano spazio per inserire livelli senza rinumerare.
export const Z = {
  // Impilamento dentro una card o una cella: bordi attivi, indicatori "oggi".
  inCard: 1,
  cardRaised: 2,
  stickyNote: 5,

  // Sovrapposizioni locali a un componente (azioni swipe, testate sticky).
  local: 10,
  localRaised: 20,
  swipePanel: 30,

  // Popover ancorati a un elemento: menù contatti, azioni su hover di un
  // messaggio, pannello del date picker.
  popover: 40,
  popoverRaised: 50,
  datePicker: 60,

  // Dropdown di un input o di un pulsante di barra.
  dropdown: 100,
  // Pannelli a discesa della Topbar (notifiche, ricerca, utente) e i loro
  // sotto-menù.
  panel: 200,
  panelRaised: 300,

  // Elementi flottanti del guscio.
  fab: 400,
  bottomNav: 450, // definito anche in GlobalStyles.jsx (.vd-bottom-nav)

  // Slide-over: l'overlay sta SOTTO il pannello che oscura.
  slideOverBackdrop: 500,
  slideOver: 600,
  listeOverlay: 650, // .lv-overlay del modulo Liste (listeStyles.jsx)

  // Chat: stesso schema overlay/pannello, sopra gli slide-over perché può
  // essere aperta mentre uno di essi è già visibile.
  chatBackdrop: 700,
  chat: 800,
  chatForward: 900, // il picker "inoltra a" sta sopra il pannello chat

  // Modali che possono aprirsi DA uno slide-over o dalla chat: devono
  // scavalcarli entrambi.
  modalBackdrop: 1000,
  modal: 1001,
  modalFullBackdrop: 1100,
  modalFull: 1101,

  // Il toast è sempre l'ultimo: se non si vede, non ha alcuna utilità.
  toast: 9999,
};

// ─── BOTTONI ─────────────────────────────────────────────────────────────────
// Base condivisa + varianti. `adminStyles.js` e `bulkStyles.js` ora ri-esportano
// da qui invece di mantenere ognuno la propria copia divergente.
const btnBase = {
  padding: "8px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
  cursor: "pointer", fontFamily: "inherit", border: "1px solid transparent",
  transition: "opacity 0.15s",
};

export const btn = {
  primary: { ...btnBase, border: "1px solid var(--navy)",   background: "var(--navy)",    color: "#fff" },
  gold:    { ...btnBase, border: "1px solid var(--gold)",   background: "var(--gold)",    color: "var(--navy)" },
  ghost:   { ...btnBase, border: "1px solid var(--border)", background: "var(--card)",    color: "var(--text)" },
  danger:  { ...btnBase, border: "1px solid var(--danger)", background: "var(--danger)",  color: "#fff" },
  warning: { ...btnBase, border: "1px solid var(--warning)",background: "var(--warning)", color: "#fff" },
};

// ─── CAMPI ───────────────────────────────────────────────────────────────────
export const field = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "1px solid var(--border)", fontSize: 13, outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
  background: "var(--card)", color: "var(--text)",
};
