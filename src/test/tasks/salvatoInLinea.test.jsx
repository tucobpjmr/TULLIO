// B-6 dell'analisi del 4 novembre · «Salvato ✓» accanto al campo, non un toast.
//
// Ogni campo lasciato nel pannello task accodava «Task aggiornato!»: dieci
// campi, dieci toast, e quelli delle azioni vere (swipe, cestino — gli unici
// con «Annulla») uscivano dalla pila. Ora il toast resta alle azioni esplicite
// e la modifica di un campo si conferma dove l'utente sta guardando.
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";
import { reducer, makeInitialState } from "../../state/reducer.js";

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
const { DURATA_SALVATO_MS } = await import("../../components/tasks/useCampiSalvati.js");

const TASK = {
  id: "t1", title: "Voli Tokyo", category: "booking", priority: "medium",
  status: "todo", assignees: ["marco"], comments: [], client: null,
  praticaRef: null, contact: null, description: "Testo originale", dueDate: null,
};

const monta = (dispatch) =>
  renderWithAppData(<TaskSlideOver task={TASK} />, { ...DEMO_APP_CTX, dispatch });

// L'etichetta del campo e la sua regione «Salvato ✓» stanno nello stesso nodo.
const etichetta = (testo) => screen.getByText(testo, { exact: false, selector: "div" });
const salvatoAccanto = (testo) => within(etichetta(testo)).getByRole("status").textContent;

afterEach(() => { vi.useRealTimers(); });

describe("B-6 · reducer: il toast è per le azioni esplicite", () => {
  const TEAM = [{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }];
  const stato = () => ({
    ...makeInitialState({ team: TEAM, currentUserId: "marco" }),
    tasks: [{ ...TASK, assignees: ["marco"] }],
  });

  it("UPDATE_TASK da un campo (`daCampo`) aggiorna la riga senza toast", () => {
    const s = reducer(stato(), { type: "UPDATE_TASK", payload: { id: "t1", priority: "high" }, daCampo: true });
    expect(s.tasks[0].priority).toBe("high");
    expect(s.toasts).toEqual([]);
  });

  it("controllo positivo: senza `daCampo` (riapri, ripristina) il toast c'è", () => {
    const s = reducer(stato(), { type: "UPDATE_TASK", payload: { id: "t1", status: "inprogress" } });
    expect(s.toasts.map((t) => t.message)).toEqual(["Task aggiornato!"]);
  });

  it("lo swipe tiene il suo toast con «Annulla»", () => {
    const s = reducer(stato(), { type: "UPDATE_TASK", payload: { id: "t1", assignees: [] }, swipe: true, toastMessage: "Fatto" });
    expect(s.toasts).toMatchObject([{ message: "Fatto", undoable: true }]);
  });
});

describe("B-6 · TaskSlideOver: «Salvato ✓» accanto al campo", () => {
  it("cambiare la priorità dispatcha `daCampo` e accende «Salvato ✓» solo lì", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    expect(salvatoAccanto("PRIORITÀ")).toBe("");

    const select = within(etichetta("PRIORITÀ").parentElement).getByRole("combobox");
    await act(async () => { fireEvent.change(select, { target: { value: "high" } }); });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "UPDATE_TASK", payload: { id: "t1", priority: "high" }, daCampo: true,
    }));
    expect(salvatoAccanto("PRIORITÀ")).toBe("Salvato ✓");
    expect(salvatoAccanto("CATEGORIA")).toBe("");
  });

  it("un campo testo si conferma al blur", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const campo = screen.getByPlaceholderText("es. PR-2026-001");
    await act(async () => {
      fireEvent.change(campo, { target: { value: "PR-1" } });
      fireEvent.blur(campo);
    });
    expect(salvatoAccanto("N° PRATICA")).toBe("Salvato ✓");
  });

  it("un salvataggio fallito NON dice «Salvato»", async () => {
    const dispatch = vi.fn(async () => ({ error: { message: "rifiutato" } }));
    monta(dispatch);
    const select = within(etichetta("PRIORITÀ").parentElement).getByRole("combobox");
    await act(async () => { fireEvent.change(select, { target: { value: "high" } }); });
    expect(salvatoAccanto("PRIORITÀ")).toBe("");
  });

  it("l'indicatore si spegne da solo", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const select = within(etichetta("PRIORITÀ").parentElement).getByRole("combobox");
    await act(async () => { fireEvent.change(select, { target: { value: "high" } }); });
    expect(salvatoAccanto("PRIORITÀ")).toBe("Salvato ✓");

    await act(async () => { await vi.advanceTimersByTimeAsync(DURATA_SALVATO_MS); });
    expect(salvatoAccanto("PRIORITÀ")).toBe("");
  });
});
