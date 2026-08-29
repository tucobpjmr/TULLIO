// src/test/tasks/taskAttachmentsCorse.test.jsx
//
// M-1 (audit del 28 agosto) · Le corse sono DUE, e questo pannello correva
// proprio la seconda.
//
// PERCHÉ ESISTE. `TaskAttachments` caricava con `useIsMounted()` come sola
// guardia: copre lo smontaggio — criticità #11, lo slide-over si chiude con un
// tap sull'overlay mentre la risposta dello storage è in volo — e NON il cambio
// di `taskId`. Che è precisamente ciò che succede qui: lo slide-over resta
// MONTATO passando da un task all'altro (`LazyPanel` gli passa `resetKey`, che
// riarma il boundary e non è una `key` React), ed è il percorso normale quando
// si aprono due notifiche di seguito.
//
// Il difetto non produce alcun errore ed è invisibile a chi guarda: con due
// `listForTask` in volo insieme vinceva quella che rispondeva per ultima, e gli
// allegati del task PRECEDENTE finivano sotto l'intestazione del nuovo con
// `caricando` già chiuso. Su un pannello che elenca allegati di una pratica,
// mostrare quelli di un'altra non è un dettaglio.
//
// ⚠️ I due casi qui sotto FALLISCONO sulla guardia di solo smontaggio: è il
// modo in cui questo difetto si presenta, e un test che passasse anche sul
// codice precedente non verificherebbe la correzione ma la sua assenza.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const listForTask = vi.fn(async () => ({ data: [], error: null }));

vi.mock("../../lib/api.js", () => ({
  TaskFiles: {
    listForTask: (...a) => listForTask(...a),
    upload: vi.fn(async () => ({ data: null, error: null })),
    remove: vi.fn(async () => ({ error: null })),
    getFileUrl: vi.fn(async () => ({ url: "https://esempio/x", error: null })),
  },
}));

const { TaskAttachments } = await import("../../components/tasks/TaskAttachments.jsx");

const TASK_A = "11111111-2222-4333-8444-555555555555";
const TASK_B = "99999999-8888-4777-8666-555555555555";

const allegato = (nome) => ({
  id: nome, file_name: nome, file_type: "application/pdf", file_size: 10,
});

const differita = () => {
  let risolvi;
  const promise = new Promise((res) => { risolvi = res; });
  return { promise, risolvi };
};

beforeEach(() => { listForTask.mockReset(); });

describe("TaskAttachments — la corsa sul cambio di taskId", () => {
  it("la risposta del task PRECEDENTE, se arriva per ultima, non sostituisce quella del nuovo", async () => {
    const lenta = differita();
    listForTask
      .mockImplementationOnce(() => lenta.promise)                                   // task A
      .mockImplementationOnce(async () => ({ data: [allegato("di-B.pdf")], error: null })); // task B

    const { rerender, queryByText, findByText } = renderWithAppData(
      <TaskAttachments taskId={TASK_A} editable={false} />, DEMO_APP_CTX);

    // Si passa al task B senza smontare il pannello: è l'apertura di una
    // seconda notifica mentre la prima sta ancora caricando.
    rerender(<TaskAttachments taskId={TASK_B} editable={false} />);
    expect(await findByText("di-B.pdf")).toBeTruthy();

    // E solo ORA risponde il task A. `useIsMounted()` la lascerebbe passare —
    // il componente è montato — ed è esattamente il difetto.
    await act(async () => {
      lenta.risolvi({ data: [allegato("di-A.pdf")], error: null });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(queryByText("di-A.pdf")).toBeNull();
    expect(queryByText("di-B.pdf")).toBeTruthy();
  });

  it("il conteggio in testata non è quello del task precedente mentre il nuovo carica", async () => {
    // L'elenco sotto dice già «Caricamento…», e il numero in testata lo
    // contraddiceva: «ALLEGATI (1)» sopra un pannello che sta caricando è il
    // conteggio della pratica di prima presentato come quello di questa.
    const lenta = differita();
    listForTask
      .mockImplementationOnce(async () => ({ data: [allegato("di-A.pdf")], error: null }))
      .mockImplementationOnce(() => lenta.promise);

    const { rerender, findByText, getByText, queryByText } = renderWithAppData(
      <TaskAttachments taskId={TASK_A} editable={false} />, DEMO_APP_CTX);
    expect(await findByText("di-A.pdf")).toBeTruthy();
    expect(getByText(/ALLEGATI \(1\)/)).toBeTruthy();

    rerender(<TaskAttachments taskId={TASK_B} editable={false} />);

    await waitFor(() => expect(queryByText("Caricamento…")).toBeTruthy());
    expect(queryByText(/ALLEGATI \(1\)/)).toBeNull();

    await act(async () => {
      lenta.risolvi({ data: [], error: null });
      await new Promise(r => setTimeout(r, 0));
    });
  });
});
