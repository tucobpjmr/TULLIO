// La coda delle scritture offline — M-2 dell'audit del 10 settembre.
//
// Il valore di questo file non è "la coda mette e toglie righe": è che le
// QUATTRO decisioni che la rendono sicura siano verificate, perché ciascuna,
// sbagliata, produce un difetto peggiore del problema che la coda risolve —
// una scrittura persa (peggio: creduta salva), un doppione, una coda che
// cresce per sempre, o la scrittura di un utente rigiocata nella sessione di
// un altro.
import { describe, it, expect } from "vitest";
import { depositoMemoria } from "../../lib/depositoIdb.js";
import {
  creaCodaScritture, guastoDiRete, scritturaGiaApplicata, MAX_VOCI, ETA_MASSIMA_MS,
} from "../../state/codaScritture.js";

const scrittura = (over = {}) => ({
  uid: "u1", tipo: "MOVE_TASK", azione: { type: "MOVE_TASK", payload: { taskId: "t1" } }, ...over,
});

describe("guastoDiRete — la distinzione da cui dipende tutto il resto", () => {
  it("riconosce i testi con cui i motori annunciano un fetch fallito", () => {
    for (const testo of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "TypeError: fetch failed",
    ]) {
      expect(guastoDiRete(new TypeError(testo))).toBe(true);
    }
  });

  it("NON scambia per rete un rifiuto del server", () => {
    // Se lo facesse, la coda rigiocherebbe all'infinito una scrittura che il
    // server continuerà a rifiutare, e all'utente non lo direbbe mai nessuno.
    expect(guastoDiRete({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(guastoDiRete({ code: "23503", message: "violates foreign key constraint" })).toBe(false);
  });

  it("crede a navigator.onLine prima che al messaggio", () => {
    const originale = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    // Il browser dice che la rete non c'è: il motivo del fallimento è quello,
    // qualunque cosa dica il testo dell'errore.
    expect(guastoDiRete({ message: "qualcosa di illeggibile" })).toBe(true);
    if (originale) Object.defineProperty(window.navigator, "onLine", originale);
  });
});

describe("scritturaGiaApplicata — la rigiocata che trova il proprio lavoro", () => {
  it("legge 23505 come «l'avevo già scritta io»", () => {
    expect(scritturaGiaApplicata({ code: "23505" })).toBe(true);
  });
  it("e non confonde gli altri codici", () => {
    expect(scritturaGiaApplicata({ code: "42501" })).toBe(false);
    expect(scritturaGiaApplicata(new Error("Failed to fetch"))).toBe(false);
    expect(scritturaGiaApplicata(null)).toBe(false);
  });
});

describe("creaCodaScritture", () => {
  it("restituisce le voci nell'ordine in cui sono entrate", async () => {
    // L'ordine È il contratto: tre spostamenti della stessa task rigiocati al
    // contrario finirebbero nella colonna sbagliata, che è precisamente il
    // difetto che la coda esiste per non produrre.
    const coda = creaCodaScritture(depositoMemoria());
    await coda.accoda(scrittura({ azione: { n: 1 } }));
    await coda.accoda(scrittura({ azione: { n: 2 } }));
    await coda.accoda(scrittura({ azione: { n: 3 } }));

    const voci = await coda.elenco("u1");
    expect(voci.map(v => v.azione.n)).toEqual([1, 2, 3]);
  });

  it("non consegna a un utente le scritture di un altro", async () => {
    // Stesso telefono di servizio, due turni, due account: la RLS rifiuterebbe
    // comunque, ma una coda che le PROPONE produce un toast d'errore che
    // l'utente non può capire né rimediare.
    const coda = creaCodaScritture(depositoMemoria());
    await coda.accoda(scrittura({ uid: "u1" }));
    await coda.accoda(scrittura({ uid: "u2" }));

    expect((await coda.elenco("u1")).length).toBe(1);
    expect((await coda.conta("u2"))).toBe(1);
  });

  it("scarta — e cancella — le voci più vecchie dell'età massima", async () => {
    let ora = 1_000_000_000_000;
    const deposito = depositoMemoria();
    const coda = creaCodaScritture(deposito, { adesso: () => ora });
    await coda.accoda(scrittura({ azione: { n: "vecchia" } }));
    ora += ETA_MASSIMA_MS + 1;
    await coda.accoda(scrittura({ azione: { n: "nuova" } }));

    const voci = await coda.elenco("u1");
    expect(voci.map(v => v.azione.n)).toEqual(["nuova"]);
    // Cancellate davvero, non solo saltate: una voce che nessuno rigiocherà
    // occuperebbe per sempre un posto sotto il tetto di MAX_VOCI.
    expect((await deposito.tutte()).length).toBe(1);
  });

  it("smette di accettare oltre il tetto, e lo DICE", async () => {
    const coda = creaCodaScritture(depositoMemoria());
    for (let i = 0; i < MAX_VOCI; i++) expect(await coda.accoda(scrittura())).toBe(true);
    // `false` non è un dettaglio: è il segnale con cui chi chiama torna al
    // rollback e al toast rosso invece di dire all'utente che è tutto a posto.
    expect(await coda.accoda(scrittura())).toBe(false);
  });

  it("con un deposito rotto non promette nulla", async () => {
    const rotto = {
      persistente: true,
      aggiungi: () => Promise.reject(new Error("QuotaExceededError")),
      tutte: () => Promise.resolve([]),
      rimuovi: () => Promise.resolve(),
      svuota: () => Promise.resolve(),
    };
    expect(await creaCodaScritture(rotto).accoda(scrittura())).toBe(false);
  });

  it("dichiara se il deposito sopravvive alla chiusura dell'app", async () => {
    expect(creaCodaScritture(depositoMemoria()).persistente).toBe(false);
  });

  it("rimuove una voce per id", async () => {
    const coda = creaCodaScritture(depositoMemoria());
    await coda.accoda(scrittura());
    const [voce] = await coda.elenco("u1");
    await coda.rimuovi(voce.id);
    expect(await coda.conta("u1")).toBe(0);
  });
});
