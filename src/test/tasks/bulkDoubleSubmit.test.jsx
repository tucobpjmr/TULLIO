import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);

// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di bulkRowDescription.test.jsx) — BulkTaskCreator importa TaskFiles per gli
// allegati di riga, non esercitati da questo test.
vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");

// Due tap ravvicinati sullo stesso bottone "Crea" — prima di questa
// correzione ManualTab, DuplicateTab, ImportTab e TemplateTab tenevano il
// freno al doppio invio in `useState`, non in un ref: un secondo evento
// dispatchato PRIMA che React ri-renderizzasse il bottone disabilitato
// leggeva ancora `busy === false` e faceva partire un secondo batch
// identico (lo stesso difetto che hooks/useSalvataggio.js esiste per
// evitare in QuickAddTask/ClienteModal/TaskSlideOver). Qui i due click
// vengono dispatchati DENTRO lo stesso `act()`, cioè senza un render fra i
// due — è la sola forma in cui il vecchio bug si osservava.
describe("BulkTaskCreator — freno al doppio invio", () => {
  it("Manuale: due tap ravvicinati creano un solo batch", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Manuale"));

    fireEvent.change(screen.getAllByPlaceholderText("Titolo task...")[0], { target: { value: "Prenotare volo" } });

    act(() => {
      fireEvent.click(screen.getByText(/Crea 1 task/));
      fireEvent.click(screen.getByText(/Crea 1 task/));
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("Duplica: due tap ravvicinati creano un solo batch", () => {
    const onCreate = vi.fn();
    const existing = [{ id: "t1", title: "Volo Roma-Parigi", dueDate: null, category: "booking" }];
    render(<BulkTaskCreator existingTasks={existing} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Duplica"));
    fireEvent.click(screen.getByText("Volo Roma-Parigi"));

    act(() => {
      fireEvent.click(screen.getByText(/Crea 1 copie/));
      fireEvent.click(screen.getByText(/Crea 1 copie/));
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("Da template: due tap ravvicinati creano un solo batch", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Da template"));
    // Sceglie il primo template disponibile.
    fireEvent.click(screen.getByText("Evento corporate / Incentive"));

    // Imposta la data evento tramite il DateTimePicker (giorno 15, sempre nel
    // mese corrente indipendentemente da quando gira il test — stesso vincolo
    // di bulkCommonDueDate.test.jsx).
    const dataField = screen.getByText("DATA EVENTO *").parentElement;
    const trigger = within(dataField).getByRole("button");
    fireEvent.click(trigger);
    const panel = trigger.closest("div");
    fireEvent.click(within(panel).getByRole("button", { name: "15" }));
    fireEvent.click(within(panel).getByRole("button", { name: "OK" }));

    const footerTemplate = screen.getByText(/task pronti/).closest("div").parentElement;
    const bottoneCrea = within(footerTemplate).getByText(/^✓ Crea \d+ task$/);
    act(() => {
      fireEvent.click(bottoneCrea);
      fireEvent.click(bottoneCrea);
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
