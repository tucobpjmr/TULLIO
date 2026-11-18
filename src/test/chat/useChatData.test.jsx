// useChatData — protezione delle scritture in volo (A-2 dell'audit del 14
// agosto, secondo passaggio).
//
// IL BUG CHE QUESTO FILE BLOCCA. La chat è l'unico sottosistema che, a
// differenza del core (state/persistence.js + pendingWrites), non aveva
// alcuna nozione di "questo messaggio l'ho appena inviato e non è ancora
// committato". `useChatData` rilegge i messaggi a ogni evento
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
  ultimiPerConversazioni: vi.fn(async () => ({ data: [], error: null, troncate: [] })),
  listForConversation: vi.fn(async () => ({ data: [], error: null })),
  send: vi.fn(() => new Promise(() => {})), // non risolve mai: l'INSERT resta "in volo"
  contaNonLetti: vi.fn(async () => ({ data: [], error: null })),
  markReadBulk: vi.fn(async () => ({ data: 0, error: null })),
};

vi.mock("../../lib/api.js", () => ({
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
  subscribeToTable: (...a) => subscribeToTable(...a),
}));

const { useChatData, PAGINA_STORIA } = await import("../../hooks/useChatData.js");
const { comeServer } = await import("../helpers/messaggiServer.js");

const UUID_CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: UUID_CONV, type: "direct", participants: ["u1", "u2"] }], error: null });
  MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: [], error: null }));
  MessagesAPI.send.mockImplementation(() => new Promise(() => {}));
  MessagesAPI.contaNonLetti.mockResolvedValue({ data: [], error: null });
  MessagesAPI.markReadBulk.mockResolvedValue({ data: 0, error: null });
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
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({
      data: [{
        id: normalized.id, conversation_id: UUID_CONV, sender_id: "u1",
        type: "text", text: "ciao", created_at: new Date().toISOString(),
      }],
      error: null,
    }));
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
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: [MSG], error: null }));
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
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: null, error: { message: "Failed to fetch" } }));

    // Un evento senza riga non si può applicare da solo: riparte la rilettura.
    await eventoRealtime("messages");

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
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: null, error: { message: "giù" } }));
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError: () => {}, onSuccess: () => {},
    }));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});

// A-2 dell'analisi del 10 novembre. Prima ogni evento su `messages` rileggeva
// il corpus intero, e sopra il tetto la storia più vecchia non era raggiungibile.
describe("useChatData — eventi di messages applicati riga per riga", () => {
  const riga = (id, extra = {}) => ({
    id, conversation_id: UUID_CONV, sender_id: "u2", text: id,
    created_at: "2026-11-10T10:00:00Z", read_by: [], ...extra,
  });

  const monta = async (iniziali = [riga("m1")]) => {
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: iniziali, error: null }));
    const r = renderHook(() => useChatData({
      enabled: true, team: [{ id: "u1" }, { id: "u2" }], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError: vi.fn(), onSuccess: () => {},
    }));
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    MessagesAPI.ultimiPerConversazioni.mockClear();
    ConversationsAPI.listMine.mockClear();
    return r;
  };

  it("INSERT: il messaggio compare senza rileggere il corpus", async () => {
    const { result } = await monta();
    await eventoRealtime("messages", { eventType: "INSERT", new: riga("m2", { created_at: "2026-11-10T10:01:00Z" }) });

    expect(result.current.messages[UUID_CONV].map(m => m.id)).toEqual(["m1", "m2"]);
    expect(MessagesAPI.ultimiPerConversazioni).not.toHaveBeenCalled();
    expect(ConversationsAPI.listMine).not.toHaveBeenCalled();
  });

  it("UPDATE e DELETE: la riga si aggiorna e si toglie", async () => {
    const { result } = await monta([riga("m1"), riga("m2")]);
    await eventoRealtime("messages", { eventType: "UPDATE", new: riga("m1", { read_by: ["u1"] }) });
    expect(result.current.messages[UUID_CONV][0].readBy).toEqual(["u1"]);

    await eventoRealtime("messages", { eventType: "DELETE", old: { id: "m2", conversation_id: UUID_CONV } });
    expect(result.current.messages[UUID_CONV].map(m => m.id)).toEqual(["m1"]);
    expect(MessagesAPI.ultimiPerConversazioni).not.toHaveBeenCalled();
  });

  it("UPDATE di un messaggio non in stato: ignorato (niente buchi nella storia)", async () => {
    const { result } = await monta();
    await eventoRealtime("messages", { eventType: "UPDATE", new: riga("vecchio", { created_at: "2020-01-01T00:00:00Z" }) });
    expect(result.current.messages[UUID_CONV].map(m => m.id)).toEqual(["m1"]);
  });

  it("controllo positivo: un evento senza riga leggibile rilegge il corpus", async () => {
    await monta();
    await eventoRealtime("messages", { eventType: "INSERT" });
    expect(MessagesAPI.ultimiPerConversazioni).toHaveBeenCalledTimes(1);
  });
});

describe("useChatData — storia di una conversazione con la pagina piena", () => {
  const riga = (i, extra = {}) => ({
    id: `m${i}`, conversation_id: UUID_CONV, sender_id: "u2", text: `t${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), read_by: [], ...extra,
  });
  // Conversazione «troncata»: il server ne consegna una pagina piena.
  const CORPUS = Array.from({ length: PAGINA_STORIA }, (_, i) => riga(10_000 + i));

  const monta = async (corpus = CORPUS) => {
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: corpus, error: null }));
    const onError = vi.fn();
    const r = renderHook(() => useChatData({
      enabled: true, team: [{ id: "u1" }, { id: "u2" }], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError, onSuccess: () => {},
    }));
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    return { ...r, onError };
  };

  it("una pagina non piena: storia completa, niente da caricare", async () => {
    const { result } = await monta([riga(1)]);
    expect(result.current.storiaMessaggi.corpusCompleto).toBe(true);
  });

  it("caricaPrecedenti chiede la pagina prima del più vecchio in stato e la mette in testa", async () => {
    const { result } = await monta();
    expect(result.current.storiaMessaggi.corpusCompleto).toBe(false);
    const pagina = Array.from({ length: PAGINA_STORIA }, (_, i) => riga(9_000 + i));
    MessagesAPI.listForConversation.mockResolvedValueOnce({ data: pagina, error: null });

    await act(async () => { await result.current.commands.caricaPrecedenti(UUID_CONV); });

    expect(MessagesAPI.listForConversation).toHaveBeenCalledWith(
      UUID_CONV, { fino: CORPUS[0].created_at, limit: PAGINA_STORIA });
    const lista = result.current.messages[UUID_CONV];
    expect(lista).toHaveLength(PAGINA_STORIA + PAGINA_STORIA);
    expect(lista[0].id).toBe("m9000");
    expect(result.current.storiaMessaggi.perConv[UUID_CONV].completa).toBe(false);
  });

  it("una pagina corta chiude la storia: nessuna altra richiesta", async () => {
    const { result } = await monta();
    MessagesAPI.listForConversation.mockResolvedValueOnce({ data: [riga(1), CORPUS[0]], error: null });
    await act(async () => { await result.current.commands.caricaPrecedenti(UUID_CONV); });
    expect(result.current.storiaMessaggi.perConv[UUID_CONV].completa).toBe(true);
    expect(result.current.messages[UUID_CONV]).toHaveLength(PAGINA_STORIA + 1);

    MessagesAPI.listForConversation.mockClear();
    await act(async () => { await result.current.commands.caricaPrecedenti(UUID_CONV); });
    expect(MessagesAPI.listForConversation).not.toHaveBeenCalled();
  });

  it("un errore si vede, non chiude la storia e non tocca i messaggi", async () => {
    const { result, onError } = await monta();
    MessagesAPI.listForConversation.mockResolvedValueOnce({ data: null, error: { message: "rete" } });
    await act(async () => { await result.current.commands.caricaPrecedenti(UUID_CONV); });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("precedenti"));
    expect(result.current.storiaMessaggi.perConv[UUID_CONV]).toMatchObject({ completa: false, errore: true, caricando: false });
    expect(result.current.messages[UUID_CONV]).toHaveLength(PAGINA_STORIA);
  });

  it("una rilettura della conversazione troncata non butta via la storia già caricata", async () => {
    const { result } = await monta();
    MessagesAPI.listForConversation.mockResolvedValueOnce({ data: [riga(1), riga(2)], error: null });
    await act(async () => { await result.current.commands.caricaPrecedenti(UUID_CONV); });

    await eventoRealtime("messages", { eventType: "INSERT" }); // senza riga: rilettura

    const ids = result.current.messages[UUID_CONV].map(m => m.id);
    expect(ids.slice(0, 2)).toEqual(["m1", "m2"]);
    expect(ids).toHaveLength(PAGINA_STORIA + 2);
  });
});

// ─── B-7 del 16 novembre · non letti oltre il corpus, contati dal server ────
describe("useChatData — non letti più vecchi della finestra", () => {
  const riga = (i, extra = {}) => ({
    id: `n${i}`, conversation_id: UUID_CONV, sender_id: "u2", text: `t${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), read_by: ["u1"], ...extra,
  });
  // Pagina piena con 2 non letti dentro; il server ne conta 5.
  const corpus = () => Array.from({ length: PAGINA_STORIA }, (_, i) => riga(i, i < 2 ? { read_by: [] } : {}));

  const monta = async (data) => {
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data, error: null }));
    const r = renderHook(() => useChatData({
      enabled: true, team: [{ id: "u1" }, { id: "u2" }], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError: vi.fn(), onSuccess: () => {},
    }));
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    return r;
  };

  it("pagina piena: il badge somma i non letti che la finestra non contiene", async () => {
    MessagesAPI.contaNonLetti.mockResolvedValue({ data: [{ conversation_id: UUID_CONV, non_letti: 5 }], error: null });
    const { result } = await monta(corpus());
    expect(MessagesAPI.contaNonLetti).toHaveBeenCalledTimes(1);
    expect(result.current.storiaMessaggi.nonLettiOltre).toEqual({ [UUID_CONV]: 3 });
    expect(result.current.unreadChat).toBe(5);
  });

  it("segnare letta la conversazione azzera anche la parte oltre il corpus", async () => {
    MessagesAPI.contaNonLetti.mockResolvedValue({ data: [{ conversation_id: UUID_CONV, non_letti: 5 }], error: null });
    const { result } = await monta(corpus());
    act(() => { result.current.commands.markConversationRead(UUID_CONV); });
    expect(result.current.unreadChat).toBe(0);
    expect(result.current.storiaMessaggi.nonLettiOltre).toEqual({});
  });

  it("pagina non piena: il server non si interroga, c'è già tutto", async () => {
    const { result } = await monta([riga(1, { read_by: [] })]);
    expect(MessagesAPI.contaNonLetti).not.toHaveBeenCalled();
    expect(result.current.unreadChat).toBe(1);
  });

  it("RPC assente o in errore: si resta sul conteggio locale, senza toast", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    MessagesAPI.contaNonLetti.mockResolvedValue({ data: null, error: { message: "function not found" } });
    const { result } = await monta(corpus());
    expect(result.current.unreadChat).toBe(2);
    expect(result.current.storiaMessaggi.nonLettiOltre).toEqual({});
    warn.mockRestore();
  });
});

// ─── Punto 4 dell'analisi del 15 novembre · una finestra per conversazione ──
describe("useChatData — gli ultimi messaggi di OGNI conversazione", () => {
  const C2 = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const riga = (conv, i) => ({
    id: `${conv.slice(0, 2)}${i}`, conversation_id: conv, sender_id: "u2", text: `t${i}`,
    created_at: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), read_by: ["u1"],
  });
  const monta = async () => {
    const r = renderHook(() => useChatData({
      enabled: true, team: [{ id: "u1" }, { id: "u2" }], currentUserId: "u1",
      mockConversations: [], mockMessages: {}, onError: vi.fn(), onSuccess: () => {},
    }));
    await waitFor(() => expect(r.result.current.loading).toBe(false));
    return r;
  };

  it("chiede le conversazioni elencate, e la storia è per conversazione", async () => {
    ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: UUID_CONV }, { id: C2 }], error: null });
    const piena = Array.from({ length: PAGINA_STORIA }, (_, i) => riga(UUID_CONV, i));
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: [...piena, riga(C2, 1)], error: null }));

    const { result } = await monta();

    expect(MessagesAPI.ultimiPerConversazioni).toHaveBeenCalledWith([UUID_CONV, C2], { limit: PAGINA_STORIA });
    expect(result.current.storiaMessaggi.corpusCompleto).toBe(false);
    expect(result.current.storiaMessaggi.perConv[C2]?.completa).toBe(true);
    expect(result.current.storiaMessaggi.perConv[UUID_CONV]?.completa).toBeFalsy();
  });

  it("una conversazione nuova legge SOLO i suoi messaggi, e le altre restano", async () => {
    ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: UUID_CONV }], error: null });
    MessagesAPI.ultimiPerConversazioni.mockImplementation(comeServer({ data: [riga(UUID_CONV, 1), riga(C2, 2)], error: null }));
    const { result } = await monta();
    MessagesAPI.ultimiPerConversazioni.mockClear();

    ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: UUID_CONV }, { id: C2 }], error: null });
    await eventoRealtime("conversations", { eventType: "INSERT" });

    expect(MessagesAPI.ultimiPerConversazioni).toHaveBeenCalledTimes(1);
    expect(MessagesAPI.ultimiPerConversazioni.mock.calls[0][0]).toEqual([C2]);
    expect(result.current.messages[UUID_CONV].map(m => m.id)).toEqual(["aa1"]);
    expect(result.current.messages[C2].map(m => m.id)).toEqual(["bb2"]);
  });
});
