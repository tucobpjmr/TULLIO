// Un evento realtime arrivato DURANTE il primo caricamento lo scarta senza
// rifarlo (useDebouncedTableSubscription: `gen` avanza e `isCurrent()` del
// primo reload diventa false).
//
// ⚠️ BUG APERTO. I tre casi `it.fails` descrivono il comportamento GIUSTO e
// oggi falliscono: lo documentano senza rompere la CI. Si sbloccano solo con
// `online` o con un ritorno in primo piano oltre SOGLIA_RIPRESA_MS.
//   - task, evento `tasks` (applyRow): il gen avanza, nessuno rifà il carico.
//   - task, evento `comments`: il debounce lancia un reload `soloThread` che
//     sostituisce quello completo.
//   - chat, evento `messages` oltre il debounce: reload `soloMessaggi`, le
//     conversazioni non arrivano mai.
// Quando il bug è corretto, `it.fails` → `it`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const emetti = (tabella, payload) => handlers.get(tabella)?.(payload);

const vuoto = { data: [], error: null };
const risposta = async () => vuoto;

const differita = () => {
  let risolvi;
  const promise = new Promise((res) => { risolvi = res; });
  return { promise, risolvi };
};

let rispostaTasks = () => Promise.resolve(vuoto);
const TasksAPI = { list: vi.fn((opts) => rispostaTasks(opts)) };
const TaskThreadsAPI = {
  comments: vi.fn(risposta),
  commentsForTasks: vi.fn(risposta),
};

let rispostaConv = () => Promise.resolve(vuoto);
const ConversationsAPI = { listMine: vi.fn(() => rispostaConv()) };
const MessagesAPI = { listAll: vi.fn(risposta), listForConversation: vi.fn(risposta) };

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: vi.fn((tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  }),
  Tasks: TasksAPI,
  TaskThreads: TaskThreadsAPI,
  Notices: { list: vi.fn(risposta) },
  Categories: { list: vi.fn(risposta) },
  Users: { listAll: vi.fn(risposta), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(risposta) },
  MessageTemplates: { list: vi.fn(risposta) },
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
}));

const { useAppHydration } = await import("../../hooks/useAppHydration.js");
const { useChatData } = await import("../../hooks/useChatData.js");

const attendi = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const TASK = { id: "t1", title: "Volo", status: "todo", created_at: "2026-11-01T10:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  rispostaTasks = () => Promise.resolve(vuoto);
  rispostaConv = () => Promise.resolve(vuoto);
});

describe("controllo: senza eventi il primo caricamento arriva", () => {
  it("task", async () => {
    const primo = differita();
    rispostaTasks = () => primo.promise;
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    await attendi(300);
    await act(async () => { primo.risolvi({ data: [TASK], error: null }); });
    await attendi(50);
    expect(dispatch.mock.calls.filter(([a]) => a.type === "SET_TASKS")).toHaveLength(1);
    expect(result.current.caricamento.tasks).toBe(false);
  });

  it("chat", async () => {
    const primo = differita();
    rispostaConv = () => primo.promise;
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {},
      onError: () => {}, onSuccess: () => {}, onConversationRead: () => {},
    }));
    await waitFor(() => expect(ConversationsAPI.listMine).toHaveBeenCalledTimes(1));
    await attendi(300);
    await act(async () => {
      primo.risolvi({ data: [{ id: "c1", type: "direct", participants: ["u1", "u2"] }], error: null });
    });
    await attendi(50);
    expect(result.current.conversations.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("task: evento durante il primo caricamento", () => {
  it.fails("evento su `tasks` (applyRow) durante il primo Tasks.list → SET_TASKS arriva comunque", async () => {
    const primo = differita();
    rispostaTasks = () => primo.promise;
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));

    // Un collega modifica un'altra task mentre il primo caricamento è in volo.
    act(() => { emetti("tasks", { eventType: "UPDATE", new: { id: "t9", title: "Altro" } }); });

    await act(async () => { primo.risolvi({ data: [TASK], error: null }); });
    await attendi(400);

    const setTasks = dispatch.mock.calls.filter(([a]) => a.type === "SET_TASKS");
    expect(setTasks, "SET_TASKS mai dispatchato: il primo caricamento è stato scartato").toHaveLength(1);
    expect(result.current.caricamento.tasks, "scheletro ancora acceso").toBe(false);
  });

  it.fails("evento su `comments` durante il primo Tasks.list (debounce scatta prima della risposta) → SET_TASKS arriva comunque", async () => {
    const primo = differita();
    rispostaTasks = () => primo.promise;
    const dispatch = vi.fn();
    const { result } = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "u1", dispatch, onError: vi.fn(),
    }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));

    act(() => { emetti("comments", { eventType: "INSERT", new: { id: "k1", task_id: "t1" } }); });
    await attendi(300); // oltre il debounce (200 ms): parte il reload `soloThread`

    await act(async () => { primo.risolvi({ data: [TASK], error: null }); });
    await attendi(400);

    const setTasks = dispatch.mock.calls.filter(([a]) => a.type === "SET_TASKS");
    expect(setTasks, "SET_TASKS mai dispatchato: il primo caricamento è stato scartato").toHaveLength(1);
    expect(result.current.caricamento.tasks, "scheletro ancora acceso").toBe(false);
  });
});

describe("chat: evento durante il primo caricamento", () => {
  it.fails("evento su `messages` durante il primo listMine (debounce scatta prima della risposta) → le conversazioni arrivano comunque", async () => {
    const primo = differita();
    rispostaConv = () => primo.promise;
    const { result } = renderHook(() => useChatData({
      enabled: true, team: [], currentUserId: "u1",
      mockConversations: [], mockMessages: {},
      onError: () => {}, onSuccess: () => {}, onConversationRead: () => {},
    }));
    await waitFor(() => expect(ConversationsAPI.listMine).toHaveBeenCalledTimes(1));

    act(() => {
      emetti("messages", { eventType: "INSERT", new: { id: "m1", conversation_id: "c1", sender_id: "u2", text: "ciao" } });
    });
    await attendi(300); // oltre il debounce: parte il reload `soloMessaggi`

    await act(async () => {
      primo.risolvi({ data: [{ id: "c1", type: "direct", participants: ["u1", "u2"] }], error: null });
    });
    await attendi(400);

    expect(result.current.conversations.map((c) => c.id), "conversazioni mai caricate").toEqual(["c1"]);
  });
});
