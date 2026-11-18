// A-3 dell'analisi UX del 15 novembre: Esc, ✕ e «Annulla» non buttano via un
// form compilato senza chiedere (hooks/useChiusuraProtetta.js).
import { describe, it, expect, vi } from "vitest";
import { render as renderBase, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmProvider } from "../../state/ConfirmContext.jsx";
import { BulkMovimentiModal } from "../../components/liste/modals/BulkMovimentiModal.jsx";
import { EditMovimentoModal } from "../../components/liste/modals/EditMovimentoModal.jsx";
import { ClienteModal } from "../../components/clients/ClienteModal.jsx";

const render = (ui) => renderBase(ui, { wrapper: ConfirmProvider });
const esc = () => fireEvent.keyDown(window, { key: "Escape" });

const movimento = {
  id: "m1", data_movimento: "2026-11-10", descrizione: "ROSSI MARIO",
  importo: 100, metodo: null, banca: null,
};

describe("chiusura protetta dei form", () => {
  it("un form vuoto si chiude subito con Esc", () => {
    const onClose = vi.fn();
    render(<BulkMovimentiModal onClose={onClose} onSave={{ run: vi.fn(), onError: vi.fn() }} />);
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Chiudere senza salvare?")).toBeNull();
  });

  it("con dati inseriti Esc chiede, e «Continua a modificare» li tiene", async () => {
    const onClose = vi.fn();
    render(<BulkMovimentiModal onClose={onClose} onSave={{ run: vi.fn(), onError: vi.fn() }} />);
    fireEvent.change(screen.getAllByLabelText("Descrizione del movimento")[0], { target: { value: "BIANCHI" } });
    esc();
    expect(await screen.findByText("Chiudere senza salvare?")).toBeTruthy();
    fireEvent.click(screen.getByText("Continua a modificare"));
    await waitFor(() => expect(screen.queryByText("Chiudere senza salvare?")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText("Descrizione del movimento")[0].value).toBe("BIANCHI");
  });

  it("«Chiudi senza salvare» chiude davvero", async () => {
    const onClose = vi.fn();
    render(<BulkMovimentiModal onClose={onClose} onSave={{ run: vi.fn(), onError: vi.fn() }} />);
    fireEvent.change(screen.getAllByLabelText("Importo del movimento")[0], { target: { value: "50" } });
    fireEvent.click(screen.getByText("Annulla"));
    fireEvent.click(await screen.findByText("Chiudi senza salvare"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("la modifica di un movimento conta come «sporca» solo se un valore cambia", async () => {
    const onClose = vi.fn();
    render(<EditMovimentoModal movimento={movimento} onClose={onClose} onSave={{ run: vi.fn(), onError: vi.fn() }} />);
    esc();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dopo un salvataggio riuscito non si chiede nulla", async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue({ error: null });
    render(<ClienteModal cliente={null} onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: "Famiglia Verdi" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Chiudere senza salvare?")).toBeNull();
  });

  it("un doppio «Annulla» apre UNA sola domanda", async () => {
    const onClose = vi.fn();
    render(<ClienteModal cliente={null} onSave={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: "X" } });
    fireEvent.click(screen.getByText("Annulla"));
    fireEvent.click(screen.getByText("Annulla"));
    expect(await screen.findAllByText("Chiudere senza salvare?")).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
