// Eliminazione conversazioni/gruppi dalla chat.
// Il bottone 🗑 (lista e header conversazione) chiede conferma via
// window.confirm e delega a onDeleteConversation(convId); l'annullamento non
// deve produrre alcuna chiamata. Se la conv eliminata è quella aperta, si
// torna alla lista.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChatPanel } from "../components/chat/ChatPanel.jsx";

// Come negli altri test chat: mock di api.js per non istanziare Supabase.
vi.mock("../lib/api.js", () => ({
  Messages: {
    getFileUrl: vi.fn(async () => ({ url: null, error: null })),
    uploadVoice: vi.fn(async () => ({ path: null, error: null })),
    uploadFile: vi.fn(async () => ({ path: null, error: null })),
    copyFile: vi.fn(async () => ({ path: null, error: null })),
    removeConversationFiles: vi.fn(async () => ({ error: null })),
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

if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

const GROUP = {
  id: "11111111-1111-4111-8111-111111111111",
  type: "group",
  participants: ["marco", "sofia", "luca"],
  name: "Gruppo QA",
  icon: "👥",
};

function renderPanel({ onDeleteConversation }) {
  return render(
    <ChatPanel
      open
      onClose={() => {}}
      conversations={[GROUP]}
      setConversations={() => {}}
      messages={{}}
      setMessages={() => {}}
      onDeleteConversation={onDeleteConversation}
      intent={null}
    />
  );
}

let confirmSpy;
beforeEach(() => {
  confirmSpy = vi.spyOn(window, "confirm");
});
afterEach(() => {
  confirmSpy.mockRestore();
});

describe("eliminazione conversazioni/gruppi", () => {
  it("lista: 🗑 con conferma chiama onDeleteConversation con l'id", () => {
    confirmSpy.mockReturnValue(true);
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    fireEvent.click(screen.getByTitle("Elimina gruppo"));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Eliminare il gruppo "Gruppo QA"?');
    expect(onDelete).toHaveBeenCalledWith(GROUP.id);
  });

  it("lista: annullando la conferma non elimina nulla", () => {
    confirmSpy.mockReturnValue(false);
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    fireEvent.click(screen.getByTitle("Elimina gruppo"));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("conversazione aperta: 🗑 in header elimina e torna alla lista", async () => {
    confirmSpy.mockReturnValue(true);
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    // Apre la conversazione (click sulla riga della lista)
    fireEvent.click(screen.getByText("Gruppo QA"));
    // Header conversazione: bottone elimina
    fireEvent.click(screen.getByTitle("Elimina gruppo"));

    expect(onDelete).toHaveBeenCalledWith(GROUP.id);
    // Tornati alla lista conversazioni
    expect(await screen.findByPlaceholderText("Cerca conversazione...")).toBeTruthy();
  });

  it("senza onDeleteConversation il bottone 🗑 non è renderizzato", () => {
    render(
      <ChatPanel
        open
        onClose={() => {}}
        conversations={[GROUP]}
        setConversations={() => {}}
        messages={{}}
        setMessages={() => {}}
        intent={null}
      />
    );
    expect(screen.queryByTitle("Elimina gruppo")).toBeNull();
  });
});
