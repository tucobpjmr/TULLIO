// src/lib/depositoIdb.js
// Un deposito di righe che SOPRAVVIVE alla chiusura dell'app.
//
// PERCHÉ ESISTE (M-2 dell'audit del 10 settembre). La coda delle scritture
// offline non può vivere in memoria: il caso che deve coprire è il furgone che
// entra in galleria, l'autista che blocca il telefono e la PWA che iOS scarica
// per liberare memoria. Una coda in memoria muore lì, cioè proprio nel momento
// per cui è stata scritta.
//
// ⛔ NON localStorage, e non è una preferenza di stile: è sincrono (blocca il
// thread che disegna, su una coda di decine di voci lo si sente), ha un tetto
// di ~5 MB per origine condiviso con tutto il resto, e `docs/CLAUDE.md` lo
// vieta esplicitamente. IndexedDB è asincrono, transazionale e ha un tetto
// nell'ordine dei centinaia di MB.
//
// ⛔ NIENTE LIBRERIE. `idb` sarebbe 1,5 kB gzip di comodità per le quattro
// operazioni che servono davvero (aggiungi, leggi tutte, rimuovi, svuota), e
// il budget del bundle di questo progetto è misurato in CI a soglia fissa.
//
// COSA NON FA: nessun indice, nessuna query. Chi legge legge tutto, e la coda
// è potata per età e per numero da chi la usa (state/codaScritture.js). Una
// coda che ha bisogno di un indice è una coda troppo lunga.

const DB_DEFAULT = "voyagedesk";

/**
 * Il deposito in memoria: stessa interfaccia, nessuna persistenza. È il
 * ripiego dove IndexedDB non c'è — jsdom nei test, Safari in navigazione
 * privata su versioni vecchie, un browser con lo storage bloccato da policy —
 * e dichiara `persistente: false` così chi lo usa può DIRLO all'utente invece
 * di promettergli una consegna che non può garantire.
 * @returns {Deposito}
 */
export function depositoMemoria() {
  /** @type {Map<number, any>} */
  const righe = new Map();
  let prossimoId = 1;
  return {
    persistente: false,
    async aggiungi(riga) {
      const id = prossimoId++;
      righe.set(id, { ...riga, id });
      return id;
    },
    async tutte() {
      return [...righe.values()];
    },
    async rimuovi(id) {
      righe.delete(id);
    },
    async svuota() {
      righe.clear();
    },
  };
}

/**
 * @typedef {object} Deposito
 * @property {boolean} persistente `false` per il ripiego in memoria.
 * @property {(riga: any) => Promise<number>} aggiungi
 * @property {() => Promise<any[]>} tutte  in ordine di inserimento (la chiave
 *   è auto-incrementale, e IndexedDB scorre per chiave crescente).
 * @property {(id: number) => Promise<void>} rimuovi
 * @property {() => Promise<void>} svuota
 */

/**
 * Il deposito su IndexedDB. `store` è creato al primo `open` con chiave
 * auto-incrementale: l'ordine di lettura è quello di inserimento, che per una
 * coda è il contratto, non un dettaglio.
 *
 * @param {{ store: string, nomeDb?: string, versione?: number }} opzioni
 * @returns {Deposito}
 */
export function depositoIdb({ store, nomeDb = DB_DEFAULT, versione = 1 }) {
  /** @type {Promise<IDBDatabase>|null} */
  let apertura = null;

  const db = () => {
    // Una sola apertura per l'intera vita del modulo, riusata da tutte le
    // operazioni: aprire a ogni scrittura costa un round-trip e, su Safari,
    // sveglia il worker dello storage ogni volta.
    if (!apertura) {
      apertura = new Promise((risolvi, rifiuta) => {
        const req = indexedDB.open(nomeDb, versione);
        req.onupgradeneeded = () => {
          const aperto = req.result;
          if (!aperto.objectStoreNames.contains(store)) {
            aperto.createObjectStore(store, { keyPath: "id", autoIncrement: true });
          }
        };
        req.onsuccess = () => risolvi(req.result);
        req.onerror = () => rifiuta(req.error || new Error("IndexedDB: apertura fallita"));
        // `blocked` = un'altra scheda tiene aperta una versione precedente.
        // Rifiutare è più onesto di restare appesi: chi chiama ha un ripiego.
        req.onblocked = () => rifiuta(new Error("IndexedDB: apertura bloccata da un'altra scheda"));
      });
      // Un'apertura fallita non deve restare in cache come promessa rifiutata
      // per sempre: il prossimo tentativo riprova (lo storage può tornare
      // disponibile — permesso concesso, quota liberata).
      apertura.catch(() => { apertura = null; });
    }
    return apertura;
  };

  // Una transazione, una richiesta, un risultato — letto in `oncomplete` e non
  // in `onsuccess`: `onsuccess` dice che la richiesta è passata, `oncomplete`
  // che la transazione è stata SCRITTA. Per una coda che deve sopravvivere
  // alla chiusura dell'app la differenza è tutta lì.
  const esegui = async (modo, azione) => {
    const aperto = await db();
    return new Promise((risolvi, rifiuta) => {
      const tx = aperto.transaction(store, modo);
      const req = azione(tx.objectStore(store));
      tx.oncomplete = () => risolvi(req ? req.result : undefined);
      tx.onerror = () => rifiuta(tx.error || new Error("IndexedDB: transazione fallita"));
      tx.onabort = () => rifiuta(tx.error || new Error("IndexedDB: transazione annullata"));
    });
  };

  return {
    persistente: true,
    async aggiungi(riga) {
      return Number(await esegui("readwrite", (s) => s.add(riga)));
    },
    async tutte() {
      return (await esegui("readonly", (s) => s.getAll())) || [];
    },
    async rimuovi(id) {
      await esegui("readwrite", (s) => s.delete(id));
    },
    async svuota() {
      await esegui("readwrite", (s) => s.clear());
    },
  };
}

/**
 * Il deposito giusto per questo browser: IndexedDB se c'è, memoria se non c'è.
 * La distinzione la porta `persistente`, che il chiamante deve poter LEGGERE:
 * una coda su un deposito non persistente promette meno, e va detto.
 * @param {{ store: string, nomeDb?: string, versione?: number }} opzioni
 * @returns {Deposito}
 */
export function creaDeposito(opzioni) {
  const disponibile = typeof indexedDB !== "undefined" && indexedDB !== null;
  return disponibile ? depositoIdb(opzioni) : depositoMemoria();
}
