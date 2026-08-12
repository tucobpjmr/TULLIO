// M-5 — il badge dei non letti non si ricalcola a ogni battuta.
//
// `unreadChat` attraversa TUTTE le conversazioni e, per ognuna, tutti i suoi
// messaggi (fino a ~2000 tenuti in memoria). Era una riduzione nuda nel corpo
// di useChatData, cioè rieseguita a ogni render di VoyageDesk — che ri-renderizza
// a ogni carattere digitato nella barra di ricerca, a ogni toast, a ogni azione.
// Il risultato però cambia solo quando arriva o si legge un messaggio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../lib/api.js", () => ({
  Conversations: { listMine: vi.fn(async () => ({ data: [], error: null })) },
  Messages: { listAll: vi.fn(async () => ({ data: [], error: null })) },
  subscribeToTable: vi.fn(() => () => {}),
}));

// La funzione vera, avvolta da una spia: il conteggio delle invocazioni È
// l'asserzione, quindi il comportamento deve restare quello reale.
const vero = await vi.importActual("../components/chat/chatFormat.js");
const getUnreadCount = vi.fn(vero.getUnreadCount);
vi.mock("../components/chat/chatFormat.js", async () => {
  const attuale = await vi.importActual("../components/chat/chatFormat.js");
  return { ...attuale, getUnreadCount: (...a) => getUnreadCount(...a) };
});

const { useChatData } = await import("../hooks/useChatData.js");

const ME = "marco";
const CONVS = [
  { id: "c1", type: "direct", participants: [ME, "sofia"] },
  { id: "c2", type: "group", participants: [ME, "sofia", "luca"] },
];
const MSGS = {
  c1: [{ id: "m1", sender: "sofia", readBy: [], conversation_id: "c1" }],
  c2: [{ id: "m2", sender: "luca", readBy: [ME], conversation_id: "c2" }],
};

const monta = () => renderHook(() => useChatData({
  enabled: false,                 // modalità mock: nessuna idratazione da rete
  team: [{ id: ME }, { id: "sofia" }, { id: "luca" }],
  currentUserId: ME,
  mockConversations: CONVS,
  mockMessages: MSGS,
  onError: vi.fn(),
  onSuccess: vi.fn(),
  onConversationRead: vi.fn(),
}));

beforeEach(() => { getUnreadCount.mockClear(); });

describe("useChatData — unreadChat", () => {
  it("conta i messaggi non letti non inviati da me", () => {
    const { result } = monta();
    expect(result.current.unreadChat).toBe(1);
  });

  it("non ricalcola nulla su un re-render che non tocca chat né utente", () => {
    const { result, rerender } = monta();
    const dopoIlPrimo = getUnreadCount.mock.calls.length;
    expect(dopoIlPrimo).toBeGreaterThan(0);

    rerender();
    rerender();
    rerender();

    expect(getUnreadCount).toHaveBeenCalledTimes(dopoIlPrimo);
    expect(result.current.unreadChat).toBe(1);
  });
});
