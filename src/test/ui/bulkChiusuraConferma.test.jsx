import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);

vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");
const { Z } = await import("../../styles/tokens.js");

// Regressione: scelto un template la modale è «sporca», e Annulla/✕ aprono la
// conferma «Chiudere senza creare?». La conferma stava su z-index 1001 mentre
// BulkTaskCreator sta su 1101: compariva SOTTO la modale, invisibile e non
// cliccabile, e la pagina sembrava bloccata.
describe("BulkTaskCreator — chiusura con dati non salvati", () => {
  it("la conferma sta sopra la modale e permette di chiudere", async () => {
    const onClose = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText("Da template"));
    fireEvent.click(screen.getByText("Evento corporate / Incentive"));

    fireEvent.click(screen.getByLabelText("Chiudi"));

    const titolo = await screen.findByText("Chiudere senza creare?");
    const overlayConferma = titolo.closest('[role="dialog"]').parentElement;
    // Stesso layer della modale: a pari z-index vince il portale montato dopo,
    // cioè la conferma. Con il layer «modal» (1000) stava sotto.
    expect(Number(overlayConferma.style.zIndex)).toBeGreaterThanOrEqual(Z.modalFullBackdrop);

    fireEvent.click(screen.getByText("Chiudi e perdi"));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
