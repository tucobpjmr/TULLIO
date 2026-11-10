// Un evento realtime arrivato DURANTE un reload non deve buttarlo via.
//
// Il difetto (10 novembre): in useDebouncedTableSubscription ogni evento fa
// avanzare `gen`, il reload in volo vede `isCurrent() === false` e si scarta.
// Nessuno lo rifaceva: al suo posto partiva un reload PARZIALE, o niente.
//   - task, evento `tasks` (applyRow): SET_TASKS mai arrivato, scheletro acceso.
//   - task, evento `comments`: il reload `soloThread` sostituiva quello completo.
//   - chat, evento `messages` oltre il debounce: reload `soloMessaggi`, le
//     conversazioni non arrivavano mai.
// Si sbloccava solo con `online` o con un ritorno in primo piano oltre
// SOGLIA_RIPRESA_MS.
//
// La correzione è il lavoro DOVUTO dell'hook: chi scarta un reload non
// arrivato ne eredita le tabelle, e un evento `applyRow` che lo scarta lo fa
// ripartire.
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

const { useDebouncedTableSubscription } = await import("../../hooks/useDebouncedTableSubscription.js");
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
  it("evento su `tasks` (applyRow) durante il primo Tasks.list → SET_TASKS arriva comunque", async () => {
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

  it("evento su `comments` durante il primo Tasks.list (debounce scatta prima della risposta) → SET_TASKS arriva comunque", async () => {
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
  it("evento su `messages` durante il primo listMine (debounce scatta prima della risposta) → le conversazioni arrivano comunque", async () => {
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

describe("hook: il lavoro dovuto", () => {
  // Reload che resta in volo finché il test non lo risolve.
  const reloadDifferiti = () => {
    const chiamate = [];
    const reload = vi.fn((isCurrent, tabelle) => {
      const d = differita();
      chiamate.push({ isCurrent, tabelle, risolvi: d.risolvi });
      return d.promise;
    });
    return { reload, chiamate };
  };
  const comeLista = (t) => (t === null ? null : [...t].sort());

  it("un reload parziale che ne scarta uno completo non arrivato diventa completo", async () => {
    const { reload, chiamate } = reloadDifferiti();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { delay: 5 }));
    expect(chiamate[0].tabelle).toBe(null);

    act(() => { emetti("a", { eventType: "INSERT", new: {} }); });
    await attendi(20);

    expect(reload).toHaveBeenCalledTimes(2);
    expect(chiamate[1].tabelle).toBe(null);
    expect(chiamate[0].isCurrent()).toBe(false);
  });

  it("due parziali: il secondo eredita le tabelle del primo non arrivato", async () => {
    const { reload, chiamate } = reloadDifferiti();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { delay: 5 }));
    await act(async () => { chiamate[0].risolvi(); });

    act(() => { emetti("a", { eventType: "INSERT", new: {} }); });
    await attendi(20);
    act(() => { emetti("b", { eventType: "INSERT", new: {} }); });
    await attendi(20);

    expect(comeLista(chiamate[1].tabelle)).toEqual(["a"]);
    expect(comeLista(chiamate[2].tabelle)).toEqual(["a", "b"]);
  });

  it("un evento applyRow che scarta il reload in volo lo fa ripartire, una volta sola", async () => {
    const { reload, chiamate } = reloadDifferiti();
    const applyRow = vi.fn(() => true);
    renderHook(() => useDebouncedTableSubscription(["a"], reload, { delay: 5, applyRow }));

    act(() => {
      emetti("a", { eventType: "UPDATE", new: { id: 1 } });
      emetti("a", { eventType: "UPDATE", new: { id: 2 } });
    });
    expect(chiamate[0].isCurrent()).toBe(false);
    await attendi(20);

    expect(reload).toHaveBeenCalledTimes(2);
    expect(chiamate[1].tabelle).toBe(null);

    // Il secondo arriva: niente altro è dovuto.
    await act(async () => { chiamate[0].risolvi(); chiamate[1].risolvi(); });
    await attendi(20);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("a reload arrivato, un evento applyRow non fa partire nulla", async () => {
    const { reload, chiamate } = reloadDifferiti();
    const applyRow = vi.fn(() => true);
    renderHook(() => useDebouncedTableSubscription(["a"], reload, { delay: 5, applyRow }));
    await act(async () => { chiamate[0].risolvi(); });

    act(() => { emetti("a", { eventType: "UPDATE", new: { id: 1 } }); });
    await attendi(20);

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("un reload che rigetta resta dovuto: il parziale successivo diventa completo", async () => {
    const chiamate = [];
    const reload = vi.fn((_isCurrent, tabelle) => {
      chiamate.push(tabelle);
      return chiamate.length === 1 ? Promise.reject(new Error("rete")) : Promise.resolve();
    });
    // Il rigetto è voluto: lo si intercetta, o vitest lo conta come errore.
    const suRigetto = () => {};
    process.on("unhandledRejection", suRigetto);
    try {
      renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { delay: 5 }));
      await attendi(10);
      act(() => { emetti("a", { eventType: "INSERT", new: {} }); });
      await attendi(20);
    } finally {
      process.off("unhandledRejection", suRigetto);
    }
    expect(chiamate[1]).toBe(null);
  });
});
