// src/state/visteRiservate.js
// Quali viste richiedono un ruolo, e che cosa si risponde a chi non ce l'ha.
//
// ─── PERCHÉ UN FILE SUO ─────────────────────────────────────────────────────
// Erano tre `if` consecutivi dentro `case "SET_VIEW"` di `state/reducer.js`,
// identici nella forma e diversi solo per la coppia (predicato, messaggio).
// Il terzo — l'archivio documenti — è quello che ha reso evidente il pattern e
// ha portato `reducer.js` a 857 righe fisiche, oltre il tetto di 850 che
// `verifica:convenzioni` tiene a zero file. La risposta è la stessa data ad
// A-4 dell'audit del 12 agosto su `ListeViaggio.jsx` (495/500 righe): non si
// comprime il commento, si estrae la parte che è diventata una tabella.
//
// Il guadagno non è di righe. È che aggiungere la QUARTA vista riservata ora
// significa aggiungere una riga a questo oggetto, invece di copiare un `if`
// dal vicino — che è esattamente il modo in cui, nella storia di questo
// progetto, un guard è stato dimenticato (le tre migrazioni di hardening del
// modulo Liste committate e mai applicate, vedi docs/MIGRAZIONI_SUPABASE.md).
//
// ⛔ NON È IL CONTROLLO CHE PROTEGGE I DATI. Quello è la RLS, e resta il solo
// che un utente non possa aggirare. Questo evita di MONTARE una vista che
// mostrerebbe soltanto errori, e dà un diniego leggibile invece di una
// schermata vuota.

import { canAccessAdmin, canAccessListe, canAccessDocumenti } from "../lib/permissions.js";

/**
 * Vista → il predicato che la apre e il messaggio di diniego.
 *
 * I predicati sono quelli di `lib/permissions.js`, cioè le stesse funzioni che
 * `state/persistence.js` usa per le scritture: una vista e le mutazioni che
 * contiene non possono rispondere in modo diverso alla stessa domanda.
 *
 * Le viste ASSENTI da qui sono aperte a tutti i ruoli (dashboard, calendario,
 * archivio task, cestino): l'assenza è il default permissivo, ed è leggibile
 * perché l'elenco è corto.
 *
 * @type {Record<string, { puo: (team: object[], userId: string) => boolean, diniego: string }>}
 */
export const VISTE_RISERVATE = {
  admin: {
    puo: canAccessAdmin,
    diniego: "Non hai i permessi per accedere all'Admin",
  },
  // Riservata ad admin/manager/agent attivi. Il verdetto arriva da
  // `canAccessListe`, che rispecchia `can_liste()` del database: era scritto
  // nel reducer come `isDriver(...)`, cioè una seconda definizione della
  // stessa regola che coincideva con la prima solo per i casi ordinari.
  liste: {
    puo: canAccessListe,
    diniego: "Il modulo Liste viaggio non è disponibile per il tuo ruolo",
  },
  // Stesso insieme di ruoli, funzione propria: `can_documenti()` lato database
  // e `canAccessDocumenti` qui — vedi il perché in lib/permissions.js. La voce
  // di nav è già filtrata per ruolo (shell/navHelpers.js), ma `activeView` si
  // imposta anche da percorsi che non passano dalla nav (la query `?v=`, una
  // notifica push), ed è l'ultimo punto prima di montare una vista che mostra
  // documenti di identità.
  documenti: {
    puo: canAccessDocumenti,
    diniego: "L'archivio documenti non è disponibile per il tuo ruolo",
  },
};

/**
 * Il messaggio di diniego se questa vista è chiusa a questo utente, `null` se
 * può aprirla.
 *
 * Ritorna il MESSAGGIO e non un booleano perché il chiamante ha bisogno di
 * entrambi e un booleano lo costringerebbe a cercare il testo da un'altra
 * parte — cioè a tenere allineate due mappe invece di una.
 *
 * @param {string} vista
 * @param {object[]} team
 * @param {string} userId
 * @returns {string|null}
 */
export function dinegoVista(vista, team, userId) {
  const regola = VISTE_RISERVATE[vista];
  if (!regola) return null;
  return regola.puo(team, userId) ? null : regola.diniego;
}
