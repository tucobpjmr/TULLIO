// C-1 dell'audit del 14 agosto (terzo passaggio) — l'ordine dei due passi con
// cui si elimina una conversazione, e cosa succede quando il secondo fallisce.
//
// IL DIFETTO CHE QUESTI TEST BLOCCANO. `removeConversation` cancellava PRIMA
// gli allegati dal bucket e POI la riga `conversations`. L'ordine aveva una
// ragione scritta accanto (dopo il DELETE della riga le policy dello storage
// non autorizzano più la pulizia → orfani), ma metteva l'operazione
// IRREVERSIBILE per prima e condizionata a nulla:
//
//   • se la DELETE falliva — rete caduta fra i due await, che su mobile è il
//     caso normale — la conversazione restava viva per tutti i partecipanti,
//     con ogni allegato (vocali, documenti, foto di passaporti) già distrutto
//     e non recuperabile;
//   • e la DELETE poteva "riuscire" senza fare nulla: `Conversations.remove`
//     non chiedeva `count`, quindi un rifiuto della RLS era indistinguibile
//     da una cancellazione vera — toast verde compreso.
//
// Qui si misurano le tre proprietà che chiudono il difetto: l'ordine, il
// silenzio dello storage quando la riga non è stata tolta, e il ripristino
// della conversazione in lista.
import { describe, it, expect, vi, beforeEach } from "vitest";

const chiamate = [];

const ConversationsAPI = {
  create: vi.fn(async () => ({ data: null, error: null })),
  update: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => { chiamate.push("delete-riga"); return { error: null, count: 1 }; }),
};
const MessagesAPI = {
  send: vi.fn(async () => ({ error: null })),
  setPinned: vi.fn(async () => ({ error: null })),
  markReadBulk: vi.fn(async () => ({ error: null })),
  toggleReaction: vi.fn(async () => ({ error: null })),
  removeConversationFiles: vi.fn(async () => { chiamate.push("delete-file"); return { error: null }; }),
};

vi.mock("../lib/api.js", () => ({
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
}));

const { makeChatCommands } = await import("../components/chat/chatCommands.js");

const CONV = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  type: "group",
  name: "Gruppo QA",
  participants: ["u1", "u2"],
};
const MSG = { id: "11111111-2222-4333-8444-555555555555", sender: "u2", text: "ciao" };

// Piccolo banco: due stati React finti pilotati dagli updater, come nel resto
// dei test di questo modulo.
function banco() {
  const stato = { conversations: [CONV], messages: { [CONV.id]: [MSG] } };
  const onError = vi.fn();
  const onSuccess = vi.fn();
  const commands = makeChatCommands({
    setConversations: (u) => { stato.conversations = typeof u === "function" ? u(stato.conversations) : u; },
    setMessages: (u) => { stato.messages = typeof u === "function" ? u(stato.messages) : u; },
    enabled: true,
    getCurrentUserId: () => "u1",
    onError,
    onSuccess,
  });
  return { stato, commands, onError, onSuccess };
}

const attendi = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  chiamate.length = 0;
  vi.clearAllMocks();
  ConversationsAPI.remove.mockImplementation(async () => { chiamate.push("delete-riga"); return { error: null, count: 1 }; });
  MessagesAPI.removeConversationFiles.mockImplementation(async () => { chiamate.push("delete-file"); return { error: null }; });
});

describe("removeConversation — l'irreversibile viene per ultimo", () => {
  it("cancella la RIGA prima degli allegati", async () => {
    const { commands, onSuccess } = banco();
    commands.removeConversation(CONV);
    await attendi();
    await attendi();
    expect(chiamate).toEqual(["delete-riga", "delete-file"]);
    expect(onSuccess).toHaveBeenCalledWith("Conversazione eliminata");
  });

  it("se la riga non viene eliminata, gli allegati NON vengono toccati", async () => {
    ConversationsAPI.remove.mockImplementationOnce(async () => {
      chiamate.push("delete-riga");
      return { error: { message: "network" } };
    });
    const { commands, onError } = banco();
    commands.removeConversation(CONV);
    await attendi();
    await attendi();
    expect(chiamate).toEqual(["delete-riga"]);
    expect(MessagesAPI.removeConversationFiles).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  // Il caso che nessun `error` avrebbe mai segnalato: la policy filtra la
  // riga, la DELETE ne tocca zero, PostgREST risponde 2xx.
  it("un rifiuto silenzioso della RLS (count 0) è trattato come fallimento", async () => {
    ConversationsAPI.remove.mockImplementationOnce(async () => {
      chiamate.push("delete-riga");
      return { error: null, count: 0 };
    });
    const { stato, commands, onError, onSuccess } = banco();
    commands.removeConversation(CONV);
    await attendi();
    await attendi();
    expect(chiamate).toEqual(["delete-riga"]);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    // …e la conversazione torna in lista: sul server c'è ancora.
    expect(stato.conversations.map(c => c.id)).toEqual([CONV.id]);
  });

  it("i messaggi restano finché il server non conferma, e spariscono dopo", async () => {
    const fallisce = banco();
    ConversationsAPI.remove.mockImplementationOnce(async () => ({ error: { message: "boom" } }));
    fallisce.commands.removeConversation(CONV);
    await attendi();
    await attendi();
    // Ripristino completo: conversazione E messaggi, non una chat vuota.
    expect(fallisce.stato.messages[CONV.id]).toEqual([MSG]);

    const riesce = banco();
    riesce.commands.removeConversation(CONV);
    await attendi();
    await attendi();
    expect(riesce.stato.conversations).toEqual([]);
    expect(CONV.id in riesce.stato.messages).toBe(false);
  });

  it("in modalità mock (id non uuid) non tocca la rete e pulisce lo stato locale", async () => {
    const { stato, commands } = banco();
    stato.conversations = [{ id: "c123", name: "mock" }];
    stato.messages = { c123: [{ id: "m1" }] };
    commands.removeConversation({ id: "c123", name: "mock" });
    await attendi();
    expect(ConversationsAPI.remove).not.toHaveBeenCalled();
    expect(stato.conversations).toEqual([]);
    expect("c123" in stato.messages).toBe(false);
  });
});
