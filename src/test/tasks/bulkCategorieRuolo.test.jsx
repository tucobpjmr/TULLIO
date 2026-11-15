// B-5 dell'analisi del 14 novembre · «Crea più task» e le categorie del ruolo.
//
// ManualTab partiva da "booking" fisso ed elencava tutte le categorie. Il
// pulsante «Crea più task» lo vede anche un driver, che può creare solo
// "transfer": la guardia di ADD_TASKS_BULK gli rifiutava il batch. Qui si
// verifica che la tab parta da una categoria che il ruolo può creare.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";
import { canCreateTaskCategory } from "../../lib/permissions.js";

vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");

const crea = (currentUserId) => {
  const onCreate = vi.fn();
  renderWithAppData(
    <BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />,
    { ...DEMO_APP_CTX, currentUserId },
  );
  fireEvent.click(screen.getByText("Manuale"));
  fireEvent.change(screen.getByLabelText("Titolo (comune a tutte le righe)"), { target: { value: "Navetta" } });
  fireEvent.click(screen.getByText(/Crea 3 task/));
  return onCreate.mock.calls[0][0];
};

describe("ManualTab — categoria di partenza per ruolo", () => {
  it("un driver parte da una categoria che può creare", () => {
    const tasks = crea("giulia");
    expect(tasks.every(t => t.category === "transfer")).toBe(true);
    expect(tasks.every(t => canCreateTaskCategory(DEMO_APP_CTX.team, t.category, "giulia"))).toBe(true);
  });

  it("un driver vede solo le categorie che può creare", () => {
    renderWithAppData(
      <BulkTaskCreator existingTasks={[]} onCreate={vi.fn()} onClose={vi.fn()} />,
      { ...DEMO_APP_CTX, currentUserId: "giulia" },
    );
    fireEvent.click(screen.getByText("Manuale"));
    const valori = [...document.querySelectorAll("option")].map(o => o.value);
    expect(valori).not.toContain("booking");
  });

  it("un agente parte ancora dalla prima categoria disponibile", () => {
    const tasks = crea("marco");
    expect(tasks[0].category).toBe(Object.keys(DEMO_APP_CTX.categories)[0]);
  });
});
