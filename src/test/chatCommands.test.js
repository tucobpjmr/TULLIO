// chatCommands — la persistenza della chat non vive più dentro un updater.
//
// IL BUG CHE QUESTI TEST BLOCCANO. Prima, `setConversations` e `setMessages`
// erano wrapper che deducevano l'operazione DIFFERENZIANDO prev e next dentro
// la funzione updater passata a setState, e da lì chiamavano Supabase. Ma
// l'updater di setState deve essere PURO: React 18 lo invoca due volte in
// StrictMode (attivo in src/main.jsx) e può rieseguirlo in Concurrent
// Rendering. In sviluppo, creare una conversazione faceva quindi DUE INSERT —
// il guard `if (!prevById.has(c.id))` non protegge, perché entrambe le
// invocazioni ricevono lo stesso `prev`.
//
// Il primo describe riproduce esattamente quella condizione: un setter che
// invoca l'updater due volte con lo stesso stato precedente. Con la vecchia
// implementazione le asserzioni "chiamata una sola volta" fallivano.
import { describe, it, expect, vi, beforeEach } from "vitest";

const ConversationsAPI = {
  create: vi.fn(async () => ({ data: null, error: null })),
  update: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
};
const MessagesAPI = {
  send: vi.fn(async () => ({ error: null })),
  setPinned: vi.fn(async () => ({ error: null })),
  markReadBulk: vi.fn(async () => ({ error: null })),
  toggleReaction: vi.fn(async () => ({ error: null })),
  removeConversationFiles: vi.fn(async () => ({ error: null })),
};

vi.mock("../lib/api.js", () => ({
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
}));

const { makeChatCommands } = await import("../components/chat/chatCommands.js");
const { isUuid } = await import("../lib/mappers.js");

const UUID_CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UUID_MSG = "11111111-2222-4333-8444-555555555555";

// Setter che imita StrictMode: invoca l'updater DUE volte con lo stesso `prev`,
// esattamente come fa React in sviluppo, e tiene il risultato della seconda.
const setterStrictMode = () => {
  let stato = { conv: [], msg: {} };
  const doppio = (chiave, vuoto) => (updater) => {
    const prev = stato[chiave] ?? vuoto;
    if (typeof updater !== "function") { stato[chiave] = updater; return; }
    updater(prev);                       // prima invocazione (scartata da React)
    stato[chiave] = updater(prev);       // seconda invocazione (quella tenuta)
  };
  return {
    setConversations: doppio("conv", []),
    setMessages: doppio("msg", {}),
    stato: () => stato,
  };
};

beforeEach(() => {
  for (const fn of Object.values(ConversationsAPI)) fn.mockClear();
  for (const fn of Object.values(MessagesAPI)) fn.mockClear();
});

describe("chatCommands — updater invocato due volte (StrictMode)", () => {
  it("createConversation fa UN solo INSERT anche se l'updater gira due volte", () => {
    const h = setterStrictMode();
    const commands = makeChatCommands({
      setConversations: h.setConversations,
      setMessages: h.setMessages,
      enabled: true,
    });

    commands.createConversation({ id: "c123", type: "group", participants: ["a", "b"], name: "QA" });

    expect(ConversationsAPI.create).toHaveBeenCalledTimes(1);
    // E lo stato locale contiene una sola conversazione, non due.
    expect(h.stato().conv).toHaveLength(1);
  });

  it("sendMessage fa UN solo INSERT anche se l'updater gira due volte", async () => {
    const h = setterStrictMode();
    const commands = makeChatCommands({
      setConversations: h.setConversations,
      setMessages: h.setMessages,
      enabled: true,
    });

    commands.sendMessage(UUID_CONV, { id: "m1", sender: "a", type: "text", text: "ciao" });
    await Promise.resolve();

    expect(MessagesAPI.send).toHaveBeenCalledTimes(1);
    expect(h.stato().msg[UUID_CONV]).toHaveLength(1);
  });

  it("setMessagePinned fa UN solo UPDATE anche se l'updater gira due volte", () => {
    const h = setterStrictMode();
    const commands = makeChatCommands({
      setConversations: h.setConversations,
      setMessages: h.setMessages,
      enabled: true,
    });

    commands.setMessagePinned(UUID_CONV, UUID_MSG, true, "u1");

    expect(MessagesAPI.setPinned).toHaveBeenCalledTimes(1);
    expect(MessagesAPI.setPinned).toHaveBeenCalledWith(UUID_MSG, true, "u1");
  });
});

describe("chatCommands — normalizzazione degli id", () => {
  const setup = (enabled) => {
    const stato = { conv: [], msg: {} };
    const commands = makeChatCommands({
      setConversations: (u) => { stato.conv = typeof u === "function" ? u(stato.conv) : u; },
      setMessages: (u) => { stato.msg = typeof u === "function" ? u(stato.msg) : u; },
      enabled,
    });
    return { commands, stato };
  };

  it("createConversation assegna un UUID e RITORNA la conv normalizzata", () => {
    const { commands, stato } = setup(true);
    const conv = commands.createConversation({ id: "c999", type: "direct", participants: ["a", "b"] });
    expect(isUuid(conv.id)).toBe(true);
    expect(stato.conv[0].id).toBe(conv.id); // lista e valore di ritorno coincidono
  });

  it("l'UUID della conversazione è assegnato anche senza persistenza (mock)", () => {
    // Senza uuid il creatore resterebbe fuori dai gate isUuid di typing e
    // markRead: la normalizzazione non dipende dalla modalità.
    const { commands } = setup(false);
    expect(isUuid(commands.createConversation({ id: "c999", type: "direct" }).id)).toBe(true);
    expect(ConversationsAPI.create).not.toHaveBeenCalled();
  });

  it("sendMessage normalizza l'id solo in modalità DB", () => {
    expect(isUuid(setup(true).commands.sendMessage(UUID_CONV, { id: "m1" }).id)).toBe(true);
    expect(setup(false).commands.sendMessage(UUID_CONV, { id: "m1" }).id).toBe("m1");
  });
});

describe("chatCommands — il primo messaggio attende la creazione della conv", () => {
  it("non invia finché l'INSERT della conversazione è in volo", async () => {
    let risolvi;
    ConversationsAPI.create.mockImplementationOnce(() => new Promise(r => { risolvi = r; }));
    const stato = { conv: [], msg: {} };
    const commands = makeChatCommands({
      setConversations: (u) => { stato.conv = typeof u === "function" ? u(stato.conv) : u; },
      setMessages: (u) => { stato.msg = typeof u === "function" ? u(stato.msg) : u; },
      enabled: true,
    });

    const conv = commands.createConversation({ id: UUID_CONV, type: "direct", participants: ["a", "b"] });
    commands.sendMessage(conv.id, { id: UUID_MSG, sender: "a", type: "text", text: "primo" });

    // La riga conversazione non esiste ancora sul DB: la RLS messages_insert
    // rifiuterebbe il messaggio (il sintomo utente è "il messaggio non arriva").
    await Promise.resolve();
    expect(MessagesAPI.send).not.toHaveBeenCalled();

    risolvi({ error: null });
    // La promise attesa da sendMessage è quella CONCATENATA (create → then →
    // finally): serve un giro completo di microtask, non un singolo tick.
    await new Promise(r => setTimeout(r, 0));
    expect(MessagesAPI.send).toHaveBeenCalledTimes(1);
  });

  it("se la creazione della conversazione fallisce, il messaggio non viene inviato", async () => {
    ConversationsAPI.create.mockImplementationOnce(async () => ({ error: { message: "RLS" } }));
    const stato = { conv: [], msg: {} };
    const onError = vi.fn();
    const commands = makeChatCommands({
      setConversations: (u) => { stato.conv = typeof u === "function" ? u(stato.conv) : u; },
      setMessages: (u) => { stato.msg = typeof u === "function" ? u(stato.msg) : u; },
      enabled: true,
      onError,
    });

    const conv = commands.createConversation({ id: UUID_CONV, type: "direct", participants: ["a", "b"] });
    commands.sendMessage(conv.id, { id: UUID_MSG, sender: "a", type: "text", text: "primo" });
    await new Promise(r => setTimeout(r, 0));

    expect(MessagesAPI.send).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1); // un solo toast, non due
  });
});

describe("chatCommands — modalità locale (nessun login)", () => {
  it("aggiorna lo stato senza toccare Supabase", () => {
    const stato = { conv: [], msg: {} };
    const commands = makeChatCommands({
      setConversations: (u) => { stato.conv = typeof u === "function" ? u(stato.conv) : u; },
      setMessages: (u) => { stato.msg = typeof u === "function" ? u(stato.msg) : u; },
      enabled: false,
    });

    commands.createConversation({ id: UUID_CONV, type: "direct", participants: ["a", "b"] });
    commands.sendMessage(UUID_CONV, { id: "m1", sender: "a", type: "text", text: "ciao" });
    commands.setMessagePinned(UUID_CONV, "m1", true, "a");
    commands.removeConversation(UUID_CONV);

    expect(ConversationsAPI.create).not.toHaveBeenCalled();
    expect(MessagesAPI.send).not.toHaveBeenCalled();
    expect(MessagesAPI.setPinned).not.toHaveBeenCalled();
    expect(ConversationsAPI.remove).not.toHaveBeenCalled();
    expect(stato.conv).toHaveLength(0); // la remove locale è comunque applicata
  });
});

describe("chatCommands — rollback della reazione", () => {
  it("ripristina lo snapshot se la RPC fallisce", async () => {
    MessagesAPI.toggleReaction.mockImplementationOnce(async () => ({ error: { message: "boom" } }));
    const partenza = { [UUID_CONV]: [{ id: UUID_MSG, sender: "b", reactions: {} }] };
    let msg = partenza;
    const onError = vi.fn();
    const commands = makeChatCommands({
      setMessages: (u) => { msg = typeof u === "function" ? u(msg) : u; },
      enabled: true,
      getCurrentUserId: () => "u1",
      onError,
    });

    commands.toggleReaction(UUID_CONV, UUID_MSG, "👍");
    expect(msg[UUID_CONV][0].reactions["👍"]).toEqual(["u1"]); // ottimistico

    await new Promise(r => setTimeout(r, 0));
    expect(msg).toBe(partenza); // rollback allo snapshot esatto
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
