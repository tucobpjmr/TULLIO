// Eliminazione conversazioni/gruppi dalla chat.
// Il bottone 🗑 (lista e header conversazione) chiede conferma e delega a
// onDeleteConversation(conv); l'annullamento non deve produrre alcuna
// chiamata. Il parametro è la conversazione INTERA e non il solo id (C-1 del
// terzo passaggio del 14 agosto): serve al comando per rimetterla in lista se
// il DELETE sul server non passa. Se la conv eliminata è quella aperta, si torna alla lista.
//
// Criticità #8: la conferma era `window.confirm`, e questi test la pilotavano
// con una spia su window. Ora è la finestra dell'app (useConfirm), quindi il
// test fa quello che fa l'utente — clicca "Elimina" o "Annulla". È un test
// PIÙ forte di prima: prima verificava che venisse chiesto qualcosa al
// browser, ora che a schermo compaia una domanda leggibile e che i due
// pulsanti facciano due cose diverse.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor, within } from "@testing-library/react";
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
      messages={{}}
      onDeleteConversation={onDeleteConversation}
      intent={null}
    />
  );
}

// La finestra di conferma è un <dialog> dell'app: si risponde cliccando.
const rispondi = async (etichetta) => {
  const dialogo = await screen.findByRole("dialog");
  fireEvent.click(within(dialogo).getByRole("button", { name: etichetta }));
};

describe("eliminazione conversazioni/gruppi", () => {
  it("lista: 🗑 con conferma chiama onDeleteConversation con la conversazione", async () => {
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    fireEvent.click(screen.getByTitle("Elimina gruppo"));

    // La domanda è a schermo, in italiano, e nomina il gruppo: è quello che
    // un window.confirm non poteva garantire (lingua e forma erano del browser).
    expect(await screen.findByText('Eliminare il gruppo "Gruppo QA"?')).toBeTruthy();
    await rispondi("Elimina");
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: GROUP.id })));
  });

  it("lista: annullando la conferma non elimina nulla", async () => {
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    fireEvent.click(screen.getByTitle("Elimina gruppo"));
    await rispondi("Annulla");

    expect(onDelete).not.toHaveBeenCalled();
    // E la finestra si chiude: una conferma annullata non lascia residui.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("su un'azione irreversibile il focus parte da Annulla, non da Elimina", async () => {
    // Un Invio premuto per abitudine non deve cancellare la conversazione di
    // qualcun altro: `danger` sposta il focus iniziale sull'uscita sicura.
    renderPanel({ onDeleteConversation: vi.fn() });
    fireEvent.click(screen.getByTitle("Elimina gruppo"));

    const dialogo = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(document.activeElement).toBe(within(dialogo).getByRole("button", { name: "Annulla" })));
  });

  it("conversazione aperta: 🗑 in header elimina e torna alla lista", async () => {
    const onDelete = vi.fn();
    renderPanel({ onDeleteConversation: onDelete });

    // Apre la conversazione (click sulla riga della lista)
    fireEvent.click(screen.getByText("Gruppo QA"));
    // Header conversazione: bottone elimina
    fireEvent.click(screen.getByTitle("Elimina gruppo"));
    await rispondi("Elimina");

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: GROUP.id })));
    // Tornati alla lista conversazioni
    expect(await screen.findByPlaceholderText("Cerca conversazione...")).toBeTruthy();
  });

  it("senza onDeleteConversation il bottone 🗑 non è renderizzato", () => {
    render(
      <ChatPanel
        open
        onClose={() => {}}
        conversations={[GROUP]}
        messages={{}}
        intent={null}
      />
    );
    expect(screen.queryByTitle("Elimina gruppo")).toBeNull();
  });
});
