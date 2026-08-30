// src/test/hooks/useRicercaAnagrafica.test.js
// A-1 (audit del 30 agosto) — debounce, guardia di staleness, conteggio ed
// errore esposto: le proprietà che ClientiView richiede e che
// useRicercaClienti.js (l'autocomplete) non ha bisogno di avere, perché lì un
// suggerimento mancante non è un errore da mostrare.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const cercaAnagrafica = vi.fn(async () => ({ data: [], count: 0, error: null }));
vi.mock("../../lib/api.js", () => ({ Clients: { cercaAnagrafica: (...a) => cercaAnagrafica(...a) } }));

const { useRicercaAnagrafica } = await import("../../hooks/useRicercaAnagrafica.js");

const CLIENTE_DB = { id: "c1", name: "Rossi Mario", email: null, phone: null, address: null, city: null, notes: null, created_at: "2026-01-01T00:00:00.000Z" };

beforeEach(() => { cercaAnagrafica.mockClear(); });

describe("useRicercaAnagrafica", () => {
  it("con query vuota o enabled:false non interroga il server", () => {
    const { result, rerender } = renderHook(
      ({ q, enabled }) => useRicercaAnagrafica(q, { enabled }),
      { initialProps: { q: "", enabled: true } });
    expect(result.current).toEqual({ risultati: [], count: 0, caricando: false, errore: null });

    rerender({ q: "rossi", enabled: false });
    expect(cercaAnagrafica).not.toHaveBeenCalled();
  });

  it("interroga il server dopo il debounce, non a ogni carattere", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderHook(
      ({ q }) => useRicercaAnagrafica(q, { limite: 50 }), { initialProps: { q: "r" } });
    rerender({ q: "ro" });
    rerender({ q: "ros" });
    rerender({ q: "rossi" });
    expect(cercaAnagrafica).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(cercaAnagrafica).toHaveBeenCalledTimes(1);
    expect(cercaAnagrafica).toHaveBeenCalledWith("rossi", { limite: 50 });
    vi.useRealTimers();
  });

  it("mappa i risultati con fromDbClient (createdAt, non created_at)", async () => {
    cercaAnagrafica.mockResolvedValue({ data: [CLIENTE_DB], count: 1, error: null });
    const { result } = renderHook(() => useRicercaAnagrafica("rossi"));

    await waitFor(() => expect(result.current.risultati).toHaveLength(1));
    expect(result.current.risultati[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(result.current.count).toBe(1);
    expect(result.current.caricando).toBe(false);
    expect(result.current.errore).toBeNull();
  });

  it("caricando è true finché la risposta non arriva", async () => {
    let sblocca;
    cercaAnagrafica.mockReturnValue(new Promise((r) => { sblocca = r; }));
    const { result } = renderHook(() => useRicercaAnagrafica("rossi"));

    await waitFor(() => expect(result.current.caricando).toBe(true));
    sblocca({ data: [], count: 0, error: null });
    await waitFor(() => expect(result.current.caricando).toBe(false));
  });

  it("un errore di rete si espone, e NON si confonde con zero risultati", async () => {
    const errore = new Error("rete");
    cercaAnagrafica.mockResolvedValue({ data: null, count: 0, error: errore });
    const { result } = renderHook(() => useRicercaAnagrafica("rossi"));

    await waitFor(() => expect(result.current.errore).toBe(errore));
    expect(result.current.risultati).toEqual([]);
    expect(result.current.caricando).toBe(false);
  });

  it("una risposta tardiva di una query precedente non sovrascrive quella nuova", async () => {
    // Guardia di staleness: due richieste EFFETTIVAMENTE in volo (il debounce
    // di ciascuna è già scattato), vince l'ultima DIGITATA, non l'ultima
    // ARRIVATA — stesso contratto di useRicercaClienti.js. Serve il debounce
    // reale (timer finti avanzati oltre i 200ms) fra le due digitazioni,
    // altrimenti la seconda cancellerebbe il timer della prima prima ancora
    // che parta una richiesta: non ci sarebbe nulla da rendere stantio.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let sbloccaPrima;
    cercaAnagrafica.mockImplementationOnce(() => new Promise((r) => { sbloccaPrima = r; }));
    const { rerender, result } = renderHook(
      ({ q }) => useRicercaAnagrafica(q), { initialProps: { q: "rossi" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(cercaAnagrafica).toHaveBeenCalledTimes(1);

    cercaAnagrafica.mockResolvedValueOnce({
      data: [{ ...CLIENTE_DB, id: "c2", name: "Bianchi" }], count: 1, error: null,
    });
    rerender({ q: "bianchi" });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await waitFor(() => expect(result.current.risultati.map(c => c.id)).toEqual(["c2"]));

    // La prima richiesta (per "rossi") risponde ORA, dopo la seconda: non deve
    // rimettere in lista un risultato che non corrisponde più a ciò che è
    // scritto nel campo.
    await act(async () => { sbloccaPrima({ data: [CLIENTE_DB], count: 1, error: null }); });
    expect(result.current.risultati.map(c => c.id)).toEqual(["c2"]);
    vi.useRealTimers();
  });
});
