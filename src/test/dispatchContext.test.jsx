// DispatchContext — M-2 dell'audit del 25 agosto.
//
// `dispatch` non è più una prop: cinquanta componenti lo dichiaravano fra le
// proprie, e per buona parte di loro era un pacco da consegnare al piano di
// sotto. Qui si fissano le tre proprietà su cui poggia quella scelta.
import { describe, it, expect, vi } from "vitest";
import { memo, useState } from "react";
import { render, screen, act } from "@testing-library/react";
import { DispatchProvider, useDispatch } from "../state/DispatchContext.jsx";

function Sonda() {
  const dispatch = useDispatch();
  return <button onClick={() => dispatch({ type: "PING" })}>invia</button>;
}

describe("useDispatch", () => {
  it("consegna il dispatch del provider", () => {
    const dispatch = vi.fn();
    render(<DispatchProvider dispatch={dispatch}><Sonda /></DispatchProvider>);
    act(() => { screen.getByText("invia").click(); });
    expect(dispatch).toHaveBeenCalledWith({ type: "PING" });
  });

  // Un no-op silenzioso al posto dell'errore darebbe un'interfaccia che sembra
  // funzionare e non scrive niente: il guasto peggiore possibile per una
  // funzione il cui unico scopo è cambiare lo stato.
  it("solleva fuori dal provider invece di degradare a no-op", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Sonda />)).toThrow(/DispatchProvider/);
    errSpy.mockRestore();
  });
});

// La ragione per cui questo context può esistere senza costare render: il
// value È la funzione, e `useSyncedDispatch` la tiene a identità stabile. Se un
// giorno il provider costruisse un oggetto attorno al dispatch — o se il
// dispatch tornasse a essere ricreato a ogni render — ogni consumatore
// memoizzato si sveglierebbe a ogni azione dell'app, ed è esattamente ciò che i
// sei provider di dominio esistono per evitare.
describe("il value non si muove", () => {
  let renderConsumatore = 0;
  const Consumatore = memo(function Consumatore() {
    useDispatch();
    renderConsumatore += 1;
    return <div data-testid="consumatore" />;
  });

  function Guscio() {
    const [tick, setTick] = useState(0);
    const [dispatch] = useState(() => vi.fn());
    return (
      <DispatchProvider dispatch={dispatch}>
        <button onClick={() => setTick((n) => n + 1)}>tick {tick}</button>
        <Consumatore />
      </DispatchProvider>
    );
  }

  it("un render del genitore non sveglia i consumatori memoizzati", () => {
    render(<Guscio />);
    expect(screen.getByTestId("consumatore")).toBeTruthy();
    const dopoMount = renderConsumatore;

    act(() => { screen.getByRole("button", { name: /tick/ }).click(); });
    act(() => { screen.getByRole("button", { name: /tick/ }).click(); });

    expect(renderConsumatore).toBe(dopoMount);
  });
});
