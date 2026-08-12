// B-1 — compensazioni della campanella.
//
// `remove` e `clearAll` sono ottimistiche: l'elenco si aggiorna subito e, se la
// delete su DB fallisce, si torna indietro. Il difetto era DOVE veniva letto lo
// stato da cui costruire quel "indietro": dentro l'updater di setState
//
//     setNotifications(prev => { snapshot = prev; return prev.filter(…); });
//
// cioè in una funzione che React 18 può invocare più di una volta per lo stesso
// aggiornamento (StrictMode di proposito, il Concurrent rendering rigiocando la
// coda su una base più recente). Un updater che scrive fuori da sé non è puro,
// e quale invocazione vinca non è deciso da questo codice.
//
// La correzione è doppia: lo stato si legge da un ref aggiornato in render, e
// la compensazione è MIRATA — la notifica torna al suo posto, l'elenco non
// viene riscritto per intero. Su un feed vivo la differenza è quella fra
// rimettere a posto un errore e cancellare quello che è arrivato nel frattempo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const Notifications = {
  list: vi.fn(async () => ({ data: [], error: null })),
  markRead: vi.fn(async () => ({ error: null })),
  markAllRead: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
  removeAll: vi.fn(async () => ({ error: null })),
};

vi.mock("../lib/api.js", () => ({
  Notifications,
  subscribeToTable: vi.fn(() => () => {}),
}));

const { useNotifications } = await import("../hooks/useNotifications.js");

const notifica = (id) => ({ id, type: "mention", read: false, text: `n-${id}` });

// Monta l'hook e semina l'elenco DOPO l'idratazione iniziale (che con `list`
// vuota lo azzererebbe subito dopo).
const conElenco = async (elenco) => {
  const onError = vi.fn();
  const view = renderHook(() => useNotifications({ enabled: true, onError }));
  await waitFor(() => expect(Notifications.list).toHaveBeenCalled());
  await act(async () => { view.result.current.setNotifications(elenco); });
  return { ...view, onError };
};

beforeEach(() => {
  vi.clearAllMocks();
  Notifications.list.mockResolvedValue({ data: [], error: null });
  Notifications.remove.mockResolvedValue({ error: null });
  Notifications.removeAll.mockResolvedValue({ error: null });
});

describe("useNotifications — remove", () => {
  it("toglie la notifica subito e la lascia via se il server conferma", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.remove("a"); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["b"]);
  });

  it("in errore la rimette AL SUO POSTO, non in coda", async () => {
    Notifications.remove.mockResolvedValueOnce({ error: { message: "rls" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, onError } = await conElenco([notifica("a"), notifica("b"), notifica("c")]);

    await act(async () => { result.current.remove("b"); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["a", "b", "c"]);
    expect(onError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("in errore NON cancella ciò che è arrivato mentre la delete era in volo", async () => {
    // È il caso che il rollback allo snapshot intero sbagliava: la campanella è
    // un feed, e fra il click e la risposta del server il realtime consegna.
    let sblocca;
    Notifications.remove.mockReturnValueOnce(new Promise(r => { sblocca = r; }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.remove("a"); });
    // Arriva una notifica nuova mentre la delete è ancora in volo.
    await act(async () => { result.current.setNotifications(prev => [notifica("z"), ...prev]); });
    await act(async () => { sblocca({ error: { message: "rls" } }); });

    const ids = result.current.notifications.map(n => n.id);
    expect(ids).toContain("z");   // l'arrivata non è stata spazzata via
    expect(ids).toContain("a");   // la rimozione fallita è tornata
    errSpy.mockRestore();
  });

  it("un id che non è in elenco non tocca né stato né server", async () => {
    const { result } = await conElenco([notifica("a")]);
    await act(async () => { result.current.remove("inesistente"); });
    expect(Notifications.remove).not.toHaveBeenCalled();
    expect(result.current.notifications.map(n => n.id)).toEqual(["a"]);
  });
});

describe("useNotifications — clearAll", () => {
  it("svuota subito e resta vuoto se il server conferma", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);
    await act(async () => { result.current.clearAll(); });
    expect(result.current.notifications).toEqual([]);
  });

  it("in errore rimette l'elenco di prima", async () => {
    Notifications.removeAll.mockResolvedValueOnce({ error: { message: "rls" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, onError } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.clearAll(); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["a", "b"]);
    expect(onError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("in errore unisce invece di sostituire: l'arrivata resta in testa", async () => {
    let sblocca;
    Notifications.removeAll.mockReturnValueOnce(new Promise(r => { sblocca = r; }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await conElenco([notifica("a")]);

    await act(async () => { result.current.clearAll(); });
    await act(async () => { result.current.setNotifications([notifica("z")]); });
    await act(async () => { sblocca({ error: { message: "rls" } }); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["z", "a"]);
    errSpy.mockRestore();
  });
});

describe("useNotifications — identità dei comandi", () => {
  it("remove e clearAll non cambiano riferimento quando arriva una notifica", async () => {
    const { result } = await conElenco([notifica("a")]);
    const prima = { remove: result.current.remove, clearAll: result.current.clearAll };

    await act(async () => { result.current.setNotifications(prev => [notifica("z"), ...prev]); });

    // Se lo stato fosse nelle deps della useCallback (invece che in un ref),
    // ogni notifica in arrivo ricreerebbe i comandi e invaliderebbe chi li
    // memoizza.
    expect(result.current.remove).toBe(prima.remove);
    expect(result.current.clearAll).toBe(prima.clearAll);
  });
});
