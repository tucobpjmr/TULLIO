// src/state/codaScritture.js
// La coda delle scritture rifiutate DALLA RETE, non dal server.
//
// ─── M-2 dell'audit del 10 settembre · IL PROBLEMA ─────────────────────────
// Leggere da offline funziona da M-1 del 5 settembre: il service worker tiene
// in cache il guscio, l'app si apre, le strisce di condizione dicono che i
// dati sono fermi. Scrivere no: `useSyncedDispatch` trattava un `TypeError:
// Failed to fetch` come qualunque altro fallimento — rollback dello stato
// ottimistico e toast rosso — cioè buttava via il lavoro dell'utente e glielo
// diceva. Per i due driver in mobilità, che è la popolazione che va offline
// per mestiere, «riprova quando torna la rete» significa rifare a mano una
// spunta o un commento che erano già stati scritti una volta.
//
// ─── COSA FA, E COSA NON FA ───────────────────────────────────────────────
// Fa: mette da parte l'azione GIÀ NORMALIZZATA, la ritrova dopo un reload o
// una riapertura della PWA (il deposito è IndexedDB, vedi lib/depositoIdb.js)
// e la rigioca in ordine quando la rete torna.
//
// NON fa — e ognuna di queste è una decisione, non una mancanza:
//
//   • NON accoda tutto. Solo le entry del registry che dichiarano
//     `offline: true`. Il criterio è scritto in state/persistence.js accanto
//     alle entry: `persist` che non legge lo stato, payload già materializzato
//     da `normalize`, e un significato che non scade. `EMPTY_TRASH` — «svuota
//     ciò che è nel cestino ADESSO» — rigiocata un'ora dopo cancellerebbe
//     cose diverse da quelle che l'utente ha visto.
//   • NON ordina per entità né deduplica. Se l'utente sposta la stessa task
//     tre volte da offline, partono tre scritture nello stesso ordine: la
//     terza vince, ed è ciò che l'utente ha visto sullo schermo. Comprimerle
//     richiederebbe conoscere la semantica di ogni azione, che è esattamente
//     ciò che il registry esiste per tenere fuori da qui.
//   • NON risolve conflitti. L'ultima scrittura vince, come quando la rete
//     c'è: questa coda RITARDA una scrittura, non cambia il modello di
//     concorrenza dell'app.
//   • NON è un archivio. Ha un tetto di voci e un'età massima: una coda che
//     cresce senza limite è un difetto peggiore di quello che chiude.

/** Oltre questo numero di voci la coda smette di accettare: vedi `accoda`. */
export const MAX_VOCI = 200;

/** Una voce più vecchia di così non viene più rigiocata: vedi `elenco`. */
export const ETA_MASSIMA_MS = 7 * 24 * 60 * 60 * 1000;

// I messaggi con cui un fetch fallito si presenta, per browser. Non c'è un
// codice: `fetch` rifiuta con un `TypeError` e un testo che ogni motore
// scrive a modo suo — Chrome «Failed to fetch», Firefox «NetworkError when
// attempting to fetch resource», Safari «Load failed», e supabase-js a volte
// lo re-impacchetta in `error.message` invece di rifiutare.
const TESTI_DI_RETE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|econnrefused|timeout/i;

/**
 * È un guasto di RETE (la scrittura non è mai arrivata al server) o un rifiuto
 * DEL server (RLS, vincolo, dato invalido)? La distinzione è tutta la coda:
 * il primo si rigioca identico, il secondo si rigiocherebbe all'infinito.
 *
 * `navigator.onLine === false` ha la precedenza su qualunque testo: se il
 * browser dichiara che non c'è rete nel momento in cui la scrittura fallisce,
 * il motivo è quello — qualunque cosa dica il messaggio.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function guastoDiRete(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const testo = err && typeof err === "object"
    ? String(/** @type {{message?: unknown}} */ (err).message ?? "")
    : String(err ?? "");
  return TESTI_DI_RETE.test(testo);
}

/**
 * La riga c'era GIÀ con il nostro id: la scrittura era arrivata al server, ed
 * è la risposta che si è persa per strada (galleria, tab chiusa a metà
 * richiesta). Rigiocandola il database risponde `23505` — unique_violation.
 *
 * Trattarlo come successo è corretto SOLO per le entry accodabili, ed è il
 * motivo per cui questa funzione vive qui e non in lib/: quelle entry
 * inseriscono righe il cui unico vincolo di unicità è la chiave primaria, e
 * quella chiave la genera `normalize` sul CLIENT (`newId()`), prima di
 * qualunque tentativo. Un `23505` su una di loro può quindi voler dire una
 * cosa sola: «questa riga, con questo id, l'ho scritta io».
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function scritturaGiaApplicata(err) {
  return !!err && typeof err === "object"
    && /** @type {{code?: unknown}} */ (err).code === "23505";
}

/**
 * @typedef {object} VoceCoda
 * @property {number} [id]     chiave assegnata dal deposito.
 * @property {string} uid      l'utente che ha prodotto la scrittura.
 * @property {string} tipo     `action.type`, cioè la chiave nel registry.
 * @property {any}    azione   l'azione GIÀ normalizzata, com'è stata applicata
 *   allo stato locale: rigiocare quella e non l'originale è ciò che tiene
 *   allineati l'id locale e quello scritto sul server.
 * @property {number} creatoIl millisecondi epoch.
 */

/**
 * La coda, sopra un deposito qualunque (IndexedDB in produzione, memoria nei
 * test — vedi lib/depositoIdb.js).
 *
 * @param {import("../lib/depositoIdb.js").Deposito} deposito
 * @param {{ adesso?: () => number }} [opzioni]
 */
export function creaCodaScritture(deposito, { adesso = () => Date.now() } = {}) {
  return {
    /** Il deposito promette di sopravvivere alla chiusura dell'app? */
    persistente: deposito.persistente,

    /**
     * Mette in coda una scrittura. Torna `false` quando NON ha potuto — coda
     * piena o deposito rotto — e quel `false` non è un dettaglio: chi chiama
     * deve poter tornare al comportamento di prima (rollback + toast rosso)
     * invece di dire all'utente che il lavoro è al sicuro quando non lo è.
     *
     * @param {{uid: string, tipo: string, azione: any}} scrittura
     * @returns {Promise<boolean>}
     */
    async accoda({ uid, tipo, azione }) {
      try {
        const presenti = await deposito.tutte();
        if (presenti.length >= MAX_VOCI) return false;
        await deposito.aggiungi({ uid, tipo, azione, creatoIl: adesso() });
        return true;
      } catch {
        // Nessun `console.error`: il chiamante lo registra con il contesto
        // dell'azione, che qui non c'è.
        return false;
      }
    },

    /**
     * Le voci da rigiocare per questo utente, in ordine di inserimento. Le
     * scadute vengono RIMOSSE, non solo saltate: una voce che nessuno
     * rigiocherà più è spazzatura che occupa il tetto di `MAX_VOCI`.
     *
     * Le voci di un ALTRO utente restano dove sono: sullo stesso dispositivo
     * possono essersi alternati due account (è un gestionale su un telefono di
     * servizio), e la scrittura di uno non si rigioca con la sessione
     * dell'altro — la RLS la rifiuterebbe, e avrebbe ragione.
     *
     * @param {string} uid
     * @returns {Promise<VoceCoda[]>}
     */
    async elenco(uid) {
      let righe = [];
      try {
        righe = await deposito.tutte();
      } catch {
        return [];
      }
      const limite = adesso() - ETA_MASSIMA_MS;
      const vive = [];
      for (const r of righe) {
        if (!r || typeof r.creatoIl !== "number" || r.creatoIl < limite) {
          if (r?.id != null) await deposito.rimuovi(r.id).catch(() => {});
          continue;
        }
        if (r.uid === uid) vive.push(r);
      }
      return vive.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    },

    /** Quante voci aspettano, per questo utente. */
    async conta(uid) {
      return (await this.elenco(uid)).length;
    },

    /** @param {number} id */
    async rimuovi(id) {
      try {
        await deposito.rimuovi(id);
      } catch { /* una voce che non si riesce a togliere scade da sola */ }
    },

    async svuota() {
      try {
        await deposito.svuota();
      } catch { /* niente da fare, e niente da dire all'utente */ }
    },
  };
}
