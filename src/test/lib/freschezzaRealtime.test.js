// A-1 dell'audit UX/errori del 31 agosto — il registro della freschezza.
//
// Il rilievo: `.subscribe()` era chiamata senza callback di stato, quindi
// `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` non li leggeva nessuno — zero
// occorrenze in tutto `src/`. Con `navigator.onLine` ancora `true`,
// `OfflineBanner` taceva e l'operatore lavorava su dati fermi credendoli
// aggiornati.
//
// Questi test fissano la POLITICA del registro, che è la parte che si può
// sbagliare in silenzio: quando il fatto aggregato è vero, e — soprattutto —
// quante volte lo si annuncia. Nove canali che riagganciano insieme dopo una
// sospensione devono produrre UN risveglio, non nove: `useSyncExternalStore`
// ri-renderizza a ogni notifica, e la shell è il componente più caro da
// svegliare dell'app.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  segnalaStatoCanale, dimenticaCanale, freschezzaDegradata,
  osservaFreschezza, _resetFreschezza,
} from "../../lib/freschezzaRealtime.js";

beforeEach(() => { _resetFreschezza(); });

describe("freschezzaRealtime — il fatto aggregato", () => {
  it("parte non degradata: nessun canale registrato non è un guasto", () => {
    expect(freschezzaDegradata()).toBe(false);
  });

  it("un solo canale rotto basta a degradare l'insieme", () => {
    segnalaStatoCanale("tasks#1", "SUBSCRIBED");
    segnalaStatoCanale("notices#2", "SUBSCRIBED");
    expect(freschezzaDegradata()).toBe(false);

    segnalaStatoCanale("notices#2", "CHANNEL_ERROR");
    expect(freschezzaDegradata()).toBe(true);
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "%s conta come rotto: la differenza fra i tre è diagnostica, non operativa",
    (stato) => {
      segnalaStatoCanale("tasks#1", stato);
      expect(freschezzaDegradata()).toBe(true);
    },
  );

  it("il riaggancio dell'ultimo canale rotto riporta l'insieme in salute", () => {
    segnalaStatoCanale("tasks#1", "CHANNEL_ERROR");
    segnalaStatoCanale("notices#2", "TIMED_OUT");
    expect(freschezzaDegradata()).toBe(true);

    segnalaStatoCanale("tasks#1", "SUBSCRIBED");
    // Ancora degradata: `notices` non è tornato su.
    expect(freschezzaDegradata()).toBe(true);

    segnalaStatoCanale("notices#2", "SUBSCRIBED");
    expect(freschezzaDegradata()).toBe(false);
  });

  it("la chiave è per SOTTOSCRIZIONE: `users` è osservata due volte e i due stati non si sovrascrivono", () => {
    // Il caso reale: il refresh del team e la presenza guardano entrambi
    // `users`. Con una chiave per TABELLA la seconda cancellerebbe lo stato
    // della prima, e un canale rotto sparirebbe dal registro senza essere
    // tornato su.
    segnalaStatoCanale("users#1", "CHANNEL_ERROR");
    segnalaStatoCanale("users#2", "SUBSCRIBED");
    expect(freschezzaDegradata()).toBe(true);
  });
});

describe("freschezzaRealtime — quante volte si annuncia", () => {
  it("notifica sulla TRANSIZIONE, non a ogni stato ricevuto", () => {
    const visto = vi.fn();
    osservaFreschezza(visto);

    segnalaStatoCanale("tasks#1", "SUBSCRIBED");
    segnalaStatoCanale("notices#2", "SUBSCRIBED");
    expect(visto).not.toHaveBeenCalled();      // niente è cambiato

    segnalaStatoCanale("tasks#1", "CHANNEL_ERROR");
    expect(visto).toHaveBeenCalledTimes(1);
    expect(visto).toHaveBeenLastCalledWith(true);

    // Un secondo canale che cade NON è una nuova notizia: il fatto aggregato
    // era già vero. È il caso della sospensione, dove cadono tutti insieme.
    segnalaStatoCanale("notices#2", "TIMED_OUT");
    segnalaStatoCanale("clients#3", "CHANNEL_ERROR");
    expect(visto).toHaveBeenCalledTimes(1);
  });

  it("nove canali che riagganciano insieme producono UN solo risveglio", () => {
    const visto = vi.fn();
    const chiavi = Array.from({ length: 9 }, (_, i) => `t${i}#${i}`);
    chiavi.forEach(k => segnalaStatoCanale(k, "CHANNEL_ERROR"));
    osservaFreschezza(visto);

    chiavi.forEach(k => segnalaStatoCanale(k, "SUBSCRIBED"));
    expect(visto).toHaveBeenCalledTimes(1);
    expect(visto).toHaveBeenLastCalledWith(false);
  });

  it("la deregistrazione ferma le notifiche", () => {
    const visto = vi.fn();
    const stop = osservaFreschezza(visto);
    stop();
    segnalaStatoCanale("tasks#1", "CHANNEL_ERROR");
    expect(visto).not.toHaveBeenCalled();
  });
});

describe("freschezzaRealtime — lo smontaggio", () => {
  it("dimenticare l'ultimo canale rotto abbassa il fatto E lo notifica", () => {
    // Senza la notifica, la striscia resterebbe a schermo dopo che l'ultimo
    // canale degradato è stato smontato (cambio vista, logout): affermerebbe
    // una condizione che non è più osservabile da nessuno.
    const visto = vi.fn();
    segnalaStatoCanale("tasks#1", "CHANNEL_ERROR");
    osservaFreschezza(visto);

    dimenticaCanale("tasks#1");
    expect(freschezzaDegradata()).toBe(false);
    expect(visto).toHaveBeenCalledWith(false);
  });

  it("dimenticare un canale sano non notifica nulla", () => {
    const visto = vi.fn();
    segnalaStatoCanale("tasks#1", "SUBSCRIBED");
    osservaFreschezza(visto);
    dimenticaCanale("tasks#1");
    expect(visto).not.toHaveBeenCalled();
  });

  it("dimenticare una chiave mai vista è un no-op", () => {
    const visto = vi.fn();
    osservaFreschezza(visto);
    expect(() => dimenticaCanale("mai-esistito")).not.toThrow();
    expect(visto).not.toHaveBeenCalled();
  });
});
