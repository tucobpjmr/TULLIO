// useListeData — un movimento rilegge il saldo della SUA lista, non di tutte.
//
// Prima ogni evento su movimenti_lista rileggeva l'intera vista `liste_saldi`
// (un aggregato su tutti i movimenti di tutte le liste) su ogni client con il
// modulo aperto: il costo cresceva con movimenti × utenti connessi.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload) => handlers.get(tabella)?.(payload);
const movimento = (listaId) => ({ eventType: "INSERT", new: { id: `m-${listaId}`, lista_id: listaId } });
const attendiDebounce = () => new Promise((r) => setTimeout(r, 250));

const ListeAPI = {
  list: vi.fn(),
  listTrash: vi.fn(),
  saldi: vi.fn(),
  saldiPerListe: vi.fn(),
};

vi.mock("../../lib/api/liste.js", () => ({ ListeAPI }));
vi.mock("../../lib/api.js", () => ({ subscribeToTable: (...a) => subscribeToTable(...a) }));

const { useListeData, TETTO_SALDI_MIRATI } = await import("../../components/liste/useListeData.js");

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  ListeAPI.list.mockResolvedValue({ data: [{ id: "l1" }, { id: "l2" }], error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [], error: null });
  ListeAPI.saldi.mockResolvedValue({
    data: [{ lista_id: "l1", saldo: 10 }, { lista_id: "l2", saldo: 20 }], error: null,
  });
  ListeAPI.saldiPerListe.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 99 }], error: null });
});

const montato = async () => {
  const hook = renderHook(() => useListeData({ enabled: true }));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  vi.clearAllMocks();
  return hook;
};

describe("useListeData — saldi mirati", () => {
  it("un movimento rilegge solo il saldo della sua lista e lascia gli altri", async () => {
    const { result } = await montato();

    await act(async () => { emetti("movimenti_lista", movimento("l1")); await attendiDebounce(); });

    expect(ListeAPI.saldiPerListe).toHaveBeenCalledWith(["l1"]);
    expect(ListeAPI.saldi).not.toHaveBeenCalled();
    expect(result.current.saldi).toEqual({
      l1: { lista_id: "l1", saldo: 99 },
      l2: { lista_id: "l2", saldo: 20 },
    });
  });

  it("più movimenti nella stessa finestra diventano UNA lettura", async () => {
    await montato();
    ListeAPI.saldiPerListe.mockResolvedValue({ data: [], error: null });

    await act(async () => {
      emetti("movimenti_lista", movimento("l1"));
      emetti("movimenti_lista", movimento("l2"));
      emetti("movimenti_lista", movimento("l1"));
      await attendiDebounce();
    });

    expect(ListeAPI.saldiPerListe).toHaveBeenCalledTimes(1);
    expect([...ListeAPI.saldiPerListe.mock.calls[0][0]].sort()).toEqual(["l1", "l2"]);
  });

  it("una lista senza riga di ritorno esce dalla mappa", async () => {
    const { result } = await montato();
    ListeAPI.saldiPerListe.mockResolvedValue({ data: [], error: null });

    await act(async () => { emetti("movimenti_lista", movimento("l2")); await attendiDebounce(); });

    expect(result.current.saldi).toEqual({ l1: { lista_id: "l1", saldo: 10 } });
  });

  // ⚠️ `movimenti_lista` ha la replica identity di default: su una DELETE
  // `old` porta solo l'id, e la lista non si conosce.
  it("un evento senza lista_id rilegge tutta la vista", async () => {
    await montato();

    await act(async () => {
      emetti("movimenti_lista", movimento("l1"));
      emetti("movimenti_lista", { eventType: "DELETE", old: { id: "m9" } });
      await attendiDebounce();
    });

    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldiPerListe).not.toHaveBeenCalled();
  });

  it("oltre il tetto rilegge tutta la vista", async () => {
    await montato();

    await act(async () => {
      for (let i = 0; i <= TETTO_SALDI_MIRATI; i++) emetti("movimenti_lista", movimento(`x${i}`));
      await attendiDebounce();
    });

    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldiPerListe).not.toHaveBeenCalled();
  });

  it("una lettura fallita rimette le liste per il giro successivo", async () => {
    const { result } = await montato();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    ListeAPI.saldiPerListe.mockResolvedValueOnce({ data: null, error: { message: "rete" } });

    await act(async () => { emetti("movimenti_lista", movimento("l1")); await attendiDebounce(); });
    expect(result.current.loadError).toBe("rete");

    await act(async () => { emetti("movimenti_lista", movimento("l2")); await attendiDebounce(); });

    expect([...ListeAPI.saldiPerListe.mock.calls[1][0]].sort()).toEqual(["l1", "l2"]);
    expect(result.current.loadError).toBeNull();
    spy.mockRestore();
  });

  it("un evento su liste_viaggio resta un reload completo", async () => {
    await montato();

    await act(async () => {
      emetti("movimenti_lista", movimento("l1"));
      emetti("liste_viaggio", { eventType: "UPDATE", new: { id: "l1" } });
      await attendiDebounce();
    });

    expect(ListeAPI.list).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldiPerListe).not.toHaveBeenCalled();
  });
});
