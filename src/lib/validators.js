// src/lib/validators.js
// Helper di validazione condivisi, senza side-effect (facilmente testabili).
//
// ─── CRITICITÀ #10 · la validazione era una sola, e parlava dal posto sbagliato
// Prima qui c'era solo `isValidEmail`, e tutto il resto della validazione era
// scritto a mano dentro i form, con l'esito comunicato da un TOAST:
//
//     if (!data || !desc.trim() || importo === null) {
//       dispatch({ type: "SHOW_TOAST", … "Compila data, descrizione e importo" });
//
// Tre problemi, tutti dello stesso tipo — l'errore non è dove serve:
//   • il toast compare in un ANGOLO dello schermo e sparisce da solo, mentre
//     il campo sbagliato resta identico a quelli giusti;
//   • cita tre campi insieme senza dire quale sia quello vuoto, quindi
//     l'utente li rilegge tutti;
//   • per chi usa uno screen reader non esiste alcun legame fra il messaggio
//     e l'input: niente `aria-invalid`, niente `aria-describedby`, e il focus
//     resta dov'era.
//
// Qui vive la METÀ PURA della soluzione: validatori componibili e un runner.
// La metà visiva (il messaggio sotto il campo, gli attributi ARIA) sta in
// components/ui/FieldError.jsx. La divisione non è cosmetica: questa metà è
// testabile senza montare nulla, ed è la stessa per tutti i form.

// Regex email pragmatica (non RFC-completa): richiede una parte locale senza
// spazi/@/virgole, una @, un dominio e almeno un punto. Estratta da
// BulkInviteModal (era duplicata solo lì) per essere riusata ovunque si
// validi un'email inserita manualmente (ProfileEditor, AddTeamMemberModal).
export const EMAIL_RX = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// Valida un indirizzo email. Una stringa vuota/whitespace-only NON è valida:
// i chiamanti che considerano l'email opzionale devono controllare prima se
// il campo è vuoto e saltare la validazione in quel caso.
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RX.test(email.trim());
}

// ─── VALIDATORI COMPONIBILI ────────────────────────────────────────────────
// Un validatore è `(valore, tuttiIValori) => messaggio | null`: ritorna la
// stringa da mostrare all'utente quando il campo è sbagliato, `null` quando
// va bene. Il secondo argomento serve ai campi che dipendono da un altro
// (l'importo di un movimento si interpreta col segno scelto).
//
// Il messaggio lo passa il CHIAMANTE invece di essere generato da un'etichetta:
// l'italiano ha genere e numero, e "Descrizione è obbligatorio" è il genere di
// frase che nasce quando si prova a comporre testo per interpolazione.

const vuoto = (v) => v === null || v === undefined || (typeof v === "string" ? !v.trim() : v === "");

export const obbligatorio = (messaggio) => (v) => (vuoto(v) ? messaggio : null);

// Email OPZIONALE ma valida se compilata: è il contratto di tutti i punti in
// cui l'app chiede un'email (profilo, membro del team), dove lasciare vuoto è
// legittimo e sbagliare no.
export const emailValida = (messaggio = "Email non valida.") => (v) =>
  (vuoto(v) || isValidEmail(v) ? null : messaggio);

// Campo numerico la cui interpretazione vive altrove (`parseImporto` per gli
// importi delle liste): il parser è passato dal chiamante e `null` è la sua
// convenzione per "non interpretabile".
export const interpretabile = (parse, messaggio) => (v, valori) =>
  (parse(v, valori) === null ? messaggio : null);

// ─── RUNNER ────────────────────────────────────────────────────────────────
/**
 * Applica le regole ai valori e ritorna una mappa `campo → messaggio` con le
 * sole voci in errore (oggetto vuoto = form valido).
 *
 * Si ferma al PRIMO messaggio per campo: mostrarne due sullo stesso input
 * significa chiedere all'utente di correggere due cose in una casella sola.
 *
 * @param {object} valori  i valori correnti del form
 * @param {object} regole  `campo → validatore | validatore[]`
 */
export function validaCampi(valori, regole) {
  const errori = {};
  for (const [campo, controlli] of Object.entries(regole)) {
    for (const controllo of Array.isArray(controlli) ? controlli : [controlli]) {
      const messaggio = controllo(valori[campo], valori);
      if (messaggio) { errori[campo] = messaggio; break; }
    }
  }
  return errori;
}

/**
 * Il primo campo in errore secondo l'ORDINE VISIVO del form, che è quello su
 * cui va portato il focus: `Object.keys` seguirebbe l'ordine di dichiarazione
 * delle regole, che non è detto coincida con quello dei campi a schermo, e
 * mandare il focus a un campo più in alto di un altro già sbagliato fa
 * scorrere la pagina avanti e indietro.
 */
export function primoCampoInvalido(errori, ordine) {
  return ordine.find((campo) => errori[campo]) ?? null;
}

// ─── PASSWORD ──────────────────────────────────────────────────────────────
// M-4 dell'audit sicurezza del 26 agosto. La stessa riga
//
//     if (password.length < 8) { setErr('La password deve avere almeno 8 caratteri.'); return; }
//
// era scritta due volte — in `auth/UpdatePasswordScreen.jsx` e in
// `components/shell/AccountSicurezza.jsx` — cioè nella forma che
// `_shared/requireActiveAdmin.ts` descrive come il difetto peggiore delle
// copie: non divergono, restano uguali e sbagliate insieme.
//
// ⚠️ E il difetto vero non è la duplicazione: è che NESSUNA DELLE DUE È IL
// LIVELLO CHE DECIDE. `supabase.auth.updateUser({ password })` è raggiungibile
// su `/auth/v1/user` con il solo token di sessione, e lì il minimo effettivo è
// quello configurato in GoTrue (dashboard → Auth → Password → «Minimum
// password length»), non questo numero. Vale qui la posizione del progetto —
// «il client decide cosa mostrare, il database cosa è permesso»: questa
// costante serve a dare all'utente il messaggio giusto PRIMA del viaggio, non
// a impedirgli qualcosa. Se i due numeri divergono, quello che vale è GoTrue.
// Stato della leva lato server e come riallinearla: docs/SICUREZZA.md §6.
//
// ─── A-3 dell'audit del 4 settembre · lunghezza minima e composizione ──────
// Otto caratteri senza nessun requisito di composizione significa che
// `password` e `12345678` passavano. I due numeri qui rispecchiano la
// configurazione applicata in Supabase → Auth → Policies (Minimum password
// length: 12, Password requirements: lower + upper + digits) — SONO DUE
// leve e non una, per la stessa ragione di sopra: quella della piattaforma
// è l'unica che valga anche per chi chiama `/auth/v1` senza passare da qui,
// questa evita che l'utente scopra il requisito come un errore del server
// invece che PRIMA di inviare (la stessa asimmetria dei tetti di
// `errorReporting.js`, C-1 del 2 settembre). La leaked password protection
// (HaveIBeenPwned) NON è qui: è una funzione del piano Supabase Pro, il
// progetto resta sul piano Free per scelta già presa e documentata in
// `AVVISI_ACCETTATI` di `scripts/verifica-advisor/advisor.js` — vedi la
// correzione in testa alla sezione A-3 dell'audit.
export const PASSWORD_MIN = 12;

/** @type {[RegExp, string][]} */
const REQUISITI_PASSWORD = [
  [/.{12,}/, "almeno 12 caratteri"],
  [/[a-z]/, "una lettera minuscola"],
  [/[A-Z]/, "una lettera maiuscola"],
  [/\d/, "una cifra"],
];

// Frase unica dei requisiti, usata sia dal messaggio di validazione sia da
// chi deve descriverli fuori da un validatore (LoginScreen, che traduce il
// rifiuto `weak_password` di GoTrue): un solo posto in cui i requisiti sono
// elencati, non due frasi che potrebbero divergere.
export const REQUISITI_PASSWORD_TESTO = REQUISITI_PASSWORD.map(([, t]) => t).join(", ");

export const passwordValida = () => (v) => {
  if (typeof v !== "string") return `La password deve avere ${REQUISITI_PASSWORD_TESTO}.`;
  const mancanti = REQUISITI_PASSWORD.filter(([rx]) => !rx.test(v)).map(([, t]) => t);
  return mancanti.length ? `La password deve avere ${mancanti.join(", ")}.` : null;
};
