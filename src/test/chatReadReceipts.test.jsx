// Regressione: "read receipts che non si aggiornano a chat aperta".
// Prima del fix, ConversationView marcava la conversazione come letta SOLO
// all'apertura (effect con dep [conv.id]): un messaggio arrivato via realtime
// mentre la chat restava aperta non veniva mai marcato come letto finché
// l'utente non chiudeva e riapriva la conversazione.
import { describe, it, expect, vi } from "vitest";
import { useMemo, useState } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
// ST-12 · Import DINAMICO: `ChatPanel` è ora un chunk lazy e una regola di
// lint vieta la forma statica (la stessa che protegge ClienteListePanel e
// ArchivedListe). Un `import` statico qui non romperebbe il test — romperebbe
// il chunk, che è precisamente il difetto che nessuno vede in review.
const { ChatPanel } = await import("../components/chat/ChatPanel.jsx");
import { makeChatCommands } from "../components/chat/chatCommands.js";
import { INITIAL_TEAM } from "../state/mockData.js";
import { renderWithAppData } from "./helpers/appData.jsx";

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

// Utente corrente e interlocutore: due membri reali di INITIAL_TEAM. Prima
// erano letti dal globale CURRENT_USER; ora il contesto è dichiarato qui e
// passato al render, quindi il test non dipende da nessuno stato di modulo.
const ME = "marco";
const OTHER_USER = "sofia";
const APP_CTX = { team: INITIAL_TEAM, currentUserId: ME };
const render = (ui) => renderWithAppData(ui, APP_CTX);
const CONV_ID = "conv-test-1"; // non-uuid: nessuna chiamata Supabase (vedi isUuid guard)

// Harness: tiene lo stato messaggi "lato genitore" come fa VoyageDesk.jsx e ne
// costruisce i COMANDI, invece di passare al pannello il setter grezzo perché
// ricostruisca gli stessi comandi per conto suo (ST-10). È il punto del
// rilievo: il mark-as-read aveva due implementazioni — quella dei comandi e un
// fallback dentro ConversationView "per i test" — e a divergere sarebbe stata
// proprio quella che questo file esercitava. Ora ne resta una sola, ed è quella
// di produzione. Un bottone simula l'arrivo realtime di un nuovo messaggio non
// letto nella conversazione già aperta.
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
  const commands = useMemo(
    () => makeChatCommands({ setMessages, getCurrentUserId: () => ME, enabled: false }),
    // `setMessages` è ricreata a ogni render dell'harness ma chiude solo su
    // setState e su una callback stabile: tenerla nelle deps ricostruirebbe i
    // comandi a ogni render, che è ciò che ConversationView non deve vedere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const conv = { id: CONV_ID, type: "direct", participants: [ME, OTHER_USER], name: null };

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
        messages={messages}
        commands={commands}
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
      expect(latest[CONV_ID].find(m => m.id === "m1").readBy).toContain(ME);
    });
  });

  it("marca come letto un nuovo messaggio arrivato mentre la chat resta aperta, senza chiudere/riaprire", async () => {
    let latest;
    render(<ChatHarness onMessagesChange={(m) => { latest = m; }} />);

    // Attende il mark-as-read iniziale (m1)
    await waitFor(() => {
      expect(latest[CONV_ID].find(m => m.id === "m1").readBy).toContain(ME);
    });

    // Simula un nuovo messaggio non letto arrivato via realtime (conv. sempre aperta)
    fireEvent.click(screen.getByText("simula-arrivo-realtime"));

    await waitFor(() => {
      const m2 = latest[CONV_ID].find(m => m.id === "m2");
      expect(m2).toBeTruthy();
      expect(m2.readBy).toContain(ME);
    });
  });
});
