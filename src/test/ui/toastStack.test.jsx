// ToastStack/ToastItem: la coda di notifiche in basso allo schermo.
//
// Copre il contratto d'accessibilità (live region sempre montata, role
// alert/status) e quello temporale (gli errori non si auto-chiudono più,
// successi/warning sì) che erano i tre difetti del vecchio Toast monolitico.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToastStack } from "../../components/ui/Toast.jsx";
import { withDispatch } from "../helpers/appData.jsx";

describe("ToastStack", () => {
  it("con toasts vuoto il contenitore aria-live esiste comunque, senza toast visibili", () => {
    const { container } = render(withDispatch(<ToastStack toasts={[]} />));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toBeInTheDocument();
    expect(live.children.length).toBe(0);
  });

  it("un toast di tipo error ha role=alert e il bottone Chiudi notifica", () => {
    render(withDispatch(
      <ToastStack
        toasts={[{ id: "1", message: "errore grave", type: "error" }]}
      />,
    ));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chiudi notifica" })).toBeInTheDocument();
  });

  it("un toast di tipo success ha role=status", () => {
    render(withDispatch(
      <ToastStack
        toasts={[{ id: "1", message: "fatto!", type: "success" }]}
      />,
    ));
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("il click sul bottone ✕ dispatcha CLEAR_TOAST con l'id del toast", () => {
    const dispatch = vi.fn();
    render(withDispatch(
      <ToastStack
        toasts={[{ id: "abc-123", message: "errore", type: "error" }]}
      />,
      dispatch,
    ));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi notifica" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_TOAST", payload: "abc-123" });
  });

  it("un toast undoable mostra Annulla e il click dispatcha UNDO_LAST_ACTION", () => {
    const dispatch = vi.fn();
    render(withDispatch(
      <ToastStack
        toasts={[{ id: "1", message: "Task eliminato", type: "success", undoable: true }]}
      />,
      dispatch,
    ));
    const undoBtn = screen.getByRole("button", { name: /Annulla/ });
    fireEvent.click(undoBtn);
    expect(dispatch).toHaveBeenCalledWith({ type: "UNDO_LAST_ACTION" });
  });

  describe("auto-dismiss", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("un toast error NON si auto-chiude, nemmeno dopo un tempo lungo", () => {
      const dispatch = vi.fn();
      render(withDispatch(
        <ToastStack
          toasts={[{ id: "err-1", message: "errore RLS", type: "error" }]}
        />,
        dispatch,
      ));
      vi.advanceTimersByTime(10000);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("un toast success si auto-chiude dopo 3000ms", () => {
      const dispatch = vi.fn();
      render(withDispatch(
        <ToastStack
          toasts={[{ id: "ok-1", message: "fatto!", type: "success" }]}
        />,
        dispatch,
      ));
      vi.advanceTimersByTime(2999);
      expect(dispatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_TOAST", payload: "ok-1" });
    });

    it("un toast success undoable si auto-chiude dopo 5000ms (non 3000)", () => {
      const dispatch = vi.fn();
      render(withDispatch(
        <ToastStack
          toasts={[{ id: "ok-2", message: "eliminato", type: "success", undoable: true }]}
        />,
        dispatch,
      ));
      vi.advanceTimersByTime(3000);
      expect(dispatch).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_TOAST", payload: "ok-2" });
    });
  });

  it("con più toast in coda vengono renderizzati tutti", () => {
    render(withDispatch(
      <ToastStack
        toasts={[
          { id: "1", message: "primo messaggio", type: "success" },
          { id: "2", message: "secondo messaggio", type: "warning" },
          { id: "3", message: "terzo messaggio", type: "error" },
        ]}
      />,
    ));
    expect(screen.getByText("primo messaggio")).toBeInTheDocument();
    expect(screen.getByText("secondo messaggio")).toBeInTheDocument();
    expect(screen.getByText("terzo messaggio")).toBeInTheDocument();
  });

  // A-2 · il tetto visivo (MAX_A_SCHERMO) vive in ToastStack, non nella coda:
  // oltre tre toast, i più vecchi restano in coda e si contano invece di
  // sparire in silenzio.
  it("con più di tre toast ne mostra solo tre e conta gli altri", () => {
    render(withDispatch(
      <ToastStack
        toasts={[
          { id: "1", message: "Uno", type: "error" },
          { id: "2", message: "Due", type: "error" },
          { id: "3", message: "Tre", type: "error" },
          { id: "4", message: "Quattro", type: "error" },
          { id: "5", message: "Cinque", type: "error" },
        ]}
      />,
    ));
    expect(screen.queryByText("Uno")).not.toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    expect(screen.getByText("Tre")).toBeInTheDocument();
    expect(screen.getByText("Quattro")).toBeInTheDocument();
    expect(screen.getByText("Cinque")).toBeInTheDocument();
    expect(screen.getByText(/\+2 altri messaggi in coda/)).toBeInTheDocument();
  });

  it("con tre toast o meno non mostra il contatore", () => {
    render(withDispatch(
      <ToastStack
        toasts={[
          { id: "1", message: "Uno", type: "success" },
          { id: "2", message: "Due", type: "success" },
        ]}
      />,
    ));
    expect(screen.queryByText(/altri messaggi in coda/)).not.toBeInTheDocument();
  });

  it("un messaggio lungo non viene troncato: niente ellipsis, testo completo nel DOM", () => {
    const lungo = "new row violates row-level security policy for table \"prenotazioni\": controllare i permessi dell'utente corrente prima di riprovare l'operazione";
    render(withDispatch(
      <ToastStack
        toasts={[{ id: "1", message: lungo, type: "error" }]}
      />,
    ));
    const el = screen.getByText(lungo);
    expect(el).toBeInTheDocument();
    expect(el.style.textOverflow).not.toBe("ellipsis");
    expect(el.style.overflow).not.toBe("hidden");
  });
});
