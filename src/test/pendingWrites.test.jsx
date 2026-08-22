// Scritture in volo (rilievo S-5): un refetch altrui non deve sovrascrivere
// l'update ottimistico ancora in viaggio verso Supabase.
//
// LA SEQUENZA CHE QUESTO FILE RIPRODUCE, e che prima del fix lasciava la UI
// disallineata dal database a tempo indeterminato:
//
//   t0        A dispatcha UPDATE_TASK → stato ottimistico applicato (titolo nuovo)
//   t0+ε      TasksAPI.update(...) parte, in volo
//   t1        B modifica un ALTRO task → evento realtime, origine B → non filtrato
//   t1+200ms  A esegue Tasks.list() → il server serve la SELECT PRIMA che la
//             UPDATE di A abbia fatto commit
//   t2        SET_TASKS → il titolo di A torna quello VECCHIO
//   t3        la UPDATE di A committa → eco taggata con l'origin di A →
//             FILTRATA → nessun refetch
//
// Da t3 in poi nulla viene a correggere la UI. Il punto è che SET_TASKS
// sostituiva l'array intero senza sapere che alcune di quelle righe avevano una
// scrittura in volo: la risposta del server è più recente per tutte le altre e
// più VECCHIA per quelle.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReducer } from "react";
import { renderHook, act } from "@testing-library/react";
// A-1 (22 agosto): la terza funzione del modulo si testa direttamente —
// è pura, e le sue due semantiche non sarebbero distinguibili passando
// dal reducer, dove ciascun case ne esercita una sola.
import { fondiThreadCommenti } from "../state/pendingWrites.js";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { useSyncedDispatch } = await import("../hooks/useSyncedDispatch.js");
const { reducer, makeInitialState } = await import("../state/reducer.js");
const { Tasks: TasksAPI } = await import("../lib/api.js");

const TEAM = [
  { id: "admin1",  name: "Admin",  role: "Admin",        active: true, pending: false },
  { id: "junior1", name: "Junior", role: "Junior Agent", active: true, pending: false },
];

const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;

const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["junior1"], comments: [], history: [], ...over,
});

// Promise che risolviamo (o rigettiamo) a mano: è il modo di tenere una
// scrittura "in volo" per il tempo che serve al test.
function differita() {
  let risolvi, rifiuta;
  const promise = new Promise((res, rej) => { risolvi = res; rifiuta = rej; });
  return { promise, risolvi, rifiuta };
}

// L'app vera: useReducer + useSyncedDispatch sopra. `raw` è il dispatch grezzo,
// cioè quello che useAppHydration usa per SET_TASKS — la ri-idratazione NON
// passa dall'orchestratore.
function montaApp({ uid = "admin1", tasks = [] } = {}) {
  const view = renderHook(() => {
    const [state, raw] = useReducer(
      reducer, undefined, () => makeInitialState({ team: TEAM, currentUserId: uid }),
    );
    return { state, raw, dispatch: useSyncedDispatch(state, raw, { enabled: true }) };
  });
  act(() => { view.result.current.raw({ type: "SET_TASKS", payload: tasks }); });
  return view;
}

const titoloDi = (view, id = uuid(1)) => view.result.current.state.tasks.find(t => t.id === id)?.title;
const inVolo = (view) => view.result.current.state.pendingWrites;

beforeEach(() => { vi.clearAllMocks(); });

describe("scritture in volo — la sequenza t0→t3", () => {
  it("un SET_TASKS concorrente NON riporta indietro il valore ottimistico", async () => {
    const vecchio = task({ title: "Volo Roma" });
    const view = montaApp({ tasks: [vecchio] });

    // t0 — dispatch ottimistico; la persist resta appesa.
    const rete = differita();
    TasksAPI.update.mockReturnValueOnce(rete.promise);
    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "Volo Roma MODIFICATO" } }); });

    expect(titoloDi(view)).toBe("Volo Roma MODIFICATO");
    expect(inVolo(view).has(uuid(1))).toBe(true);

    // t1/t2 — B tocca un altro task, il refetch arriva prima del nostro commit
    // e porta ancora il PRE-IMMAGINE della nostra riga.
    act(() => {
      view.result.current.raw({
        type: "SET_TASKS",
        payload: [vecchio, task({ id: uuid(2), title: "Task di B" })],
      });
    });

    // Il resto della lista è quello del server; la nostra riga no.
    expect(titoloDi(view)).toBe("Volo Roma MODIFICATO");
    expect(titoloDi(view, uuid(2))).toBe("Task di B");

    // t3 — la UPDATE committa. L'eco realtime sarebbe filtrata (origin nostro):
    // se il valore fosse già tornato indietro, nulla verrebbe più a correggerlo.
    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });
    expect(titoloDi(view)).toBe("Volo Roma MODIFICATO");
    expect(inVolo(view).size).toBe(0);
  });

  it("a persist conclusa l'id è libero e il refetch torna ad avere l'ultima parola", async () => {
    const view = montaApp({ tasks: [task()] });

    const rete = differita();
    TasksAPI.update.mockReturnValueOnce(rete.promise);
    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "Mio" } }); });
    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });

    expect(inVolo(view).size).toBe(0);

    // Ora una modifica di qualcun altro sulla stessa riga deve entrare: il
    // congelamento dura quanto la scrittura, non un istante di più.
    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task({ title: "Modificato da B" })] }); });
    expect(titoloDi(view)).toBe("Modificato da B");
  });

  it("persist che RIGETTA: l'id viene liberato lo stesso (il .finally)", async () => {
    // Senza `finally` un errore di rete lascerebbe l'id marcato per sempre e
    // quel task smetterebbe di aggiornarsi da realtime per il resto della
    // sessione — un difetto peggiore di quello corretto qui.
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = montaApp({ tasks: [task()] });

    const rete = differita();
    TasksAPI.update.mockReturnValueOnce(rete.promise);
    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "Mio" } }); });
    expect(inVolo(view).has(uuid(1))).toBe(true);

    await act(async () => { rete.rifiuta(new Error("connessione persa")); await esito; });

    expect(inVolo(view).size).toBe(0);
    expect(view.result.current.state.toasts?.at(-1)?.type).toBe("error");

    // E il task torna a seguire il server.
    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task({ title: "Verità del server" })] }); });
    expect(titoloDi(view)).toBe("Verità del server");
    errori.mockRestore();
  });

  it("due scritture ravvicinate sulla stessa riga: la prima che si chiude non libera l'id", async () => {
    // È la ragione per cui pendingWrites è una Map con un contatore e non un
    // Set: con un Set la prima persist conclusa smarcherebbe l'id mentre la
    // seconda è ancora in volo, riaprendo la finestra.
    const view = montaApp({ tasks: [task()] });

    const primaRete = differita();
    const secondaRete = differita();
    TasksAPI.update
      .mockReturnValueOnce(primaRete.promise)
      .mockReturnValueOnce(secondaRete.promise);

    let e1, e2;
    await act(async () => { e1 = view.result.current.dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "Primo" } }); });
    await act(async () => { e2 = view.result.current.dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "Secondo" } }); });
    expect(inVolo(view).get(uuid(1))).toBe(2);

    await act(async () => { primaRete.risolvi({ data: null, error: null }); await e1; });
    expect(inVolo(view).has(uuid(1))).toBe(true);

    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task({ title: "Volo Roma" })] }); });
    expect(titoloDi(view)).toBe("Secondo");

    await act(async () => { secondaRete.risolvi({ data: null, error: null }); await e2; });
    expect(inVolo(view).size).toBe(0);
  });
});

describe("scritture in volo — le altre forme di action", () => {
  it("MOVE_TASK (payload.taskId) marca la riga giusta", async () => {
    const view = montaApp({ tasks: [task()] });
    const rete = differita();
    TasksAPI.update.mockReturnValueOnce(rete.promise);

    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } }); });
    expect(inVolo(view).has(uuid(1))).toBe(true);

    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task({ status: "todo" })] }); });
    expect(view.result.current.state.tasks[0].status).toBe("done");

    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });
  });

  it("DELETE_TASK (payload nudo): il refetch non resuscita la riga cestinata", async () => {
    const view = montaApp({ tasks: [task()] });
    const rete = differita();
    TasksAPI.softDelete.mockReturnValueOnce(rete.promise);

    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(view.result.current.state.tasks[0].deletedAt).toBeTruthy();

    // Il server serve ancora il pre-immagine: deletedAt assente.
    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task()] }); });
    expect(view.result.current.state.tasks[0].deletedAt).toBeTruthy();

    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });
  });

  it("ADD_TASK: la riga creata in ottimistico non sparisce col refetch", async () => {
    const view = montaApp({ tasks: [] });
    const rete = differita();
    TasksAPI.create.mockReturnValueOnce(rete.promise);

    let esito;
    await act(async () => { esito = view.result.current.dispatch({ type: "ADD_TASK", payload: task({ id: uuid(3), title: "Appena creato" }) }); });
    const idCreato = view.result.current.state.tasks[0].id;

    // Il refetch non la conosce ancora: senza protezione sparirebbe dalla lista.
    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [task({ id: uuid(2), title: "Task di B" })] }); });
    expect(view.result.current.state.tasks.map(t => t.id)).toContain(idCreato);
    expect(view.result.current.state.tasks).toHaveLength(2);

    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });
  });

  it("ADD_TASKS_BULK (array di id): tutto il batch è protetto, e il rollback lo trova ancora marcato", async () => {
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = montaApp({ tasks: [] });
    const rete = differita();
    TasksAPI.createMany.mockReturnValueOnce(rete.promise);

    let esito;
    await act(async () => {
      esito = view.result.current.dispatch({
        type: "ADD_TASKS_BULK",
        payload: [task({ id: uuid(4) }), task({ id: uuid(5) })],
      });
    });
    expect(inVolo(view).size).toBe(2);

    act(() => { view.result.current.raw({ type: "SET_TASKS", payload: [] }); });
    expect(view.result.current.state.tasks).toHaveLength(2);

    // L'insert in blocco è atomica: se fallisce, ROLLBACK_TASKS_BULK toglie le
    // righe. Deve funzionare anche se gli id sono ancora marcati — e la
    // liberazione deve avvenire DOPO, altrimenti un refetch fra rollback e
    // smarcamento potrebbe reintrodurre righe che sul server non esistono.
    await act(async () => { rete.rifiuta(new Error("vincolo violato")); await esito; });
    expect(view.result.current.state.tasks).toHaveLength(0);
    expect(inVolo(view).size).toBe(0);
    errori.mockRestore();
  });

  it("ADD_COMMENT: il thread riletto dal server non cancella il commento ottimistico", async () => {
    const view = montaApp({ tasks: [task()] });
    const rete = differita();
    const { Comments: CommentsAPI } = await import("../lib/api.js");
    CommentsAPI.create.mockReturnValueOnce(rete.promise);

    let esito;
    await act(async () => {
      esito = view.result.current.dispatch({
        type: "ADD_COMMENT",
        payload: { taskId: uuid(1), comment: { user: "admin1", text: "ok" } },
      });
    });
    expect(view.result.current.state.tasks[0].comments).toHaveLength(1);

    // SET_TASK_THREADS con il thread ancora vuoto lato server.
    act(() => { view.result.current.raw({ type: "SET_TASK_THREADS", payload: { comments: {} } }); });
    expect(view.result.current.state.tasks[0].comments).toHaveLength(1);

    await act(async () => { rete.risolvi({ data: null, error: null }); await esito; });
    act(() => { view.result.current.raw({ type: "SET_TASK_THREADS", payload: { comments: { [uuid(1)]: [{ text: "ok" }] } } }); });
    expect(view.result.current.state.tasks[0].comments).toEqual([{ text: "ok" }]);
  });
});

describe("scritture in volo — il reducer da solo", () => {
  const statoCon = (tasks, pendingWrites = new Map()) => ({
    ...makeInitialState({ team: TEAM, currentUserId: "admin1" }),
    tasks, pendingWrites, toasts: [],
  });

  it("senza pendenti SET_TASKS resta la sostituzione in blocco di prima", () => {
    const next = reducer(statoCon([task({ title: "vecchio" })]), {
      type: "SET_TASKS", payload: [task({ title: "nuovo" })],
    });
    expect(next.tasks[0].title).toBe("nuovo");
  });

  it("payload non-array azzera la lista, come prima", () => {
    expect(reducer(statoCon([task()]), { type: "SET_TASKS", payload: null }).tasks).toEqual([]);
  });

  it("MARK/UNMARK sono simmetrici e non mutano lo state ricevuto", () => {
    const prima = statoCon([task()]);
    const marcato = reducer(prima, { type: "MARK_PENDING_WRITE", payload: [uuid(1)] });
    expect(prima.pendingWrites.size).toBe(0);          // l'input non è stato toccato
    expect(marcato.pendingWrites.get(uuid(1))).toBe(1);
    const smarcato = reducer(marcato, { type: "UNMARK_PENDING_WRITE", payload: [uuid(1)] });
    expect(smarcato.pendingWrites.size).toBe(0);
  });

  it("uno smarcamento di troppo non porta il contatore sotto zero", () => {
    const next = reducer(statoCon([task()]), { type: "UNMARK_PENDING_WRITE", payload: [uuid(1)] });
    expect(next.pendingWrites.has(uuid(1))).toBe(false);
  });

  it("un payload vuoto non crea un nuovo state (niente render inutili)", () => {
    const prima = statoCon([task()]);
    expect(reducer(prima, { type: "MARK_PENDING_WRITE", payload: [] })).toBe(prima);
  });

  it("una riga rimossa in locale e ancora pendente non viene resuscitata dal refetch", () => {
    // PURGE_TASK ottimistico: localmente non c'è più, il server la serve ancora.
    const stato = statoCon([], new Map([[uuid(1), 1]]));
    const next = reducer(stato, { type: "SET_TASKS", payload: [task()] });
    expect(next.tasks).toEqual([]);
  });
});

// ─── fondiThreadCommenti — A-1, audit del 22 agosto ────────────────────────
// La terza funzione del modulo, e l'unica con DUE semantiche a seconda che il
// chiamante passi o no l'elenco degli id. È la distinzione che separa
// SET_TASK_THREADS (corpus) da MERGE_TASK_COMMENTS (sottoinsieme), ed è anche
// il modo in cui questa correzione potrebbe causare una perdita di dati
// silenziosa se venisse sbagliata: applicare la semantica del corpus a un
// sottoinsieme azzererebbe il thread di ogni task non toccato dall'evento.
describe("fondiThreadCommenti", () => {
  const tasks = [
    { id: "t1", title: "Volo", comments: [{ id: "vecchio1" }] },
    { id: "t2", title: "Hotel", comments: [{ id: "vecchio2" }] },
    { id: "t3", title: "Visto", comments: [] },
  ];
  const perId = (l) => Object.fromEntries(l.map(t => [t.id, t]));

  describe("senza elenco di id — `comments` è il CORPUS", () => {
    it("applica i thread arrivati e AZZERA quelli non presenti", () => {
      const out = perId(fondiThreadCommenti(tasks, undefined, { t1: [{ id: "nuovo1" }] }));
      expect(out.t1.comments).toEqual([{ id: "nuovo1" }]);
      // t2 non compare nel corpus: ha davvero zero commenti.
      expect(out.t2.comments).toEqual([]);
    });

    it("non tocca i campi del task diversi da `comments`", () => {
      const out = perId(fondiThreadCommenti(tasks, undefined, {}));
      expect(out.t1.title).toBe("Volo");
    });
  });

  describe("con elenco di id — `comments` è un SOTTOINSIEME", () => {
    it("lascia INTATTI i task fuori dall'elenco", () => {
      const out = perId(fondiThreadCommenti(tasks, undefined, { t1: [{ id: "nuovo1" }] }, ["t1"]));
      expect(out.t1.comments).toEqual([{ id: "nuovo1" }]);
      // Il caso che conta: t2 non è stato CHIESTO, non è "senza commenti".
      expect(out.t2.comments).toEqual([{ id: "vecchio2" }]);
      expect(out.t3.comments).toEqual([]);
    });

    it("azzera un task DENTRO l'elenco ma senza chiave nella risposta", () => {
      // È il caso in cui tutti i commenti di quel task sono stati cancellati:
      // il server risponde senza chiave, e il thread va svuotato. È anche la
      // ragione per cui gli id viaggiano espliciti invece di essere dedotti
      // dalle chiavi della mappa — qui le due cose non coincidono.
      const out = perId(fondiThreadCommenti(tasks, undefined, {}, ["t1"]));
      expect(out.t1.comments).toEqual([]);
      expect(out.t2.comments).toEqual([{ id: "vecchio2" }]);
    });

    it("ignora un id che non corrisponde ad alcun task in stato", () => {
      const out = fondiThreadCommenti(tasks, undefined, { tX: [{ id: "x" }] }, ["tX"]);
      expect(out).toHaveLength(3);
      expect(perId(out).t1.comments).toEqual([{ id: "vecchio1" }]);
    });
  });

  describe("l'invariante condivisa con le due funzioni sorelle", () => {
    it("un task con una scrittura in volo non si lascia sovrascrivere", () => {
      const pending = new Map([["t1", 1]]);
      const out = perId(fondiThreadCommenti(tasks, pending, { t1: [{ id: "dalServer" }] }, ["t1"]));
      // ADD_COMMENT appena dispatchato: il server può non averlo ancora.
      expect(out.t1.comments).toEqual([{ id: "vecchio1" }]);
    });

    it("vale anche per il percorso del corpus", () => {
      const pending = new Map([["t1", 1]]);
      const out = perId(fondiThreadCommenti(tasks, pending, {}));
      expect(out.t1.comments).toEqual([{ id: "vecchio1" }]);
      expect(out.t2.comments).toEqual([]);
    });
  });

  it("non muta l'array né i task che riceve", () => {
    const copia = JSON.parse(JSON.stringify(tasks));
    fondiThreadCommenti(tasks, undefined, { t1: [{ id: "nuovo1" }] }, ["t1"]);
    expect(tasks).toEqual(copia);
  });

  it("tollera un elenco di task assente", () => {
    expect(fondiThreadCommenti(undefined, undefined, {})).toEqual([]);
  });
});
