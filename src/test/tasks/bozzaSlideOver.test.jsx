// A-2 dell'audit del 4 novembre · la bozza del pannello task.
//
// La bozza dei campi testo si riallineava solo all'apertura di un task diverso.
// Se intanto un collega cambiava un campo (arriva via realtime nel `task`), la
// bozza restava col valore vecchio: bastava entrare e uscire dal campo perché
// il commit al blur RISCRIVESSE il vecchio valore sopra quello del collega,
// senza nessun avviso. Qui il realtime si simula con un `rerender` dello
// stesso task con un campo cambiato, che è esattamente ciò che arriva al
// pannello quando MERGE_TASK_ROW aggiorna `selectedTask`.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// Stessa forma di contratti/salvaEChiudi.test.jsx: lo slide-over monta
// allegati e cronologia, che qui servono solo a non sollevare.
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

const monta = (dispatch, task = TASK) => {
  const ctx = { ...DEMO_APP_CTX, dispatch };
  const utils = renderWithAppData(<TaskSlideOver task={task} />, ctx);
  return {
    // Ciò che il realtime fa al pannello: stesso task, un campo cambiato.
    aggiorna: (patch) => utils.rerender(<TaskSlideOver task={{ ...task, ...patch }} />, ctx),
    apri: (altro) => utils.rerender(<TaskSlideOver task={altro} />, ctx),
  };
};

const descrizione = () => screen.getByPlaceholderText("Dettagli del task…");
const aggiornamentiDi = (dispatch, campo) => dispatch.mock.calls
  .map(([azione]) => azione)
  .filter((a) => a.type === "UPDATE_TASK" && campo in a.payload);

const esci = async (el) => {
  await act(async () => { fireEvent.focus(el); fireEvent.blur(el); });
};

describe("TaskSlideOver — A-2, la bozza non cancella le modifiche dei colleghi", () => {
  it("un campo non toccato segue il valore arrivato dal realtime", () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { aggiorna } = monta(dispatch);

    aggiorna({ description: "Scritto dal collega" });

    expect(descrizione().value).toBe("Scritto dal collega");
  });

  it("entrare e uscire da un campo non toccato non riscrive il valore vecchio", async () => {
    // Il difetto: qui partiva UPDATE_TASK { description: "Testo originale" }.
    const dispatch = vi.fn(async () => ({ error: null }));
    const { aggiorna } = monta(dispatch);
    aggiorna({ description: "Scritto dal collega" });

    await esci(descrizione());

    expect(aggiornamentiDi(dispatch, "description")).toEqual([]);
  });

  it("il testo che si sta digitando resta, anche se il campo cambia da fuori", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { aggiorna } = monta(dispatch);

    fireEvent.change(descrizione(), { target: { value: "Il mio testo" } });
    aggiorna({ description: "Scritto dal collega", status: "inprogress" });
    expect(descrizione().value).toBe("Il mio testo");

    await esci(descrizione());
    expect(aggiornamentiDi(dispatch, "description")).toEqual([
      expect.objectContaining({ payload: { id: "t1", description: "Il mio testo" } }),
    ]);
  });

  it("dopo un salvataggio riuscito il campo torna a seguire il realtime", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { aggiorna } = monta(dispatch);

    fireEvent.change(descrizione(), { target: { value: "Il mio testo" } });
    await esci(descrizione());
    aggiorna({ description: "Il mio testo" });       // l'aggiornamento ottimistico
    aggiorna({ description: "Poi il collega" });     // e dopo, il collega

    expect(descrizione().value).toBe("Poi il collega");
  });

  it("salvataggio fallito: il testo resta nel campo e si ritenta al blur successivo", async () => {
    const dispatch = vi.fn(async () => ({ error: new Error("rete") }));
    const { aggiorna } = monta(dispatch);

    fireEvent.change(descrizione(), { target: { value: "Il mio testo" } });
    await esci(descrizione());
    // Il rollback riporta il task al valore di prima: la bozza NON lo segue,
    // altrimenti il testo scritto andrebbe perso.
    aggiorna({ description: "Testo originale", priority: "high" });
    expect(descrizione().value).toBe("Il mio testo");

    await esci(descrizione());
    expect(aggiornamentiDi(dispatch, "description")).toHaveLength(2);
  });

  it("ciò che si scrive mentre il salvataggio è in volo non viene dimenticato", async () => {
    let risolvi;
    const dispatch = vi.fn(() => new Promise((r) => { risolvi = r; }));
    monta(dispatch);

    fireEvent.change(descrizione(), { target: { value: "Prima parte" } });
    fireEvent.focus(descrizione());
    fireEvent.blur(descrizione());
    fireEvent.change(descrizione(), { target: { value: "Prima parte e seconda" } });
    await act(async () => { risolvi({ error: null }); });

    await esci(descrizione());
    expect(aggiornamentiDi(dispatch, "description").map((a) => a.payload.description))
      .toEqual(["Prima parte", "Prima parte e seconda"]);
  });

  it("aprire un altro task azzera i campi toccati", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { apri } = monta(dispatch);

    fireEvent.change(descrizione(), { target: { value: "Bozza del primo" } });
    apri({ ...TASK, id: "t2", description: "Descrizione del secondo" });
    expect(descrizione().value).toBe("Descrizione del secondo");

    await esci(descrizione());
    expect(aggiornamentiDi(dispatch, "description")).toEqual([]);
  });

  it("il titolo svuotato torna al valore corrente senza scrivere", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    monta(dispatch);
    const titolo = screen.getByPlaceholderText("Titolo del task");

    fireEvent.change(titolo, { target: { value: "   " } });
    await esci(titolo);

    expect(titolo.value).toBe("Voli Tokyo");
    expect(aggiornamentiDi(dispatch, "title")).toEqual([]);
  });
});
