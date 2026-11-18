// Punto 8 dell'analisi del 15 novembre · le derivazioni dei task si calcolano
// una volta nel provider (state/TasksContext.jsx), non in ogni vista.
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  TasksProvider, derivaTask, useTaskAttivi, useTaskCestinati, useConteggiTaskAttivi,
} from "../../state/TasksContext.jsx";

const TASKS = [
  { id: "a", assignees: ["u1", "u2"], category: "volo" },
  { id: "b", assignees: ["u1"], category: "hotel" },
  { id: "c", assignees: ["u2"], category: "volo", deletedAt: "2026-11-18T10:00:00Z" },
  { id: "d", category: "volo" },
];

describe("derivaTask", () => {
  it("separa attivi e cestinati, e conta solo gli attivi", () => {
    const d = derivaTask(TASKS);
    expect(d.attivi.map((t) => t.id)).toEqual(["a", "b", "d"]);
    expect(d.cestinati.map((t) => t.id)).toEqual(["c"]);
    expect(Object.fromEntries(d.attiviPerAssegnatario)).toEqual({ u1: 2, u2: 1 });
    expect(Object.fromEntries(d.attiviPerCategoria)).toEqual({ volo: 2, hotel: 1 });
  });
});

describe("hook delle derivazioni", () => {
  const conTasks = (tasks) => ({ wrapper: ({ children }) => <TasksProvider tasks={tasks}>{children}</TasksProvider> });

  it("restituiscono lo STESSO array finché `tasks` non cambia", () => {
    const { result, rerender } = renderHook(() => useTaskAttivi(), conTasks(TASKS));
    const primo = result.current;
    rerender();
    expect(result.current).toBe(primo);
  });

  it("cestinati e conteggi arrivano dal provider", () => {
    const { result } = renderHook(
      () => ({ cestinati: useTaskCestinati(), conteggi: useConteggiTaskAttivi() }), conTasks(TASKS));
    expect(result.current.cestinati.map((t) => t.id)).toEqual(["c"]);
    expect(result.current.conteggi.perAssegnatario.get("u1")).toBe(2);
    expect(result.current.conteggi.perCategoria.get("hotel")).toBe(1);
  });

  it("fuori dal provider sollevano, come useTasks", () => {
    expect(() => renderHook(() => useTaskAttivi())).toThrow(/TasksProvider/);
  });
});
