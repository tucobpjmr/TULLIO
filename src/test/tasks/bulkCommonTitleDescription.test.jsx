import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);

// Mock di api.js per non istanziare il client Supabase reale.
vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");

// Titolo e descrizione fra le IMPOSTAZIONI COMUNI: valgono per le righe che
// non ne hanno uno proprio, come categoria, priorità e scadenza.

const openManualTab = () => fireEvent.click(screen.getByText("Manuale"));
const commonTitle = () => screen.getByLabelText("Titolo (comune a tutte le righe)");
const commonDescription = () => screen.getByLabelText("Descrizione (comune a tutte le righe)");

describe("BulkTaskCreator — titolo e descrizione comuni", () => {
  it("con un titolo comune ogni riga diventa una task", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(commonTitle(), { target: { value: "Check-in" } });
    fireEvent.change(commonDescription(), { target: { value: "Inviare carta d'imbarco" } });
    fireEvent.click(screen.getByText(/Crea 3 task/));

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks).toHaveLength(3);
    expect(tasks.every(t => t.title === "Check-in")).toBe(true);
    expect(tasks.every(t => t.description === "Inviare carta d'imbarco")).toBe(true);
  });

  it("titolo e descrizione della riga hanno la precedenza su quelli comuni", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(commonTitle(), { target: { value: "Comune" } });
    fireEvent.change(commonDescription(), { target: { value: "Desc comune" } });
    // Con il titolo comune impostato il placeholder di riga lo mostra.
    const titles = screen.getAllByPlaceholderText("Comune (comune)");
    const descs = screen.getAllByPlaceholderText("Desc comune (comune)");
    fireEvent.change(titles[0], { target: { value: "Proprio" } });
    fireEvent.change(descs[0], { target: { value: "Desc propria" } });
    fireEvent.click(screen.getByText(/Crea 3 task/));

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks[0]).toMatchObject({ title: "Proprio", description: "Desc propria" });
    expect(tasks[1]).toMatchObject({ title: "Comune", description: "Desc comune" });
  });
});
