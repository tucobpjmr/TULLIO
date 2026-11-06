// M-2 dell'analisi del 6 novembre — «c'è una versione nuova, ricarica».
//
// PERCHÉ ESISTE. Una scheda aperta da giorni eseguiva la build con cui era
// partita finché un chunk lazy non rispondeva 404. `useNuovaVersione` rilegge
// `/version.json` e lo confronta con l'id compilato nel bundle; la striscia in
// OfflineBanner lo dice. Qui si verificano le due metà: QUANDO l'hook chiede
// (e quando no), e DOVE la striscia sta fra le altre condizioni.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import { useNuovaVersione } from "../../hooks/useNuovaVersione.js";
import { OfflineBanner } from "../../components/shell/OfflineBanner.jsx";

const INTERVALLO = 1000;

const rispostaJson = (corpo) => Promise.resolve({ ok: true, json: () => Promise.resolve(corpo) });

/** Fa scattare l'intervallo e lascia risolvere fetch e json(). */
const giro = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALLO); });
};

let fetchFinto;
beforeEach(() => {
  vi.useFakeTimers();
  fetchFinto = vi.fn(() => rispostaJson({ build: "a" }));
  vi.stubGlobal("fetch", fetchFinto);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.navigator.onLine;
});

describe("useNuovaVersione", () => {
  it("senza un id compilato (sviluppo, test) non chiede niente", async () => {
    const { result } = renderHook(() => useNuovaVersione({ buildCorrente: undefined, intervalloMs: INTERVALLO }));
    await giro();
    await giro();
    expect(fetchFinto).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("non chiede all'avvio: la build appena scaricata È quella in linea", () => {
    renderHook(() => useNuovaVersione({ buildCorrente: "a", intervalloMs: INTERVALLO }));
    expect(fetchFinto).not.toHaveBeenCalled();
  });

  it("stessa build in linea: resta false, e la richiesta salta ogni cache", async () => {
    const { result } = renderHook(() => useNuovaVersione({ buildCorrente: "a", intervalloMs: INTERVALLO }));
    await giro();
    expect(fetchFinto).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    expect(result.current).toBe(false);
  });

  it("build diversa in linea: true, e da lì smette di chiedere", async () => {
    const { result } = renderHook(() => useNuovaVersione({ buildCorrente: "a", intervalloMs: INTERVALLO }));
    await giro();
    expect(result.current).toBe(false);

    fetchFinto.mockImplementation(() => rispostaJson({ build: "b" }));
    await giro();
    expect(result.current).toBe(true);

    const chiamate = fetchFinto.mock.calls.length;
    await giro();
    await giro();
    expect(fetchFinto.mock.calls.length).toBe(chiamate);
  });

  it("chiede anche al ritorno in primo piano e al ritorno della rete", async () => {
    renderHook(() => useNuovaVersione({ buildCorrente: "a", intervalloMs: 10 * INTERVALLO }));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchFinto).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(fetchFinto).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["la rete non risponde", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["il server risponde un errore", () => Promise.resolve({ ok: false, json: () => Promise.resolve({ build: "b" }) })],
    ["arriva l'HTML della riscrittura invece del JSON", () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("Unexpected token <")) })],
    ["il JSON non porta un id", () => rispostaJson({})],
  ])("nessun avviso se %s", async (_caso, risposta) => {
    fetchFinto.mockImplementation(risposta);
    const { result } = renderHook(() => useNuovaVersione({ buildCorrente: "a", intervalloMs: INTERVALLO }));
    await giro();
    expect(fetchFinto).toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});

describe("OfflineBanner — la striscia «versione nuova»", () => {
  const setOnLine = (valore) => {
    Object.defineProperty(window.navigator, "onLine", { value: valore, configurable: true, writable: true });
  };

  // OfflineBanner usa l'id compilato: nei test non c'è, quindi lo si fornisce.
  beforeEach(() => {
    vi.stubEnv("VITE_BUILD_ID", "a");
    fetchFinto.mockImplementation(() => rispostaJson({ build: "b" }));
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  const montaConNuovaVersione = async (props = {}) => {
    setOnLine(true);
    const esito = render(<OfflineBanner {...props} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60 * 1000); });
    return esito;
  };

  it("compare con il comando Ricarica", async () => {
    await montaConNuovaVersione();
    expect(screen.getByText(/versione nuova di VoyageDesk/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ricarica" })).toBeTruthy();
  });

  it("non compare finché la coda offline sta ancora inviando", async () => {
    await montaConNuovaVersione({ inAttesa: 2 });
    expect(screen.getByText(/Invio delle modifiche in corso/)).toBeTruthy();
    expect(screen.queryByText(/versione nuova/)).toBeNull();
  });

  it("offline vince: la striscia rossa resta l'unica", async () => {
    await montaConNuovaVersione();
    // Controllo positivo: la striscia c'era, quindi sotto è l'offline a toglierla.
    expect(screen.getByText(/versione nuova/)).toBeTruthy();
    setOnLine(false);
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText(/Sei offline/)).toBeTruthy();
    expect(screen.queryByText(/versione nuova/)).toBeNull();
  });
});
