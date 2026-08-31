// A-5 dell'audit UX/errori del 31 agosto — verifica end-to-end (non solo sui
// comandi) che un invio di testo rigettato dalla rete: tolga il messaggio
// fantasma dallo schermo, e restituisca il testo al composer con l'etichetta
// che lo distingue da una bozza qualsiasi.
import { describe, it, expect, vi } from "vitest";
import { useMemo, useState } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
const { ChatPanel } = await import("../../components/chat/ChatPanel.jsx");
import { makeChatCommands } from "../../components/chat/chatCommands.js";
import { INITIAL_TEAM } from "../../state/mockData.js";
import { renderWithAppData } from "../helpers/appData.jsx";

const sendMock = vi.fn(() => Promise.reject(new Error("Failed to fetch")));

vi.mock("../../lib/api.js", () => ({
  Messages: {
    send: (...args) => sendMock(...args),
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

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const ME = "marco";
const OTHER_USER = "sofia";
const APP_CTX = { team: INITIAL_TEAM, currentUserId: ME };
const render = (ui) => renderWithAppData(ui, APP_CTX);
// uuid valido: `enabled: true` invia solo su conversation id UUID (isUuid guard).
const CONV_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function ChatHarness() {
  const [messages, setMessages] = useState({ [CONV_ID]: [] });
  const [errore, setErrore] = useState(null);
  const commands = useMemo(
    () => makeChatCommands({
      setMessages, getCurrentUserId: () => ME, enabled: true,
      onError: setErrore,
    }),
    [],
  );
  const conv = { id: CONV_ID, type: "direct", participants: [ME, OTHER_USER], name: null };
  return (
    <div>
      {errore && <div role="alert">{errore}</div>}
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

describe("ConversationView — invio fallito (A-5)", () => {
  it("il testo scritto torna nel composer con l'etichetta, e il fantasma sparisce", async () => {
    render(<ChatHarness />);

    const campo = await screen.findByPlaceholderText(/Scrivi un messaggio/i);
    fireEvent.change(campo, { target: { value: "un messaggio importante" } });
    fireEvent.click(screen.getByText("↑"));

    // Ottimistico: appare subito.
    expect(screen.getByText("un messaggio importante")).toBeInTheDocument();
    // Il composer si è svuotato all'invio (comportamento invariato).
    expect(campo.value).toBe("");

    await waitFor(() => expect(sendMock).toHaveBeenCalledTimes(1));

    // Il fantasma sparisce dall'elenco messaggi…
    await waitFor(() => {
      expect(screen.queryByText("un messaggio importante")).not.toBeInTheDocument();
    });
    // …e il testo torna nel composer, marcato.
    await waitFor(() => {
      expect(campo.value).toBe("un messaggio importante");
    });
    expect(screen.getByText("Non inviato — riprova")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/invio messaggio fallito/i);
  });
});
