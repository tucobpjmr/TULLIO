// A-2 — i clienti sono un'entità realtime come tutte le altre, e l'id che il
// client genera è quello che finisce sul database.
//
// I due pezzi stanno nello stesso file perché sono lo stesso problema visto da
// due lati, e separarli renderebbe incomprensibile il secondo.
//
// Prima, `clients` era l'unica entità di dominio senza subscription: una
// useEffect al mount e nient'altro. Quella mancanza NASCONDEVA un secondo
// difetto — toDbClient non spediva l'id, quindi il database ne assegnava uno
// proprio (default gen_random_uuid()) diverso da quello messo nello stato
// React da ADD_CLIENT.normalize. Siccome nessuna ri-idratazione arrivava mai a
// smentire lo stato locale, lo scarto restava invisibile fino al reload
// successivo — ma UPDATE_CLIENT e DELETE_CLIENT usano quell'id come clausola
// WHERE, quindi ogni modifica a un cliente creato nella stessa sessione
// colpiva ZERO righe sul server mentre la UI diceva "Cliente aggiornato!".
//
// Aggiungere la subscription senza correggere l'id avrebbe trasformato un bug
// latente in uno visibile entro 200 ms: la ri-idratazione avrebbe sostituito
// la riga locale con quella del server, con un id diverso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { toDbClient, toDbClientPatch, isUuid } from "../lib/mappers.js";
import { PERSISTENCE } from "../state/persistence.js";

const UUID = "11111111-2222-4333-8444-555555555555";

// ─── Il lato mapper: l'id viaggia sull'insert, non sul patch ─────────────────
describe("toDbClient / toDbClientPatch", () => {
  it("toDbClient porta con sé un id valido invece di lasciarlo generare al DB", () => {
    const row = toDbClient({ id: UUID, name: "Rossi" });
    expect(row.id).toBe(UUID);
  });

  it("toDbClient genera un uuid quando l'id manca o non è valido", () => {
    // Il DB ha comunque un default, ma generarlo qui è ciò che tiene allineati
    // stato React e riga del server: il default è la rete di sicurezza, non il
    // percorso normale.
    expect(isUuid(toDbClient({ name: "Rossi" }).id)).toBe(true);
    expect(isUuid(toDbClient({ id: "c123", name: "Rossi" }).id)).toBe(true);
    expect(toDbClient({ id: "c123", name: "Rossi" }).id).not.toBe("c123");
  });

  it("toDbClientPatch NON contiene l'id", () => {
    // L'id identifica la riga nella clausola WHERE. Mandarlo anche fra i campi
    // da scrivere significherebbe riscrivere la chiave primaria della riga che
    // si sta modificando.
    const patch = toDbClientPatch({ id: UUID, name: "Rossi", city: "Roma" });
    expect(patch).not.toHaveProperty("id");
    expect(patch).toEqual({ name: "Rossi", city: "Roma" });
  });

  it("toDbClientPatch traduce solo i campi presenti", () => {
    // Un patch parziale non deve azzerare il resto della riga: è lo stesso
    // contratto di toDbTaskPatch.
    expect(toDbClientPatch({ city: "Roma" })).toEqual({ city: "Roma" });
    expect(toDbClientPatch({ email: null })).toEqual({ email: null });
  });
});

// ─── Il lato registry: l'id normalizzato è quello persistito ─────────────────
describe("ADD_CLIENT — l'id dello stato è quello del database", () => {
  it("normalize genera l'id e persist lo spedisce, identico", () => {
    const azione = PERSISTENCE.ADD_CLIENT.normalize({
      type: "ADD_CLIENT", payload: { name: "Rossi" },
    });
    const idNelloStato = azione.payload.id;

    let rigaSpedita;
    const ClientsAPI = { create: (r) => { rigaSpedita = r; return { error: null }; } };
    // Invece di rimockare l'intero modulo api, esercitiamo il mapper sullo
    // stesso payload che persist gli passerebbe: è quel passaggio ad aver
    // perso l'id, ed è quello che il test deve sorvegliare.
    ClientsAPI.create(toDbClient(azione.payload));

    expect(isUuid(idNelloStato)).toBe(true);
    expect(rigaSpedita.id).toBe(idNelloStato);
  });

  it("un id già valido non viene rigenerato", () => {
    const azione = PERSISTENCE.ADD_CLIENT.normalize({
      type: "ADD_CLIENT", payload: { id: UUID, name: "Rossi" },
    });
    expect(azione.payload.id).toBe(UUID);
  });
});

// ─── Il lato idratazione: la subscription esiste ─────────────────────────────
const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});

const vuoto = { data: [], error: null };
// Estratta e non inline: M-1 (passo 2) verifica QUANTE volte l'anagrafica
// viene scaricata, e per farlo serve poterla interrogare.
const ClientsList = vi.fn(async () => ({ data: [{ id: UUID, name: "Rossi" }], error: null }));
vi.mock("../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
  Tasks: { list: vi.fn(async () => vuoto) },
  Notices: { list: vi.fn(async () => vuoto) },
  Categories: { list: vi.fn(async () => vuoto) },
  Users: { listAll: vi.fn(async () => vuoto), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: (...a) => ClientsList(...a) },
  MessageTemplates: { list: vi.fn(async () => vuoto) },
}));

const { useAppHydration } = await import("../hooks/useAppHydration.js");

beforeEach(() => { vi.clearAllMocks(); handlers.clear(); });

describe("useAppHydration — i clienti sono realtime come le altre entità", () => {
  it("sottoscrive la tabella clients", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(result.current.crmLoading).toBe(false));

    // La riga che mancava: senza, un cliente creato da un altro utente non
    // arrivava mai in sessione.
    expect([...handlers.keys()]).toContain("clients");
  });

  // ⚠️ M-1 (passo 2), 19 agosto: la sottoscrizione c'è ancora, ma l'anagrafica
  // non si idrata più all'avvio — la chiede la vista che la guarda. Il
  // contratto verificato qui è quindi in due tempi, e sono entrambi il punto.
  it("un evento su clients ri-dispatcha SET_CLIENTS, DOPO che l'anagrafica è stata chiesta", async () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await act(async () => { await result.current.clientiCompleti.richiedi(); });
    await waitFor(() => expect(result.current.crmLoading).toBe(false));
    dispatch.mockClear();

    handlers.get("clients")?.({ eventType: "INSERT", new: {} });
    await waitFor(() =>
      expect(dispatch.mock.calls.some(([a]) => a.type === "SET_CLIENTS")).toBe(true));
  });

  it("PRIMA che sia stata chiesta, un evento su clients non tocca lo stato", async () => {
    // Non è un'ottimizzazione: `applicaRigaRealtime` APPENDE le righe che non
    // conosce, quindi su un elenco vuoto ogni evento costruirebbe
    // un'anagrafica di uno, due, tre clienti — parziale e indistinguibile da
    // una vera per chiunque la legga.
    const dispatch = vi.fn();
    renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(handlers.has("clients")).toBe(true));
    dispatch.mockClear();

    handlers.get("clients")?.({ eventType: "INSERT", new: { id: "c9", name: "Fantasma" } });
    await new Promise(r => setTimeout(r, 400));
    const toccati = dispatch.mock.calls
      .map(([a]) => a.type)
      .filter(t => t === "SET_CLIENTS" || t === "MERGE_CLIENT_ROW");
    expect(toccati).toEqual([]);
  });

  it("l'anagrafica NON si scarica all'avvio: è la vista che la chiede", async () => {
    // Il rilievo M-1 in una riga. `Clients.list()` resta la lettura giusta —
    // paginata, intera — ma non parte più da sola.
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(handlers.has("clients")).toBe(true));
    expect(ClientsList).not.toHaveBeenCalled();

    await act(async () => { await result.current.clientiCompleti.richiedi(); });
    expect(ClientsList).toHaveBeenCalledTimes(1);

    // Idempotente: una seconda vista che la chiede non rifà la query.
    await act(async () => { await result.current.clientiCompleti.richiedi(); });
    expect(ClientsList).toHaveBeenCalledTimes(1);
  });

  it("con enabled=false non interroga nulla e non blocca lo spinner", () => {
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: false, currentUserId: null, dispatch, onError: vi.fn(),
    }));

    // Senza login si usano i mock: il gate non deve essere stato perso nel
    // passaggio da useEffect a subscription.
    expect(handlers.size).toBe(0);
    expect(result.current.crmLoading).toBe(false);
  });
});
