// ST-10 · Un solo percorso di scrittura nella chat, e ST-12 · il pannello lazy.
//
// PERCHÉ QUESTI TEST ESISTONO. `useChatData` ritornava anche i setter grezzi
// (`setConversations`/`setMessages`), VoyageDesk li passava a ChatPanel fra 18
// prop, e ConversationView li usava in due punti per rifare a mano ciò che i
// comandi già facevano — con il commento onesto "eg. test" accanto. Erano due
// implementazioni della stessa semantica, compilate in produzione, mai
// confrontate fra loro: se il mark-as-read reale avesse cambiato regola, a
// divergere sarebbe stato il ramo che i test esercitavano.
//
// Quel difetto ne nascondeva un altro, trovato togliendolo: ChatPanel non
// passava affatto `commands` a ConversationView, quindi `sendText` avrebbe
// sollevato al primo invio. I due fallback coprivano gli unici percorsi che i
// test toccavano, quindi nulla era rosso. Il primo test qui sotto è la sonda di
// quel caso.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { INITIAL_TEAM } from "../../state/mockData.js";
import { renderWithAppData } from "../helpers/appData.jsx";

vi.mock("../../lib/api.js", () => ({
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

// ST-12: la forma statica è vietata dal lint, ed è il punto del rilievo.
const { ChatPanel } = await import("../../components/chat/ChatPanel.jsx");

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const ME = "marco";
const ALTRO = "sofia";
const CONV = { id: "conv-locale-1", type: "direct", participants: [ME, ALTRO], name: null };
const render = (ui) => renderWithAppData(ui, { team: INITIAL_TEAM, currentUserId: ME });

const montaPannello = (props = {}) => render(
  <ChatPanel
    open
    onClose={() => {}}
    conversations={[CONV]}
    messages={{ [CONV.id]: [] }}
    intent={{ toUser: ALTRO }}
    currentUserId={ME}
    {...props}
  />
);

describe("chat — un solo percorso di scrittura (ST-10)", () => {
  it("inviare un messaggio funziona anche senza `commands` dal genitore", async () => {
    // La regressione vera: senza `commands` passato a ConversationView questo
    // click sollevava un TypeError. Il pannello costruisce ora la variante
    // locale della stessa factory, quindi il percorso esiste sempre.
    montaPannello();
    const composer = await screen.findByPlaceholderText("Scrivi un messaggio...");
    fireEvent.change(composer, { target: { value: "ciao" } });
    fireEvent.keyDown(composer, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("ciao")).toBeTruthy();
  });

  it("il mark-as-read passa dal comando, non da un secondo aggiornamento a mano", async () => {
    // Il messaggio altrui non letto sparisce dai non letti perché il comando ha
    // aggiornato `readBy` — la stessa funzione che gira in produzione, non una
    // copia scritta per i test.
    const conNonLetti = {
      [CONV.id]: [{ id: "m1", sender: ALTRO, type: "text", text: "presente?", time: new Date().toISOString(), readBy: [] }],
    };
    montaPannello({ messages: conNonLetti });
    await screen.findByText("presente?");
    // Nessun badge di non letti sulla conversazione aperta.
    await waitFor(() => expect(screen.queryByText("1")).toBeNull());
  });
});

describe("useChatData — i setter grezzi non escono dall'hook (ST-10)", async () => {
  // L'hook si importa da solo: montarlo richiederebbe Supabase, mentre qui
  // interessa la SUPERFICIE che espone, che è il contratto del rilievo.
  const modulo = await import("../../hooks/useChatData.js");

  it("il modulo non esporta setter di stato", () => {
    for (const nome of Object.keys(modulo)) {
      expect(nome.startsWith("set")).toBe(false);
    }
  });

  it("il valore di ritorno dichiarato nel sorgente non contiene i setter", async () => {
    // Il contratto è scritto nel `return` dell'hook: leggerlo è più onesto che
    // montare l'hook con mezzo Supabase mockato per osservare le stesse righe.
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/hooks/useChatData.js", "utf8");
    const ritorno = src.slice(src.lastIndexOf("return {"));
    expect(ritorno).not.toContain("setConversations:");
    expect(ritorno).not.toContain("setMessages:");
    expect(ritorno).toContain("commands:");
  });
});
