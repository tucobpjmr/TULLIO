// src/test/cronologiaPerTask.test.jsx
// A-3, passo 3 · La cronologia si legge PER TASK APERTO.
//
// PERCHÉ ESISTE, e cosa distingue questo file da `paginazione.test.js`. Là si
// verifica la FORMA della query (`.eq('task_id', …)`); qui si verifica che
// quella query venga fatta da chi deve, quando deve, e — la parte che si
// rompe in silenzio — che NON venga rifatta quando non deve.
//
// Il difetto che questi casi impediscono è uno spostamento, non una
// regressione visibile. `task_history` è l'unica tabella dell'app che cresce e
// non si pota mai (660 righe il 17 agosto 2026, ~14,8 al giorno): prima veniva
// riletta INTERA a ogni evento, su un percorso che scatta a ogni modifica di
// stato, priorità, scadenza o assegnatario fatta da CHIUNQUE in agenzia. Se il
// pannello si limitasse a leggere per task ma restasse sveglio a ogni evento
// della tabella, avremmo sostituito «una lettura grande e rara» con «una
// lettura piccola e frequentissima» — e nulla fallirebbe, perché a schermo il
// risultato è identico.
//
// Da qui la forma delle asserzioni: quasi tutte contano CHIAMATE, non pixel.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { withAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// Handler registrati per tabella, così il test può emettere un evento e
// osservare se il pannello ci reagisce.
const handlers = new Map();
const disiscritti = [];
const subscribeToTable = vi.fn((tabella, handler) => {
  const chiave = `${tabella}#${handlers.size}`;
  handlers.set(chiave, handler);
  return () => { disiscritti.push(chiave); handlers.delete(chiave); };
});
const emetti = (payload) => {
  for (const h of handlers.values()) h(payload);
};

const RIGA = (over = {}) => ({
  id: "h1", task_id: "t1", action: "status", old_value: "todo", new_value: "done",
  created_at: "2026-08-01T10:00:00Z", users: { name: "Marco" }, ...over,
});

let risposta = async () => ({ data: [RIGA()], error: null });
const historyForTask = vi.fn((taskId) => risposta(taskId));

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
  TaskThreads: { historyForTask: (...a) => historyForTask(...a) },
}));

const { TaskHistoryPanel } = await import("../../components/tasks/TaskHistoryPanel.jsx");

const monta = (taskId = "t1") =>
  render(withAppData(<TaskHistoryPanel taskId={taskId} />, DEMO_APP_CTX));

// Oltre il debounce della sottoscrizione (200ms di default).
const oltreIlDebounce = async () => {
  await act(async () => { await new Promise(r => setTimeout(r, 250)); });
};

beforeEach(() => {
  handlers.clear();
  disiscritti.length = 0;
  historyForTask.mockClear();
  subscribeToTable.mockClear();
  risposta = async () => ({ data: [RIGA()], error: null });
});

describe("TaskHistoryPanel — legge la cronologia del solo task aperto", () => {
  it("al mount chiede la cronologia di QUESTO task", async () => {
    monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(1));
    expect(historyForTask).toHaveBeenCalledWith("t1");
    expect(await screen.findByText(/Stato:/)).toBeInTheDocument();
  });

  it("mostra la riga con attore, descrizione e conteggio", async () => {
    monta("t1");
    expect(await screen.findByText("Marco")).toBeInTheDocument();
    expect(screen.getByText(/CRONOLOGIA \(1\)/)).toBeInTheDocument();
  });

  it("cambiando task rilegge per il nuovo id", async () => {
    const { rerender } = monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledWith("t1"));

    rerender(withAppData(<TaskHistoryPanel taskId="t2" />, DEMO_APP_CTX));
    await waitFor(() => expect(historyForTask).toHaveBeenCalledWith("t2"));
  });
});

describe("TaskHistoryPanel — il realtime è filtrato sul proprio task", () => {
  it("un evento su UN ALTRO task non fa rileggere nulla", async () => {
    // È il caso che tiene in piedi A-3. Senza il filtro il pannello
    // rileggerebbe a ogni modifica fatta da chiunque: il difetto non sarebbe
    // corretto, sarebbe solo diventato più piccolo e molto più frequente.
    monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(1));

    emetti({ eventType: "INSERT", new: RIGA({ id: "h9", task_id: "t-di-un-altro" }) });
    await oltreIlDebounce();

    expect(historyForTask).toHaveBeenCalledTimes(1);
  });

  it("un evento sul PROPRIO task fa rileggere", async () => {
    // Il controllo positivo del caso sopra: senza, un `filterEvent` che
    // scarta tutto lo farebbe passare comunque.
    monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(1));

    emetti({ eventType: "INSERT", new: RIGA({ id: "h2", task_id: "t1" }) });
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(2));
  });

  it("una DELETE sul proprio task passa dal pre-image (`payload.old`)", async () => {
    // Sulle DELETE `payload.new` è vuoto: leggere solo quello significherebbe
    // non accorgersi mai della purge di un task.
    monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(1));

    emetti({ eventType: "DELETE", old: RIGA({ task_id: "t1" }) });
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(2));
  });

  it("smontando il pannello la sottoscrizione si chiude", async () => {
    // Lo slide-over si apre e si chiude di continuo: un canale per ogni
    // apertura, mai chiuso, è il costo che questa correzione voleva togliere.
    const { unmount } = monta("t1");
    await waitFor(() => expect(historyForTask).toHaveBeenCalledTimes(1));
    expect(handlers.size).toBe(1);

    unmount();
    expect(handlers.size).toBe(0);
    expect(disiscritti).toHaveLength(1);
  });
});

describe("TaskHistoryPanel — stati di attesa onesti", () => {
  it("mentre carica NON dichiara la cronologia vuota", async () => {
    // Stessa regola delle viste (docs/CLAUDE.md): un vuoto dichiarato prima di
    // aver caricato è un'affermazione falsa su dati operativi. Qui si legge
    // male in particolare, perché la cronologia è il posto in cui si va a
    // vedere CHI ha cambiato cosa, di solito quando qualcosa non torna.
    let risolvi;
    risposta = () => new Promise((r) => { risolvi = r; });
    monta("t1");

    expect(screen.queryByText("Nessuna cronologia disponibile.")).toBeNull();
    expect(screen.getByText("Caricamento della cronologia…")).toBeInTheDocument();
    // Nemmeno il conteggio, che a zero sarebbe una risposta e non un'attesa.
    expect(screen.queryByText(/CRONOLOGIA \(/)).toBeNull();

    await act(async () => { risolvi({ data: [], error: null }); });
    expect(await screen.findByText("Nessuna cronologia disponibile.")).toBeInTheDocument();
  });

  it("su ERRORE dice che non è disponibile, non che è vuota", async () => {
    // Tre stati e non due: «non c'è cronologia» e «non sono riuscito a
    // leggerla» portano a due conclusioni diverse per chi guarda.
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    risposta = async () => ({ data: null, error: { message: "rete assente" } });
    monta("t1");

    expect(await screen.findByText("Cronologia non disponibile.")).toBeInTheDocument();
    expect(screen.queryByText("Nessuna cronologia disponibile.")).toBeNull();
    // …e lo scheletro non gira per sempre.
    expect(screen.queryByText("Caricamento della cronologia…")).toBeNull();
    errori.mockRestore();
  });
});
