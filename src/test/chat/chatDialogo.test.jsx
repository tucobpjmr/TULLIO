// M-4 dell'analisi UX del 15 novembre · il pannello chat è un dialogo: Esc lo
// chiude, ma con del testo nel campo il primo Esc toglie solo il fuoco (le
// bozze della chat non si salvano). Setup preso da chatConvDelete.test.jsx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { _resetPilaModali } from "../../components/ui/pilaModali.js";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";
// ST-12 · Import DINAMICO: `ChatPanel` è ora un chunk lazy e una regola di
// lint vieta la forma statica (la stessa che protegge ClienteListePanel e
// ArchivedListe). Un `import` statico qui non romperebbe il test — romperebbe
// il chunk, che è precisamente il difetto che nessuno vede in review.
const { ChatPanel } = await import("../../components/chat/ChatPanel.jsx");

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Come negli altri test chat: mock di api.js per non istanziare Supabase.
vi.mock("../../lib/api.js", () => ({
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

function renderPanel({ onClose }) {
  return render(
    <ChatPanel
      open
      onClose={onClose}
      conversations={[GROUP]}
      messages={{}}
      intent={null}
    />
  );
}

const esc = () => act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });

beforeEach(() => _resetPilaModali());

describe("ChatPanel come dialogo", () => {
  it("ha ruolo di dialogo modale", () => {
    renderPanel({ onClose: vi.fn() });
    expect(screen.getByRole("dialog", { name: "Messaggi" })).toHaveAttribute("aria-modal", "true");
  });

  it("Esc chiude il pannello", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("con del testo nel campo, il primo Esc toglie il fuoco e il secondo chiude", async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    const campo = screen.getAllByRole("textbox")[0];
    act(() => campo.focus());
    fireEvent.change(campo, { target: { value: "ciao" } });
    await esc();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(campo);
    expect(campo.value).toBe("ciao");
    await esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
