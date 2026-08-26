// src/test/presenceToggle.test.jsx
// M-1 dell'audit del 16 agosto — l'updater di setState resta PURO anche qui.
//
// `chatCommands.js` porta la regola scritta a lettere maiuscole (⛔ mai
// chiamate di rete dentro l'updater di `setState`) e un test che la blinda per
// la chat; `usePresence` faceva esattamente quella cosa nel toggle "Occupato":
// dentro `setMyBusy(prev => …)` c'erano una `UsersAPI.setPresence` e una
// seconda `setPresenceMap`. React 18 invoca gli updater DUE volte in
// StrictMode — di proposito, per rendere visibili proprio questi effetti
// collaterali — quindi un click partiva due volte.
//
// Il test monta l'hook dentro <StrictMode>, che è la condizione in cui il
// difetto si manifesta, e conta le scritture per click.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { renderHook, act, waitFor } from "@testing-library/react";

const setPresence = vi.fn(async () => ({ error: null }));
vi.mock("../../lib/api.js", () => ({
  Users: { setPresence: (...a) => setPresence(...a) },
  subscribeToTable: () => () => {},
  // A-3 · La presenza live passa da qui e non più da una UPDATE periodica:
  // qui basta una maniglia inerte, il canale ha i propri test in
  // `presenzaCanale.test.jsx`.
  subscribeToPresence: () => ({ track: () => {}, unsubscribe: () => {} }),
}));

const { usePresence } = await import("../../hooks/usePresence.js");

const wrapper = ({ children }) => <StrictMode>{children}</StrictMode>;
const TEAM = [{ id: "u1", name: "Marco" }];

beforeEach(() => { setPresence.mockClear(); });

describe("usePresence — toggle Occupato", () => {
  it("un click = UNA scrittura di presenza, anche in StrictMode", async () => {
    const { result } = renderHook(
      () => usePresence({ enabled: true, userId: "u1", team: TEAM }),
      { wrapper },
    );
    // La scrittura d'avvio è un'altra cosa: si conta da qui in avanti.
    await waitFor(() => expect(setPresence).toHaveBeenCalled());
    setPresence.mockClear();

    act(() => { result.current.toggleMyBusy(); });

    expect(setPresence).toHaveBeenCalledTimes(1);
    expect(setPresence).toHaveBeenCalledWith("u1", "busy");
    expect(result.current.myBusy).toBe(true);
  });

  it("il secondo click torna Online, sempre con una sola scrittura", async () => {
    const { result } = renderHook(
      () => usePresence({ enabled: true, userId: "u1", team: TEAM }),
      { wrapper },
    );
    await waitFor(() => expect(setPresence).toHaveBeenCalled());

    act(() => { result.current.toggleMyBusy(); });
    setPresence.mockClear();
    act(() => { result.current.toggleMyBusy(); });

    expect(setPresence).toHaveBeenCalledTimes(1);
    expect(setPresence).toHaveBeenCalledWith("u1", "online");
    expect(result.current.myBusy).toBe(false);
  });

  it("senza login non scrive nulla, ma il toggle resta usabile", async () => {
    const { result } = renderHook(
      () => usePresence({ enabled: false, userId: "u1", team: TEAM }),
      { wrapper },
    );
    act(() => { result.current.toggleMyBusy(); });

    expect(setPresence).not.toHaveBeenCalled();
    expect(result.current.myBusy).toBe(true);
  });
});
