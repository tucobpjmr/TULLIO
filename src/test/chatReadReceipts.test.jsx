// Regressione: "read receipts che non si aggiornano a chat aperta".
// Prima del fix, ConversationView marcava la conversazione come letta SOLO
// all'apertura (effect con dep [conv.id]): un messaggio arrivato via realtime
// mentre la chat restava aperta non veniva mai marcato come letto finché
// l'utente non chiudeva e riapriva la conversazione.
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatPanel } from "../components/chat/ChatPanel.jsx";
import { CURRENT_USER } from "../state/appGlobals.js";

// ChatPanel importa src/lib/api.js, che a sua volta istanzia il client
// Supabase reale (richiede VITE_SUPABASE_URL/ANON_KEY, assenti in test).
// Il fallback "mark as read" testato qui non passa da MessagesAPI/UsersAPI
// (usa markConversationRead=undefined → path locale in ChatPanel.jsx), quindi
// un mock a vuoto è sufficiente e ci evita di dover configurare un client
// Supabase fittizio solo per far caricare il modulo.
vi.mock("../lib/api.js", () => ({
  Messages: {
    getFileUrl: vi.fn(async () => ({ url: null, error: null })),
    uploadVoice: vi.fn(async () => ({ path: null, error: null })),
    uploadFile: vi.fn(async () => ({ path: null, error: null })),
    copyFile: vi.fn(async () => ({ path: null, error: null })),
    markRead: vi.fn(async () => ({ error: null })),
    markReadBulk: vi.fn(async () => ({ error: null })),
    setReactions: vi.fn(async () => ({ error: null })),
    setPinned: vi.fn(async () => ({ error: null })),
  },
  Users: {
    list: vi.fn(async () => ({ data: [], error: null })),
    getPreferences: vi.fn(async () => ({ data: null, error: null })),
    setRecentReactions: vi.fn(async () => ({ error: null })),
  },
}));

// jsdom non implementa Element.scrollTo (usato dall'effect di autoscroll).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const OTHER_USER = "sofia"; // membro reale di INITIAL_TEAM (diverso da CURRENT_USER)
const CONV_ID = "conv-test-1"; // non-uuid: nessuna chiamata Supabase (vedi isUuid guard)

// Harness: tiene lo stato messaggi "lato genitore" come farebbe VoyageDesk.jsx
// e passa setMessages/markConversationRead=undefined (fallback usato nei test,
// vedi commento in ChatPanel.jsx). Un bottone simula l'arrivo realtime di un
// nuovo messaggio non letto nella conversazione già aperta.
function ChatHarness({ onMessagesChange }) {
  const [messages, setMessagesState] = useState({
    [CONV_ID]: [
      { id: "m1", sender: OTHER_USER, type: "text", text: "ciao", time: new Date().toISOString(), readBy: [] },
    ],
  });

  const setMessages = (updater) => {
    setMessagesState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onMessagesChange(next);
      return next;
    });
  };

  const conv = { id: CONV_ID, type: "direct", participants: [CURRENT_USER, OTHER_USER], name: null };

  return (
    <div>
      <button onClick={() => setMessages(prev => ({
        ...prev,
        [CONV_ID]: [
          ...(prev[CONV_ID] || []),
          { id: "m2", sender: OTHER_USER, type: "text", text: "ci sei?", time: new Date().toISOString(), readBy: [] },
        ],
      }))}>
        simula-arrivo-realtime
      </button>
      <ChatPanel
        open
        onClose={() => {}}
        conversations={[conv]}
        setConversations={() => {}}
        messages={messages}
        setMessages={setMessages}
        intent={{ toUser: OTHER_USER }}
      />
    </div>
  );
}

describe("ConversationView — mark as read a chat aperta", () => {
  it("marca come letto il messaggio iniziale all'apertura", async () => {
    let latest;
    render(<ChatHarness onMessagesChange={(m) => { latest = m; }} />);

    await waitFor(() => {
      expect(latest[CONV_ID].find(m => m.id === "m1").readBy).toContain(CURRENT_USER);
    });
  });

  it("marca come letto un nuovo messaggio arrivato mentre la chat resta aperta, senza chiudere/riaprire", async () => {
    let latest;
    render(<ChatHarness onMessagesChange={(m) => { latest = m; }} />);

    // Attende il mark-as-read iniziale (m1)
    await waitFor(() => {
      expect(latest[CONV_ID].find(m => m.id === "m1").readBy).toContain(CURRENT_USER);
    });

    // Simula un nuovo messaggio non letto arrivato via realtime (conv. sempre aperta)
    fireEvent.click(screen.getByText("simula-arrivo-realtime"));

    await waitFor(() => {
      const m2 = latest[CONV_ID].find(m => m.id === "m2");
      expect(m2).toBeTruthy();
      expect(m2.readBy).toContain(CURRENT_USER);
    });
  });
});
