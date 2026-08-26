// `useCaricamento` — «carica al mount, scarta la risposta tardiva».
//
// PERCHÉ QUESTO TEST ESISTE. La primitiva nasce da M-4 dell'audit del 26
// agosto, dove la stessa forma era scritta a mano in nove effetti con tre nomi
// di flag diversi. Le nove copie coprivano METÀ DELLA CORSA CIASCUNA: chi si
// difendeva dallo smontaggio non si difendeva dal cambio di dipendenza, e
// viceversa. Sono le due proprietà che qui devono valere insieme, e nessuna
// delle due si rompe rumorosamente — una risposta scartata di troppo o di meno
// non fa fallire nessun test funzionale, si vede solo come un dato sbagliato
// in un momento raro.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCaricamento } from "../../hooks/useCaricamento.js";

/** Una promessa che si risolve quando lo decide il test. */
const differita = () => {
  let risolvi, rifiuta;
  const promessa = new Promise((res, rej) => { risolvi = res; rifiuta = rej; });
  return { promessa, risolvi, rifiuta };
};

describe("useCaricamento — il dato", () => {
  it("carica al mount e chiude `caricando`", async () => {
    const { result } = renderHook(() => useCaricamento(() => Promise.resolve(7), []));
    expect(result.current.caricando).toBe(true);
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(result.current.dato).toBe(7);
    expect(result.current.errore).toBe(null);
  });

  it("riconosce la forma { data, error } del data layer", async () => {
    const { result } = renderHook(() =>
      useCaricamento(() => Promise.resolve({ data: ["a"], error: null }), []));
    await waitFor(() => expect(result.current.dato).toEqual(["a"]));
  });

  it("`{ data: null, error: null }` è un DATO, non un errore", async () => {
    // È la risposta di «non c'è niente da caricare» (ClientiView quando
    // l'utente non vede il modulo Liste). Riconoscere la forma dal valore di
    // `error` invece che dalla presenza della chiave la scambierebbe per un
    // valore nudo, e `dato` diventerebbe l'oggetto intero.
    const { result } = renderHook(() =>
      useCaricamento(() => ({ data: null, error: null }), [], { iniziale: "x" }));
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(result.current.dato).toBe(null);
    expect(result.current.errore).toBe(null);
  });

  it("accetta un valore nudo, senza promessa", async () => {
    const { result } = renderHook(() => useCaricamento(() => 42, []));
    await waitFor(() => expect(result.current.dato).toBe(42));
  });
});

describe("useCaricamento — l'errore", () => {
  it("instrada l'errore del data layer a `suErrore` e lo espone", async () => {
    const suErrore = vi.fn();
    const guasto = new Error("giù");
    const { result } = renderHook(() =>
      useCaricamento(() => Promise.resolve({ data: null, error: guasto }), [], { suErrore }));
    await waitFor(() => expect(result.current.errore).toBe(guasto));
    expect(suErrore).toHaveBeenCalledWith(guasto);
  });

  it("cattura anche la promessa RIFIUTATA, non solo `{ error }`", async () => {
    const suErrore = vi.fn();
    const { result } = renderHook(() =>
      useCaricamento(() => Promise.reject(new Error("crash")), [], { suErrore }));
    await waitFor(() => expect(result.current.caricando).toBe(false));
    expect(suErrore).toHaveBeenCalledTimes(1);
  });

  it("NON azzera il dato già buono quando il ricaricamento fallisce", async () => {
    // Una vista che mostra dati vecchi accanto a un errore dichiarato è
    // onesta; una che li svuota afferma che non ce ne sono.
    let esito = { data: "buono", error: null };
    const { result, rerender } = renderHook(({ k }) => useCaricamento(() => esito, [k]),
      { initialProps: { k: 1 } });
    await waitFor(() => expect(result.current.dato).toBe("buono"));

    esito = { data: null, error: new Error("giù") };
    rerender({ k: 2 });
    await waitFor(() => expect(result.current.errore).toBeTruthy());
    expect(result.current.dato).toBe("buono");
  });
});

describe("useCaricamento — le due corse", () => {
  it("una risposta che arriva dopo lo SMONTAGGIO non scrive lo stato", async () => {
    const { promessa, risolvi } = differita();
    const { result, unmount } = renderHook(() => useCaricamento(() => promessa, []));
    unmount();
    await act(async () => { risolvi("tardi"); await promessa; });
    // Nessun aggiornamento su un componente smontato: React lo segnalerebbe,
    // e il valore resta quello dell'ultimo render vivo.
    expect(result.current.dato).toBe(null);
  });

  it("vince l'ultima richiesta FATTA, non l'ultima risposta ARRIVATA", async () => {
    // È la metà della corsa che gli effetti scritti a mano dimenticavano più
    // spesso: `photo` cambia, parte una seconda richiesta, e la prima — più
    // lenta — torna dopo e sovrascrive la risposta giusta con quella vecchia.
    const lenta = differita();
    const veloce = differita();
    const carica = vi.fn()
      .mockImplementationOnce(() => lenta.promessa)
      .mockImplementationOnce(() => veloce.promessa);

    const { result, rerender } = renderHook(({ k }) => useCaricamento(carica, [k]),
      { initialProps: { k: "primo" } });
    rerender({ k: "secondo" });
    expect(carica).toHaveBeenCalledTimes(2);

    await act(async () => { veloce.risolvi("secondo"); await veloce.promessa; });
    await act(async () => { lenta.risolvi("primo"); await lenta.promessa; });

    expect(result.current.dato).toBe("secondo");
  });
});
