// Granularità del realtime: ricaricare SOLO ciò che l'evento può aver
// invalidato, e non lasciare fuori nessuna entità di dominio.
//
// Due correzioni sono blindate qui, ed entrambe hanno la stessa forma: un
// comportamento che era corretto quando i dati erano pochi e non lo è più.
//
//   A-1  useDebouncedTableSubscription non diceva a chi ricarica QUALE tabella
//        avesse generato l'evento, quindi chi si sottoscrive a più tabelle era
//        costretto a ricaricare tutto per costruzione. Nel modulo Liste questo
//        significava: ogni movimento registrato — l'operazione più frequente
//        del modulo — scaricava l'elenco completo delle liste e il cestino
//        completo su ogni client connesso.
//
//   A-2  `clients` era l'unica entità senza subscription. Un cliente creato da
//        un altro utente non arrivava MAI in sessione, e il sintomo era il
//        doppione in anagrafica (l'autocomplete non lo trovava e l'utente lo
//        ricreava a mano), non un dato visibilmente mancante.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ─── Doppi ───────────────────────────────────────────────────────────────────
// subscribeToTable registra gli handler per tabella, così i test possono
// emettere un evento su una tabella specifica — che è precisamente ciò che le
// correzioni qui sopra rendono distinguibile.
const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload = { eventType: "INSERT", new: {} }) =>
  handlers.get(tabella)?.(payload);

const ListeAPI = {
  list: vi.fn(async () => ({ data: [{ id: "l1" }], error: null })),
  listTrash: vi.fn(async () => ({ data: [{ id: "l2" }], error: null })),
  saldi: vi.fn(async () => ({ data: [{ lista_id: "l1", saldo: 10 }], error: null })),
};

vi.mock("../lib/api.js", () => ({ subscribeToTable: (...a) => subscribeToTable(...a) }));
vi.mock("../lib/listeApi.js", () => ({ ListeAPI }));

const { useDebouncedTableSubscription } = await import("../hooks/useDebouncedTableSubscription.js");
const { useListeData } = await import("../components/liste/useListeData.js");

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  ListeAPI.list.mockResolvedValue({ data: [{ id: "l1" }], error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [{ id: "l2" }], error: null });
  ListeAPI.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 10 }], error: null });
});

describe("useDebouncedTableSubscription — quale tabella ha generato l'evento", () => {
  it("l'idratazione iniziale riceve null, non un Set vuoto", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    // I due casi devono restare distinguibili: "nessun evento, carica tutto"
    // non è "eventi da un insieme vuoto di tabelle", che non esiste.
    expect(reload.mock.calls[0][1]).toBeNull();
  });

  it("passa a reload solo le tabelle che hanno davvero emesso", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("b");
      await new Promise(r => setTimeout(r, 20));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect([...reload.mock.calls[1][1]]).toEqual(["b"]);
  });

  it("coalesce più tabelle nella stessa finestra di debounce", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 5 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("a"); emetti("b"); emetti("a");
      await new Promise(r => setTimeout(r, 30));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect([...reload.mock.calls[1][1]].sort()).toEqual(["a", "b"]);
  });

  it("svuota le tabelle accumulate fra una finestra e la successiva", async () => {
    // Senza il reset, il secondo reload vedrebbe anche le tabelle del primo e
    // ricaricherebbe più del necessario per sempre — il bug si manifesterebbe
    // solo dopo il PRIMO evento, che è il modo più subdolo di sbagliare.
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 5 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => { emetti("a"); await new Promise(r => setTimeout(r, 30)); });
    await act(async () => { emetti("b"); await new Promise(r => setTimeout(r, 30)); });

    expect([...reload.mock.calls[2][1]]).toEqual(["b"]);
  });
});

describe("useListeData — un movimento non ricarica l'elenco", () => {
  it("un evento su movimenti_lista ricarica SOLO i saldi", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();
    ListeAPI.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 999 }], error: null });

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    // È il cuore della correzione: registrare un movimento è l'operazione più
    // frequente del modulo, e non può costare il download dell'intero elenco.
    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
    expect(ListeAPI.list).not.toHaveBeenCalled();
    expect(ListeAPI.listTrash).not.toHaveBeenCalled();
    expect(result.current.saldi).toEqual({ l1: { lista_id: "l1", saldo: 999 } });
  });

  it("il reload parziale non azzera liste e cestino già in stato", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    expect(result.current.liste).toEqual([{ id: "l1" }]);
    expect(result.current.cestino).toEqual([{ id: "l2" }]);
  });

  it("un evento su liste_viaggio ricarica tutto", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    await act(async () => {
      emetti("liste_viaggio");
      await new Promise(r => setTimeout(r, 250));
    });

    // Una lista creata, rinominata, archiviata o ripristinata cambia elenco e
    // cestino: qui il refetch completo è quello giusto, non uno spreco.
    expect(ListeAPI.list).toHaveBeenCalledTimes(1);
    expect(ListeAPI.listTrash).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
  });

  it("un errore sul reload parziale diventa loadError", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    ListeAPI.saldi.mockResolvedValue({ data: null, error: { message: "RLS negata" } });

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    expect(result.current.loadError).toBe("RLS negata");
    spy.mockRestore();
  });
});
