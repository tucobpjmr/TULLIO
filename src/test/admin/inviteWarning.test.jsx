// M-2 dell'audit del 14 agosto — metà UI: l'Edge Function invite-user ora
// segnala con `data.warning` quando l'invito è partito ma la pre-creazione di
// profilo o contatto è fallita. Questo file verifica che i due punti
// d'ingresso client (invito singolo, invito multiplo) mostrino quel segnale
// invece di limitarsi al solito "successo" — la metà server (Edge Function)
// è coperta da edgeFunctionsPiiEsitoScritture.test.js.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const inviteMock = vi.fn();
vi.mock("../../lib/api.js", () => ({
  Users: { invite: (...args) => inviteMock(...args) },
}));

const { AddTeamMemberModal } = await import("../../components/admin/AddTeamMemberModal.jsx");
const { BulkInviteModal } = await import("../../components/admin/BulkInviteModal.jsx");
const { withDispatch } = await import("../helpers/appData.jsx");

describe("AddTeamMemberModal — mostra il warning invece del solito successo", () => {
  beforeEach(() => { inviteMock.mockReset(); });

  it("un invito senza warning resta un toast di successo", async () => {
    inviteMock.mockResolvedValue({ data: { success: true, userId: "u1" }, error: null });
    const dispatch = vi.fn();
    render(withDispatch(<AddTeamMemberModal onClose={vi.fn()} existingIds={[]} />, dispatch));

    fireEvent.change(screen.getByPlaceholderText("Es. Anna Bianchi"), { target: { value: "Anna Bianchi" } });
    fireEvent.change(screen.getByPlaceholderText("anna@agenzia.it"), { target: { value: "anna@agenzia.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Invito inviato a anna@agenzia.it." },
    }));
  });

  it("un invito con warning mostra il messaggio del server, non 'Invito inviato'", async () => {
    inviteMock.mockResolvedValue({
      data: {
        success: true, userId: "u1",
        warning: "Invito inviato, ma non è stato possibile pre-creare: contatto (email). "
          + "Controlla la scheda del membro nel pannello Team dopo il primo accesso.",
      },
      error: null,
    });
    const dispatch = vi.fn();
    render(withDispatch(<AddTeamMemberModal onClose={vi.fn()} existingIds={[]} />, dispatch));

    fireEvent.change(screen.getByPlaceholderText("Es. Anna Bianchi"), { target: { value: "Anna Bianchi" } });
    fireEvent.change(screen.getByPlaceholderText("anna@agenzia.it"), { target: { value: "anna@agenzia.it" } });
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "warning", message: expect.stringContaining("contatto (email)") },
    }));
    // Mai il messaggio di successo generico insieme al warning: sarebbero due
    // affermazioni contraddittorie sullo stesso invito.
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Invito inviato a anna@agenzia.it." },
    });
  });
});

describe("BulkInviteModal — la riga con warning si distingue da ok/errore", () => {
  beforeEach(() => { inviteMock.mockReset(); });

  it("una riga con warning compare come terzo stato, non ok né errore", async () => {
    inviteMock.mockResolvedValue({
      data: { success: true, userId: "u1", warning: "Contatto non salvato." },
      error: null,
    });
    render(<BulkInviteModal onClose={vi.fn()} onInvited={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/anna@agenzia\.it/), {
      target: { value: "anna@agenzia.it" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invia inviti" }));

    await waitFor(() => expect(screen.getByText("Contatto non salvato.")).toBeTruthy());
    expect(screen.getByText(/con avviso/)).toBeTruthy();
    // Non conta né fra gli "inviati" puliti né fra i "falliti": è una terza
    // categoria, e il riepilogo deve dirlo esplicitamente.
    expect(screen.queryByText(/falliti/)).toBeNull();
  });
});
