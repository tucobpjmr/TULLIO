import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);

// Mock di api.js per non istanziare il client Supabase reale e per verificare
// su quali task finiscono gli allegati.
const upload = vi.fn(async () => ({ error: null }));
vi.mock("../../lib/api.js", () => ({ TaskFiles: { upload } }));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");

// Gli allegati delle IMPOSTAZIONI COMUNI finiscono su ogni task creata, in
// aggiunta a quelli della singola riga.

const openManualTab = () => fireEvent.click(screen.getByText("Manuale"));
const titles = () => screen.getAllByPlaceholderText("Titolo task...");
const fileInput = (btn) => btn.parentElement.querySelector('input[type="file"]');

describe("BulkTaskCreator — allegati comuni", () => {
  it("carica l'allegato comune su ogni task, insieme a quelli di riga", async () => {
    const onCreate = vi.fn(async () => ({ error: null }));
    const onClose = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={onClose} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Uno" } });
    fireEvent.change(titles()[1], { target: { value: "Due" } });
    const comune = new File(["x"], "regolamento.pdf", { type: "application/pdf" });
    const proprio = new File(["x"], "voucher.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput(screen.getByTitle(/Allega file a tutte le task/)), { target: { files: [comune] } });
    fireEvent.change(fileInput(screen.getAllByTitle(/Allega file a questa task/)[0]), { target: { files: [proprio] } });

    expect(screen.getByText(/3 allegati/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Crea 2 task/));
    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const [tasks] = onCreate.mock.calls[0];
    const caricati = upload.mock.calls.map(([f, id]) => [f.name, id]);
    expect(caricati).toEqual([
      ["regolamento.pdf", tasks[0].id],
      ["voucher.pdf", tasks[0].id],
      ["regolamento.pdf", tasks[1].id],
    ]);
  });
});
