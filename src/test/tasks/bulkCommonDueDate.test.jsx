import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);


// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di clientContactInheritance.test.jsx) — BulkTaskCreator importa TaskFiles
// per gli allegati di riga, non esercitati da questo test.
vi.mock("../../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { BulkTaskCreator } = await import("../../components/tasks/bulk/BulkTaskCreator.jsx");
const { formatPickerValue } = await import("../../components/ui/DateTimePicker.jsx");

// La scadenza delle IMPOSTAZIONI COMUNI deve comportarsi come categoria,
// priorità e assegnatario: valere per le righe che non specificano una data
// propria, ed essere visibile nella riga come valore ereditato (prima la riga
// mostrava il generico "gg/mm/aaaa --:--", quindi non si capiva se la
// scadenza comune fosse davvero agganciata alle task).

const openManualTab = () => {
  fireEvent.click(screen.getByText("Manuale"));
};

// Apre un picker, sceglie un giorno del mese corrente e conferma con OK.
// L'ora resta quella di default del picker (09:00). I giorni si cercano per
// ruolo "button": le <option> di ore e minuti contengono gli stessi numeri
// (es. "15" è anche un valore dei minuti) e altrimenti creerebbero ambiguità.
// Vanno usati giorni fra 15 e 22, gli unici che nessun mese può mostrare
// anche come coda del mese precedente o testa del successivo.
const pickDay = (triggerButton, day) => {
  fireEvent.click(triggerButton);
  const panel = triggerButton.closest("div");
  fireEvent.click(within(panel).getByRole("button", { name: String(day) }));
  fireEvent.click(within(panel).getByRole("button", { name: "OK" }));
};

// Il giorno `day` del mese corrente alle 09:00 locali, cioè quello che il
// picker produce con la sua ora di default.
const expectedIso = (day) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0, 0).toISOString();
};

// Il trigger del picker della scadenza comune, isolato dal blocco
// IMPOSTAZIONI COMUNI (l'etichetta "SCADENZA" compare anche come intestazione
// di colonna delle righe).
const commonDueTrigger = () => {
  const commonBlock = screen.getByText(/IMPOSTAZIONI COMUNI/).parentElement;
  const field = within(commonBlock).getByText("SCADENZA").parentElement;
  return within(field).getByRole("button");
};

describe("BulkTaskCreator — scadenza comune", () => {
  it("applica la scadenza comune alle righe che non ne specificano una", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    pickDay(commonDueTrigger(), 15);

    fireEvent.change(screen.getAllByPlaceholderText("Titolo task...")[0], {
      target: { value: "Task senza scadenza propria" },
    });
    fireEvent.click(screen.getByText(/Crea 1 task/));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const [tasks] = onCreate.mock.calls[0];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBe(expectedIso(15));
  });

  it("mostra nelle righe la scadenza comune come valore ereditato", () => {
    render(<BulkTaskCreator existingTasks={[]} onCreate={vi.fn()} onClose={vi.fn()} />);
    openManualTab();

    // Prima: nessuna scadenza comune, le righe mostrano il placeholder vuoto.
    expect(screen.getAllByText("gg/mm/aaaa --:--").length).toBeGreaterThan(1);

    pickDay(commonDueTrigger(), 15);

    // Dopo: nessuna riga mostra più il placeholder generico, tutte esibiscono
    // la data che erediteranno.
    expect(screen.queryByText("gg/mm/aaaa --:--")).toBeNull();
    const label = formatPickerValue(expectedIso(15));
    expect(screen.getAllByText(label).length).toBeGreaterThan(1);
  });

  it("la scadenza di riga ha comunque la precedenza su quella comune", () => {
    const onCreate = vi.fn();
    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    openManualTab();

    pickDay(commonDueTrigger(), 15);

    // I trigger in ordine di DOM: [0] è quello comune, [1] la prima riga.
    const label = formatPickerValue(expectedIso(15));
    pickDay(screen.getAllByText(label)[1].closest("button"), 20);

    const titles = screen.getAllByPlaceholderText("Titolo task...");
    fireEvent.change(titles[0], { target: { value: "Con scadenza propria" } });
    fireEvent.change(titles[1], { target: { value: "Eredita la comune" } });
    fireEvent.click(screen.getByText(/Crea 2 task/));

    const [tasks] = onCreate.mock.calls[0];
    expect(tasks.find(t => t.title === "Con scadenza propria").dueDate).toBe(expectedIso(20));
    expect(tasks.find(t => t.title === "Eredita la comune").dueDate).toBe(expectedIso(15));
  });
});
