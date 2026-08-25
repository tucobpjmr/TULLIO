// src/state/registroScritture.js
// M-1 dell'audit del 25 agosto · IL contratto di un registry di scrittura.
//
// PERCHÉ ESISTE. L'app ha due registry dichiarativi — `PERSISTENCE`
// (state/persistence.js, eseguito da hooks/useSyncedDispatch.js) e
// `LISTE_WRITES` (components/liste/listePersistence.js, eseguito da
// `useListeWrite`) — e finora erano due MONDI, non due istanze di una cosa
// sola:
//
//   • due nomi per l'operazione (`persist` di qua, `run` di là);
//   • due copie della lettura dell'esito (l'una sapeva gestire un array di
//     risposte, l'altra no);
//   • due copie di «testo utente dell'errore» (`mapError` o `err.message`, con
//     un fallback);
//   • due frasi diverse per lo stesso evento davanti all'utente —
//     «Salvataggio fallito: …» nel core, «Errore: …» nelle liste;
//   • e soprattutto: la differenza VERA fra i due era descritta a parole in
//     cima a uno dei due file («COSA NON FA, DI PROPOSITO»), quindi non era
//     verificata da niente.
//
// ─── L'UNICO ASSE SU CUI DIFFERISCONO ──────────────────────────────────────
// I due registry appartengono a due FAMIGLIE, e la scelta è di dominio:
//
//   OTTIMISTICO (il core). Lo stato cambia SUBITO, la scrittura parte dopo, e
//   se fallisce si compensa. Serve perché il core è ciò che l'operatore tocca
//   in continuazione — spuntare una task, riassegnarla — e mezzo secondo di
//   attesa per gesto è la differenza fra un gestionale e un modulo web. Il
//   prezzo è tutto il macchinario che rende quella bugia temporanea sicura:
//   `rollback`, `entityId` (le scritture in volo che un refetch concorrente non
//   deve sovrascrivere) e il ritiro del toast di successo già accodato.
//
//   CONFERMA PRIMA (le liste). Lo stato non cambia finché il database non ha
//   confermato: ogni scrittura è una RPC transazionale (dato + voce di
//   `lista_history` nella stessa transazione) seguita da un reload. Serve
//   perché qui il dato è denaro — acconti, saldi, movimenti di un buono
//   viaggio — e un saldo mostrato che il database non ha è un difetto di
//   un'altra categoria rispetto a una spunta che torna indietro.
//
// La conseguenza si legge nella FORMA delle entry, e non è una convenzione: un
// registry della famiglia "conferma prima" NON PUÒ avere `rollback`,
// `entityId` o `normalize`, perché non c'è niente da compensare, niente in volo
// e niente da arricchire prima di un dispatch che non avviene. È misurato in
// src/test/registroScritture.test.js — la prosa che lo diceva non lo era.
//
// Il terzo posto in cui l'app scrive, `components/chat/chatCommands.js`, non è
// un registry a tabella ma una factory di comandi imperativi, e resta fuori da
// qui: condivide già ciò che conta, cioè `lib/esitoScrittura.js`. Se un giorno
// diventasse una tabella, questa è la forma in cui scriverla.

import { esitoScrittura } from "../lib/esitoScrittura.js";

// ─── vocabolario ──────────────────────────────────────────────────────────
// I campi che una entry può dichiarare, divisi per famiglia. Non è
// documentazione: il test li usa per intercettare un campo scritto male
// (`mapErrror`, `sucessMsg`), che oggi non produrrebbe alcun errore — la entry
// verrebbe semplicemente eseguita senza quel comportamento, in silenzio.
export const CAMPI_COMUNI = ["persist", "guard", "mapError"];
export const CAMPI_OTTIMISTICI = ["normalize", "rollback", "entityId"];
export const CAMPI_CONFERMA_PRIMA = ["successMsg"];

/**
 * L'errore di una scrittura, o null. Accetta sia il singolo esito supabase-js
 * sia l'array che ritornano le entry costruite con `Promise.all`: il primo
 * rifiuto vince, perché è quello di cui l'utente deve sapere.
 *
 * Il caso "array" viveva solo nell'orchestratore del core. Non è una
 * particolarità sua — è una particolarità delle entry che scrivono più righe,
 * e quelle possono nascere in entrambi i registry.
 */
export const erroreDiScrittura = (res) => (
  Array.isArray(res) ? res.map(esitoScrittura).find(Boolean) || null : esitoScrittura(res)
);

/**
 * Il testo da mostrare all'utente per un errore di scrittura: quello che la
 * entry sa tradurre (`mapError`), altrimenti il messaggio grezzo, altrimenti
 * il ripiego. Un errore senza testo è un toast vuoto, ed è successo.
 */
export const testoErrore = (spec, err, ripiego = "errore sconosciuto") =>
  (spec?.mapError ? spec.mapError(err) : err?.message) || ripiego;

/**
 * Il messaggio di successo di una entry, dati gli argomenti della chiamata:
 * stringa, funzione di quegli argomenti, o assente quando è il chiamante a
 * comporlo dai dati di ritorno.
 */
export const messaggioSuccesso = (spec, args = []) =>
  (typeof spec?.successMsg === "function" ? spec.successMsg(...args) : spec?.successMsg) || null;

// ─── i due toast, con UNA frase per evento ────────────────────────────────
// Prima erano «Salvataggio fallito: …» nel core e «Errore: …» nelle liste: due
// modi di dire la stessa cosa allo stesso utente, scelti in due momenti
// diversi. Vince il primo perché dice anche COSA è fallito — «Errore» da solo
// non distingue una scrittura respinta da un caricamento andato storto.
export const toastErrore = (testo) => ({
  type: "SHOW_TOAST",
  payload: { type: "error", message: `Salvataggio fallito: ${testo}` },
});

export const toastSuccesso = (message) => ({
  type: "SHOW_TOAST",
  payload: { type: "success", message },
});
