// A-1 dell'audit UX/errori del 31 agosto — le DUE metà, misurate insieme.
//
// Il rilievo non era «manca il callback di stato»: era che un websocket morto
// con l'HTTP ancora vivo produce la condizione che `OfflineBanner` esiste per
// annunciare, e non la annuncia nessuno. La correzione ha due metà inseparabili
// (è la lezione di A-2/A-3 del 28 agosto: ciascuna da sola fa sembrare fatta
// l'altra):
//
//   SEGNALARE  → il registro si accende, la striscia compare;
//   RECUPERARE → al riaggancio si ricarica, perché Postgres Changes non ha
//                ripresa da offset e nella finestra in cui il canale era giù
//                sono passati eventi che non vedremo MAI.
//
// Il caso che conta di più è quello in NEGATIVO, ed è il secondo test: il
// PRIMO 'SUBSCRIBED' è l'aggancio iniziale, non un ritorno. Trattarlo come
// ripresa rifarebbe l'idratazione appena fatta, a ogni mount di ognuna delle
// nove sottoscrizioni.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Il triplo mock cattura il callback di stato per poterlo pilotare: è
// esattamente ciò che supabase-js consegna a `.subscribe()` e che prima di
// A-1 non arrivava a nessuno.
const statoDi = new Map();
const subscribeToTable = vi.fn((tabella, _handler, onStato) => {
  statoDi.set(tabella, onStato);
  return () => statoDi.delete(tabella);
});

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
}));

const { useDebouncedTableSubscription } =
  await import("../../hooks/useDebouncedTableSubscription.js");
const { freschezzaDegradata, _resetFreschezza } =
  await import("../../lib/freschezzaRealtime.js");

// Il reload di ripresa passa da un `setTimeout(…, 300)`: si attende quello,
// non un tempo arbitrario.
const attendiRipresa = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
};

const monta = (tabelle = ["tasks"]) => {
  const reload = vi.fn(async () => {});
  const r = renderHook(() => useDebouncedTableSubscription(tabelle, reload, { deps: [] }));
  return { reload, ...r };
};

beforeEach(() => {
  _resetFreschezza();
  statoDi.clear();
  subscribeToTable.mockClear();
});
afterEach(() => { _resetFreschezza(); });

describe("A-1 · lo stato del canale arriva al registro", () => {
  it("`subscribeToTable` riceve un terzo argomento (prima non c'era)", async () => {
    monta();
    await waitFor(() => expect(subscribeToTable).toHaveBeenCalled());
    expect(typeof subscribeToTable.mock.calls[0][2]).toBe("function");
  });

  it("CHANNEL_ERROR degrada la freschezza; il riaggancio la ripristina", async () => {
    monta();
    await waitFor(() => expect(statoDi.has("tasks")).toBe(true));

    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    expect(freschezzaDegradata()).toBe(false);

    await act(async () => { statoDi.get("tasks")("CHANNEL_ERROR"); });
    expect(freschezzaDegradata()).toBe(true);

    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    expect(freschezzaDegradata()).toBe(false);
  });

  it("lo smontaggio toglie i canali dal registro", async () => {
    const { unmount } = monta();
    await waitFor(() => expect(statoDi.has("tasks")).toBe(true));
    await act(async () => { statoDi.get("tasks")("CHANNEL_ERROR"); });
    expect(freschezzaDegradata()).toBe(true);

    // Senza il `dimenticaCanale` nel cleanup, la striscia resterebbe accesa
    // per sempre su un canale che non esiste più.
    unmount();
    expect(freschezzaDegradata()).toBe(false);
  });
});

describe("A-1 · il recupero, e quando NON deve scattare", () => {
  it("il PRIMO 'SUBSCRIBED' non ricarica: è l'aggancio, non un ritorno", async () => {
    const { reload } = monta();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1)); // idratazione

    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    await attendiRipresa();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("il riaggancio DOPO una caduta ricarica tutto (`tabelle === null`)", async () => {
    const { reload } = monta();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    await act(async () => { statoDi.get("tasks")("TIMED_OUT"); });
    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    await attendiRipresa();

    expect(reload).toHaveBeenCalledTimes(2);
    // `null` e non un Set: non sapendo cosa si è perso, l'unico reload
    // corretto è quello che carica tutto — stesso ramo dell'idratazione.
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  it("una caduta senza riaggancio non ricarica nulla", async () => {
    const { reload } = monta();
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    await act(async () => { statoDi.get("tasks")("SUBSCRIBED"); });
    await act(async () => { statoDi.get("tasks")("CHANNEL_ERROR"); });
    await attendiRipresa();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("A-3 · l'handle di ricarica esposto dalla sottoscrizione", () => {
  it("`ricarica()` rifà la richiesta completa", async () => {
    const reload = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDebouncedTableSubscription(["tasks"], reload, { deps: [] }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => { result.current(); });
    expect(reload).toHaveBeenCalledTimes(2);
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  it("l'identità è stabile fra i render: le viste sono `memo`", async () => {
    const reload = vi.fn(async () => {});
    const { result, rerender } = renderHook(() =>
      useDebouncedTableSubscription(["tasks"], reload, { deps: [] }));
    const prima = result.current;
    rerender();
    expect(result.current).toBe(prima);
  });

  it("dopo lo smontaggio non fa partire nulla", async () => {
    const reload = vi.fn(async () => {});
    const { result, unmount } = renderHook(() =>
      useDebouncedTableSubscription(["tasks"], reload, { deps: [] }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    unmount();
    result.current();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
