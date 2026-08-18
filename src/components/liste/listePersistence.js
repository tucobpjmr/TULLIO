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
// COSA NON FA, DI PROPOSITO. Nessun update ottimistico e nessun rollback,
// a differenza di state/persistence.js. Non è una semplificazione: il modulo
// non mostra MAI uno stato che il database non abbia già confermato — ogni
// scrittura è una RPC transazionale (dato + voce di lista_history nella stessa
// transazione) seguita da un reload. Aggiungere qui un livello ottimistico
// introdurrebbe la classe di disallineamenti che il registry del core esiste
// per chiudere, invece di prevenirla.
//
// FORMA DI UNA ENTRY:
//   run(...args)      → l'operazione su Supabase. Ritorna { data, error } come
//                       qualunque chiamata supabase-js.
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
// `if (r?.error)` a mano in un sottosistema nuovo»).
import { esitoScrittura } from "../../lib/esitoScrittura.js";
import { useAppData } from "../../state/AppDataContext.jsx";

// La conferma testuale che reset_completo() pretende lato database. Vive qui e
// non nel componente: è metà del contratto della RPC, e un refuso nel
// chiamante trasformerebbe l'operazione in un errore incomprensibile.
export const CONFERMA_RESET = "RESET TOTALE";

export const LISTE_WRITES = {
  // ─── LISTE ─────────────────────────────────────────────────────────────────
  creaLista: {
    run: (payload) => ListeAPI.crea(payload),
    successMsg: "Lista creata",
  },

  // Modifica dei dati della lista dalla modale di edit (titolo + eventuale
  // rinomina del cliente). Distinta da modificaTitolo qui sotto benché passi
  // dalla stessa RPC: sono due operazioni di dominio diverse, con due messaggi
  // diversi, e tenerle separate è ciò che rende il registry leggibile come un
  // elenco di cose che l'utente fa.
  modificaLista: {
    run: (payload) => ListeAPI.modifica(payload),
    successMsg: "Dati lista aggiornati",
  },

  // clientName null: la RPC lascia il nome cliente invariato.
  modificaTitolo: {
    run: ({ id, titolo }) => ListeAPI.modifica({ id, titolo, clientName: null }),
    successMsg: ({ titolo }) => (titolo ? "Titolo aggiornato" : "Titolo rimosso"),
  },

  modificaNote: {
    run: ({ id, note }) => ListeAPI.modificaNote({ id, note }),
    successMsg: ({ note }) => (note ? "Note interne aggiornate" : "Note interne rimosse"),
  },

  riapriLista: {
    run: (id) => ListeAPI.cambiaStato(id, "attiva"),
    successMsg: "Lista riaperta",
  },

  esaurisciLista: {
    run: (id) => ListeAPI.cambiaStato(id, "esaurita"),
    successMsg: "Lista segnata come ESAURITA",
  },

  cestinaLista: {
    run: (id) => ListeAPI.archivia(id),
    successMsg: "Lista spostata nel cestino",
  },

  ripristinaLista: {
    run: (id) => ListeAPI.ripristina(id),
    successMsg: "Lista ripristinata",
  },

  eliminaListaDefinitivamente: {
    run: (id) => ListeAPI.eliminaDefinitiva(id),
    successMsg: "Lista eliminata definitivamente",
  },

  // ─── COINTESTAZIONE ────────────────────────────────────────────────────────
  spostaTitolare: {
    run: (id, nuovoClientId) => ListeAPI.spostaTitolare(id, nuovoClientId),
    successMsg: "Titolare spostato",
  },

  aggiungiCointestatario: {
    run: (payload) => ListeAPI.aggiungiBeneficiario(payload),
    successMsg: "Cointestatario aggiunto",
  },

  rimuoviCointestatario: {
    run: (listaId, clientId) => ListeAPI.rimuoviBeneficiario(listaId, clientId),
    successMsg: "Cointestatario rimosso",
  },

  // ─── MOVIMENTI ─────────────────────────────────────────────────────────────
  registraMovimento: {
    run: (payload) => ListeAPI.addMovimento(payload),
    successMsg: "Movimento registrato",
  },

  // Il chiamante compone il messaggio dal numero di righe scritte, che conosce
  // solo dopo la risposta.
  registraMovimenti: {
    run: (payload) => ListeAPI.addMovimenti(payload),
  },

  modificaMovimento: {
    run: (payload) => ListeAPI.modificaMovimento(payload),
    successMsg: "Movimento aggiornato",
  },

  annullaMovimento: {
    run: (id) => ListeAPI.annullaMovimento(id),
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
    run: (payload, onProgress) => ListeAPI.importaBackup(payload, onProgress),
  },

  // L'unica operazione distruttiva e irreversibile del modulo. Il gate lato
  // client era il solo fatto che il bottone non venisse renderizzato per i
  // non-admin: nessun controllo sul percorso di esecuzione. La RPC ha il
  // proprio `private.is_admin()` nel corpo ed è quella che conta davvero, ma
  // questo guard è la difesa in profondità che ogni altra scrittura
  // privilegiata dell'app ha già (vedi ADMIN_ONLY_ACTIONS nel reducer).
  resetTotale: {
    guard: (team, uid) => isAdmin(team, uid),
    run: () => ListeAPI.resetCompleto(CONFERMA_RESET),
  },
};

// Testo del toast di successo per una entry, dati gli argomenti della chiamata.
const messaggioSuccesso = (spec, args) =>
  (typeof spec.successMsg === "function" ? spec.successMsg(...args) : spec.successMsg) || null;

/**
 * Esecutore delle scritture del modulo.
 *
 * Sostituisce `runListeCall(dispatch, ListeAPI.x(args), "messaggio")`: il nome
 * della RPC e il messaggio non sono più decisi al call site, che dichiara
 * soltanto QUALE operazione di dominio sta eseguendo.
 *
 *   const esegui = useListeWrite(dispatch);
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
export function useListeWrite(dispatch) {
  const { team, currentUserId } = useAppData();

  return useCallback(async (op, ...args) => {
    const spec = LISTE_WRITES[op];
    // Un'operazione non dichiarata è un errore di programmazione, non un caso
    // da gestire: fallire rumorosamente qui è preferibile a una scrittura
    // silenziosamente saltata.
    if (!spec) throw new Error(`[liste] operazione non dichiarata in LISTE_WRITES: "${op}"`);

    if (spec.guard && !spec.guard(team, currentUserId)) {
      dispatch({
        type: "SHOW_TOAST",
        payload: { type: "error", message: "Non hai i permessi per questa operazione" },
      });
      return { ok: false, data: null };
    }

    const res = await spec.run(...args);
    // ⚠️ Oggi le diciotto operazioni di questo registry passano tutte da una
    // RPC, che non ritorna un conteggio di righe: `esitoScrittura` si comporta
    // quindi esattamente come l'`if (error)` che sostituisce. È voluto e non
    // rende l'adozione inutile — il valore è che il giorno in cui una scrittura
    // del modulo toccherà una tabella direttamente (con `count: 'exact'`), il
    // rifiuto silenzioso della RLS sarà già visto qui invece di dover essere
    // scoperto una terza volta.
    const error = esitoScrittura(res);
    if (error) {
      console.error("[liste]", op, error);
      const testo = (spec.mapError ? spec.mapError(error) : error.message) || "errore sconosciuto";
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${testo}` } });
      return { ok: false, data: null };
    }
    const { data } = res;

    const msg = messaggioSuccesso(spec, args);
    if (msg) dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: msg } });
    return { ok: true, data };
  }, [dispatch, team, currentUserId]);
}
