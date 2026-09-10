// src/lib/tema.js
// Quale faccia ha l'app: quella di sistema, chiara o scura.
//
// ─── M-4 dell'audit del 10 settembre ───────────────────────────────────────
// Tre valori e nient'altro. Il TEMA vero — i colori — sta in
// styles/global.css come ridefinizione dei token: qui c'è solo la scelta
// dell'utente e il posto dove viene scritta perché l'app la ritrovi domani.
//
// ⚠️ SÌ, È localStorage, e `docs/CLAUDE.md` lo vieta. La regola («non usare
// localStorage/sessionStorage») porta accanto la propria data di scadenza —
// «vincolo artifact, da rimuovere post-migrazione Vite» — e quella migrazione
// è avvenuta. Ma non è per questo che qui si può: è per il SINCRONO.
//
//   • La scelta va applicata PRIMA del primo paint, altrimenti l'app parte
//     chiara e diventa scura sotto gli occhi di chi l'ha aperta di notte —
//     cioè il difetto che il tema scuro esiste per togliere.
//   • L'unico deposito persistente e sincrono di un browser è localStorage.
//     IndexedDB, che questo progetto usa da M-2 per la coda offline, è
//     asincrono per disegno: leggerlo significa avere la risposta DOPO il
//     primo paint.
//   • La CSP di `vercel.json` è `script-src 'self'`: niente `<script>` inline
//     in index.html, quindi l'unico punto in cui applicare il tema prima di
//     React è il modulo d'ingresso (main.jsx), che gira comunque prima del
//     render.
//
// Ciò che si scrive è una di tre parole. Nessun dato personale, niente che
// sopravviva a una disinstallazione, niente che valga qualcosa per chi
// leggesse quello storage — che è il motivo per cui la regola esiste.

/** I tre valori ammessi. `sistema` = segui il sistema operativo. */
export const TEMI = /** @type {const} */ (["sistema", "chiaro", "scuro"]);

export const CHIAVE_TEMA = "vd-tema";

/** L'etichetta con cui i tre valori si presentano all'utente. */
export const ETICHETTE_TEMA = {
  sistema: "Sistema",
  chiaro: "Chiaro",
  scuro: "Scuro",
};

/**
 * La scelta salvata, o `"sistema"` — che è anche il ripiego giusto quando lo
 * storage non è leggibile (navigazione privata, permessi negati): seguire il
 * sistema è ciò che l'app farebbe comunque senza alcuna scelta.
 * @returns {"sistema"|"chiaro"|"scuro"}
 */
export function leggiTema() {
  try {
    const salvato = window.localStorage.getItem(CHIAVE_TEMA);
    return TEMI.includes(/** @type {any} */ (salvato)) ? /** @type {any} */ (salvato) : "sistema";
  } catch {
    return "sistema";
  }
}

/**
 * Salva la scelta. Un fallimento non è un errore da mostrare: il tema è già
 * applicato a schermo, quello che si perde è solo la memoria per la prossima
 * apertura.
 * @param {"sistema"|"chiaro"|"scuro"} tema
 */
export function salvaTema(tema) {
  try {
    if (tema === "sistema") window.localStorage.removeItem(CHIAVE_TEMA);
    else window.localStorage.setItem(CHIAVE_TEMA, tema);
  } catch { /* niente da fare, e niente da dire all'utente */ }
}

/**
 * Scrive la scelta sul documento, da dove il CSS la legge
 * (`:root[data-tema="scuro"]`, `:root:not([data-tema="chiaro"])`).
 *
 * Per `sistema` l'attributo viene TOLTO, non messo a `"sistema"`: il selettore
 * che segue il sistema operativo è quello che nega il chiaro, e un attributo
 * con un terzo valore lo lascerebbe passare per caso invece che per disegno.
 *
 * @param {"sistema"|"chiaro"|"scuro"} tema
 */
export function applicaTema(tema) {
  const radice = document.documentElement;
  if (tema === "sistema") radice.removeAttribute("data-tema");
  else radice.setAttribute("data-tema", tema);
}

/**
 * Cosa si vede DAVVERO, risolvendo `sistema` con la preferenza del sistema
 * operativo. Serve all'etichetta («Sistema — ora scuro») e ai test: il CSS non
 * ha bisogno di questa funzione, se la calcola da sé.
 * @param {"sistema"|"chiaro"|"scuro"} tema
 * @returns {"chiaro"|"scuro"}
 */
export function temaEffettivo(tema) {
  if (tema !== "sistema") return tema;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "scuro" : "chiaro";
  } catch {
    // Un ambiente senza matchMedia (jsdom nudo) non ha una preferenza: il
    // chiaro è il default dichiarato in `:root`.
    return "chiaro";
  }
}
