// Apertura della conversazione dal tap su una notifica di chat
// (20260725_chat_message_notifications): il service worker manda
// push-open-chat / ?chat=<id>, VoyageDesk lo traduce in un intent { convId } e
// ChatPanel deve aprire quella conversazione — anche quando al momento del tap
// la lista non è ancora idratata (avvio a freddo dell'app dalla notifica).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";
// ST-12 · Import DINAMICO: `ChatPanel` è ora un chunk lazy e una regola di
// lint vieta la forma statica (la stessa che protegge ClienteListePanel e
// ArchivedListe). Un `import` statico qui non romperebbe il test — romperebbe
// il chunk, che è precisamente il difetto che nessuno vede in review.
const { ChatPanel } = await import("../components/chat/ChatPanel.jsx");

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Come negli altri test chat: mock di api.js per non istanziare Supabase.
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
  subscribeToTyping: vi.fn(() => ({ send: vi.fn(), unsubscribe: vi.fn() })),
}));

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const CONV = {
  id: "c0000000-0000-4000-8000-000000000001",
  type: "group",
  name: "Team Operativo",
  participants: ["u1", "u2"],
};

const renderPanel = (props = {}) => render(
  <ChatPanel
    open
    onClose={() => {}}
    conversations={[]}
    messages={{}}
    intent={null}
    currentUserId="u1"
    {...props}
  />
);

beforeEach(() => vi.clearAllMocks());

describe("ChatPanel — intent da notifica di chat", () => {
  it("apre la conversazione indicata dall'intent { convId }", async () => {
    renderPanel({ conversations: [CONV], intent: { convId: CONV.id } });
    // Il nome compare anche nella lista: la prova che la conversazione è
    // APERTA è il composer della ConversationView.
    expect(await screen.findByPlaceholderText("Scrivi un messaggio...")).toBeTruthy();
  });

  it("apre la conversazione appena arriva, se al tap la lista non era ancora idratata", async () => {
    // Avvio a freddo dalla notifica: prima render senza conversazioni.
    const { rerender } = renderPanel({ conversations: [], intent: { convId: CONV.id } });
    expect(screen.queryByPlaceholderText("Scrivi un messaggio...")).toBeNull();

    rerender(
      <ChatPanel
        open
        onClose={() => {}}
        conversations={[CONV]}
        messages={{}}
        intent={{ convId: CONV.id }}
        currentUserId="u1"
      />
    );
    await waitFor(() => expect(screen.getByPlaceholderText("Scrivi un messaggio...")).toBeTruthy());
  });

  it("resta sulla lista se l'intent punta a una conversazione inesistente", async () => {
    renderPanel({ conversations: [CONV], intent: { convId: "c0000000-0000-4000-8000-0000000000ff" } });
    await waitFor(() => expect(screen.queryByPlaceholderText("Scrivi un messaggio...")).toBeNull());
  });
});
