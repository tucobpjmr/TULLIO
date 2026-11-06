// src/lib/erroriCambioPassword.js
// Il rifiuto di GoTrue a un cambio password, detto in italiano.
//
// A-3 dell'analisi del 6 novembre. Ora il cambio password dal profilo porta
// la password attuale (`current_password`), e con l'opzione «Require current
// password when changing password» attiva su Supabase Auth è GoTrue a
// controllarla. Quindi i rifiuti nuovi arrivano dal server: questa funzione li
// traduce, non li decide. Un codice che non conosce lascia il messaggio
// originale. Meglio un inglese giusto di un italiano sbagliato.
import { REQUISITI_PASSWORD_TESTO } from "./validators.js";

/** @type {Record<string, string>} */
const MESSAGGI = {
  current_password_mismatch: "La password attuale non è corretta.",
  current_password_required: "Inserisci la password attuale.",
  same_password: "La nuova password deve essere diversa da quella attuale.",
  weak_password: `Password troppo debole: usa ${REQUISITI_PASSWORD_TESTO}.`,
  // «Secure password change»: su una sessione aperta da più di 24 ore GoTrue
  // vorrebbe anche un codice via email, che questa schermata non chiede.
  // Uscire e rientrare apre una sessione nuova.
  reauthentication_needed: "Per sicurezza esci, rientra e riprova.",
  over_request_rate_limit: "Troppi tentativi. Riprova tra qualche minuto.",
};

/**
 * @param {{ code?: string, message?: string } | null | undefined} errore
 * @returns {string}
 */
export function messaggioCambioPassword(errore) {
  const codice = errore?.code ?? "";
  if (MESSAGGI[codice]) return MESSAGGI[codice];
  const testo = (errore?.message ?? "").toLowerCase();
  if (testo.includes("network") || testo.includes("failed to fetch")) {
    return "Errore di rete. Verifica la connessione.";
  }
  return errore?.message || "Cambio password non riuscito.";
}
