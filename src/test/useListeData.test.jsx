// useListeData — il modulo Liste passa alla stessa architettura dati del core.
//
// Prima il modulo aveva un ciclo di vita tutto suo: useState locali, chiamate
// dirette a ListeAPI e `await loadHome()` manuale dopo ogni scrittura, senza
// realtime. Due conseguenze concrete: due utenti sulla stessa lista non si
// vedevano a vicenda, e ogni scrittura costava tre round-trip di refetch.
//
// Questi test coprono ciò che il riuso di useDebouncedTableSubscription deve
// garantire: la sottoscrizione alle tabelle giuste, il gate per ruolo (il
// Driver non accede al modulo, quindi non deve nemmeno interrogarlo) e la
// guardia anti-stale che scarta le risposte di un reload superato.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const ListeAPI = {
  list: vi.fn(async () => ({ data: [{ id: "l1", stato: "attiva" }], error: null })),
  listTrash: vi.fn(async () => ({ data: [{ id: "l2" }], error: null })),
  saldi: vi.fn(async () => ({ data: [{ lista_id: "l1", saldo: 120 }], error: null })),
};
const subscribeToTable = vi.fn(() => () => {});

vi.mock("../components/liste/listeApi.js", () => ({ ListeAPI }));
vi.mock("../lib/api.js", () => ({ subscribeToTable: (...a) => subscribeToTable(...a) }));

const { useListeData } = await import("../components/liste/useListeData.js");

beforeEach(() => {
  vi.clearAllMocks();
  ListeAPI.list.mockResolvedValue({ data: [{ id: "l1", stato: "attiva" }], error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [{ id: "l2" }], error: null });
  ListeAPI.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 120 }], error: null });
});

describe("useListeData — idratazione", () => {
  it("carica liste, cestino e saldi, e indicizza i saldi per lista_id", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.liste).toEqual([{ id: "l1", stato: "attiva" }]);
    expect(result.current.cestino).toEqual([{ id: "l2" }]);
    expect(result.current.saldi).toEqual({ l1: { lista_id: "l1", saldo: 120 } });
    expect(result.current.loadError).toBeNull();
  });

  it("un errore su una qualsiasi delle tre query diventa loadError", async () => {
    ListeAPI.saldi.mockResolvedValue({ data: null, error: { message: "RLS negata" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe("RLS negata");
    spy.mockRestore();
  });
});

describe("useListeData — realtime", () => {
  it("sottoscrive liste_viaggio e movimenti_lista", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // I movimenti servono quanto le liste: un movimento cambia il saldo, che è
    // la colonna mostrata in elenco.
    const tabelle = subscribeToTable.mock.calls.map(c => c[0]);
    expect(tabelle).toContain("liste_viaggio");
    expect(tabelle).toContain("movimenti_lista");
  });

  it("disiscrive allo smontaggio", async () => {
    const unsub = vi.fn();
    subscribeToTable.mockReturnValue(unsub);
    const { result, unmount } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});

describe("useListeData — gate per ruolo", () => {
  it("con enabled=false non interroga il DB e non sottoscrive nulla", () => {
    const { result } = renderHook(() => useListeData({ enabled: false }));

    // Il Driver non accede al modulo: non deve nemmeno chiederne i dati, e la
    // vista non deve restare bloccata su uno spinner che non finirà mai.
    expect(ListeAPI.list).not.toHaveBeenCalled();
    expect(subscribeToTable).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe("useListeData — guardia anti-stale", () => {
  it("una risposta di un reload superato non sovrascrive quella corrente", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simula il reload lento: `isCurrent` dice che nel frattempo ne è partito
    // uno più recente, quindi questa risposta va scartata.
    ListeAPI.list.mockResolvedValue({ data: [{ id: "VECCHIA" }], error: null });
    await act(async () => { await result.current.reload(() => false); });

    expect(result.current.liste).toEqual([{ id: "l1", stato: "attiva" }]);
  });
});
