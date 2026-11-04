// M-1/M-2 dell'audit del 4 novembre · «confronta e scrivi» sui task.
//
// Prima vinceva sempre l'ultimo che salvava: due agenti che premevano insieme
// «prendi in carico» vedevano entrambi il proprio nome, e l'annullamento di
// uno swipe riscriveva il task INTERO com'era prima, cancellando ciò che un
// collega aveva cambiato nel frattempo. Qui si verificano le tre metà:
// la scrittura confrontata (cosa vuol dire «zero righe»), il suo arrivo da
// useSyncedDispatch (cosa vede l'utente su un conflitto) e l'annullamento.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  Tasks: {
    update: vi.fn(async () => ({ data: [{ id: "x" }], error: null })),
    leggi: vi.fn(async () => ({ data: null, error: null })),
    create: vi.fn(), createMany: vi.fn(), softDelete: vi.fn(), restore: vi.fn(),
    hardDelete: vi.fn(), hardDeleteMany: vi.fn(),
  },
  Comments: { create: vi.fn() },
  Notices: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), togglePin: vi.fn() },
  Users: {}, Clients: {}, Categories: {}, MessageTemplates: {},
}));

const { Tasks: TasksAPI } = await import("../../lib/api.js");
const {
  scriviTaskConfrontato, valoriAttesi, stessoValore, compensazioneConflitto, CODICE_CONFLITTO,
} = await import("../../state/scritturaTaskConfrontata.js");
const { RIFIUTO_RLS } = await import("../../lib/esitoScrittura.js");
const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");
const { reducer, makeInitialState } = await import("../../state/reducer.js");
const { PERSISTENCE } = await import("../../state/persistence.js");

const ID = "11111111-2222-4333-8444-555555555555";
const TEAM = [
  { id: "admin1", name: "Admin", role: "Admin", active: true, pending: false },
  { id: "agente1", name: "Sofia", role: "Senior Agent", active: true, pending: false },
  { id: "agente2", name: "Luca", role: "Senior Agent", active: true, pending: false },
];
const rigaDb = (over = {}) => ({
  id: ID, title: "Volo Roma", category: "booking", priority: "high", status: "todo",
  assignees: [], client_id: null, pratica_ref: null, contact: null,
  due_date: "2026-11-10T09:00:00+00:00", estimated_hours: null, description: null,
  deleted_at: null, completed_at: null, ...over,
});
const taskApp = (over = {}) => ({
  id: ID, title: "Volo Roma", category: "booking", priority: "high", status: "todo",
  assignees: [], client: null, praticaRef: null, contact: null,
  dueDate: "2026-11-10T09:00:00.000Z", estimatedHours: 0, description: "",
  deletedAt: null, completedAt: null, comments: [{ id: "c1", text: "ciao" }], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  TasksAPI.update.mockImplementation(async () => ({ data: [{ id: ID }], error: null }));
  TasksAPI.leggi.mockImplementation(async () => ({ data: null, error: null }));
});

describe("scriviTaskConfrontato — cosa vuol dire «zero righe»", () => {
  it("passa al data layer i valori attesi in forma DATABASE", async () => {
    await scriviTaskConfrontato(ID, { assignees: ["agente1"], status: "inprogress" },
      { assignees: [], status: "todo" });
    expect(TasksAPI.update).toHaveBeenCalledWith(
      ID, { assignees: ["agente1"], status: "inprogress" },
      { attesi: { assignees: [], status: "todo" } },
    );
  });

  it("senza valori attesi scrive come prima (voci vecchie della coda offline)", async () => {
    await scriviTaskConfrontato(ID, { status: "done" }, undefined);
    expect(TasksAPI.update).toHaveBeenCalledWith(ID, { status: "done" });
  });

  it("una riga aggiornata è un successo, senza rileggere", async () => {
    const res = await scriviTaskConfrontato(ID, { title: "Volo Milano" }, { title: "Volo Roma" });
    expect(res.error).toBeNull();
    expect(TasksAPI.leggi).not.toHaveBeenCalled();
  });

  it("zero righe e la riga ha GIÀ i valori nuovi: era arrivata, è un successo", async () => {
    // È la coda offline che rigioca una scrittura di cui si era persa la risposta.
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    TasksAPI.leggi.mockResolvedValueOnce({ data: rigaDb({ title: "Volo Milano" }), error: null });
    const res = await scriviTaskConfrontato(ID, { title: "Volo Milano" }, { title: "Volo Roma" });
    expect(res.error).toBeNull();
  });

  it("zero righe e un collega ha cambiato il campo: CONFLITTO con la sua versione", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    TasksAPI.leggi.mockResolvedValueOnce({ data: rigaDb({ assignees: ["agente2"] }), error: null });
    const res = await scriviTaskConfrontato(ID, { assignees: ["agente1"] }, { assignees: [] });
    expect(res.error.code).toBe(CODICE_CONFLITTO);
    expect(res.error.campi).toEqual(["assignees"]);
    expect(res.error.message).toMatch(/preso in carico/);
    expect(res.riga.assignees).toEqual(["agente2"]);
  });

  it("zero righe e niente è cambiato: è la RLS, non un conflitto", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    TasksAPI.leggi.mockResolvedValueOnce({ data: rigaDb(), error: null });
    const res = await scriviTaskConfrontato(ID, { title: "Volo Milano" }, { title: "Volo Roma" });
    expect(res.error).toBe(RIFIUTO_RLS);
  });

  it("zero righe e la riga non si legge più: è sparita o non è visibile", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    const res = await scriviTaskConfrontato(ID, { title: "Volo Milano" }, { title: "Volo Roma" });
    expect(res.error).toBe(RIFIUTO_RLS);
  });

  it("un errore del server passa così com'è", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await scriviTaskConfrontato(ID, { title: "X" }, { title: "Volo Roma" });
    expect(res.error).toEqual({ message: "boom" });
  });
});

describe("i campi confrontati", () => {
  it("valoriAttesi prende solo i campi brevi che la modifica tocca", () => {
    const attesi = valoriAttesi(taskApp({ status: "todo" }),
      { id: ID, status: "done", description: "lunga…", estimatedHours: 3 });
    expect(attesi).toEqual({ status: "todo" });
  });

  it("le date si confrontano come istanti, '' vale null, gli assegnatari come elenco", () => {
    expect(stessoValore("dueDate", "2026-11-10T09:00:00+00:00", "2026-11-10T09:00:00.000Z")).toBe(true);
    expect(stessoValore("dueDate", null, "2026-11-10T09:00:00.000Z")).toBe(false);
    expect(stessoValore("contact", "", null)).toBe(true);
    expect(stessoValore("assignees", ["a", "b"], ["a", "b"])).toBe(true);
    expect(stessoValore("assignees", ["a"], ["b"])).toBe(false);
  });

  it("la compensazione di un conflitto non porta via i commenti a schermo", () => {
    const undo = compensazioneConflitto({ error: { code: CODICE_CONFLITTO }, riga: taskApp() });
    expect(undo.type).toBe("UPDATE_TASK");
    expect("comments" in undo.payload).toBe(false);
    expect(compensazioneConflitto({ error: { message: "altro" } })).toBeNull();
  });
});

describe("useSyncedDispatch — M-2, due «prendi in carico» insieme", () => {
  function setup(tasks, uid = "agente1") {
    const rawDispatch = vi.fn();
    const state = { ...makeInitialState({ team: TEAM, currentUserId: uid }), tasks, toasts: [] };
    const view = renderHook(({ s }) => useSyncedDispatch(s, rawDispatch, { enabled: true }),
      { initialProps: { s: state } });
    return { dispatch: view.result.current, rawDispatch };
  }
  const azioni = (rawDispatch) => rawDispatch.mock.calls.map(([a]) => a);

  it("la presa in carico confronta gli assegnatari che l'agente vedeva", async () => {
    const { dispatch } = setup([taskApp({ assignees: [] })]);
    await act(async () => {
      await dispatch({ type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente1"], status: "inprogress" }, swipe: true });
    });
    expect(TasksAPI.update.mock.calls[0][2]).toEqual({ attesi: { assignees: [], status: "todo" } });
  });

  it("chi arriva secondo vede il collega, un errore chiaro e nessun «Hai preso in carico»", async () => {
    TasksAPI.update.mockResolvedValueOnce({ data: [], error: null });
    TasksAPI.leggi.mockResolvedValueOnce({ data: rigaDb({ assignees: ["agente2"], status: "inprogress" }), error: null });
    const { dispatch, rawDispatch } = setup([taskApp({ assignees: [] })]);

    let esito;
    await act(async () => {
      esito = await dispatch({ type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente1"], status: "inprogress" }, swipe: true });
    });

    expect(esito.error.code).toBe(CODICE_CONFLITTO);
    const compensazione = azioni(rawDispatch).find((a) => a.meta?.compensazione);
    expect(compensazione).toMatchObject({ type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente2"] } });
    expect(azioni(rawDispatch).some((a) => a.type === "RETRACT_TOASTS")).toBe(true);
    const errore = azioni(rawDispatch).find((a) => a.type === "SHOW_TOAST" && a.payload.type === "error");
    expect(errore.payload.message).toMatch(/preso in carico/);
  });

  it("MOVE_TASK confronta lo stato di partenza", async () => {
    const { dispatch } = setup([taskApp({ status: "todo", assignees: ["agente1"] })]);
    await act(async () => {
      await dispatch({ type: "MOVE_TASK", payload: { taskId: ID, newStatus: "done" } });
    });
    expect(TasksAPI.update).toHaveBeenCalledWith(ID, { status: "done" }, { attesi: { status: "todo" } });
  });
});

describe("UNDO dopo uno swipe — M-1, si annulla solo ciò che lo swipe ha cambiato", () => {
  const conSwipe = () => {
    const base = { ...makeInitialState({ team: TEAM, currentUserId: "agente1" }), tasks: [taskApp()], toasts: [] };
    const dopoSwipe = reducer(base, {
      type: "UPDATE_TASK", payload: { id: ID, assignees: ["agente1"], status: "inprogress" }, swipe: true,
    });
    // Un collega intanto cambia la scadenza (arriva via realtime).
    const conCollega = reducer(dopoSwipe, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", row: { ...dopoSwipe.tasks[0], dueDate: "2026-12-01T09:00:00.000Z" } },
    });
    return conCollega;
  };

  it("lo stato locale torna indietro sui soli campi dello swipe", () => {
    const annullato = reducer(conSwipe(), { type: "UNDO_LAST_ACTION" });
    const t = annullato.tasks[0];
    expect(t.assignees).toEqual([]);
    expect(t.status).toBe("todo");
    expect(t.dueDate).toBe("2026-12-01T09:00:00.000Z");   // la modifica del collega resta
  });

  it("sul server si riscrivono solo quei campi, e solo se valgono ancora i valori dello swipe", async () => {
    await PERSISTENCE.UNDO_LAST_ACTION.persist(conSwipe());
    const [id, patch, opzioni] = TasksAPI.update.mock.calls[0];
    expect(id).toBe(ID);
    expect(patch).toEqual({ assignees: [], status: "todo" });
    expect(opzioni).toEqual({ attesi: { assignees: ["agente1"], status: "inprogress" } });
  });
});
