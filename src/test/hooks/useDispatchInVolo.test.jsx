// B-4 del 16 novembre · Il registro delle scritture in volo sta in un ref:
// marcare e smarcare non deve far ri-renderizzare chi possiede lo stato, e le
// azioni devono partire con l'istantanea del registro.
import { describe, it, expect } from "vitest";
import { useReducer } from "react";
import { renderHook, act } from "@testing-library/react";
import { useDispatchInVolo } from "../../hooks/useDispatchInVolo.js";
import { reducer, makeInitialState } from "../../state/reducer.js";

const TEAM = [{ id: "admin1", name: "Admin", role: "Admin", active: true, pending: false }];

function monta() {
  let render = 0;
  const view = renderHook(() => {
    render += 1;
    const [state, dispatchReact] = useReducer(
      reducer, undefined, () => makeInitialState({ team: TEAM, currentUserId: "admin1" }),
    );
    return { state, ...useDispatchInVolo(dispatchReact) };
  });
  return { view, render: () => render };
}

describe("useDispatchInVolo", () => {
  it("MARK/UNMARK non arrivano a React: nessun render", () => {
    const { view, render } = monta();
    const prima = render();
    act(() => { view.result.current.dispatch({ type: "MARK_PENDING_WRITE", payload: ["t1"] }); });
    act(() => { view.result.current.dispatch({ type: "UNMARK_PENDING_WRITE", payload: ["t1"] }); });
    expect(render()).toBe(prima);
    expect(view.result.current.leggiInVolo().size).toBe(0);
  });

  it("un SET_TASKS dopo la marcatura parte con l'istantanea e tiene la riga locale", () => {
    const { view } = monta();
    act(() => { view.result.current.dispatch({ type: "SET_TASKS", payload: [{ id: "t1", title: "locale", comments: [] }] }); });
    let consegnata;
    act(() => {
      view.result.current.dispatch({ type: "MARK_PENDING_WRITE", payload: ["t1"] });
      consegnata = view.result.current.dispatch({ type: "SET_TASKS", payload: [{ id: "t1", title: "server", comments: [] }] });
    });
    expect(consegnata.inVolo.get("t1")).toBe(1);
    expect(view.result.current.state.tasks[0].title).toBe("locale");
  });

  it("l'istantanea timbrata non cambia con le marcature successive", () => {
    const { view } = monta();
    let consegnata;
    act(() => {
      view.result.current.dispatch({ type: "MARK_PENDING_WRITE", payload: ["t1"] });
      consegnata = view.result.current.dispatch({ type: "SET_TASKS", payload: [] });
      view.result.current.dispatch({ type: "UNMARK_PENDING_WRITE", payload: ["t1"] });
    });
    expect(consegnata.inVolo.has("t1")).toBe(true);
    expect(view.result.current.leggiInVolo().has("t1")).toBe(false);
  });

  it("a registro vuoto l'azione parte così com'è", () => {
    const { view } = monta();
    const azione = { type: "SET_TASKS", payload: [] };
    let consegnata;
    act(() => { consegnata = view.result.current.dispatch(azione); });
    expect(consegnata).toBe(azione);
  });
});
