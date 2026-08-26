// Una task "in attesa" (cliente/fornitore) scaduta appartiene solo alla coda
// "In attesa": è bloccata dall'esterno, non in ritardo per conto di chi la
// possiede. Prima di questo test la stessa task compariva ANCHE nella coda
// Scadute, contandola due volte e mischiando due significati diversi di
// "richiede attenzione".
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

const { Dashboard } = await import("../../components/dashboard/Dashboard.jsx");

const scaduta = {
  id: "t-waiting-overdue",
  title: "Attesa risposta fornitore voli",
  category: "booking",
  priority: "high",
  status: "awaiting_supplier",
  client: "Rossi",
  assignees: ["marco"],
  dueDate: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
};

const ctx = { ...DEMO_APP_CTX, tasks: [scaduta] };
const dispatch = () => {};

describe("Dashboard — task in attesa scaduta", () => {
  // "Scadenze Prossime" (sotto le tab) è un pannello indipendente da
  // activeQueue e mostra sempre le prossime scadenze non completate — la
  // task compare lì a prescindere. Il conteggio delle occorrenze distingue
  // le due situazioni: 1 (solo il pannello) vs 2 (pannello + coda attiva).
  it("non compare nella coda Scadute", () => {
    renderWithAppData(<Dashboard />, { ...ctx, dispatch });
    fireEvent.click(screen.getByText("Scadute"));
    expect(screen.getByText(/Nessuna task scaduta/)).toBeTruthy();
    expect(screen.getAllByText("Attesa risposta fornitore voli").length).toBe(1);
  });

  it("compare nella coda In Attesa", () => {
    renderWithAppData(<Dashboard />, { ...ctx, dispatch });
    fireEvent.click(screen.getByText("In Attesa"));
    expect(screen.getAllByText("Attesa risposta fornitore voli").length).toBe(2);
  });

  it("il badge della tab Scadute non la conta", () => {
    renderWithAppData(<Dashboard />, { ...ctx, dispatch });
    const scaduteTab = screen.getByText("Scadute").closest("button");
    expect(scaduteTab.textContent).not.toMatch(/1/);
  });
});
