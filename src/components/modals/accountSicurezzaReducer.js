// src/components/modals/accountSicurezzaReducer.js
// Lo stato locale della sezione "sicurezza dell'account" di `ProfileEditor`:
// le due fisarmoniche (cambio password, elimina account) e l'esito delle tre
// operazioni asincrone che vivono lì.
//
// B-3 residuo dell'audit del 15 agosto, chiuso il 23 agosto: erano 9 `useState`
// indipendenti in `ProfileEditor.jsx` (12 in tutto col file). Non perché
// fossero la STESSA cosa — restano campi distinti, annidati per sezione e non
// fusi in un valore solo — ma perché cambiano sempre in GRUPPO: aprire la
// sezione password azzera insieme esito e bozza, un cambio password riuscito
// azzera la bozza ma non l'esito. Stesso trattamento di `convViewReducer` in
// `chat/chatReducers.js`: un reducer locale per un form con più sotto-macchine,
// non un reducer di dominio.
//
// M-5 (audit del 25 agosto): il reducer aveva una quarta fetta, `salvaInVolo`,
// che non apparteneva a questa macchina — è il freno al doppio invio del
// SALVATAGGIO DEL PROFILO, cioè dell'altra metà della modale. È tornata a
// `ProfileEditor` come `useState`, dove si legge accanto a ciò che protegge.
export const ESITO_PRONTO = { fase: "pronto", testo: null };
const BOZZA_PWD = { nuova: "", conferma: "" };

export const accountIniziale = {
  pwd: { aperta: false, rivela: false, bozza: BOZZA_PWD, esito: ESITO_PRONTO },
  elim: { aperta: false, conferma: "", esito: ESITO_PRONTO },
  signOut: { esito: ESITO_PRONTO },
};

export function accountReducer(s, a) {
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
    default:
      return s;
  }
}
