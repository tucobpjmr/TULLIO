// C-1 dell'audit del 14 agosto (secondo passaggio): una scrittura respinta
// dalla RLS non mette nulla in `error` — la clausola USING di una policy non
// solleva un'eccezione, filtra le righe. Una UPDATE/DELETE mirata a UNA riga
// che la RLS nasconde ne tocca zero, e PostgREST risponde 2xx come per
// qualunque altra scrittura riuscita: `res.error` resta `null`.
//
// Il caso vivo verificato in produzione (835 clienti, 3 utenti `agent` su 7):
// un agent preme «Rimuovi» su una scheda cliente. `clients_delete` è
// riservata ad admin/manager, quindi la RLS non fa cancellare nulla — ma
// prima di questa correzione `useSyncedDispatch` vedeva `error: null` e
// concludeva "salvata": nessun rollback, nessun toast d'errore, il cliente
// resta nel database mentre lo schermo mostra "Cliente rimosso".
//
// Questo file verifica il meccanismo generale (`esito()` in
// useSyncedDispatch.js), non solo il caso clienti: una `persist` che risolve
// `{ error: null, count: 0 }` deve produrre rollback + toast d'errore quanto
// una che risolve `{ error: {...} }`, e una che risolve `count: 1` deve
// restare un successo — altrimenti il meccanismo romperebbe le scritture che
// funzionano.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReducer } from "react";
import { renderHook, act } from "@testing-library/react";

vi.mock("../lib/api.js", () => ({
  Tasks:      { create: vi.fn(), createMany: vi.fn(), update: vi.fn(), softDelete: vi.fn(), restore: vi.fn(), hardDelete: vi.fn() },
  Comments:   { create: vi.fn() },
  Notices:    { create: vi.fn(), update: vi.fn(), remove: vi.fn(), togglePin: vi.fn() },
  Users:      { approve: vi.fn(), deleteUser: vi.fn(), setActive: vi.fn(), updateProfile: vi.fn(), updateContact: vi.fn() },
  Clients:    { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  Categories: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const { useSyncedDispatch } = await import("../hooks/useSyncedDispatch.js");
const { reducer, makeInitialState } = await import("../state/reducer.js");
const { Clients: ClientsAPI } = await import("../lib/api.js");

const TEAM = [
  { id: "admin1", name: "Admin", role: "Admin", active: true, pending: false },
  { id: "agent1", name: "Agent", role: "Agent", active: true, pending: false },
];

const cliente = (over = {}) => ({
  id: "11111111-2222-4333-8444-555555555555", name: "Mario Rossi", ...over,
});

function montaApp({ uid = "admin1", clients = [] } = {}) {
  const view = renderHook(() => {
    const [state, raw] = useReducer(
      reducer, undefined, () => makeInitialState({ team: TEAM, currentUserId: uid }),
    );
    return { state, raw, dispatch: useSyncedDispatch(state, raw, { enabled: true }) };
  });
  act(() => { view.result.current.raw({ type: "SET_CLIENTS", payload: clients }); });
  return view;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("scrittura respinta dalla RLS senza `error` (RIFIUTO_RLS)", () => {
  it("DELETE_CLIENT con count:0 fa il rollback e mostra il toast d'errore", async () => {
    ClientsAPI.remove.mockResolvedValue({ data: null, error: null, count: 0 });
    const view = montaApp({ clients: [cliente()] });

    await act(async () => {
      await view.result.current.dispatch({ type: "DELETE_CLIENT", payload: cliente().id });
    });

    // Il rollback (RESTORE_CLIENT) rimette la scheda in lista: senza il
    // controllo su `count`, questo test fallirebbe perché il client restava
    // rimosso dallo stato ottimistico e nessun toast d'errore compariva.
    expect(view.result.current.state.clients).toHaveLength(1);
    expect(view.result.current.state.clients[0].id).toBe(cliente().id);
    expect(view.result.current.state.toasts.some(t => t.type === "error")).toBe(true);
  });

  it("DELETE_CLIENT con count:1 resta un successo: nessun rollback, nessun toast d'errore", async () => {
    ClientsAPI.remove.mockResolvedValue({ data: null, error: null, count: 1 });
    const view = montaApp({ clients: [cliente()] });

    await act(async () => {
      await view.result.current.dispatch({ type: "DELETE_CLIENT", payload: cliente().id });
    });

    expect(view.result.current.state.clients).toHaveLength(0);
    expect(view.result.current.state.toasts.some(t => t.type === "error")).toBe(false);
  });

  it("una risposta senza `count` (metodo non ancora migrato) non cambia comportamento: successo", async () => {
    ClientsAPI.remove.mockResolvedValue({ data: null, error: null });
    const view = montaApp({ clients: [cliente()] });

    await act(async () => {
      await view.result.current.dispatch({ type: "DELETE_CLIENT", payload: cliente().id });
    });

    expect(view.result.current.state.clients).toHaveLength(0);
    expect(view.result.current.state.toasts.some(t => t.type === "error")).toBe(false);
  });
});
