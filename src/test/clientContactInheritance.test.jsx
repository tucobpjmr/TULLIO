import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock di api.js per non istanziare il client Supabase reale (stesso pattern
// di chatConvCreate.test.jsx) — QuickAddTask importa TaskFiles per l'upload
// allegati, non esercitato da questo test.
vi.mock("../lib/api.js", () => ({
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));

const { QuickAddTask } = await import("../components/modals/QuickAddTask.jsx");

// Un cliente scelto dall'autocomplete deve portare con sé i contatti già
// presenti in anagrafica (telefono/email), non solo il nome — prima la
// selezione lasciava "Contatti" vuoto anche quando l'anagrafica li aveva.
const CLIENT = { id: "cl1", name: "Mario Rossi", city: "Roma", phone: "333 1234567", email: "mario.rossi@example.com" };

describe("QuickAddTask — eredità contatti dall'anagrafica cliente", () => {
  it("selezionando un cliente dall'autocomplete, il campo Contatti si precompila da telefono/email", () => {
    render(<QuickAddTask onAdd={vi.fn()} onClose={vi.fn()} clients={[CLIENT]} />);

    const clientInput = screen.getByPlaceholderText("Cerca in anagrafica o scrivi un nome…");
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: "Mario" } });

    fireEvent.mouseDown(screen.getByText("Mario Rossi"));

    expect(clientInput.value).toBe("Mario Rossi");
    const contactInput = screen.getByPlaceholderText("Telefono, email…");
    expect(contactInput.value).toBe("333 1234567 · mario.rossi@example.com");
  });

  it("non sovrascrive un contatto già digitato a mano", () => {
    render(<QuickAddTask onAdd={vi.fn()} onClose={vi.fn()} clients={[CLIENT]} />);

    const contactInput = screen.getByPlaceholderText("Telefono, email…");
    fireEvent.change(contactInput, { target: { value: "già inserito a mano" } });

    const clientInput = screen.getByPlaceholderText("Cerca in anagrafica o scrivi un nome…");
    fireEvent.focus(clientInput);
    fireEvent.change(clientInput, { target: { value: "Mario" } });
    fireEvent.mouseDown(screen.getByText("Mario Rossi"));

    expect(contactInput.value).toBe("già inserito a mano");
  });
});
