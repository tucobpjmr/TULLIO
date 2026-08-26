// S-2 — ripresa dopo un buco di connessione.
//
// Postgres Changes non offre ripresa da offset: se il socket cade — schermo
// bloccato, cambio rete, tab in background — supabase-js riaggancia il
// canale da solo, ma gli eventi emessi nel frattempo non vengono mai
// consegnati. Prima di questa correzione l'unico reload era quello iniziale
// al mount: un'app rimasta in background per qualche minuto non aveva alcun
// modo di sapere di aver perso eventi, e restava con dati muti finché
// l'utente non ricaricava la pagina a mano.
//
// Questi test guidano i due segnali di ripresa aggiunti a
// useDebouncedTableSubscription: 'online' (la rete torna) e
// 'visibilitychange' verso 'visible' (l'app torna in primo piano). Entrambi
// devono innescare un reload COMPLETO (tabelle = null), non uno parziale:
// non sapendo cosa si è perso, l'unico reload corretto è quello che carica
// tutto — lo stesso ramo che l'idratazione iniziale già usa.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
}));

const { useDebouncedTableSubscription, SOGLIA_RIPRESA_MS } =
  await import("../../hooks/useDebouncedTableSubscription.js");

let visibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibilityState,
});

// Passa in secondo piano e torna in primo dopo `pausaMs` di orologio. Il tempo
// è simulato spostando Date.now: la soglia è di trenta secondi reali, e farli
// passare davvero renderebbe la suite inutilizzabile.
const vaiInBackgroundETorna = async (pausaMs) => {
  const vero = Date.now();
  const orologio = vi.spyOn(Date, "now");
  orologio.mockReturnValue(vero);

  await act(async () => {
    visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  });

  orologio.mockReturnValue(vero + pausaMs);

  await act(async () => {
    visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    orologio.mockRestore();
    await new Promise((r) => setTimeout(r, 350));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  visibilityState = "visible";
});

afterEach(() => {
  visibilityState = "visible";
});

describe("useDebouncedTableSubscription — ripresa dopo un buco di connessione", () => {
  it("l'evento 'online' fa scattare un reload completo (tabelle = null)", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  it("tornare visibile dopo una lunga assenza fa scattare un reload completo", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await vaiInBackgroundETorna(SOGLIA_RIPRESA_MS + 1000);

    expect(reload).toHaveBeenCalledTimes(2);
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  // ─── M-3 · la soglia ──────────────────────────────────────────────────────
  // Su mobile `visibilitychange` verso `visible` lo emettono il commutatore di
  // app, la tendina delle notifiche, il selettore di file e il picker della
  // fotocamera — cioè proprio i gesti con cui si allega un file o si risponde a
  // una notifica, più volte in pochi secondi. Con nove istanze di questo hook
  // vive insieme, ognuno di quei ritorni costava nove SELECT di tabella intera,
  // mentre il websocket non era mai caduto e nessun evento era andato perso.
  it("un ritorno in primo piano dopo pochi secondi non ricarica nulla", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await vaiInBackgroundETorna(2000);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("un visibilitychange verso 'visible' senza essere mai passati da 'hidden' non ricarica", async () => {
    // Alcuni browser lo emettono anche solo cambiando scheda avanti e indietro
    // nella stessa finestra: senza una permanenza in secondo piano non c'è
    // nessuna finestra temporale in cui si possa aver perso qualcosa.
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("passare a 'hidden' non fa scattare nessun reload", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("'online' e 'visibilitychange' ravvicinati coalescono in un solo reload", async () => {
    // Sbloccare lo schermo spesso significa anche riagganciare la rete quasi
    // insieme: senza coalescing sarebbero due reload completi ravvicinati.
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    const vero = Date.now();
    const orologio = vi.spyOn(Date, "now").mockReturnValue(vero);
    await act(async () => {
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    orologio.mockReturnValue(vero + SOGLIA_RIPRESA_MS + 1000);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      visibilityState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
      orologio.mockRestore();
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("un reload parziale già in coda viene assorbito dal reload completo di ripresa", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 200 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      // Un evento reale è già in coda nel debounce (finestra di 200ms) quando
      // arriva il segnale di ripresa: il partial reload non deve più partire,
      // il reload completo lo copre già.
      handlers.get("tasks")?.({ eventType: "UPDATE", new: {} });
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 500));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect(reload.mock.calls[1][1]).toBeNull();
  });

  it("l'unsubscribe rimuove i listener di ripresa (nessun reload dopo l'unmount)", async () => {
    const reload = vi.fn();
    const { unmount } = renderHook(() =>
      useDebouncedTableSubscription(["tasks"], reload, { enabled: true, delay: 1 })
    );
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
