// ErrorReportsSection — M-1 dell'audit del 2 settembre.
//
// PERCHÉ ESISTE. `error_reports` aveva una tabella, una policy di lettura per
// gli admin e nessun lettore: questo componente è il lettore. Gemello di
// AuditLogSection (stesso useCaricamento, stesso pattern di stato), verificato
// qui per gli stessi tre stati — caricamento, vuoto onesto, errore onesto —
// più il caso normale con dati.
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";

const listMock = vi.fn();
vi.mock("../../lib/api.js", () => ({ ErrorReports: { list: listMock } }));

const { ErrorReportsSection } = await import("../../components/admin/tabs/ErrorReportsSection.jsx");

describe("ErrorReportsSection", () => {
  it("mostra le segnalazioni caricate", async () => {
    listMock.mockResolvedValueOnce({
      data: [{
        id: "1", code: "VD-ABC-1234", at: "2026-09-02T10:00:00Z",
        user_id: "u1", user_name: "Marco", origin: "runtime",
        message: "Cannot read properties of undefined (reading 'assignees')",
        stack: null, url: "https://app/tasks", user_agent: "UA",
      }],
      error: null,
    });
    render(<ErrorReportsSection />);
    await waitFor(() => expect(screen.getByText("VD-ABC-1234")).toBeInTheDocument());
    expect(screen.getByText(/Cannot read properties/)).toBeInTheDocument();
    expect(screen.getByText("Marco")).toBeInTheDocument();
  });

  it("un elenco vuoto dice che non c'è nessuna segnalazione, non che c'è un errore", async () => {
    listMock.mockResolvedValueOnce({ data: [], error: null });
    render(<ErrorReportsSection />);
    await waitFor(() => expect(screen.getByText("Nessuna segnalazione")).toBeInTheDocument());
  });

  it("un errore di lettura si distingue da un elenco vuoto", async () => {
    listMock.mockResolvedValueOnce({ data: null, error: new Error("RLS") });
    render(<ErrorReportsSection />);
    await waitFor(() => expect(screen.getByText("Segnalazioni non disponibili")).toBeInTheDocument());
    expect(screen.queryByText("Nessuna segnalazione")).not.toBeInTheDocument();
  });

  it("il bottone di export è disabilitato senza righe", async () => {
    listMock.mockResolvedValueOnce({ data: [], error: null });
    render(<ErrorReportsSection />);
    await waitFor(() => expect(screen.getByText("Nessuna segnalazione")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Esporta CSV/ })).toBeDisabled();
  });
});
