// M-2 — la finestra sugli elenchi lunghi, su tutte le viste e non su due.
//
// PERCHÉ ESISTE. La convenzione («elenchi lunghi: una finestra, non tutte le
// righe») era applicata a ClientiView e ListeViaggio, e blindata da un test
// per la sola prima. Archivio, Cestino e le cinque code della Dashboard
// montavano l'array intero: 209 card d'archivio oggi, +4 al giorno, ognuna con
// i propri avatar e chip di categoria. Non era una decisione — erano viste
// scritte in momenti diversi.
//
// Le asserzioni contano le RIGHE a schermo, non chiamate interne: è l'unico
// modo perché la finestra non torni ad aprirsi per intero senza che nulla
// diventi rosso. E contano insieme le due metà che si dimenticano una alla
// volta: il tetto, e il RIAZZERAMENTO a ogni restringimento — senza il secondo,
// chi filtra vede i primi N di un filtro precedente.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// Come in dashboardQueues.test.jsx: le viste montano Avatar → lib/api.js →
// lib/supabase.js, che senza URL e chiave non si costruisce.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

const { Archive } = await import("../components/tasks/Archive.jsx");
const { Trash } = await import("../components/tasks/Trash.jsx");
const { OverdueQueue } = await import("../components/dashboard/queues/OverdueQueue.jsx");
const { UnassignedQueue } = await import("../components/dashboard/queues/UnassignedQueue.jsx");
const { useFinestra } = await import("../hooks/useFinestra.js");

const PAGINA = 24;          // Archivio e Cestino
const QUEUE_PAGINA = 10;    // le cinque code della Dashboard

const dispatch = () => {};

// Task riconoscibili una a una dal titolo: contarle significa contare i titoli
// a schermo, senza dipendere dal markup interno di TaskCard/della tabella.
const taskFinte = (n, patch = () => ({})) => Array.from({ length: n }, (_, i) => ({
  id: `t${i}`,
  title: `Task ${String(i).padStart(3, "0")}`,
  category: "booking",
  priority: "medium",
  status: "done",
  assignees: ["marco"],
  client: null,
  praticaRef: null,
  dueDate: new Date(2026, 0, 1 + i).toISOString(),
  ...patch(i),
}));

const titoliVisibili = () => screen.queryAllByText(/^Task \d{3}$/).length;

describe("useFinestra — il contratto della finestra", () => {
  // Una sonda invece di una vista: qui interessa l'hook, non chi lo usa.
  const Sonda = ({ elementi, passo, restringimenti }) => {
    const f = useFinestra(elementi, passo, restringimenti);
    return (
      <div>
        <span data-testid="visibili">{f.visibili.join(",")}</span>
        <span data-testid="restanti">{f.restanti}</span>
        <span data-testid="totale">{f.totale}</span>
        <button onClick={f.ancora}>ancora</button>
      </div>
    );
  };
  const numeri = (n) => Array.from({ length: n }, (_, i) => i);
  const monta = (props) => renderWithAppData(<Sonda {...props} />, DEMO_APP_CTX);

  it("mostra solo `passo` elementi e dice quanti ne restano", () => {
    monta({ elementi: numeri(25), passo: 10, restringimenti: ["a"] });
    expect(screen.getByTestId("visibili").textContent.split(",")).toHaveLength(10);
    expect(screen.getByTestId("restanti").textContent).toBe("15");
    expect(screen.getByTestId("totale").textContent).toBe("25");
  });

  it("`ancora` allarga di un passo per volta", () => {
    monta({ elementi: numeri(25), passo: 10, restringimenti: ["a"] });
    fireEvent.click(screen.getByText("ancora"));
    expect(screen.getByTestId("visibili").textContent.split(",")).toHaveLength(20);
    fireEvent.click(screen.getByText("ancora"));
    expect(screen.getByTestId("restanti").textContent).toBe("0");
  });

  it("sotto la soglia restituisce l'array ORIGINALE, non una copia", () => {
    // L'identità è il punto: una `slice` inutile darebbe una prop nuova a ogni
    // render e i figli `memo` si sveglierebbero comunque.
    const elementi = numeri(3);
    let visti = null;
    const Spia = () => { visti = useFinestra(elementi, 10, []).visibili; return null; };
    renderWithAppData(<Spia />, DEMO_APP_CTX);
    expect(visti).toBe(elementi);
  });

  it("un restringimento RIAZZERA la finestra allargata", () => {
    const { rerender } = monta({ elementi: numeri(50), passo: 10, restringimenti: ["a"] });
    fireEvent.click(screen.getByText("ancora"));
    expect(screen.getByTestId("visibili").textContent.split(",")).toHaveLength(20);

    rerender(<Sonda elementi={numeri(50)} passo={10} restringimenti={["b"]} />);
    expect(screen.getByTestId("visibili").textContent.split(",")).toHaveLength(10);
  });

  it("un elenco che cambia SENZA restringimenti non riazzera la finestra", () => {
    // Un evento realtime che aggiunge una riga non deve richiudere la finestra
    // sotto gli occhi di chi ha appena premuto "mostra altri".
    const { rerender } = monta({ elementi: numeri(50), passo: 10, restringimenti: ["a"] });
    fireEvent.click(screen.getByText("ancora"));
    rerender(<Sonda elementi={numeri(51)} passo={10} restringimenti={["a"]} />);
    expect(screen.getByTestId("visibili").textContent.split(",")).toHaveLength(20);
  });
});

describe("Archivio — la finestra sulle task completate", () => {
  const monta = (n) => renderWithAppData(
    <Archive loading={false} />,
    { dispatch, ...DEMO_APP_CTX, tasks: taskFinte(n, () => ({ completedAt: new Date().toISOString() })) },
  );

  it("con più task della pagina ne disegna solo PAGINA, non tutte", () => {
    monta(60);
    expect(titoliVisibili()).toBe(PAGINA);
    // Il totale resta vero: è la vista che risponde a "quante ne ho chiuse".
    expect(screen.getByText(`${PAGINA} di 60 task`)).toBeTruthy();
  });

  it("il bottone dice quante ne mancano e le aggiunge", () => {
    monta(60);
    fireEvent.click(screen.getByText(`Mostra altre ${PAGINA} di ${60 - PAGINA}`));
    expect(titoliVisibili()).toBe(PAGINA * 2);
  });

  it("sotto la soglia non compare nessun bottone", () => {
    monta(5);
    expect(titoliVisibili()).toBe(5);
    expect(screen.queryByText(/Mostra altre/)).toBeNull();
  });

  it("una ricerca RIAZZERA la finestra invece di ereditarla", () => {
    monta(60);
    fireEvent.click(screen.getByText(/Mostra altre/));
    expect(titoliVisibili()).toBe(PAGINA * 2);

    // "Task 0" corrisponde a tutte e 60: il filtro non riduce, quindi se la
    // finestra non fosse riazzerata resterebbero 48 righe.
    fireEvent.change(screen.getByPlaceholderText(/Cerca per titolo/), { target: { value: "Task 0" } });
    expect(titoliVisibili()).toBe(PAGINA);
  });
});

describe("Cestino — la finestra sulle task eliminate", () => {
  const monta = (n) => renderWithAppData(
    <Trash loading={false} />,
    { dispatch,
      ...DEMO_APP_CTX,
      tasks: taskFinte(n, () => ({ status: "todo", deletedAt: new Date().toISOString() })),
    },
  );

  it("ne disegna PAGINA e dice il totale vero", () => {
    monta(40);
    expect(titoliVisibili()).toBe(PAGINA);
    expect(screen.getByText(`${PAGINA} di 40 task`)).toBeTruthy();
  });

  it("il bottone allarga la finestra", () => {
    monta(40);
    fireEvent.click(screen.getByText(`Mostra altri ${40 - PAGINA} di ${40 - PAGINA}`));
    expect(titoliVisibili()).toBe(40);
    expect(screen.queryByText(/Mostra altri/)).toBeNull();
  });
});

describe("code della Dashboard — le due senza tetto naturale", () => {
  it("OverdueQueue ne disegna QUEUE_PAGINA e allarga a richiesta", () => {
    const tasks = taskFinte(25, () => ({ status: "todo" }));
    renderWithAppData(<OverdueQueue tasks={tasks} />, { ...DEMO_APP_CTX, dispatch });
    expect(titoliVisibili()).toBe(QUEUE_PAGINA);
    fireEvent.click(screen.getByText(`Mostra altre ${QUEUE_PAGINA} di ${25 - QUEUE_PAGINA}`));
    expect(titoliVisibili()).toBe(QUEUE_PAGINA * 2);
  });

  it("UnassignedQueue riazzera la finestra quando si filtra per priorità", () => {
    const tasks = taskFinte(25, (i) => ({
      status: "todo",
      assignees: [],
      priority: i % 2 === 0 ? "high" : "low",
    }));
    const { container } = renderWithAppData(
      <UnassignedQueue tasks={tasks} onTake={dispatch} uid="marco" />,
      { ...DEMO_APP_CTX, dispatch },
    );
    expect(titoliVisibili()).toBe(QUEUE_PAGINA);
    fireEvent.click(screen.getByText(/Mostra altre/));
    expect(titoliVisibili()).toBe(QUEUE_PAGINA * 2);

    // 13 task su 25 hanno priorità alta: la finestra torna a 10, non resta a 20.
    fireEvent.click(within(container).getByRole("button", { name: "Alto" }));
    expect(titoliVisibili()).toBe(QUEUE_PAGINA);
  });
});
