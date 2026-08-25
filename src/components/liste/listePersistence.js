// src/components/liste/listePersistence.js
// Registry dichiarativo delle SCRITTURE del modulo Liste viaggio.
//
// PERCHÉ ESISTE. È il gemello di state/persistence.js per l'unico modulo che
// non passa dal reducer, e nasce dallo stesso problema: finché le scritture
// vivono sparse nei componenti, ogni call site è libero di dimenticare un
// pezzo, e nessuno se ne accorge in review. Qui erano diciotto operazioni
// distribuite su quattro file, ciascuna scritta come
//
//     const { ok } = await runListeCall(dispatch, ListeAPI.qualcosa(args), "messaggio");
//
// cioè con il nome della RPC, il messaggio di successo e — quando serviva — il
// controllo di ruolo scelti a mano, uno per uno. Il costo concreto: lo stesso
// "Lista creata" ricopiato in due file, "Lista riaperta" in altri due, e il
// reset totale (la sola operazione distruttiva e irreversibile del modulo)
// protetto unicamente dal fatto che il bottone fosse nascosto ai non-admin.
// Nascondere un bottone non è un controllo: è una scelta di layout.
//
// LA FAMIGLIA È «CONFERMA PRIMA», e non è una semplificazione. Nessun update
// ottimistico e nessun rollback, a differenza di state/persistence.js: il
// modulo non mostra MAI uno stato che il database non abbia già confermato —
// ogni scrittura è una RPC transazionale (dato + voce di lista_history nella
// stessa transazione) seguita da un reload. Qui il dato è denaro (acconti,
// saldi, movimenti di un buono viaggio), e un saldo mostrato che il database
// non ha è un difetto di un'altra categoria rispetto a una spunta che torna
// indietro.
//
// M-1 (audit del 25 agosto): quella scelta era descritta QUI a parole, e per
// questo non la verificava nessuno. Ora le due famiglie sono dichiarate in
// state/registroScritture.js — che è anche il posto in cui vivono le parti
// dell'esecutore comuni ai due registry — e la conseguenza sulla FORMA delle
// entry (niente `rollback`, `entityId`, `normalize`: non c'è nulla da
// compensare, nulla in volo, nessun dispatch da arricchire prima) è misurata
// in src/test/registroScritture.test.js.
//
// FORMA DI UNA ENTRY:
//   persist(...args)  → l'operazione su Supabase. Ritorna { data, error } come
//                       qualunque chiamata supabase-js. Stesso nome che ha nel
//                       core: è la stessa cosa, e chiamarla `run` di qua e
//                       `persist` di là faceva sembrare due mondi ciò che è un
//                       contratto solo.
//   successMsg        → testo del toast di successo: stringa, oppure funzione
//                       degli stessi args (alcuni messaggi dipendono dal
//                       valore scritto), oppure assente quando è il chiamante a
//                       comporre il messaggio dai dati di ritorno.
//   guard(team, uid)  → controllo di permesso AGGIUNTIVO, valutato prima di
//                       toccare la rete. Assente = basta l'accesso al modulo.
//   mapError(err)     → testo utente al posto del messaggio grezzo.
//
// L'esecutore è useListeWrite(), in fondo a questo file.

import { useCallback } from "react";
import { ListeAPI } from "./listeApi.js";
import { isAdmin, canImportBackup } from "../../lib/permissions.js";
// A-1 (audit di architettura del 15 agosto), residuo concreto. «È andata
// bene» non è `!res.error`: una scrittura che la RLS rifiuta risponde 2xx
// senza errore, e `lib/esitoScrittura.js` è nato apposta per dare UNA
// definizione ai tre registry dell'app — il core, la chat e questo. I primi
// due l'avevano adottata; questo era rimasto con il proprio `if (error)`
// scritto a mano, cioè la terza copia cieca che quel modulo esiste per
// togliere di mezzo (vedi il ⛔ in docs/CLAUDE.md: «Non riscrivere
// `if (r?.error)` a mano in un sottosistema nuovo»). Da M-1 quella lettura
// arriva da `erroreDiScrittura`, che è `esitoScrittura` più il caso "array di
// risposte": un'astrazione in meno da ricordare, e la stessa dei due registry.
import {
  erroreDiScrittura, messaggioSuccesso, testoErrore, toastErrore, toastSuccesso,
} from "../../state/registroScritture.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useDispatch } from "../../state/DispatchContext.jsx";

// La conferma testuale che reset_completo() pretende lato database. Vive qui e
// non nel componente: è metà del contratto della RPC, e un refuso nel
// chiamante trasformerebbe l'operazione in un errore incomprensibile.
export const CONFERMA_RESET = "RESET TOTALE";

export const LISTE_WRITES = {
  // ─── LISTE ─────────────────────────────────────────────────────────────────
  creaLista: {
    persist: (payload) => ListeAPI.crea(payload),
    successMsg: "Lista creata",
  },

  // Modifica dei dati della lista dalla modale di edit (titolo + eventuale
  // rinomina del cliente). Distinta da modificaTitolo qui sotto benché passi
  // dalla stessa RPC: sono due operazioni di dominio diverse, con due messaggi
  // diversi, e tenerle separate è ciò che rende il registry leggibile come un
  // elenco di cose che l'utente fa.
  modificaLista: {
    persist: (payload) => ListeAPI.modifica(payload),
    successMsg: "Dati lista aggiornati",
  },

  // clientName null: la RPC lascia il nome cliente invariato.
  modificaTitolo: {
    persist: ({ id, titolo }) => ListeAPI.modifica({ id, titolo, clientName: null }),
    successMsg: ({ titolo }) => (titolo ? "Titolo aggiornato" : "Titolo rimosso"),
  },

  modificaNote: {
    persist: ({ id, note }) => ListeAPI.modificaNote({ id, note }),
    successMsg: ({ note }) => (note ? "Note interne aggiornate" : "Note interne rimosse"),
  },

  riapriLista: {
    persist: (id) => ListeAPI.cambiaStato(id, "attiva"),
    successMsg: "Lista riaperta",
  },

  esaurisciLista: {
    persist: (id) => ListeAPI.cambiaStato(id, "esaurita"),
    successMsg: "Lista segnata come ESAURITA",
  },

  cestinaLista: {
    persist: (id) => ListeAPI.archivia(id),
    successMsg: "Lista spostata nel cestino",
  },

  ripristinaLista: {
    persist: (id) => ListeAPI.ripristina(id),
    successMsg: "Lista ripristinata",
  },

  eliminaListaDefinitivamente: {
    persist: (id) => ListeAPI.eliminaDefinitiva(id),
    successMsg: "Lista eliminata definitivamente",
  },

  // ─── COINTESTAZIONE ────────────────────────────────────────────────────────
  spostaTitolare: {
    persist: (id, nuovoClientId) => ListeAPI.spostaTitolare(id, nuovoClientId),
    successMsg: "Titolare spostato",
  },

  aggiungiCointestatario: {
    persist: (payload) => ListeAPI.aggiungiBeneficiario(payload),
    successMsg: "Cointestatario aggiunto",
  },

  rimuoviCointestatario: {
    persist: (listaId, clientId) => ListeAPI.rimuoviBeneficiario(listaId, clientId),
    successMsg: "Cointestatario rimosso",
  },

  // ─── MOVIMENTI ─────────────────────────────────────────────────────────────
  registraMovimento: {
    persist: (payload) => ListeAPI.addMovimento(payload),
    successMsg: "Movimento registrato",
  },

  // Il chiamante compone il messaggio dal numero di righe scritte, che conosce
  // solo dopo la risposta.
  registraMovimenti: {
    persist: (payload) => ListeAPI.addMovimenti(payload),
  },

  modificaMovimento: {
    persist: (payload) => ListeAPI.modificaMovimento(payload),
    successMsg: "Movimento aggiornato",
  },

  annullaMovimento: {
    persist: (id) => ListeAPI.annullaMovimento(id),
    successMsg: "Movimento eliminato (tracciato nello storico)",
  },

  // ─── STRUMENTI DATI ────────────────────────────────────────────────────────
  // Il messaggio di successo elenca le righe importate: lo compone il chiamante
  // dai contatori di ritorno.
  //
  // guard (M-1 dell'audit del 15 agosto): la RPC importa_backup ora richiede
  // private.is_admin() lato DB (era can_liste(), admin/manager/agent — più
  // largo dell'unico ingresso in UI, riservato agli admin). Il guard qui è
  // la stessa difesa in profondità che resetTotale ha già sotto: il bottone
  // nascosto agli altri ruoli non è un controllo, è un layout.
  importaBackup: {
    guard: (team, uid) => canImportBackup(team, uid),
    persist: (payload, onProgress) => ListeAPI.importaBackup(payload, onProgress),
  },

  // L'unica operazione distruttiva e irreversibile del modulo. Il gate lato
  // client era il solo fatto che il bottone non venisse renderizzato per i
  // non-admin: nessun controllo sul percorso di esecuzione. La RPC ha il
  // proprio `private.is_admin()` nel corpo ed è quella che conta davvero, ma
  // questo guard è la difesa in profondità che ogni altra scrittura
  // privilegiata dell'app ha già (vedi ADMIN_ONLY_ACTIONS nel reducer).
  resetTotale: {
    guard: (team, uid) => isAdmin(team, uid),
    persist: () => ListeAPI.resetCompleto(CONFERMA_RESET),
  },
};

/**
 * Esecutore delle scritture del modulo.
 *
 * Sostituisce `runListeCall(dispatch, ListeAPI.x(args), "messaggio")`: il nome
 * della RPC e il messaggio non sono più decisi al call site, che dichiara
 * soltanto QUALE operazione di dominio sta eseguendo.
 *
 *   const esegui = useListeWrite();
 *   const { ok } = await esegui("cestinaLista", lista.id);
 *
 * Ritorna sempre `{ ok, data }` — stessa forma di prima, così i chiamanti
 * possono riabilitare il proprio bottone quando la scrittura fallisce.
 *
 * NOTA sull'accesso al modulo. Qui NON si ricontrolla `canAccessListe`: quel
 * verdetto è già applicato dal reducer (SET_VIEW), dal ramo di uscita di
 * ListeViaggio e dalla RLS, e aggiungerne una quarta copia sarebbe esattamente
 * l'errore che questo lavoro sta rimuovendo. Il registry dichiara i permessi
 * che quel gate NON copre, cioè quelli più stretti della soglia del modulo.
 */
export function useListeWrite() {
  const dispatch = useDispatch();
  const { team, currentUserId } = useAppData();

  return useCallback(async (op, ...args) => {
    const spec = LISTE_WRITES[op];
    // Un'operazione non dichiarata è un errore di programmazione, non un caso
    // da gestire: fallire rumorosamente qui è preferibile a una scrittura
    // silenziosamente saltata.
    if (!spec) throw new Error(`[liste] operazione non dichiarata in LISTE_WRITES: "${op}"`);

    if (spec.guard && !spec.guard(team, currentUserId)) {
      dispatch(toastErrore("non hai i permessi per questa operazione"));
      return { ok: false, data: null };
    }

    const res = await spec.persist(...args);
    // ⚠️ Oggi le diciotto operazioni di questo registry passano tutte da una
    // RPC, che non ritorna un conteggio di righe: `erroreDiScrittura` si comporta
    // quindi esattamente come l'`if (error)` che sostituisce. È voluto e non
    // rende l'adozione inutile — il valore è che il giorno in cui una scrittura
    // del modulo toccherà una tabella direttamente (con `count: 'exact'`), il
    // rifiuto silenzioso della RLS sarà già visto qui invece di dover essere
    // scoperto una terza volta.
    const error = erroreDiScrittura(res);
    if (error) {
      console.error("[liste]", op, error);
      dispatch(toastErrore(testoErrore(spec, error)));
      return { ok: false, data: null };
    }
    const { data } = res;

    const msg = messaggioSuccesso(spec, args);
    if (msg) dispatch(toastSuccesso(msg));
    return { ok: true, data };
  }, [dispatch, team, currentUserId]);
}
