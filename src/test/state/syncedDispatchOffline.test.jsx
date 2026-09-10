// useSyncedDispatch × coda offline — M-2 dell'audit del 10 settembre.
//
// La domanda che questo file tiene ferma è UNA: cosa distingue «il server ha
// detto no» da «la rete non c'era». Prima non li distingueva nessuno, ed
// entrambi finivano nello stesso percorso — rollback dello stato ottimistico e
// toast rosso — cioè il lavoro dell'utente buttato via anche quando nessuno
// l'aveva rifiutato.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");
const { makeInitialState } = await import("../../state/reducer.js");
const { Tasks: TasksAPI, Clients: ClientsAPI } = await import("../../lib/api.js");

const TEAM = [{ id: "admin1", name: "Admin", role: "Admin", active: true, pending: false }];
const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;
const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["admin1"], comments: [], ...over,
});
const cliente = (over = {}) => ({ id: uuid(2), name: "Rossi", ...over });

// L'errore con cui `fetch` rifiuta quando il pacchetto non parte: nessun
// codice, nessuna risposta, solo un TypeError.
const RETE_ASSENTE = () => Promise.reject(new TypeError("Failed to fetch"));

function setup({ coda, tasks = [task()], clients = [cliente()] } = {}) {
  const rawDispatch = vi.fn();
  const state = {
    ...makeInitialState({ team: TEAM, currentUserId: "admin1" }),
    tasks, clients, toasts: [],
  };
  const view = renderHook(() => useSyncedDispatch(state, rawDispatch, { enabled: true, coda }));
  return { dispatch: view.result.current, rawDispatch };
}

const codaFinta = (accodata = true) => ({
  accoda: vi.fn(async () => accodata),
  drena: vi.fn(async () => {}),
  persistente: true,
});

const tipiDispatchati = (rawDispatch) => rawDispatch.mock.calls.map(([a]) => a.type);
const toastDiErrore = (rawDispatch) => rawDispatch.mock.calls
  .map(([a]) => a)
  .filter(a => a.type === "SHOW_TOAST" && a.payload?.type === "error");

beforeEach(() => { vi.clearAllMocks(); });

describe("scrittura persa per assenza di rete, su una entry accodabile", () => {
  it("finisce in coda invece di essere annullata", async () => {
    TasksAPI.update.mockImplementationOnce(RETE_ASSENTE);
    const coda = codaFinta();
    const { dispatch, rawDispatch } = setup({ coda });

    await act(async () => {
      await dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } });
    });

    expect(coda.accoda).toHaveBeenCalledTimes(1);
    const accodato = coda.accoda.mock.calls[0][0];
    expect(accodato.tipo).toBe("MOVE_TASK");
    // L'azione accodata è quella NORMALIZZATA, cioè la stessa applicata allo
    // stato locale: rigiocare l'originale rischierebbe di scrivere sul server
    // un id diverso da quello che l'utente ha già a schermo.
    expect(accodato.azione.payload).toEqual({ taskId: uuid(1), newStatus: "done" });
    // Niente rollback: lo stato ottimistico è la verità che l'utente sta
    // guardando, e la coda la manterrà.
    expect(tipiDispatchati(rawDispatch)).not.toContain("RETRACT_TOASTS");
    expect(toastDiErrore(rawDispatch)).toEqual([]);
  });

  it("risponde SUCCESSO, perché è il valore di ritorno a chiudere le form", async () => {
    // A-1 dell'audit del 4 settembre: `useSalvataggio` decide dal valore di
    // ritorno se chiudere la modale. Una modifica accodata è stata accettata —
    // tenere aperta la form butterebbe via ciò che l'utente ha appena scritto.
    TasksAPI.update.mockImplementationOnce(RETE_ASSENTE);
    const { dispatch } = setup({ coda: codaFinta() });

    let esito;
    await act(async () => {
      esito = await dispatch({ type: "UPDATE_TASK", payload: task({ title: "Nuovo titolo" }) });
    });
    expect(esito).toEqual({ error: null });
  });

  it("ma se la coda NON accetta torna al rollback: niente promesse a vuoto", async () => {
    // Coda piena, o IndexedDB non disponibile. Dire all'utente che è tutto a
    // posto quando la scrittura non è da nessuna parte sarebbe peggio del
    // toast rosso.
    TasksAPI.update.mockImplementationOnce(RETE_ASSENTE);
    const coda = codaFinta(false);
    const { dispatch, rawDispatch } = setup({ coda });

    let esito;
    await act(async () => {
      esito = await dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } });
    });

    expect(coda.accoda).toHaveBeenCalledTimes(1);
    expect(esito.error).toBeTruthy();
    expect(tipiDispatchati(rawDispatch)).toContain("RETRACT_TOASTS");
    expect(toastDiErrore(rawDispatch).length).toBe(1);
  });
});

describe("cosa NON finisce in coda", () => {
  it("un rifiuto del server: rigiocarlo darebbe lo stesso esito per sempre", async () => {
    TasksAPI.update.mockImplementationOnce(
      () => Promise.resolve({ error: { code: "42501", message: "row-level security" } }));
    const coda = codaFinta();
    const { dispatch, rawDispatch } = setup({ coda });

    await act(async () => {
      await dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } });
    });

    expect(coda.accoda).not.toHaveBeenCalled();
    expect(toastDiErrore(rawDispatch).length).toBe(1);
  });

  it("una entry senza `offline: true`, anche se il guasto è di rete", async () => {
    // L'anagrafica non dichiara `offline`: nessuno la modifica da un furgone,
    // e il criterio sta in state/persistence.js. Comportamento invariato.
    ClientsAPI.update.mockImplementationOnce(RETE_ASSENTE);
    const coda = codaFinta();
    const { dispatch, rawDispatch } = setup({ coda });

    await act(async () => {
      await dispatch({ type: "UPDATE_CLIENT", payload: cliente({ name: "Bianchi" }) });
    });

    expect(coda.accoda).not.toHaveBeenCalled();
    expect(toastDiErrore(rawDispatch).length).toBe(1);
  });

  it("niente, se la coda non c'è: la modalità demo resta com'era", async () => {
    TasksAPI.update.mockImplementationOnce(RETE_ASSENTE);
    const { dispatch, rawDispatch } = setup({ coda: null });

    let esito;
    await act(async () => {
      esito = await dispatch({ type: "MOVE_TASK", payload: { taskId: uuid(1), newStatus: "done" } });
    });
    expect(esito.error).toBeTruthy();
    expect(toastDiErrore(rawDispatch).length).toBe(1);
  });
});
