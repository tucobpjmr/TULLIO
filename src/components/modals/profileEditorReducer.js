// src/components/modals/profileEditorReducer.js
// Stato locale di `ProfileEditor` che NON è un campo del profilo (quello
// resta `draft`/`errori`, dichiarati nel componente — un oggetto solo con un
// setter per campo, come `TaskSlideOver`): qui vivono le due sezioni a
// fisarmonica (cambio password, elimina account), l'esito delle TRE
// operazioni asincrone del file e il freno al doppio invio del salvataggio.
//
// B-3 residuo dell'audit del 15 agosto, chiuso il 23 agosto: erano 9 `useState`
// indipendenti in `ProfileEditor.jsx` (12 in tutto col file). Non perché
// fossero la STESSA cosa — restano campi distinti, annidati per sezione e non
// fusi in un valore solo, esattamente come la classificazione in
// `ProfileEditor.jsx` richiede — ma perché cambiano sempre in GRUPPO: aprire
// la sezione password azzera insieme esito e bozza, un cambio password
// riuscito azzera la bozza ma non l'esito. Stesso trattamento di
// `convViewReducer` in `chat/chatReducers.js`: un reducer locale per un form
// con più sotto-macchine, non un reducer di dominio.
export const ESITO_PRONTO = { fase: "pronto", testo: null };
const BOZZA_PWD = { nuova: "", conferma: "" };

export const profileUiIniziale = {
  pwd: { aperta: false, rivela: false, bozza: BOZZA_PWD, esito: ESITO_PRONTO },
  elim: { aperta: false, conferma: "", esito: ESITO_PRONTO },
  signOut: { esito: ESITO_PRONTO },
  salvaInVolo: false,
};

export function profileUiReducer(s, a) {
  switch (a.type) {
    // Aprire/chiudere la fisarmonica azzera SEMPRE esito e bozza insieme:
    // riaprire "Cambia password" dopo un tentativo fallito non deve mostrare
    // l'errore di prima accanto a campi già vuoti.
    case "TOGGLE_PWD":
      return { ...s, pwd: { ...s.pwd, aperta: !s.pwd.aperta, esito: ESITO_PRONTO, bozza: BOZZA_PWD } };
    case "SET_PWD_CAMPO":
      return { ...s, pwd: { ...s.pwd, bozza: { ...s.pwd.bozza, [a.campo]: a.valore } } };
    // Preferenza di visualizzazione condivisa dai due campi password: non fa
    // parte della bozza, sopravvive al suo svuotamento.
    case "TOGGLE_RIVELA_PWD":
      return { ...s, pwd: { ...s.pwd, rivela: !s.pwd.rivela } };
    case "PWD_ESITO":
      return { ...s, pwd: { ...s.pwd, esito: a.esito } };
    case "PWD_SUCCESSO":
      return { ...s, pwd: { ...s.pwd, esito: { fase: "ok", testo: "Password aggiornata." }, bozza: BOZZA_PWD } };
    case "TOGGLE_ELIM":
      return { ...s, elim: { ...s.elim, aperta: !s.elim.aperta, conferma: "", esito: ESITO_PRONTO } };
    case "SET_CONFERMA_ELIM":
      return { ...s, elim: { ...s.elim, conferma: a.valore } };
    case "ELIM_ESITO":
      return { ...s, elim: { ...s.elim, esito: a.esito } };
    case "SIGNOUT_ESITO":
      return { ...s, signOut: { esito: a.esito } };
    case "SALVA_IN_VOLO":
      return { ...s, salvaInVolo: a.valore };
    default:
      return s;
  }
}
