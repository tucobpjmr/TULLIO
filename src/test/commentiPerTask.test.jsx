// I commenti dei SOLI task toccati da un evento realtime — A-1 dell'audit del
// 22 agosto 2026.
//
// IL DIFETTO. Il ramo `soloThread` di useAppHydration — quello che scatta a
// ogni commento scritto da CHIUNQUE, su OGNI client connesso — chiamava
// `TaskThreads.comments()`, cioè l'INTERA tabella `comments`, paginata a
// blocchi di 1000, per applicare UNA riga che l'evento realtime già portava
// con sé. `comments` ha la proprietà che rendeva grave lo stesso difetto su
// `task_history` (A-3, passo 3): cresce e non si pota mai, perché nessuna UI
// cancella un commento.
//
// La differenza con la cronologia — e la ragione per cui questa correzione è
// arrivata dopo — è il numero di LETTORI, non la dimensione: la cronologia ne
// aveva uno solo ed è potuta scendere per-task del tutto, i commenti ne hanno
// due (il thread dello slide-over e la ricerca avanzata, che cerca dentro il
// loro testo). Il corpus resta quindi disponibile; a scendere è il solo
// percorso frequente.
//
// PERCHÉ UN FILE A SÉ e non in realtimeGranularita.test.jsx, dove sta il
// contratto vicino: quel file ha sfondato il tetto di 500 righe, e la regola
// del progetto è spezzare, non alzare — l'unica deroga dichiarata è
// state/reducer.js. Qui l'impalcatura è anche più stretta: serve un solo hook.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload = { eventType: "INSERT", new: {} }) =>
  handlers.get(tabella)?.(payload);

const vuoto = async () => ({ data: [], error: null });
const TasksAPI = { list: vi.fn(async () => ({ data: [{ id: "t1", title: "Volo" }], error: null })) };
const TaskThreadsAPI = {
  comments: vi.fn(async () => ({
    data: [{ id: "k1", task_id: "t1", text: "corpus", created_at: "2026-08-01T10:00:00Z", users: { name: "Marco" } }],
    error: null,
  })),
  commentsForTasks: vi.fn(async (ids) => ({
    data: ids.map((tid, i) => ({
      id: `k-${tid}-${i}`, task_id: tid, text: "nuovo",
      created_at: "2026-08-02T10:00:00Z", users: { name: "Sofia" },
    })),
    error: null,
  })),
  historyForTask: vi.fn(async () => ({ data: [], error: null })),
};

vi.mock("../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
  Tasks: TasksAPI,
  TaskThreads: TaskThreadsAPI,
  Notices: { list: vi.fn(vuoto) },
  Users: { listAll: vi.fn(vuoto), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(vuoto) },
  Categories: { list: vi.fn(vuoto) },
  MessageTemplates: { list: vi.fn(vuoto) },
  Conversations: { listMine: vi.fn(vuoto) },
  Messages: { listAll: vi.fn(vuoto) },
}));

const { useAppHydration } = await import("../hooks/useAppHydration.js");

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
});

describe("A-1 — reload dei commenti ristretto ai task dell'evento", () => {
  // Stesso montaggio di `idrata()` più sopra, ripetuto qui perché quello vive
  // nello scope del suo describe.
  const montaHydration = () => {
    const dispatch = vi.fn();
    const utils = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "marco", dispatch, onError: vi.fn(),
    }));
    return { dispatch, ...utils };
  };

  const conTaskId = (tid, eventType = "INSERT") => ({
    eventType, new: { id: `c-${tid}`, task_id: tid }, old: null,
  });

  it("chiede SOLO i task nominati dall'evento, non il corpus", async () => {
    montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("comments", conTaskId("t1"));
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledTimes(1);
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledWith(["t1"]);
    // Il controllo che conta: il corpus NON è stato toccato.
    expect(TaskThreadsAPI.comments).not.toHaveBeenCalled();
    expect(TasksAPI.list).not.toHaveBeenCalled();
  });

  it("dispatcha MERGE_TASK_COMMENTS, non SET_TASK_THREADS", async () => {
    const { dispatch } = montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    dispatch.mockClear();

    await act(async () => {
      emetti("comments", conTaskId("t1"));
      await new Promise(r => setTimeout(r, 250));
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "MERGE_TASK_COMMENTS",
      payload: expect.objectContaining({ taskIds: ["t1"] }),
    }));
    // SET_TASK_THREADS sostituirebbe il thread di OGNI task con `[]` per
    // quelli non presenti nella risposta: è il case del corpus, e qui sarebbe
    // una perdita di dati silenziosa.
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TASK_THREADS" }));
  });

  it("coalesce più task toccati nella stessa finestra di debounce", async () => {
    montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("comments", conTaskId("t1"));
      emetti("comments", conTaskId("t2"));
      emetti("comments", conTaskId("t1")); // duplicato: il Set lo assorbe
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledTimes(1);
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("legge il task_id da `old` quando l'evento è una DELETE", async () => {
    montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("comments", { eventType: "DELETE", new: null, old: { id: "c9", task_id: "t7" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledWith(["t7"]);
  });

  // ── Il fallback, che è ciò che rende la correzione fail-safe ─────────────
  // Se il payload non porta un task_id leggibile si torna al corpus: si
  // scarica troppo, non si mostra un thread vuoto. Il secondo esito sarebbe il
  // guasto silenzioso e auto-guarente descritto in lib/api.js.
  it("ricade sul corpus se l'evento non porta un task_id", async () => {
    const { dispatch } = montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks(); dispatch.mockClear();

    await act(async () => {
      emetti("comments"); // payload di default: `new: {}`, nessun task_id
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TaskThreadsAPI.commentsForTasks).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.comments).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_TASK_THREADS" }));
  });

  it("gli id si azzerano fra un giro e il successivo", async () => {
    montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("comments", conTaskId("t1"));
      await new Promise(r => setTimeout(r, 250));
    });
    await act(async () => {
      emetti("comments", conTaskId("t2"));
      await new Promise(r => setTimeout(r, 250));
    });

    // Il secondo giro chiede t2 e SOLO t2: se il Set non si azzerasse, la
    // richiesta crescerebbe a ogni evento fino a tornare, di fatto, al corpus.
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenNthCalledWith(1, ["t1"]);
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenNthCalledWith(2, ["t2"]);
  });

  it("resta indipendente da un evento su tasks nella stessa finestra", async () => {
    const { dispatch } = montaHydration();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks(); dispatch.mockClear();

    await act(async () => {
      emetti("comments", conTaskId("t1"));
      emetti("tasks", { eventType: "UPDATE", new: { id: "t1", title: "x" } });
      await new Promise(r => setTimeout(r, 250));
    });

    // I due percorsi non si toccano, ed è il contratto che il caso «tasks
    // (applicato per riga) e comments (reload selettivo) restano indipendenti»
    // fissa più sopra: l'evento su `tasks` è consumato da `applyRow` e non
    // entra mai nel debounce, quindi `soloThread` resta VERO e il ramo dei
    // commenti prende comunque la strada ristretta.
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "MERGE_TASK_ROW" }));
    expect(TaskThreadsAPI.commentsForTasks).toHaveBeenCalledWith(["t1"]);
    // E in nessuno dei due percorsi si ricade sul corpus.
    expect(TaskThreadsAPI.comments).not.toHaveBeenCalled();
    expect(TasksAPI.list).not.toHaveBeenCalled();
  });
});
