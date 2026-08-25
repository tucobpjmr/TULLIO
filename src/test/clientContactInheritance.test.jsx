import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// I componenti sotto test leggono team/categorie/utente da useAppData(): prima
// li prendevano dai default di modulo di appGlobals, ora vanno montati dentro
// il provider. DEMO_APP_CTX è esattamente quel default, reso esplicito.
// ST-11 · `clients` non è più una prop: QuickAddTask legge l'anagrafica da
// useClients(), quindi qui viaggia nel contesto come team/categorie/utente. È
// il punto del rilievo — prima esisteva una seconda strada per lo stesso dato,
// ed era quella che i test esercitavano.
const render = (ui, clients = []) => renderWithAppData(ui, { ...DEMO_APP_CTX, clients });


// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di chatConvCreate.test.jsx) — QuickAddTask importa TaskFiles per l'upload
// allegati, non esercitato da questo test.
vi.mock("../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { QuickAddTask } = await import("../components/tasks/QuickAddTask.jsx");

// Un cliente scelto dall'autocomplete deve portare con sé i contatti già
// presenti in anagrafica (telefono/email), non solo il nome — prima la
// selezione lasciava "Contatti" vuoto anche quando l'anagrafica li aveva.
const CLIENT = { id: "cl1", name: "Mario Rossi", city: "Roma", phone: "333 1234567", email: "mario.rossi@example.com" };

describe("QuickAddTask — eredità contatti dall'anagrafica cliente", () => {
  it("selezionando un cliente dall'autocomplete, il campo Contatti si precompila da telefono/email", () => {
    render(<QuickAddTask onAdd={vi.fn()} onClose={vi.fn()} />, [CLIENT]);

    const clientInput = screen.getByPlaceholderText("Cerca in anagrafica o scrivi un nome…");
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: "Mario" } });

    fireEvent.mouseDown(screen.getByText("Mario Rossi"));

    expect(clientInput.value).toBe("Mario Rossi");
    const contactInput = screen.getByPlaceholderText("Telefono, email…");
    expect(contactInput.value).toBe("333 1234567 · mario.rossi@example.com");
  });

  it("non sovrascrive un contatto già digitato a mano", () => {
    render(<QuickAddTask onAdd={vi.fn()} onClose={vi.fn()} />, [CLIENT]);

    const contactInput = screen.getByPlaceholderText("Telefono, email…");
    fireEvent.change(contactInput, { target: { value: "già inserito a mano" } });

    const clientInput = screen.getByPlaceholderText("Cerca in anagrafica o scrivi un nome…");
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: "Mario" } });
    fireEvent.mouseDown(screen.getByText("Mario Rossi"));

    expect(contactInput.value).toBe("già inserito a mano");
  });

  // Regressione del caso reale: un cliente importato con SOLO il telefono
  // (niente città né email, es. "malagnino …" con "+39 338 918 5756"). Prima
  // la tendina mostrava solo città·email, quindi il suo sottotitolo era vuoto
  // e il telefono da ereditare era invisibile; ora dev'essere mostrato — e
  // comunque ereditato nel campo Contatti alla selezione.
  it("mostra ed eredita il telefono anche se il cliente non ha città né email", () => {
    const phoneOnly = { id: "cl2", name: "malagnino angelo", city: "", email: "", phone: "+39 338 918 5756" };
    render(<QuickAddTask onAdd={vi.fn()} onClose={vi.fn()} />, [phoneOnly]);

    const clientInput = screen.getByPlaceholderText("Cerca in anagrafica o scrivi un nome…");
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: "malagnino" } });

    // Il telefono è visibile nel suggerimento (sottotitolo della tendina).
    expect(screen.getByText("+39 338 918 5756")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("malagnino angelo"));
    expect(screen.getByPlaceholderText("Telefono, email…").value).toBe("+39 338 918 5756");
  });
});
