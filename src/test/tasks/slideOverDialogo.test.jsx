// M-4 dell'analisi UX del 15 novembre · il pannello task è un dialogo:
// ruolo, Esc che chiude, e — soprattutto — Esc che NON perde la bozza del
// campo in modifica (un input smontato non riceve `onBlur`).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";
import { _resetPilaModali, apriModale, chiudiModale } from "../../components/ui/pilaModali.js";

vi.mock("../../lib/api.js", () => ({
  TaskFiles: {
    upload: vi.fn(async () => ({ error: null })),
    listForTask: vi.fn(async () => ({ data: [], error: null })),
    getFileUrl: vi.fn(async () => ({ url: "", error: null })),
    remove: vi.fn(async () => ({ error: null })),
  },
  TaskThreads: { historyForTask: vi.fn(async () => ({ data: [], error: null })) },
  subscribeToTable: vi.fn(() => () => {}),
}));

const { TaskSlideOver } = await import("../../components/tasks/TaskSlideOver.jsx");

const TASK = {
  id: "t1", title: "Voli Tokyo", category: "booking", priority: "medium",
  status: "todo", assignees: ["marco"], comments: [], client: null,
  praticaRef: null, contact: null, description: "Testo originale", dueDate: null,
};

const monta = (dispatch) => renderWithAppData(<TaskSlideOver task={TASK} />, { ...DEMO_APP_CTX, dispatch });
const azioni = (dispatch) => dispatch.mock.calls.map(([a]) => a);
const esc = () => act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });

beforeEach(() => _resetPilaModali());

describe("TaskSlideOver come dialogo", () => {
  it("ha ruolo di dialogo modale con un nome", () => {
    monta(vi.fn(async () => ({ error: null })));
    const dialogo = screen.getByRole("dialog", { name: "Task: Voli Tokyo" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
  });

  it("Esc chiude il pannello", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    await esc();
    expect(azioni(dispatch)).toContainEqual({ type: "SET_SELECTED_TASK", payload: null });
  });

  it("Esc con un campo in modifica salva la bozza PRIMA di chiudere", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const campo = screen.getByPlaceholderText("Dettagli del task…");
    act(() => campo.focus());
    fireEvent.change(campo, { target: { value: "Scritto e mai uscito dal campo" } });
    await esc();
    const tipi = azioni(dispatch).map((a) => a.type);
    const salva = tipi.indexOf("UPDATE_TASK");
    const chiude = tipi.indexOf("SET_SELECTED_TASK");
    expect(salva).toBeGreaterThanOrEqual(0);
    expect(salva).toBeLessThan(chiude);
    expect(azioni(dispatch)[salva].payload).toMatchObject({ description: "Scritto e mai uscito dal campo" });
  });

  it("con un altro modale sopra, Esc non chiude il pannello", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const sopra = apriModale();
    await esc();
    chiudiModale(sopra);
    expect(azioni(dispatch).map((a) => a.type)).not.toContain("SET_SELECTED_TASK");
  });
  // B-1 dell'analisi UX del 15 novembre: il titolo svuotato non torna indietro in silenzio.
  it("svuotare il titolo lo ripristina e lo DICE, e il messaggio si spegne scrivendo", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const titolo = screen.getByLabelText("Titolo del task");
    act(() => titolo.focus());
    fireEvent.change(titolo, { target: { value: "   " } });
    await act(async () => { titolo.blur(); });
    expect(titolo.value).toBe("Voli Tokyo");
    expect(screen.getByRole("alert")).toHaveTextContent("Il titolo è obbligatorio");
    expect(titolo).toHaveAttribute("aria-invalid", "true");
    expect(azioni(dispatch).map((a) => a.type)).not.toContain("UPDATE_TASK");
    fireEvent.change(titolo, { target: { value: "Voli Osaka" } });
    expect(screen.queryByText(/Il titolo è obbligatorio/)).toBeNull();
  });
});
