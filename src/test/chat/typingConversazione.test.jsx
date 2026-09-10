// useTypingConversazione — M-5 dell'audit del 10 settembre.
//
// Il «sta scrivendo…» non aveva un test suo: `lib/typingUtils.js` era coperto
// come funzione pura, ma il CICLO DI VITA — sottoscrivere, annunciare, tacere,
// chiudere — viveva dentro ConversationView e per esercitarlo bisognava
// montare la vista intera con il suo contesto. È la ragione per cui questo
// file esiste ed è la prova che il taglio del rilievo era quello giusto: un
// hook con un confine dichiarato si prova senza montare niente.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const canale = { send: vi.fn(), unsubscribe: vi.fn() };
const subscribeToTyping = vi.fn(() => canale);
let ultimoAscoltatore = null;

vi.mock("../../lib/api.js", () => ({
  subscribeToTyping: (...args) => subscribeToTyping(...args),
}));

const { useTypingConversazione } = await import("../../components/chat/useTypingConversazione.js");
const { TYPING_PING_MS } = await import("../../lib/typingUtils.js");

const CONV = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  subscribeToTyping.mockImplementation((_id, ascoltatore) => {
    ultimoAscoltatore = ascoltatore;
    return canale;
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("sottoscrizione", () => {
  it("si aggancia al canale della conversazione", () => {
    renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    expect(subscribeToTyping).toHaveBeenCalledTimes(1);
    expect(subscribeToTyping.mock.calls[0][0]).toBe(CONV);
  });

  it("non tocca il realtime su una conversazione mock", () => {
    // Gli id non-uuid sono gli smoke-test senza login: nessuna connessione,
    // nessun crash — era vero prima dell'estrazione e deve restarlo.
    renderHook(() => useTypingConversazione({ convId: "conv-demo", myId: "io" }));
    expect(subscribeToTyping).not.toHaveBeenCalled();
  });

  it("smontando annuncia il silenzio e chiude il canale", () => {
    // Senza l'annuncio, chi resta nella conversazione vedrebbe «sta
    // scrivendo…» finché non scade il TTL: quattro secondi di un'informazione
    // falsa, su un'app che si chiude e riapre in continuazione da telefono.
    const { unmount } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    unmount();
    expect(canale.send).toHaveBeenCalledWith({ userId: "io", typing: false });
    expect(canale.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("sopravvive a un canale che esplode alla sottoscrizione", () => {
    subscribeToTyping.mockImplementationOnce(() => { throw new Error("realtime giù"); });
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    // Nessuna eccezione propagata: la chat funziona senza l'indicatore, che è
    // un ornamento — l'inverso chiuderebbe la chat per un ornamento.
    expect(result.current.typingMap).toEqual({});
    spia.mockRestore();
  });
});

describe("la mappa dei typer", () => {
  it("si aggiorna con gli eventi in arrivo", () => {
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    act(() => { ultimoAscoltatore({ userId: "collega", typing: true }); });
    expect(Object.keys(result.current.typingMap)).toEqual(["collega"]);

    act(() => { ultimoAscoltatore({ userId: "collega", typing: false }); });
    expect(result.current.typingMap).toEqual({});
  });

  it("ignora l'eco di sé stessi", () => {
    // Il canale rimanda anche ciò che pubblico io: senza il filtro, l'utente
    // vedrebbe scritto che sta scrivendo lui.
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    act(() => { ultimoAscoltatore({ userId: "io", typing: true }); });
    expect(result.current.typingMap).toEqual({});
  });

  it("pota i typer scaduti anche se lo «stop» non arriva mai", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    act(() => { ultimoAscoltatore({ userId: "collega", typing: true }); });
    expect(Object.keys(result.current.typingMap)).toEqual(["collega"]);

    // Oltre il TTL: l'indicatore deve spegnersi da solo. È il ripiego per il
    // collega che ha chiuso l'app a metà frase.
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(result.current.typingMap).toEqual({});
  });
});

describe("annunciare che sto scrivendo", () => {
  it("pubblica una volta sola dentro la finestra dell'anti-flood", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));

    act(() => { result.current.notifyTyping(); });
    act(() => { result.current.notifyTyping(); });
    act(() => { result.current.notifyTyping(); });

    const start = canale.send.mock.calls.filter(([m]) => m.typing === true);
    expect(start.length).toBe(1);
  });

  it("e di nuovo quando la finestra è passata", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    act(() => { result.current.notifyTyping(); });
    act(() => { vi.advanceTimersByTime(TYPING_PING_MS + 100); });
    act(() => { result.current.notifyTyping(); });
    expect(canale.send.mock.calls.filter(([m]) => m.typing === true).length).toBe(2);
  });

  it("stopTyping tace subito, senza aspettare il debounce", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTypingConversazione({ convId: CONV, myId: "io" }));
    act(() => { result.current.notifyTyping(); });
    canale.send.mockClear();
    act(() => { result.current.stopTyping(); });
    expect(canale.send).toHaveBeenCalledWith({ userId: "io", typing: false });
  });
});
