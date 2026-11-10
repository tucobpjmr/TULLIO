// useChatData — protezione delle scritture in volo (A-2 dell'audit del 14
// agosto, secondo passaggio).
//
// IL BUG CHE QUESTO FILE BLOCCA. La chat è l'unico sottosistema che, a
// differenza del core (state/persistence.js + pendingWrites), non aveva
// alcuna nozione di "questo messaggio l'ho appena inviato e non è ancora
// committato". `useChatData` ricarica `Messages.listAll()` a ogni evento
// realtime su `messages`/`conversations` e SOSTITUISCE l'intera mappa dei
// messaggi: se quell'evento arriva (da un ALTRO utente) prima che la nostra
// INSERT abbia fatto commit, la risposta del reload non contiene ancora il
// nostro messaggio, e sostituire la mappa lo fa sparire dallo schermo. Quando
// poi l'INSERT committa, la sua eco realtime porta il nostro `origin_client`
// e viene scartata — nessun reload successivo lo riporta.
//
// Stessa sequenza, stesso rimedio di src/test/pendingWrites.test.jsx per i
// task: un registro delle scritture in volo, letto dal reload e fuso col
// risultato del server invece di esserne sovrascritto.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const handlers = {};
const subscribeToTable = vi.fn((table, cb) => {
  (handlers[table] ||= []).push(cb);
  return () => {};
});

const ConversationsAPI = {
  listMine: vi.fn(async () => ({ data: [], error: null })),
};
const MessagesAPI = {
  listAll: vi.fn(async () => ({ data: [], error: null })),
  send: vi.fn(() => new Promise(() => {})), // non risolve mai: l'INSERT resta "in volo"
};

vi.mock("../../lib/api.js", () => ({
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
  subscribeToTable: (...a) => subscribeToTable(...a),
}));

const { useChatData } = await import("../../hooks/useChatData.js");

const UUID_CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: UUID_CONV, type: "direct", participants: ["u1", "u2"] }], error: null });
  MessagesAPI.listAll.mockResolvedValue({ data: [], error: null });
  MessagesAPI.send.mockImplementation(() => new Promise(() => {}));
});

// Fa scattare il debounce: pubblica un evento sulla tabella e aspetta oltre il
// delay di default (200ms) perché il reload parta e si concluda.
async function eventoRealtime(tabella, payload = { eventType: "INSERT" }) {
  for (const cb of handlers[tabella] || []) cb(payload);
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
}

describe("useChatData — un messaggio in volo sopravvive a un reload concorrente", () => {
  it("il messaggio appena inviato resta a schermo se un evento realtime altrui fa ripartire il reload prima del commit", async () => {
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {},
      onError: () => {}, onSuccess: () => {}, onConversationRead: () => {},
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Invio: MessagesAPI.send non risolve mai in questo test, quindi l'INSERT
    // resta "in volo" per tutta la durata del test — è esattamente la
    // finestra di rischio.
    let normalized;
    act(() => {
      normalized = result.current.commands.sendMessage(UUID_CONV, { id: "m-provv", sender: "u1", type: "text", text: "ciao" });
    });
    expect(result.current.messages[UUID_CONV]).toHaveLength(1);

    // Un evento realtime ALTRUI (su `messages`, per esempio un messaggio di
    // un altro utente) fa ripartire listAll(): il server non ha ancora la
    // nostra INSERT, quindi la risposta del reload NON contiene il nostro
    // messaggio.
    await eventoRealtime("messages");

    // Senza la fusione (messaggiInVolo in useChatData.js), qui la mappa
    // sarebbe stata sostituita con quella del server e il messaggio sarebbe
    // sparito.
    const dopoReload = result.current.messages[UUID_CONV] || [];
    expect(dopoReload.some(m => m.id === normalized.id)).toBe(true);
  });

  it("un secondo reload dopo il commit non duplica il messaggio", async () => {
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {},
      onError: () => {}, onSuccess: () => {}, onConversationRead: () => {},
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let normalized;
    act(() => {
      normalized = result.current.commands.sendMessage(UUID_CONV, { id: "m-provv", sender: "u1", type: "text", text: "ciao" });
    });

    // Il server ora HA il messaggio (commit avvenuto): il prossimo reload lo
    // include nella risposta.
    MessagesAPI.listAll.mockResolvedValue({
      data: [{
        id: normalized.id, conversation_id: UUID_CONV, sender_id: "u1",
        type: "text", text: "ciao", created_at: new Date().toISOString(),
      }],
      error: null,
    });
    await eventoRealtime("messages");

    const dopo = result.current.messages[UUID_CONV] || [];
    expect(dopo.filter(m => m.id === normalized.id)).toHaveLength(1);
  });
});

// A-1 dell'analisi del 10 novembre. Una lettura fallita mostrava il toast e poi
// scriveva comunque `[]` nelle conversazioni e `{}` nei messaggi: la chat si
// svuotava proprio al rientro della rete, quando il reload riparte.
describe("useChatData — una lettura fallita non svuota la chat", () => {
  const MSG = { id: "m1", conversation_id: UUID_CONV, sender_id: "u2", text: "ciao", created_at: "2026-11-10T10:00:00Z", read_by: [] };

  const monta = async (onError) => {
    MessagesAPI.listAll.mockResolvedValue({ data: [MSG], error: null });
    const r = renderHook(() => useChatData({
      enabled: true, team: [{ id: "u1" }, { id: "u2" }], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError, onSuccess: () => {},
    }));
    await waitFor(() => expect(r.result.current.messages[UUID_CONV]?.length).toBe(1));
    expect(r.result.current.conversations).toHaveLength(1);
    return r;
  };

  it("messaggi in errore: conversazioni e messaggi restano, e l'errore si vede", async () => {
    const onError = vi.fn();
    const { result } = await monta(onError);
    MessagesAPI.listAll.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });

    await eventoRealtime("conversations");

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("messaggi"));
    expect(result.current.messages[UUID_CONV]).toHaveLength(1);
    expect(result.current.conversations).toHaveLength(1);
  });

  it("conversazioni in errore: restano quelle di prima", async () => {
    const onError = vi.fn();
    const { result } = await monta(onError);
    ConversationsAPI.listMine.mockResolvedValue({ data: null, error: { message: "Failed to fetch" } });

    await eventoRealtime("conversations");

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("conversazioni"));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.messages[UUID_CONV]).toHaveLength(1);
  });

  it("primo caricamento in errore: lo spinner si chiude comunque", async () => {
    MessagesAPI.listAll.mockResolvedValue({ data: null, error: { message: "giù" } });
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError: () => {}, onSuccess: () => {},
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
