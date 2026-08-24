// Smoke test delle quattro viste del calendario.
//
// PERCHÉ ESISTE. CalendarPlanner.jsx era il file più lungo della codebase (737
// righe effettive) e per rientrare sotto soglia ne sono uscite due griglie
// orarie — vista giorno e vista settimana piena — che nel return erano IIFE
// anonime: `{viewMode === "day" && (() => { … })()}`. Diventando componenti,
// quello che prima erano variabili chiuse dal render sono ora prop, e uno
// spostamento del genere si rompe in un modo che nessun test esistente vede:
// `calendarIcs.test.js` prova la matematica pura, e il componente non lo
// montava nessuno. (Qui era citato anche `recurrence.test.js`, uscito con il
// motore delle ricorrenze — vedi A-3.)
//
// Qui non si verifica il layout, che è tutto in stili inline: si verifica che
// ogni vista monti e mostri i task che le competono. È il minimo che distingue
// "l'estrazione ha preservato il comportamento" da "compila".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, fireEvent } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const { renderWithAppData } = await import("./helpers/appData.jsx");
const { ViewportProvider } = await import("../components/Viewport.jsx");
const { CalendarPlanner } = await import("../components/calendar/CalendarPlanner.jsx");

const TEAM = [{ id: "marco", name: "Marco Rossi", role: "Admin", active: true, pending: false }];
const CATEGORIE = { booking: { label: "Prenotazioni", icon: "🎫", color: "#0F2044" } };

// Ore fisse: le griglie posizionano gli eventi in base a getHours(), e un task
// creato "adesso" cadrebbe in una fascia diversa a ogni esecuzione.
const oggiAlle = (h, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["marco"], comments: [], dueDate: oggiAlle(10), ...over,
});

function montaCalendario(tasks) {
  return renderWithAppData(
    <ViewportProvider><CalendarPlanner dispatch={vi.fn()} /></ViewportProvider>,
    { team: TEAM, categories: CATEGORIE, currentUserId: "marco", tasks },
  );
}

// I toggle di vista sono bottoni con etichetta diversa fra desktop e mobile
// (jsdom non ha matchMedia reale: si cade nel ramo desktop).
const vaiA = (etichetta) => fireEvent.click(screen.getByRole("button", { name: etichetta }));

describe("CalendarPlanner — le quattro viste montano e mostrano i task", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("mese: il task compare nella cella del giorno", () => {
    montaCalendario([task()]);
    expect(screen.getAllByText(/Volo Roma/).length).toBeGreaterThan(0);
  });

  it("giorno: la griglia oraria mostra il task e il conteggio in agenda", () => {
    montaCalendario([task()]);
    vaiA(/Giorno/);
    expect(screen.getByText(/1 task in agenda/)).toBeTruthy();
    expect(screen.getAllByText(/Volo Roma/).length).toBeGreaterThan(0);
  });

  it("giorno: due task sovrapposti restano entrambi visibili", () => {
    // È il caso che layoutColumns esiste per gestire, ed è l'unica ragione per
    // cui la vista giorno ha bisogno di quella funzione: senza colonne, il
    // secondo evento coprirebbe il primo.
    montaCalendario([
      task({ id: "t1", title: "Volo Roma", dueDate: oggiAlle(10), estimatedHours: 2 }),
      task({ id: "t2", title: "Transfer hotel", dueDate: oggiAlle(11), estimatedHours: 2 }),
    ]);
    vaiA(/Giorno/);
    expect(screen.getByText(/2 task in agenda/)).toBeTruthy();
    expect(screen.getAllByText(/Volo Roma/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Transfer hotel/).length).toBeGreaterThan(0);
  });

  it("settimana: il task compare nella colonna del suo giorno", () => {
    montaCalendario([task()]);
    vaiA(/Settimana$/);
    expect(screen.getAllByText(/Volo Roma/).length).toBeGreaterThan(0);
  });

  it("settimana piena: la griglia oraria a sette colonne mostra il task", () => {
    montaCalendario([task()]);
    vaiA(/Sett\. piena/);
    expect(screen.getAllByText(/Volo Roma/).length).toBeGreaterThan(0);
  });

  it("aprire un evento della vista giorno dispatcha SET_SELECTED_TASK", () => {
    // La IIFE chiamava `dispatch` direttamente; il componente estratto riceve
    // `onOpenTask`. È il punto in cui l'estrazione poteva rompersi in silenzio:
    // un click che non fa più niente non rompe nessun altro test.
    const dispatch = vi.fn();
    renderWithAppData(
      <ViewportProvider><CalendarPlanner dispatch={dispatch} /></ViewportProvider>,
      { team: TEAM, categories: CATEGORIE, currentUserId: "marco", tasks: [task()] },
    );
    vaiA(/Giorno/);
    dispatch.mockClear();

    const evento = screen.getAllByText(/Volo Roma/).at(-1);
    fireEvent.click(evento);

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "SET_SELECTED_TASK" }),
    );
  });

  it("il filtro categoria vale anche dentro le griglie orarie", () => {
    // Il filtro viveva nella closure (`matchesCat`); ora passa come prop
    // `catFilter` e la griglia ricostruisce il predicato. Se la prop non
    // arrivasse, il filtro smetterebbe di avere effetto solo qui.
    montaCalendario([
      task({ id: "t1", title: "Volo Roma", category: "booking" }),
      task({ id: "t2", title: "Cena di gruppo", category: "altro", dueDate: oggiAlle(20) }),
    ]);
    vaiA(/Giorno/);
    expect(screen.getByText(/2 task in agenda/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Prenotazioni/ }));
    expect(screen.getByText(/1 task in agenda/)).toBeTruthy();
    expect(screen.queryByText(/Cena di gruppo/)).toBeNull();
  });
});

describe("CalendarPlanner — distribuzione agenti", () => {
  it("resta visibile in tutte le viste (è fuori dai rami di viewMode)", () => {
    montaCalendario([task()]);
    const tabella = () => screen.getByText(/Marco/).closest("table");
    expect(tabella()).toBeTruthy();
    vaiA(/Sett\. piena/);
    expect(within(tabella()).getByText(/Marco/)).toBeTruthy();
  });
});
