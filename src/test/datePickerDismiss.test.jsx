import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di bulkCommonDueDate.test.jsx) — serve solo al test d'integrazione col bulk.
vi.mock("../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { DateTimePicker } = await import("../components/ui/DateTimePicker.jsx");
const { BulkTaskCreator } = await import("../components/modals/BulkTaskCreator.jsx");

// Chiudere il pannello senza premere "OK" (click fuori, Escape, backdrop su
// mobile) scartava in silenzio il giorno appena scelto — che nel frattempo
// resta evidenziato in navy, quindi sembra impostato. Nel BulkTaskCreator,
// dove si passa da un campo all'altro senza confermare, le task finivano sul
// DB con due_date NULL: è il bug "la data inserita nella task non persiste".
// Ora l'abbandono APPLICA la scelta; solo "Cancella" azzera.

// Il giorno `day` del mese corrente alle 09:00 locali (ora di default).
const expectedIso = (day) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0, 0).toISOString();
};

// I giorni 15..22 sono gli unici che nessun mese mostra anche come coda del
// mese precedente o testa del successivo → nessuna ambiguità nella griglia.
const pickDay = (day) => fireEvent.click(screen.getByRole("button", { name: String(day) }));
const openPicker = (trigger) => fireEvent.click(trigger);

describe("DateTimePicker — chiusura senza OK", () => {
  it("applica il giorno scelto quando si clicca fuori dal pannello", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={null} onChange={onChange} />);

    openPicker(screen.getByText("gg/mm/aaaa --:--"));
    pickDay(20);
    fireEvent.mouseDown(document.body);

    expect(onChange).toHaveBeenCalledWith(expectedIso(20));
  });

  it("applica il giorno scelto anche uscendo con Escape", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={null} onChange={onChange} />);

    openPicker(screen.getByText("gg/mm/aaaa --:--"));
    pickDay(18);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onChange).toHaveBeenCalledWith(expectedIso(18));
  });

  it("non azzera una data esistente se si chiude senza toccare nulla", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={expectedIso(15)} onChange={onChange} />);

    openPicker(screen.getByText(/15\//));
    fireEvent.mouseDown(document.body);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("non inventa una data se si chiude senza averne scelta una", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={null} onChange={onChange} />);

    openPicker(screen.getByText("gg/mm/aaaa --:--"));
    fireEvent.mouseDown(document.body);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("'Cancella' resta l'unico modo per togliere la data", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={expectedIso(15)} onChange={onChange} />);

    openPicker(screen.getByText(/15\//));
    fireEvent.click(screen.getByText("Cancella"));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("'OK' senza giorno scelto continua ad azzerare la data", () => {
    const onChange = vi.fn();
    render(<DateTimePicker value={null} onChange={onChange} />);

    openPicker(screen.getByText("gg/mm/aaaa --:--"));
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe("BulkTaskCreator — scadenza di riga scelta senza confermare", () => {
  it("finisce comunque sulla task creata", async () => {
    const onCreate = vi.fn(async () => ({ error: null }));
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Manuale"));

    // Trigger dei picker in ordine di DOM: [0] scadenza comune, [1] prima riga.
    const triggers = screen.getAllByText("gg/mm/aaaa --:--");
    openPicker(triggers[1]);
    const panel = triggers[1].closest("div").parentElement;
    fireEvent.click(within(panel).getByRole("button", { name: "20" }));
    // L'operatore passa direttamente al campo titolo senza premere "OK".
    fireEvent.mouseDown(document.body);

    fireEvent.change(screen.getAllByPlaceholderText("Titolo task...")[0], {
      target: { value: "Transfer aeroporto" },
    });
    fireEvent.click(screen.getByText(/Crea 1 task/));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const [tasks] = onCreate.mock.calls[0];
    expect(tasks[0].dueDate).toBe(expectedIso(20));
  });
});
