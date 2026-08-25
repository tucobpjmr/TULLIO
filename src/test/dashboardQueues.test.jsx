// Le quattro code della Dashboard — test di montaggio.
//
// PERCHÉ ESISTE. UrgentQueue e UnassignedQueue usavano <QueueShell> senza
// importarlo: in produzione la coda urgenti moriva sul ViewErrorBoundary con
// "QueueShell is not defined". Nessun test le montava, e il lint non poteva
// vederlo — `no-undef` di eslint:recommended non tratta gli identificatori JSX
// come reference, quindi il file passava pulito. La regola react/jsx-no-undef
// (aggiunta in eslint.config.js) copre ora il caso in review; questi test lo
// coprono in CI, sul componente davvero renderizzato.
//
// Le asserzioni restano volutamente grosse — titolo della coda e presenza dei
// task — perché ciò che devono intercettare è il crash di render, non il
// dettaglio del markup, che ha già i suoi test in taskCard.test.jsx.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// Le code montano Avatar, che passa da lib/api.js → lib/supabase.js: senza
// queste mock il file non arriva nemmeno a importare (il client Supabase
// pretende URL e chiave). Stesso schema di avatar.test.jsx.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

const { PersonalQueue } = await import("../components/dashboard/queues/PersonalQueue.jsx");
const { UrgentQueue } = await import("../components/dashboard/queues/UrgentQueue.jsx");
const { UnassignedQueue } = await import("../components/dashboard/queues/UnassignedQueue.jsx");
const { OverdueQueue } = await import("../components/dashboard/queues/OverdueQueue.jsx");
const { WaitingQueue } = await import("../components/dashboard/queues/WaitingQueue.jsx");

const render = (ui) => renderWithAppData(ui, DEMO_APP_CTX);

// Scadenze relative a "adesso": la coda urgenti filtra su una finestra mobile,
// una data fissa renderebbe il test dipendente dal giorno in cui gira.
const inOre = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma → Tokyo", category: "booking",
  priority: "high", status: "todo", client: "Rossi",
  assignees: ["marco"], dueDate: inOre(6), ...over,
});

describe("PersonalQueue", () => {
  const me = DEMO_APP_CTX.team.find(m => m.id === "marco");

  it("monta e mostra i task assegnati", () => {
    render(<PersonalQueue tasks={[task()]} me={me} />);
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
  });

  it("a coda vuota resta in piedi", () => {
    render(<PersonalQueue tasks={[]} me={me} />);
    expect(screen.getByText(/Buon lavoro/)).toBeTruthy();
  });
});

describe("UrgentQueue", () => {
  // È la coda che si era rotta: qui il test di montaggio è il punto.
  it("monta e mostra i task in scadenza nella finestra", () => {
    render(<UrgentQueue tasks={[task()]} uid="marco" />);
    expect(screen.getByText("Urgenti")).toBeTruthy();
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
  });

  it("un task oltre le 24h non compare nella finestra di default", () => {
    render(<UrgentQueue tasks={[task({ dueDate: inOre(40) })]} uid="marco" />);
    expect(screen.queryByText("Volo Roma → Tokyo")).toBeNull();
    expect(screen.getByText(/Nessuna task in scadenza entro 24h/)).toBeTruthy();
  });

  it("i task di un altro agente sono mostrati con la scorciatoia 'contatta'", () => {
    const onOpenChat = vi.fn();
    render(
      <UrgentQueue
        tasks={[task({ assignees: ["sofia"] })]}
       
        onOpenChat={onOpenChat}
        uid="marco"
      />,
    );
    expect(screen.getByText("💬 contatta")).toBeTruthy();
  });
});

describe("UnassignedQueue", () => {
  it("monta e mostra i task non assegnati", () => {
    render(
      <UnassignedQueue
        tasks={[task({ assignees: [] })]}
       
        onTake={() => {}}
        uid="marco"
      />,
    );
    expect(screen.getByText("Coda globale")).toBeTruthy();
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
  });

  it("a coda vuota resta in piedi", () => {
    render(<UnassignedQueue tasks={[]} onTake={() => {}} uid="marco" />);
    expect(screen.getByText("Coda globale")).toBeTruthy();
  });
});

describe("OverdueQueue", () => {
  it("monta e mostra i task scaduti", () => {
    render(<OverdueQueue tasks={[task({ dueDate: inOre(-30) })]} />);
    expect(screen.getByText("Task scadute")).toBeTruthy();
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
  });

  it("a coda vuota resta in piedi", () => {
    render(<OverdueQueue tasks={[]} />);
    expect(screen.getByText(/Nessuna task scaduta/)).toBeTruthy();
  });
});

describe("WaitingQueue", () => {
  it("monta e mostra le task in attesa di cliente/fornitore", () => {
    render(<WaitingQueue tasks={[task({ status: "awaiting_client" })]} />);
    expect(screen.getByText("In attesa di cliente/fornitore")).toBeTruthy();
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
  });

  it("filtra per sotto-stato quando sono presenti entrambe le attese", () => {
    render(
      <WaitingQueue
        tasks={[
          task({ id: "t1", title: "Attesa cliente", status: "awaiting_client" }),
          task({ id: "t2", title: "Attesa fornitore", status: "awaiting_supplier" }),
        ]}
       
      />,
    );
    expect(screen.getByText("Attesa cliente")).toBeTruthy();
    expect(screen.getByText("Attesa fornitore")).toBeTruthy();
  });

  it("a coda vuota resta in piedi", () => {
    render(<WaitingQueue tasks={[]} />);
    expect(screen.getByText(/Nessuna task in attesa/)).toBeTruthy();
  });
});
