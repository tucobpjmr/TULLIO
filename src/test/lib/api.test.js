// src/test/api.test.js
// Copre TasksAPI.hardDelete / hardDeleteMany: la purge di un task deve ripulire
// anche i file fisici nel bucket privato 'task-files' oltre alle righe metadati
// (che la FK task_files.task_id ON DELETE CASCADE elimina automaticamente lato
// DB). Il client Supabase è mockato: non tocchiamo una rete reale, verifichiamo
// solo la sequenza di chiamate (select allegati → remove storage → delete task)
// e che gli errori non blocchino comunque l'eliminazione della riga task.
//
// M-4: le due varianti condividono un'implementazione sola e filtrano con `in`
// anche per un id singolo. Il caso in blocco è quello che conta davvero — è
// EMPTY_TRASH — e deve restare a TRE round-trip qualunque sia il numero di
// task, non tre per task come nel `Promise.all(ids.map(hardDelete))` di prima.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Stato mutabile letto dai mock: ogni test lo aggiorna per simulare lo
// scenario desiderato (con/senza allegati, con/senza errori).
const state = {
  taskFilesSelect: { data: [], error: null },
  tasksDelete: { data: null, error: null },
  storageRemove: { data: null, error: null },
};

const calls = [];

const storageRemoveMock = vi.fn((paths) => {
  calls.push({ op: "storage.remove", paths });
  return Promise.resolve(state.storageRemove);
});

const tasksDeleteInMock = vi.fn((_col, _ids) => {
  calls.push({ op: "tasks.delete" });
  return Promise.resolve(state.tasksDelete);
});

const taskFilesSelectInMock = vi.fn((_col, _ids) => {
  calls.push({ op: "task_files.select" });
  return Promise.resolve(state.taskFilesSelect);
});

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn((table) => {
      if (table === "task_files") {
        return { select: vi.fn(() => ({ in: taskFilesSelectInMock })) };
      }
      if (table === "tasks") {
        return { delete: vi.fn(() => ({ in: tasksDeleteInMock })) };
      }
      throw new Error(`tabella inattesa nel mock: ${table}`);
    }),
    storage: {
      from: vi.fn((bucket) => {
        if (bucket !== "task-files") throw new Error(`bucket inatteso: ${bucket}`);
        return { remove: storageRemoveMock };
      }),
    },
  },
}));

const { Tasks } = await import("../../lib/api.js");

const TASK_ID = "11111111-2222-4333-8444-555555555555";
const ALTRO_ID = "22222222-2222-4333-8444-555555555555";

describe("TasksAPI.hardDelete — purge allegati storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    state.taskFilesSelect = { data: [], error: null };
    state.tasksDelete = { data: null, error: null };
    state.storageRemove = { data: null, error: null };
  });

  it("senza allegati elimina il task senza chiamare lo storage", async () => {
    await Tasks.hardDelete(TASK_ID);
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID]);
  });

  it("con allegati rimuove tutti i path dal bucket prima di eliminare il task", async () => {
    state.taskFilesSelect = {
      data: [{ file_url: `${TASK_ID}/a-uno.pdf` }, { file_url: `${TASK_ID}/b-due.png` }],
      error: null,
    };
    await Tasks.hardDelete(TASK_ID);
    expect(storageRemoveMock).toHaveBeenCalledWith([
      `${TASK_ID}/a-uno.pdf`,
      `${TASK_ID}/b-due.png`,
    ]);
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID]);
    // La rimozione storage deve avvenire PRIMA della delete del task.
    expect(calls.map((c) => c.op)).toEqual(["task_files.select", "storage.remove", "tasks.delete"]);
  });

  it("ignora righe senza file_url e non chiama lo storage se non restano path validi", async () => {
    state.taskFilesSelect = { data: [{ file_url: null }, { file_url: "" }], error: null };
    await Tasks.hardDelete(TASK_ID);
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID]);
  });

  it("un errore nella lettura degli allegati non blocca l'eliminazione del task", async () => {
    state.taskFilesSelect = { data: null, error: { message: "boom" } };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await Tasks.hardDelete(TASK_ID);
    expect(storageRemoveMock).not.toHaveBeenCalled();
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("un errore nella rimozione storage non blocca l'eliminazione del task", async () => {
    state.taskFilesSelect = { data: [{ file_url: `${TASK_ID}/a-uno.pdf` }], error: null };
    state.storageRemove = { data: null, error: { message: "storage down" } };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await Tasks.hardDelete(TASK_ID);
    expect(storageRemoveMock).toHaveBeenCalled();
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("restituisce l'esito della delete sulla tabella tasks", async () => {
    state.tasksDelete = { data: null, error: null };
    const res = await Tasks.hardDelete(TASK_ID);
    expect(res).toEqual(state.tasksDelete);
  });
});

// M-4 · il percorso di EMPTY_TRASH. Il conteggio delle chiamate È l'asserzione:
// prima erano tre round-trip PER TASK lanciati in parallelo, e la delete non
// atomica rendeva impossibile qualunque rollback corretto.
describe("TasksAPI.hardDeleteMany — purge in blocco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    state.taskFilesSelect = { data: [], error: null };
    state.tasksDelete = { data: null, error: null };
    state.storageRemove = { data: null, error: null };
  });

  it("elimina N task con tre round-trip in tutto, non tre per task", async () => {
    state.taskFilesSelect = {
      data: [{ file_url: `${TASK_ID}/a.pdf` }, { file_url: `${ALTRO_ID}/b.png` }],
      error: null,
    };

    await Tasks.hardDeleteMany([TASK_ID, ALTRO_ID]);

    expect(calls.map((c) => c.op)).toEqual(["task_files.select", "storage.remove", "tasks.delete"]);
    expect(taskFilesSelectInMock).toHaveBeenCalledWith("task_id", [TASK_ID, ALTRO_ID]);
    // Una sola remove con tutti i path dei due task, non una per task.
    expect(storageRemoveMock).toHaveBeenCalledTimes(1);
    expect(storageRemoveMock).toHaveBeenCalledWith([`${TASK_ID}/a.pdf`, `${ALTRO_ID}/b.png`]);
    // Una sola delete: è questa atomicità a rendere corretto il rollback
    // dichiarato in state/persistence.js.
    expect(tasksDeleteInMock).toHaveBeenCalledTimes(1);
    expect(tasksDeleteInMock).toHaveBeenCalledWith("id", [TASK_ID, ALTRO_ID]);
  });

  it("con un elenco vuoto non tocca il server", async () => {
    const res = await Tasks.hardDeleteMany([]);
    expect(calls).toEqual([]);
    expect(res).toEqual({ error: null });
  });

  it("propaga l'errore della delete: è quello che innesca il rollback", async () => {
    state.tasksDelete = { data: null, error: { message: "riga bloccata" } };
    const res = await Tasks.hardDeleteMany([TASK_ID]);
    expect(res.error).toEqual({ message: "riga bloccata" });
  });
});
