// Criticità #6 — gli stati di attesa devono essere ONESTI.
//
// PERCHÉ ESISTE. Ogni vista di questo gestionale parte da un array vuoto nel
// reducer e lo riempie quando il primo fetch da Supabase torna. Nella finestra
// fra le due cose l'app non diceva "sto caricando": diceva "Nessuna task in
// scadenza", "Tutti gli incarichi hanno un proprietario", "Cestino vuoto" —
// frasi affermative su dati operativi, in un momento in cui l'unica risposta
// vera era "non lo so ancora". Chi legge (una persona di fretta, o un agente
// che automatizza) può agire su quelle frasi.
//
// Questi test guardano ESATTAMENTE quella finestra: `loading` vero e nessun
// dato. Le asserzioni sono in negativo — la frase rassicurante NON deve
// esserci — perché è la frase, non lo scheletro, il difetto da impedire. Che
// al suo posto compaia un placeholder `aria-busy` è la seconda metà del
// contratto, ed è verificata insieme.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// Come in dashboardQueues.test.jsx: le code montano Avatar → lib/api.js →
// lib/supabase.js, che senza URL e chiave non si costruisce.
vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

const { PersonalQueue } = await import("../../components/dashboard/queues/PersonalQueue.jsx");
const { UrgentQueue } = await import("../../components/dashboard/queues/UrgentQueue.jsx");
const { UnassignedQueue } = await import("../../components/dashboard/queues/UnassignedQueue.jsx");
const { OverdueQueue } = await import("../../components/dashboard/queues/OverdueQueue.jsx");
const { NoticeBoard } = await import("../../components/dashboard/NoticeBoard.jsx");
const { Archive } = await import("../../components/tasks/Archive.jsx");
const { Trash } = await import("../../components/tasks/Trash.jsx");

const render = (ui, ctx = DEMO_APP_CTX) => renderWithAppData(ui, ctx);
const me = DEMO_APP_CTX.team.find(m => m.id === "marco");

// Lo scheletro si riconosce da `aria-busy`, non da una classe CSS: è ciò che
// un lettore di schermo (e un agente che legge l'accessibility tree) usa per
// distinguere "vuoto" da "in arrivo".
const scheletro = () => document.querySelectorAll('[aria-busy="true"]');

describe("code della Dashboard — in caricamento non dichiarano una coda vuota", () => {
  it("PersonalQueue non dice 'Buon lavoro!' finché i task non sono arrivati", () => {
    render(<PersonalQueue tasks={[]} me={me} loading />);
    expect(screen.queryByText(/Buon lavoro/)).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("UnassignedQueue non dice 'Tutti gli incarichi hanno un proprietario'", () => {
    render(<UnassignedQueue tasks={[]} onTake={() => {}} uid="marco" loading />);
    expect(screen.queryByText(/hanno un proprietario/)).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("OverdueQueue non dice 'Tutto in regola!'", () => {
    render(<OverdueQueue tasks={[]} loading />);
    expect(screen.queryByText(/Tutto in regola/)).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("UrgentQueue non dice 'Nessuna task in scadenza'", () => {
    // È il caso da cui nasce la criticità: una scadenza imminente che l'app
    // dichiara inesistente perché non l'ha ancora caricata.
    render(<UrgentQueue tasks={[]} onOpenChat={() => {}} uid="marco" loading />);
    expect(screen.queryByText(/Nessuna task in scadenza/)).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("a caricamento finito la coda vuota torna a dirlo", () => {
    // Il contrario del test precedente, e la ragione per cui `loading` non
    // basta da solo: quando il fetch è tornato davvero vuoto, "Buon lavoro!"
    // è la risposta giusta e deve tornare.
    render(<PersonalQueue tasks={[]} me={me} loading={false} />);
    expect(screen.getByText(/Buon lavoro/)).toBeTruthy();
    expect(scheletro().length).toBe(0);
  });

  it("con task già in pagina un reload realtime non li nasconde sotto lo scheletro", () => {
    // `loading` resta vero solo fino al primo fetch, ma la guardia
    // `tasks.length === 0` è ciò che impedisce a un futuro riuso del flag di
    // far sparire dati già visibili.
    const task = {
      id: "t1", title: "Volo Roma → Tokyo", category: "booking", priority: "high",
      status: "todo", client: "Rossi", assignees: ["marco"],
      dueDate: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    };
    render(<PersonalQueue tasks={[task]} me={me} loading />);
    expect(screen.getByText("Volo Roma → Tokyo")).toBeTruthy();
    expect(scheletro().length).toBe(0);
  });
});

describe("bacheca avvisi — in caricamento non dichiara la bacheca vuota", () => {
  it("NoticeBoard non dice 'Nessun avviso in bacheca'", () => {
    render(<NoticeBoard notices={[]} loading />);
    expect(screen.queryByText(/Nessun avviso in bacheca/)).toBeNull();
    expect(scheletro().length).toBe(1);
  });
});

describe("Archivio e Cestino — in caricamento non si dichiarano vuoti", () => {
  const ctx = { ...DEMO_APP_CTX, tasks: [] };

  it("Archive non dice 'Archivio vuoto'", () => {
    render(<Archive loading />, ctx);
    expect(screen.queryByText("Archivio vuoto")).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("Trash non dice 'Cestino vuoto'", () => {
    // È la vista in cui si va a cercare qualcosa che si crede eliminato per
    // sbaglio: la risposta sbagliata chiude la ricerca.
    render(<Trash loading />, ctx);
    expect(screen.queryByText("Cestino vuoto")).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("a caricamento finito i due vuoti tornano a essere dichiarati", () => {
    render(<Archive loading={false} />, ctx);
    expect(screen.getByText("Archivio vuoto")).toBeTruthy();
    render(<Trash loading={false} />, ctx);
    expect(screen.getByText("Cestino vuoto")).toBeTruthy();
  });
});

// ─── A-3 · lo stesso principio, applicato alla FINESTRA ────────────────────
// Da qui in poi `loading` (l'entità `tasks`) è CHIUSO: l'idratazione è finita,
// i task in stato ci sono. Sono quelli della finestra — le non completate più
// le completate degli ultimi 60 giorni — e sono la ragione per cui questi casi
// non si sovrappongono a quelli qui sopra: il difetto non è più un vuoto
// dichiarato troppo presto, è un TOTALE dichiarato su un sottoinsieme.
//
// «209 task completate» detto mentre lo storico è ancora in volo è la stessa
// affermazione falsa di «Archivio vuoto» a dati non caricati, e si legge
// peggio: un vuoto lo si sospetta, un numero preciso no.
describe("Archivio e Cestino — con lo storico in volo non dichiarano un totale", () => {
  const completata = {
    id: "t-done", title: "Volo Milano", status: "done", priority: "media",
    category: "biglietteria", assignees: [], completedAt: "2026-08-10T09:00:00Z",
  };
  const ctx = { ...DEMO_APP_CTX, tasks: [completata], storicoInCorso: true };

  it("Archive mostra lo scheletro invece del conteggio della sola finestra", () => {
    render(<Archive loading={false} />, ctx);
    expect(screen.queryByText(/task completat/)).toBeNull();
    expect(screen.queryByText("Archivio vuoto")).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("Trash non dice 'Cestino vuoto' prima di aver caricato i cestinati", () => {
    // Il cestino non è nella finestra per costruzione: `includeDeleted` non è
    // più cablato sull'idratazione. Qui `tasks` non è vuoto e `loading` è
    // chiuso — senza il flag dello storico questa vista direbbe "vuoto" con
    // tutta la sicurezza del mondo.
    render(<Trash loading={false} />, ctx);
    expect(screen.queryByText("Cestino vuoto")).toBeNull();
    expect(scheletro().length).toBe(1);
  });

  it("a storico arrivato i conteggi tornano a essere dichiarati", () => {
    render(<Archive loading={false} />,
      { ...ctx, storicoInCorso: false });
    expect(screen.getByText(/1 task completata/)).toBeTruthy();
  });
});
