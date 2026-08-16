// src/test/chatMemo.test.jsx
// A-2 dell'audit del 16 agosto — il pannello chat deve stare fermo quando il
// guscio si muove per motivi che non lo riguardano.
//
// PERCHÉ ESISTE. Il lavoro fatto su viste e guscio (ST-1/ST-2, blindato da
// memoViste.test.jsx) si fermava alla porta della chat: ChatPanel non era
// `memo`, il value del suo ChatContext era un oggetto letterale ricostruito a
// ogni render, e — la parte che rendeva inutile qualunque memo aggiunto dopo —
// il registro `commands` cambiava identità a ogni render del guscio. La catena
// era: useNotifications ritorna un oggetto letterale → `notif` è nuovo a ogni
// render → `markChatNotificationsRead` (che lo aveva nelle deps) è nuovo →
// `onConversationRead` è nuovo → il `useMemo` di `makeChatCommands` in
// useChatData non salta mai. Il commento in useChatData.js dichiarava il
// contrario («commands cambierebbe identità solo a ogni cambio utente»), ed è
// il tipo di invariante che si rompe in silenzio: nessun test funzionale
// diventa rosso, l'app si comporta bene e costa di più.
//
// Qui la proprietà si MISURA, come per le viste: uno stub `memo` conta i
// propri render mentre si digita nella ricerca globale a chat aperta. Se una
// sola prop del pannello ha identità instabile, il contatore si muove.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memo } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ signOut: () => {}, session: null, profile: null }),
  AuthProvider: ({ children }) => children,
}));

const conteggio = { chat: 0 };

// Lo stub è `memo` come il componente vero: qui si misura la stabilità delle
// PROP che il guscio gli passa, non l'implementazione del pannello. Che il
// pannello vero sia a sua volta `memo` è verificato dal test in fondo — servono
// entrambe le metà, come per le viste.
vi.mock("../components/chat/ChatPanel.jsx", () => ({
  ChatPanel: memo(function ChatPanel() {
    conteggio.chat += 1;
    return <div data-testid="chat" />;
  }),
}));

const VoyageDesk = (await import("../VoyageDesk.jsx")).default;

const inputRicerca = () => document.querySelector("input[aria-label='Cerca']");

beforeEach(() => { conteggio.chat = 0; });

describe("il pannello chat non si ri-renderizza per il resto dell'app", () => {
  it("dieci caratteri nella ricerca globale non lo svegliano", async () => {
    render(<VoyageDesk />);
    fireEvent.click(screen.getByLabelText("Messaggi team"));
    // Il pannello è dietro Suspense (chunk lazy): aspettiamo che sia montato
    // prima di contare, altrimenti misureremmo il caricamento e non i render.
    await screen.findByTestId("chat");
    const dopoApertura = conteggio.chat;

    const input = inputRicerca();
    for (const c of "famiglia r") {
      fireEvent.change(input, { target: { value: input.value + c } });
    }

    // Controllo positivo: l'app HA ri-renderizzato davvero.
    expect(input.value).toBe("famiglia r");
    // Prima della correzione: un render del pannello (e sotto di lui della
    // conversazione aperta, messaggio per messaggio) per ogni carattere.
    expect(conteggio.chat).toBe(dopoApertura);
  });
});

describe("il pannello vero è memoizzato", () => {
  it("ChatPanel è un componente memo", async () => {
    vi.doUnmock("../components/chat/ChatPanel.jsx");
    vi.resetModules();
    const { ChatPanel } = await vi.importActual("../components/chat/ChatPanel.jsx");
    // L'altra metà della proprietà: prop stabili senza `memo` non saltano un
    // render, e `memo` senza prop stabili non salta nulla. Le due si verificano
    // separatamente perché si rompono separatamente.
    expect(ChatPanel.$$typeof).toBe(Symbol.for("react.memo"));
  });
});
