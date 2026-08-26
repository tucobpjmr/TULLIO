import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di clientContactInheritance.test.jsx) — BulkTaskCreator importa TaskFiles
// per gli allegati di riga, non esercitati da questo test.
vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");

// Ogni riga della modalità manuale ha una descrizione facoltativa: prima le
// task create in blocco nascevano sempre con description vuota, e l'unico
// modo per aggiungerla era riaprirle una per una.

const openManualTab = () => fireEvent.click(screen.getByText("Manuale"));

const firstTitle = () => screen.getAllByPlaceholderText("Titolo task...")[0];
const firstDescription = () => screen.getAllByPlaceholderText("Descrizione (facoltativa)…")[0];

describe("BulkTaskCreator — descrizione di riga", () => {
  it("porta la descrizione della riga nella task creata, ripulita dagli spazi", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(firstTitle(), { target: { value: "Prenotare volo" } });
    fireEvent.change(firstDescription(), { target: { value: "  Andata 12/08, ritorno aperto  " } });
    fireEvent.click(screen.getByText(/Crea 1 task/));

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toBe("Andata 12/08, ritorno aperto");
  });

  it("lascia la descrizione vuota se non viene compilata", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(firstTitle(), { target: { value: "Senza dettagli" } });
    fireEvent.click(screen.getByText(/Crea 1 task/));

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks[0].description).toBe("");
  });

  // Una riga con la sola descrizione non ha titolo, quindi verrebbe scartata:
  // deve rientrare fra quelle segnalate, altrimenti il testo sparirebbe senza
  // che l'operatore se ne accorga.
  it("segnala come ignorata una riga in cui è stata scritta solo la descrizione", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(firstDescription(), { target: { value: "Dettagli senza titolo" } });

    expect(screen.getByText(/1 riga senza titolo verrà ignorata/)).toBeInTheDocument();
  });
});
