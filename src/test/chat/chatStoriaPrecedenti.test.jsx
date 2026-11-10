// A-2 dell'analisi del 10 novembre — la storia più vecchia del corpus si
// carica dalla conversazione aperta: da sola se in stato ci sono pochi
// messaggi, con un pulsante quando la finestra è arrivata in cima.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useMemo, useState } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
const { ChatPanel } = await import("../../components/chat/ChatPanel.jsx");
import { makeChatCommands } from "../../components/chat/chatCommands.js";
import { PAGINA_MESSAGGI } from "../../components/chat/useElencoMessaggi.js";
import { INITIAL_TEAM } from "../../state/mockData.js";
import { renderWithAppData } from "../helpers/appData.jsx";

vi.mock("../../lib/api.js", () => ({
  Messages: {
    getFileUrl: vi.fn(async () => ({ url: null, error: null })),
    markReadBulk: vi.fn(async () => ({ error: null })),
  },
  Users: {
    list: vi.fn(async () => ({ data: [], error: null })),
    getPreferences: vi.fn(async () => ({ data: null, error: null })),
    setRecentReactions: vi.fn(async () => ({ error: null })),
  },
}));

const scrollTo = vi.fn();
Element.prototype.scrollTo = scrollTo;

const ME = "marco";
const ALTRO = "sofia";
const CONV_ID = "conv-storia-1";
const conv = { id: CONV_ID, type: "direct", participants: [ME, ALTRO], name: null };
const msg = (i) => ({
  id: `m${i}`, sender: ME, type: "text", text: `testo ${i}`,
  time: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(), readBy: [ME],
});
const serie = (da, n) => Array.from({ length: n }, (_, i) => msg(da + i));

function Banco({ iniziali, storia, caricaPrecedenti }) {
  const [messages, setMessages] = useState({ [CONV_ID]: iniziali });
  const commands = useMemo(() => ({
    ...makeChatCommands({ setMessages, getCurrentUserId: () => ME, enabled: false }),
    caricaPrecedenti: (id) => caricaPrecedenti(id, setMessages),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  return (
    <ChatPanel
      open onClose={() => {}} conversations={[conv]} messages={messages}
      commands={commands} storiaMessaggi={storia} intent={{ toUser: ALTRO }}
    />
  );
}
const monta = (props) => renderWithAppData(<Banco {...props} />, { team: INITIAL_TEAM, currentUserId: ME });
const incompleta = { corpusCompleto: false, perConv: {} };

beforeEach(() => { scrollTo.mockClear(); });

describe("ConversationView — messaggi precedenti", () => {
  it("corpus completo: nessun pulsante e nessuna richiesta", async () => {
    const carica = vi.fn();
    monta({ iniziali: serie(1, 3), storia: { corpusCompleto: true, perConv: {} }, caricaPrecedenti: carica });
    await screen.findByText("testo 3");
    expect(screen.queryByText("Carica messaggi precedenti")).toBeNull();
    expect(carica).not.toHaveBeenCalled();
  });

  it("pochi messaggi in stato: la prima pagina si chiede da sola, una volta", async () => {
    const carica = vi.fn();
    monta({ iniziali: serie(1, 3), storia: incompleta, caricaPrecedenti: carica });
    await waitFor(() => expect(carica).toHaveBeenCalledWith(CONV_ID, expect.any(Function)));
    expect(carica).toHaveBeenCalledTimes(1);
  });

  it("dopo un errore non si ritenta da soli; il pulsante resta per riprovare", async () => {
    const carica = vi.fn();
    monta({
      iniziali: serie(1, 3), caricaPrecedenti: carica,
      storia: { corpusCompleto: false, perConv: { [CONV_ID]: { caricando: false, completa: false, errore: true } } },
    });
    await screen.findByText("Carica messaggi precedenti");
    expect(carica).not.toHaveBeenCalled();
  });

  it("storia completa per questa conversazione: nessun pulsante", async () => {
    monta({
      iniziali: serie(1, 3), caricaPrecedenti: vi.fn(),
      storia: { corpusCompleto: false, perConv: { [CONV_ID]: { caricando: false, completa: true, errore: false } } },
    });
    await screen.findByText("testo 3");
    expect(screen.queryByText("Carica messaggi precedenti")).toBeNull();
  });

  it("il pulsante compare in cima alla finestra, carica la pagina e non riporta in fondo", async () => {
    const carica = vi.fn(async (id, setMessages) => {
      setMessages(prev => ({ ...prev, [id]: [...serie(1, 10), ...prev[id]] }));
    });
    monta({ iniziali: serie(100, PAGINA_MESSAGGI), storia: incompleta, caricaPrecedenti: carica });
    const bottone = await screen.findByText("Carica messaggi precedenti");
    expect(carica).not.toHaveBeenCalled(); // la finestra è piena: niente carico automatico
    expect(screen.queryByText("testo 5")).toBeNull();
    scrollTo.mockClear();

    fireEvent.click(bottone);

    await screen.findByText("testo 5");
    expect(carica).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("controllo positivo: un messaggio nuovo in coda riporta in fondo", async () => {
    let scrivi;
    const carica = vi.fn((_id, setMessages) => { scrivi = setMessages; });
    monta({ iniziali: serie(1, 3), storia: incompleta, caricaPrecedenti: carica });
    await waitFor(() => expect(carica).toHaveBeenCalled());
    scrollTo.mockClear();
    const { act } = await import("@testing-library/react");
    await act(async () => { scrivi(prev => ({ ...prev, [CONV_ID]: [...prev[CONV_ID], msg(999)] })); });
    expect(scrollTo).toHaveBeenCalled();
  });
});
