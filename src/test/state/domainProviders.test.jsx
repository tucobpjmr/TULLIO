// I provider per fetta di dominio (TasksContext / ClientsContext) e il loro
// effetto reale sui render.
//
// PERCHÉ QUESTO TEST ESISTE. Il beneficio di questo refactor non è visibile in
// nessuna asserzione funzionale: l'app mostrava le stesse cose prima e dopo.
// Quello che cambia è QUANTE VOLTE si ri-renderizza, ed è una proprietà che si
// rompe con la più innocua delle modifiche — basta rimettere una prop non
// stabile su una vista, o togliere il `memo`, e tutto torna com'era senza che
// un solo test diventi rosso.
//
// Prima ogni vista riceveva l'intero `state` del reducer, che è un oggetto
// nuovo dopo QUALUNQUE azione: un toast che compare, lo stesso toast che sparisce
// da solo dopo tre secondi, un carattere digitato nella ricerca globale. Con il
// calendario aperto, digitare "rossi" significava cinque ricostruzioni
// complete del layout del calendario su tutti i task.
//
// COME SI CONTANO I RENDER. Spiando `getActiveTasks`, che la Dashboard chiama
// una volta nel proprio corpo: una chiamata in più = un render in più. Il primo
// tentativo usava <Profiler>, ed era sbagliato — onRender scatta al commit del
// SOTTOALBERO, e il wrapper Profiler si ri-renderizza col genitore anche quando
// il figlio memoizzato salta il proprio render: misurava il wrapper, non la
// vista.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memo, useState } from "react";
import { render, screen, act } from "@testing-library/react";

vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));

vi.mock("../../lib/taskUtils.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getActiveTasks: vi.fn(actual.getActiveTasks) };
});

// ClientiView (montata da un test più sotto) interroga il modulo Liste al
// mount: qui interessano i render, non le query.
vi.mock("../../components/liste/listeApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ListeAPI: {
    listByClient: vi.fn(async () => ({ data: [], error: null })),
    saldiByClient: vi.fn(async () => ({ data: [], error: null })),
    clientiConListe: vi.fn(async () => ({ data: [], error: null })),
  },
}));

const { getActiveTasks } = await import("../../lib/taskUtils.js");
const { AppDataProvider } = await import("../../state/AppDataContext.jsx");
const { DispatchProvider } = await import("../../state/DispatchContext.jsx");
const { TasksProvider, useTasks } = await import("../../state/TasksContext.jsx");
const { ClientsProvider, useClients } = await import("../../state/ClientsContext.jsx");
// Criticità #8: la Dashboard monta la bacheca, che chiede conferma prima di
// eliminare un avviso. Il guscio del test replica quello dell'app, provider
// compreso — se non lo facesse, misurerebbe un albero che non esiste.
const { ConfirmProvider } = await import("../../state/ConfirmContext.jsx");
const { Dashboard } = await import("../../components/dashboard/Dashboard.jsx");

const TEAM = [{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }];
// Tutte fuori dal componente, e non è un dettaglio di stile: scritte inline
// (`notices={[]}`, `categories={{}}`) sarebbero valori NUOVI a ogni render del
// guscio. Le prime farebbero fallire il confronto shallow del memo; le seconde
// — peggio — cambierebbero l'identità del value di AppDataContext, che
// ri-renderizza OGNI consumatore di useAppData, memo o non memo.
//
// Le due volte che questo test è stato rosso mentre il codice era giusto è
// stato per questo, ed è la nota utile da lasciare: il bail-out regge solo se
// sono stabili sia le prop sia i contesti che la vista consuma. Nell'app lo
// sono, perché vengono tutte dallo state del reducer, che sostituisce un
// riferimento solo quando quel dato cambia davvero.
const NESSUN_AVVISO = [];
const NESSUN_CLIENTE = [];
const CATEGORIE = {};
const TASK = {
  id: "t1", title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["marco"], comments: [],
};

describe("TasksProvider / ClientsProvider — identità del value", () => {
  it("il value non cambia identità finché l'array non viene sostituito", () => {
    const visti = [];
    const Sonda = () => { visti.push(useTasks()); return null; };
    const tasks = [TASK];

    const { rerender } = render(
      <TasksProvider tasks={tasks}><Sonda /></TasksProvider>
    );
    // Stesso array, genitore ri-renderizzato: il consumatore rilegge lo stesso
    // riferimento, quindi nulla a valle si invalida.
    rerender(<TasksProvider tasks={tasks}><Sonda /></TasksProvider>);

    expect(visti).toHaveLength(2);
    expect(visti[0]).toBe(visti[1]);
  });

  it("cambia quando il reducer sostituisce l'array", () => {
    const visti = [];
    const Sonda = () => { visti.push(useTasks()); return null; };

    const { rerender } = render(<TasksProvider tasks={[TASK]}><Sonda /></TasksProvider>);
    rerender(<TasksProvider tasks={[TASK, { ...TASK, id: "t2" }]}><Sonda /></TasksProvider>);

    expect(visti[1]).not.toBe(visti[0]);
    expect(visti[1]).toHaveLength(2);
  });

  it("i due contesti sono indipendenti: i clienti non invalidano i task", () => {
    // La ragione per cui sono due provider e non uno solo con { tasks, clients }.
    const vistiTask = [];
    const SondaTask = memo(function SondaTask() { vistiTask.push(useTasks()); return null; });
    const tasks = [TASK];

    const Albero = ({ clients }) => (
      <TasksProvider tasks={tasks}>
        <ClientsProvider clients={clients}>
          <SondaTask />
        </ClientsProvider>
      </TasksProvider>
    );

    const { rerender } = render(<Albero clients={[]} />);
    rerender(<Albero clients={[{ id: "c1", name: "MARIO ROSSI" }]} />);

    // Un cliente importato non fa ri-renderizzare chi guarda i task.
    expect(vistiTask).toHaveLength(1);
  });

  it("gli hook sollevano fuori dal provider (nessun fallback silenzioso)", () => {
    const errore = vi.spyOn(console, "error").mockImplementation(() => {});
    const SoloTask = () => { useTasks(); return null; };
    const SoloClienti = () => { useClients(); return null; };
    expect(() => render(<SoloTask />)).toThrow(/TasksProvider/);
    expect(() => render(<SoloClienti />)).toThrow(/ClientsProvider/);
    errore.mockRestore();
  });
});

// ─── L'effetto misurabile, su una vista vera ────────────────────────────────
describe("Viste — un'azione che non le riguarda non le fa ri-renderizzare", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Riproduce il guscio dell'app: un genitore che possiede lo stato e si
  // ri-renderizza a ogni azione, con la vista montata sotto i provider. Il
  // bottone simula un'azione che NON tocca i task (un toast, un carattere
  // nella ricerca globale, la sidebar che si chiude).
  const Guscio = ({ tasks }) => {
    const [tick, setTick] = useState(0);
    // `dispatch` deve avere identità stabile, come quello di useSyncedDispatch:
    // è la condizione perché il confronto shallow del memo riesca. Se un
    // giorno diventasse una arrow ricreata a ogni render, questo test diventa
    // rosso — ed è esattamente il punto.
    const [dispatch] = useState(() => vi.fn());
    return (
      <DispatchProvider dispatch={dispatch}>
      <AppDataProvider team={TEAM} categories={CATEGORIE} currentUserId="marco">
        <TasksProvider tasks={tasks}>
          <ClientsProvider clients={NESSUN_CLIENTE}>
            <ConfirmProvider>
              <button onClick={() => setTick((n) => n + 1)}>azione non correlata {tick}</button>
              <Dashboard notices={NESSUN_AVVISO} dashboardQueue={null} />
            </ConfirmProvider>
          </ClientsProvider>
        </TasksProvider>
      </AppDataProvider>
      </DispatchProvider>
    );
  };

  it("la Dashboard non si ri-renderizza quando cambia solo lo stato del guscio", () => {
    render(<Guscio tasks={[TASK]} />);
    const dopoMount = getActiveTasks.mock.calls.length;
    expect(dopoMount).toBeGreaterThan(0);

    act(() => { screen.getByRole("button", { name: /azione non correlata/ }).click(); });

    // Prima di questo refactor la Dashboard riceveva `state` — oggetto nuovo a
    // ogni azione — e qui avrebbe ri-renderizzato l'intero sottoalbero: le
    // quattro code, le card, la bacheca.
    expect(getActiveTasks.mock.calls.length).toBe(dopoMount);
    // Il guscio SI è ri-renderizzato: è la prova che il test sta misurando il
    // bail-out della vista e non un click andato a vuoto.
    expect(screen.getByRole("button", { name: /azione non correlata 1/ })).toBeTruthy();
  });

  it("…ma si aggiorna quando cambiano davvero i task", () => {
    const { rerender } = render(<Guscio tasks={[TASK]} />);
    const dopoMount = getActiveTasks.mock.calls.length;

    rerender(<Guscio tasks={[TASK, { ...TASK, id: "t2", title: "Hotel" }]} />);

    expect(getActiveTasks.mock.calls.length).toBeGreaterThan(dopoMount);
    expect(screen.getByText("Hotel")).toBeTruthy();
  });
});
