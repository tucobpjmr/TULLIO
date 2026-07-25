import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock di api.js per non istanziare il client Supabase reale e per verificare
// che gli allegati di riga finiscano sulla task giusta.
const upload = vi.fn(async () => ({ error: null }));
vi.mock("../lib/api.js", () => ({ TaskFiles: { upload } }));

const { BulkTaskCreator } = await import("../components/modals/BulkTaskCreator.jsx");
const { MAX_TASK_FILE_SIZE } = await import("../lib/fileUtils.js");

// Ogni riga della modalità manuale può portarsi dietro i propri allegati:
// prima l'unico modo per allegare un file era creare la task e riaprirla dal
// dettaglio, una per una.

const openManualTab = () => fireEvent.click(screen.getByText("Manuale"));
const titles = () => screen.getAllByPlaceholderText("Titolo task...");
const attachButtons = () => screen.getAllByTitle(/Allega file a questa task/);

// Un File con dimensione arbitraria: `size` è read-only sul File reale, quindi
// per i casi oltre limite la ridefiniamo.
const makeFile = (name, size = 10, type = "application/pdf") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const attachTo = (index, files) => {
  const input = attachButtons()[index].parentElement.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files } });
};

describe("BulkTaskCreator — allegati di riga", () => {
  beforeEach(() => upload.mockClear());

  it("carica gli allegati di ogni riga sulla task creata da quella riga", async () => {
    const onCreate = vi.fn(async () => ({ error: null }));
    const onClose = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={onClose} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Prenotare volo" } });
    fireEvent.change(titles()[1], { target: { value: "Emettere voucher" } });
    const volo = makeFile("biglietto.pdf");
    const voucher = makeFile("voucher.pdf");
    attachTo(0, [volo]);
    attachTo(1, [voucher]);

    fireEvent.click(screen.getByText(/Crea 2 task/));

    await waitFor(() => expect(onClose).toHaveBeenCalled());

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks).toHaveLength(2);
    expect(upload).toHaveBeenCalledTimes(2);
    // Ogni file sull'id della propria riga, non su quello della prima task.
    expect(upload.mock.calls[0][0]).toBe(volo);
    expect(upload.mock.calls[0][1]).toBe(tasks[0].id);
    expect(upload.mock.calls[1][0]).toBe(voucher);
    expect(upload.mock.calls[1][1]).toBe(tasks[1].id);
  });

  it("assegna alle task un id uuid, così l'upload colpisce la riga davvero creata", async () => {
    const onCreate = vi.fn(async () => ({ error: null }));
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Con allegato" } });
    attachTo(0, [makeFile("doc.pdf")]);
    fireEvent.click(screen.getByText(/Crea 1 task/));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    const [tasks] = onCreate.mock.calls[0];
    expect(tasks[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("scarta i file oltre il limite e lo dice, invece di farli fallire a task già create", () => {
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn()} onClose={vi.fn()} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Task" } });
    attachTo(0, [makeFile("enorme.zip", MAX_TASK_FILE_SIZE + 1)]);

    expect(screen.getByText(/supera il limite di/)).toBeInTheDocument();
    expect(screen.getByText(/1 task da creare$/)).toBeInTheDocument();
  });

  it("segnala come ignorata una riga con soli allegati e nessun titolo", () => {
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn()} onClose={vi.fn()} />);
    openManualTab();

    attachTo(0, [makeFile("orfano.pdf")]);

    expect(screen.getByText(/1 riga senza titolo verrà ignorata \(allegati compresi\)/)).toBeInTheDocument();
  });

  it("se un upload fallisce tiene aperto il modale e dice quale file è rimasto indietro", async () => {
    upload.mockResolvedValueOnce({ error: { message: "boom" } });
    const onClose = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn(async () => ({ error: null }))} onClose={onClose} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Prenotare volo" } });
    attachTo(0, [makeFile("biglietto.pdf")]);
    fireEvent.click(screen.getByText(/Crea 1 task/));

    await screen.findByText(/l'upload di "biglietto.pdf" su "Prenotare volo" è fallito/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("non tenta l'upload se la creazione delle task è fallita", async () => {
    const onClose = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn(async () => ({ error: { message: "no" } }))} onClose={onClose} />);
    openManualTab();

    fireEvent.change(titles()[0], { target: { value: "Task" } });
    attachTo(0, [makeFile("doc.pdf")]);
    fireEvent.click(screen.getByText(/Crea 1 task/));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(upload).not.toHaveBeenCalled();
  });
});
