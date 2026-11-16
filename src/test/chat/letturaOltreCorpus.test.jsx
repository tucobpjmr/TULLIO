// B-7 del 16 novembre · Una conversazione con soli non letti più vecchi del
// corpus si segna letta all'apertura: senza, il badge restava acceso per sempre.
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLetturaConversazione } from "../../components/chat/useLetturaConversazione.js";

const letto = { id: "m1", sender: "u2", readBy: ["u1"] };

const monta = (oltre) => {
  const commands = { markConversationRead: vi.fn() };
  const scrollRif = { current: null };
  renderHook(() => useLetturaConversazione({ convId: "c1", msgs: [letto], myId: "u1", commands, scrollRif, oltre }));
  return commands;
};

describe("useLetturaConversazione — non letti oltre il corpus", () => {
  it("corpus tutto letto ma non letti oltre: si segna letta", () => {
    expect(monta(3).markConversationRead).toHaveBeenCalledWith("c1");
  });

  it("niente da leggere né dentro né oltre: nessuna chiamata", () => {
    expect(monta(0).markConversationRead).not.toHaveBeenCalled();
  });
});
