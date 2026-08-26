// A-2 dell'audit del 14 agosto (terzo passaggio) — "è andata bene?" ha una
// definizione sola, e vale per tutti i sottosistemi che scrivono.
//
// PERCHÉ. C-1 del secondo passaggio ha stabilito che una scrittura rifiutata
// dalla RLS non mette nulla in `error` (la policy filtra le righe, PostgREST
// risponde 2xx) e che l'unico modo di accorgersene è leggere `count`. Quella
// lettura viveva però dentro hooks/useSyncedDispatch.js, cioè per il solo
// core: la chat e il modulo Liste avevano ciascuno il proprio `if (r?.error)`.
// Il caso misurabile: `Messages.setPinned` chiede `count: 'exact'` da C-1 e
// nessuno lo leggeva — il conteggio viaggiava sulla rete a ogni pin e finiva
// nel cestino.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { esitoScrittura, RIFIUTO_RLS } from "../../lib/esitoScrittura.js";

describe("esitoScrittura", () => {
  it("un errore esplicito resta l'errore", () => {
    const err = { message: "boom" };
    expect(esitoScrittura({ error: err })).toBe(err);
  });

  it("count 0 su una scrittura mirata è un rifiuto, non un successo", () => {
    expect(esitoScrittura({ error: null, count: 0 })).toBe(RIFIUTO_RLS);
    expect(RIFIUTO_RLS.message).toMatch(/permessi insufficienti/i);
  });

  it("count > 0 è successo", () => {
    expect(esitoScrittura({ error: null, count: 1 })).toBeNull();
  });

  // L'adozione è per-metodo: i metodi del data layer che NON chiedono il
  // conteggio (perché zero righe è per loro un esito normale — markAllRead su
  // zero non lette, hardDeleteMany su un cestino vuoto) devono continuare a
  // comportarsi come prima.
  it("senza count il comportamento resta quello di sempre", () => {
    expect(esitoScrittura({ error: null })).toBeNull();
    expect(esitoScrittura({})).toBeNull();
    expect(esitoScrittura(null)).toBeNull();
    expect(esitoScrittura(undefined)).toBeNull();
  });

  it("count non numerico non inventa un rifiuto", () => {
    expect(esitoScrittura({ error: null, count: null })).toBeNull();
  });
});

// La regressione da bloccare non è nella funzione (è tre righe): è che un
// sottosistema torni a leggere `r.error` da solo. Qui si verifica sul campo
// che il pin della chat — la scrittura che si fa sul messaggio ALTRUI, cioè
// quella che il trigger messages_blocca_modifiche_altrui sorveglia — reagisca
// a un count 0.
describe("la chat legge il conteggio, non solo l'errore", () => {
  const MessagesAPI = {
    send: vi.fn(async () => ({ error: null })),
    setPinned: vi.fn(async () => ({ error: null, count: 0 })),
    markReadBulk: vi.fn(async () => ({ error: null })),
    toggleReaction: vi.fn(async () => ({ error: null })),
    removeConversationFiles: vi.fn(async () => ({ error: null })),
  };
  const ConversationsAPI = {
    create: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null, count: 1 })),
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it("un pin rifiutato in silenzio mostra l'errore e torna indietro", async () => {
    vi.doMock("../../lib/api.js", () => ({ Conversations: ConversationsAPI, Messages: MessagesAPI }));
    const { makeChatCommands } = await import("../../components/chat/chatCommands.js");

    const CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const MSG = "11111111-2222-4333-8444-555555555555";
    let messages = { [CONV]: [{ id: MSG, sender: "u2", pinned: false, pinnedBy: null, pinnedAt: null }] };
    const onError = vi.fn();
    const commands = makeChatCommands({
      setMessages: (u) => { messages = typeof u === "function" ? u(messages) : u; },
      enabled: true,
      getCurrentUserId: () => "u1",
      onError,
    });

    commands.setMessagePinned(CONV, MSG, true, "u1", { pinned: false, pinnedBy: null, pinnedAt: null });
    expect(messages[CONV][0].pinned).toBe(true); // ottimistico
    await new Promise(r => setTimeout(r, 0));

    expect(onError).toHaveBeenCalledTimes(1);
    // Senza il conteggio, questo pin sarebbe rimasto a schermo per chi ha
    // cliccato e per nessun altro, senza un solo messaggio d'errore.
    expect(messages[CONV][0].pinned).toBe(false);
    expect(messages[CONV][0].pinnedBy).toBeNull();
  });
});
