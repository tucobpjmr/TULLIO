// Regressione Caso 2 (typing indicator "morto" nelle conversazioni nuove).
// NewConversationView crea le conv con id locale "c<timestamp>"; l'UUID
// definitivo lo assegna commands.createConversation, che RITORNA la
// conversazione normalizzata. Se handleCreate attivasse l'oggetto ORIGINALE il
// creatore resterebbe su un id non-uuid: subscribeToTyping saltato (gate
// isUuid), primo messaggio con conversation_id invalido, risposte realtime
// sotto una chiave diversa da quella della vista.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";
import { ChatPanel } from "../components/chat/ChatPanel.jsx";
import { isUuid } from "../lib/mappers.js";

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Come in chatReadReceipts.test.jsx: mock di api.js per non istanziare il
// client Supabase reale. In più qui spiamo subscribeToTyping per verificare
// che la vista attivata apra il canale typing con l'id UUID definitivo.
const subscribeToTypingSpy = vi.fn(() => ({ send: vi.fn(), unsubscribe: vi.fn() }));
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
  subscribeToTyping: (...args) => subscribeToTypingSpy(...args),
}));

// jsdom non implementa Element.scrollTo (effect di autoscroll).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

// Harness minimale: cattura le conversazioni che ChatPanel inserisce in lista.
// Il setter è un normale setState (updater PURO): la persistenza non passa più
// da qui ma da commands.createConversation — vedi chatCommands.test.js.
function renderPanel({ onConversations }) {
  const setConversations = (updater) => {
    const next = typeof updater === "function" ? updater([]) : updater;
    onConversations(next);
  };
  return render(
    <ChatPanel
      open
      onClose={() => {}}
      conversations={[]}
      setConversations={setConversations}
      messages={{}}
      setMessages={() => {}}
      intent={null}
    />
  );
}

beforeEach(() => subscribeToTypingSpy.mockClear());

describe("handleCreate — id conversazione normalizzato prima di ACTIVATE", () => {
  it("gruppo nuovo: lista e vista attiva condividono lo stesso UUID, typing sottoscritto", async () => {
    let persisted;
    renderPanel({ onConversations: (c) => { persisted = c; } });

    // Nuova chat → Crea nuovo gruppo → nome + 2 membri → Crea gruppo
    fireEvent.click(screen.getByTitle("Nuova chat — scrivi a un membro del team"));
    fireEvent.click(screen.getByText("Crea nuovo gruppo"));
    fireEvent.change(screen.getByPlaceholderText("Nome del gruppo..."), { target: { value: "Gruppo QA" } });
    fireEvent.click(screen.getByText("Sofia Conti"));
    fireEvent.click(screen.getByText("Luca Moretti"));
    fireEvent.click(screen.getByText("Crea gruppo"));

    // La conv persistita ha un id UUID (non "c<timestamp>")
    expect(persisted).toHaveLength(1);
    const conv = persisted[0];
    expect(isUuid(conv.id)).toBe(true);

    // La vista attivata è la ConversationView del gruppo…
    expect(await screen.findByText("Gruppo QA")).toBeTruthy();
    // …e il canale typing è stato aperto con lo STESSO id della conv persistita.
    await waitFor(() => expect(subscribeToTypingSpy).toHaveBeenCalledWith(conv.id, expect.any(Function)));
  });

  it("chat diretta nuova: stesso UUID tra conv persistita e canale typing", async () => {
    let persisted;
    renderPanel({ onConversations: (c) => { persisted = c; } });

    fireEvent.click(screen.getByTitle("Nuova chat — scrivi a un membro del team"));
    fireEvent.click(screen.getByText("Giulia Ricci"));

    expect(persisted).toHaveLength(1);
    const conv = persisted[0];
    expect(isUuid(conv.id)).toBe(true);
    await waitFor(() => expect(subscribeToTypingSpy).toHaveBeenCalledWith(conv.id, expect.any(Function)));
  });
});
