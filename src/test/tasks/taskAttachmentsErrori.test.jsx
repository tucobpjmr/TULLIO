// B-2 dell'analisi UX del 15 novembre: caricando più file, ogni scarto o
// fallimento sovrascriveva il messaggio del precedente. Ora restano tutti.
import { describe, it, expect, vi } from "vitest";
import { fireEvent, act, screen } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const upload = vi.fn();
vi.mock("../../lib/api.js", () => ({
  TaskFiles: {
    listForTask: vi.fn(async () => ({ data: [], error: null })),
    upload: (...a) => upload(...a),
    remove: vi.fn(async () => ({ error: null })),
    getFileUrl: vi.fn(async () => ({ url: "", error: null })),
  },
}));

const { TaskAttachments } = await import("../../components/tasks/TaskAttachments.jsx");

const TASK = "11111111-2222-4333-8444-555555555555";
const file = (nome, size = 10) => {
  const f = new File(["x"], nome, { type: "application/pdf" });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("TaskAttachments — errori di più file", () => {
  it("mostra TUTTI gli errori, non solo l'ultimo", async () => {
    upload
      .mockResolvedValueOnce({ data: null, error: { code: "", message: "TypeError: Failed to fetch" } })
      .mockResolvedValueOnce({ data: { id: "ok", file_name: "ok.pdf", file_type: "application/pdf", file_size: 10 }, error: null });
    const { container } = renderWithAppData(<TaskAttachments taskId={TASK} editable />, DEMO_APP_CTX);
    const input = container.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("enorme.pdf", 60 * 1024 * 1024), file("rete.pdf"), file("ok.pdf")] } });
    });
    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/"enorme\.pdf" supera il limite/);
    expect(avviso.textContent).toMatch(/Upload di "rete\.pdf" fallito: connessione assente/);
    expect(avviso.textContent).not.toMatch(/ok\.pdf/);
  });
});
