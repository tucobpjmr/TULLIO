// B-2 dell'analisi del 14 novembre · Il reducer è puro: stessa azione, stesso
// stato.
//
// `applica` (hooks/useSyncedDispatch.js) esegue il reducer due volte per
// azione, una per React e una per il proprio ref. Con `Date.now()` e
// `Math.random()` dentro il reducer, le due copie avevano orari e id diversi.
// Ora l'istante e il seme arrivano con l'azione (state/istante.js).
import { describe, it, expect, vi } from "vitest";
import { useReducer } from "react";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/api.js", () => ({
  Tasks: { update: vi.fn(async () => ({ data: [{ id: "x" }], error: null })), leggi: vi.fn() },
  Comments: {}, Notices: {}, Users: {}, Clients: {}, Categories: {}, MessageTemplates: {},
}));

const { reducer, makeInitialState } = await import("../../state/reducer.js");
const { conIstante } = await import("../../state/istante.js");
const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");

const ID = "11111111-2222-4333-8444-555555555555";
const TEAM = [{ id: "agente1", name: "Sofia", role: "Senior Agent", active: true, pending: false }];
const stato = () => ({
  ...makeInitialState({ team: TEAM, currentUserId: "agente1" }),
  toasts: [],
  tasks: [{
    id: ID, title: "Volo", category: "booking", priority: "high", status: "todo",
    assignees: ["agente1"], deletedAt: null, completedAt: null, comments: [],
  }],
});
const COMPLETA = { type: "MOVE_TASK", payload: { taskId: ID, newStatus: "done" } };

describe("reducer con istante e seme sull'azione", () => {
  it("due giri sulla stessa azione danno lo stesso stato", () => {
    const azione = conIstante(COMPLETA);
    const s = stato();
    const a = reducer(s, azione);
    const b = reducer(s, azione);
    expect(a.tasks[0].completedAt).not.toBeNull();
    expect(b).toEqual(a);
  });

  it("completedAt, deletedAt, id dei toast e voce del log vengono dall'azione", () => {
    const ora = Date.UTC(2026, 10, 15, 9, 30);
    const s = stato();
    const fatto = reducer(s, { ...COMPLETA, meta: { ora, seme: "abc12" } });
    expect(fatto.tasks[0].completedAt).toBe(new Date(ora).toISOString());
    expect(fatto.toasts.at(-1).id).toBe(`${ora}-abc12-0`);
    expect(fatto.activityLog[0].time).toBe(new Date(ora).toISOString());

    const cestino = reducer(s, { type: "DELETE_TASK", payload: ID, meta: { ora, seme: "def34" } });
    expect(cestino.tasks[0].deletedAt).toBe(new Date(ora).toISOString());
  });

  // Controllo positivo: senza timbro il reducer ripiega sull'orologio, e due
  // giri divergono. Se smette di valere, il primo caso non prova più nulla.
  it("senza timbro due giri danno toast con id diversi", () => {
    const s = stato();
    const a = reducer(s, COMPLETA);
    const b = reducer(s, COMPLETA);
    expect(a.toasts.at(-1).id).not.toBe(b.toasts.at(-1).id);
  });
});

describe("applica: il ref e lo stato di React coincidono", () => {
  it("dopo un dispatch il ref vede lo stesso completedAt e gli stessi toast", async () => {
    const spia = vi.fn();
    const { result } = renderHook(() => {
      const [s, raw] = useReducer(reducer, stato());
      const rawDispatch = (a) => { spia(a); raw(a); };
      const dispatch = useSyncedDispatch(s, rawDispatch, { enabled: true });
      return { s, dispatch };
    });
    // Il ref è ciò che legge il dispatch successivo nello stesso handler:
    // rifare il reducer sull'azione timbrata deve dare lo stato di React.
    await act(async () => {
      await result.current.dispatch(COMPLETA);
    });
    const azione = spia.mock.calls[0][0];
    expect(azione.meta).toMatchObject({ ora: expect.any(Number), seme: expect.any(String) });
    const statoRef = reducer(stato(), azione);
    expect(result.current.s.tasks[0].completedAt).toBe(statoRef.tasks[0].completedAt);
    expect(result.current.s.toasts.map(t => t.id)).toEqual(statoRef.toasts.map(t => t.id));
  });
});
