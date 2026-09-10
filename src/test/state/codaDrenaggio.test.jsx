// useCodaScritture — il drenaggio, cioè la metà della coda che consegna.
//
// M-2 dell'audit del 10 settembre. Accodare è la parte facile: il rischio sta
// nel rigiocare. Una voce rimossa troppo presto è lavoro perso in silenzio;
// una rimossa troppo tardi è la stessa scrittura mandata due volte; e una
// caduta di rete a metà coda che non ferma il giro manda le scritture
// successive PRIMA di quella che si è fermata, cioè fuori ordine.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const { depositoMemoria } = await import("../../lib/depositoIdb.js");

// Un deposito solo, condiviso fra il test e l'hook: è ciò che permette di
// SEMINARE la coda prima del mount, cioè di riprodurre il caso vero — l'app
// riaperta il giorno dopo con la coda di ieri ancora dentro.
const deposito = depositoMemoria();
vi.mock("../../lib/depositoIdb.js", async (originale) => {
  const vero = /** @type {any} */ (await originale());
  const condiviso = vero.depositoMemoria();
  return { ...vero, creaDeposito: () => condiviso, __condiviso: condiviso };
});

vi.mock("../../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { useCodaScritture } = await import("../../hooks/useCodaScritture.js");
const { Tasks: TasksAPI } = await import("../../lib/api.js");
const idb = /** @type {any} */ (await import("../../lib/depositoIdb.js"));
const condiviso = idb.__condiviso;

const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;
const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["u1"], comments: [], ...over,
});
const TEAM = [{ id: "u1", name: "Admin", role: "Admin", active: true, pending: false }];
// Lo stato della sessione in cui la scrittura era stata fatta: la task
// c'è ancora, quindi un rollback ha qualcosa da compensare.
const STATO = { team: TEAM, tasks: [task()] };
// Lo stato DOPO un reload: i dati vengono dal server, e la riga ottimistica
// non esiste più. È il caso in cui il rollback è — correttamente — un no-op.
const STATO_DOPO_RELOAD = { team: TEAM, tasks: [] };

const semina = (over = {}) => condiviso.aggiungi({
  uid: "u1",
  tipo: "MOVE_TASK",
  azione: { type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } },
  creatoIl: Date.now(),
  ...over,
});

function monta(state = STATO) {
  const rawDispatch = vi.fn();
  const view = renderHook(() => useCodaScritture({
    enabled: true, uid: "u1", state, rawDispatch,
  }));
  return { view, rawDispatch };
}

const toastDi = (rawDispatch, tipo) => rawDispatch.mock.calls
  .map(([a]) => a)
  .filter(a => a.type === "SHOW_TOAST" && a.payload?.type === tipo);

beforeEach(async () => {
  vi.clearAllMocks();
  await condiviso.svuota();
  // `deposito` non è usato dall'hook: sta qui solo a documentare che
  // l'implementazione vera (`depositoMemoria`) è la stessa che l'hook riceve.
  expect(typeof deposito.aggiungi).toBe("function");
});

describe("al montaggio", () => {
  it("rigioca ciò che era rimasto da ieri e lo toglie dalla coda", async () => {
    // Nessun evento `online` arriverà mai per questa coda: il browser è
    // partito già connesso. Se il drenaggio dipendesse solo dall'evento, la
    // coda resterebbe lì per sempre.
    await semina();
    const { view, rawDispatch } = monta();

    await waitFor(() => expect(TasksAPI.update).toHaveBeenCalledTimes(1));
    expect(TasksAPI.update.mock.calls[0]).toEqual([uuid(1), { status: "done" }]);
    await waitFor(() => expect(view.result.current.inAttesa).toBe(0));
    expect(await condiviso.tutte()).toEqual([]);
    expect(toastDi(rawDispatch, "success").length).toBe(1);
  });

  it("rispetta l'ordine di inserimento", async () => {
    await semina({ azione: { type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "inprogress" } } });
    await semina({ azione: { type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } } });
    monta();

    await waitFor(() => expect(TasksAPI.update).toHaveBeenCalledTimes(2));
    expect(TasksAPI.update.mock.calls.map(([, patch]) => patch.status)).toEqual(["inprogress", "done"]);
  });

  it("non tocca le voci di un altro utente", async () => {
    await semina({ uid: "u2" });
    monta();
    await waitFor(async () => expect((await condiviso.tutte()).length).toBe(1));
    expect(TasksAPI.update).not.toHaveBeenCalled();
  });
});

describe("al ritorno della rete", () => {
  it("aspetta l'evento `online` e allora parte", async () => {
    // È il caso per cui la coda esiste: il furgone esce dalla galleria.
    const originale = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    await semina();
    const { view } = monta();

    // Montato da offline: nessuna scrittura parte, e la striscia deve poter
    // dire che c'è una modifica in attesa.
    await waitFor(() => expect(view.result.current.inAttesa).toBe(1));
    expect(TasksAPI.update).not.toHaveBeenCalled();

    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    await act(async () => { window.dispatchEvent(new Event("online")); });

    await waitFor(() => expect(TasksAPI.update).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.inAttesa).toBe(0));
    if (originale) Object.defineProperty(window.navigator, "onLine", originale);
  });
});

describe("quando la rete cade di nuovo a metà coda", () => {
  it("si ferma e lascia dentro quella fallita E quelle dopo", async () => {
    await semina({ azione: { type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "inprogress" } } });
    await semina({ azione: { type: "MOVE_TASK", payload: { taskId: uuid(2), newStatus: "done" } } });
    TasksAPI.update
      .mockImplementationOnce(() => Promise.resolve({ error: null }))
      .mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));

    const { view, rawDispatch } = monta();

    await waitFor(() => expect(TasksAPI.update).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.result.current.inAttesa).toBe(1));
    // La prima è passata ed è uscita, la seconda è ancora lì: nessun toast
    // rosso, perché non è stato perso niente.
    expect(toastDi(rawDispatch, "error")).toEqual([]);
  });
});

describe("quando il server rifiuta davvero", () => {
  it("toglie la voce, compensa lo stato e lo dice", async () => {
    TasksAPI.update.mockImplementationOnce(
      () => Promise.resolve({ error: { code: "42501", message: "row-level security" } }));
    await semina();
    const { view, rawDispatch } = monta();

    await waitFor(() => expect(view.result.current.inAttesa).toBe(0));
    expect(await condiviso.tutte()).toEqual([]);
    // Una voce rigiocata all'infinito su un rifiuto che non cambierà mai è il
    // difetto peggiore della coda: sparisce, e l'utente lo sa.
    expect(toastDi(rawDispatch, "error").length).toBe(1);
    const compensazioni = rawDispatch.mock.calls
      .map(([a]) => a)
      .filter(a => a.meta?.compensazione);
    expect(compensazioni.length).toBe(1);
    // `compensazione` per la stessa ragione di useSyncedDispatch: il case del
    // reducer non deve accodare il proprio toast di successo accanto
    // all'errore che stiamo mostrando.
    expect(compensazioni[0].type).toBe("MOVE_TASK");
  });

  it("e dopo un reload non compensa niente, perché non c'è niente da compensare", async () => {
    // Lo stato viene dal server: la riga ottimistica non esiste più, quindi il
    // rollback dell'entry non produce alcuna azione. Resta il toast, che è
    // l'unica cosa che l'utente deve ancora sapere.
    TasksAPI.update.mockImplementationOnce(
      () => Promise.resolve({ error: { code: "42501", message: "row-level security" } }));
    await semina();
    const { view, rawDispatch } = monta(STATO_DOPO_RELOAD);

    await waitFor(() => expect(view.result.current.inAttesa).toBe(0));
    expect(rawDispatch.mock.calls.map(([a]) => a).filter(a => a.meta?.compensazione)).toEqual([]);
    expect(toastDi(rawDispatch, "error").length).toBe(1);
  });

  it("ma legge 23505 come «l'avevo già scritta io»", async () => {
    // La rete è caduta DOPO che la richiesta era partita: la riga sul server
    // c'è già, con il nostro id. Non è un errore, è la conferma tardiva.
    TasksAPI.update.mockImplementationOnce(() => Promise.resolve({ error: { code: "23505" } }));
    await semina();
    const { view, rawDispatch } = monta();

    await waitFor(() => expect(view.result.current.inAttesa).toBe(0));
    expect(toastDi(rawDispatch, "error")).toEqual([]);
    expect(toastDi(rawDispatch, "success").length).toBe(1);
  });
});
