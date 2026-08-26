// src/test/taskAttachmentsGuard.test.jsx
//
// A-1 · Il guard degli allegati sta nell'AZIONE, non solo nel render.
//
// Gli allegati sono l'unica scrittura dell'app che non passa dal registry di
// persistenza, e non è una dimenticanza: i file vivono nello storage e non nel
// reducer, per questo eslint.config.js esenta `TaskFiles` da
// VIETATE_ENTITA_DELLO_STATE. L'esenzione riguarda però DOVE vive il dato, non
// se la scrittura debba avere un guard: il registry ne mette uno in ogni entry
// (state/persistence.js), e qui non ce n'era nessuno — il permesso era
// espresso solo dal `{editable && …}` attorno alla dropzone e al cestino.
//
// ⚠️ ONESTÀ SU COSA QUESTI CASI PROVANO E COSA NO. Oggi gli handler non sono
// raggiungibili senza passare dal render, quindi il guard nell'azione NON
// chiude un percorso oggi percorribile: è difesa in profondità contro un
// secondo ingresso futuro verso la stessa scrittura (un drop globale, una
// scorciatoia, un test che chiama l'handler), che è esattamente come nascono
// questi difetti. Un caso che fingesse di esercitare l'handler «scavalcando il
// render» misurerebbe l'assenza della dropzone, non il guard.
//
// Quello che questi casi provano davvero, e che è ciò che regredisce: che con
// `editable={false}` nessuna scrittura verso `TaskFiles` parte, e che con
// `editable` vera la stessa identica interazione scrive. Se domani qualcuno
// togliesse il `{editable && …}` credendo che il guard nell'handler basti (o
// viceversa), uno dei due lati cade qui.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const listForTask = vi.fn(async () => ({ data: [], error: null }));
const upload = vi.fn(async () => ({ data: null, error: null }));
const remove = vi.fn(async () => ({ error: null }));
const getFileUrl = vi.fn(async () => ({ url: "https://esempio/x", error: null }));

vi.mock("../../lib/api.js", () => ({
  TaskFiles: { listForTask, upload, remove, getFileUrl },
}));

const { TaskAttachments } = await import("../../components/tasks/TaskAttachments.jsx");

const render = (ui) => renderWithAppData(ui, DEMO_APP_CTX);

const TASK_ID = "11111111-2222-4333-8444-555555555555";

const makeFile = (name = "doc.pdf") => new File(["x"], name, { type: "application/pdf" });

describe("TaskAttachments — il guard sta nell'azione", () => {
  beforeEach(() => {
    listForTask.mockClear(); upload.mockClear(); remove.mockClear();
  });

  it("con editable=false non disegna la dropzone", async () => {
    const { container } = render(<TaskAttachments taskId={TASK_ID} editable={false} />);
    await waitFor(() => expect(listForTask).toHaveBeenCalled());
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("con editable=true la stessa dropzone scrive davvero", async () => {
    const { container } = render(<TaskAttachments taskId={TASK_ID} editable />);
    await waitFor(() => expect(listForTask).toHaveBeenCalled());

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][1]).toBe(TASK_ID);
  });

  it("con editable=false non disegna il comando di eliminazione", async () => {
    listForTask.mockResolvedValueOnce({
      data: [{ id: "f1", file_name: "contratto.pdf", file_url: `${TASK_ID}/contratto.pdf`, file_type: "application/pdf" }],
      error: null,
    });
    const { queryByTitle, findByText } = render(<TaskAttachments taskId={TASK_ID} editable={false} />);
    await findByText("contratto.pdf");
    expect(queryByTitle("Elimina allegato")).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });
});
