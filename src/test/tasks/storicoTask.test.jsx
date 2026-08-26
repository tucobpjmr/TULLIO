// src/test/storicoTask.test.jsx
// A-3 · Le due metà della finestra, e il fatto che siano DUE.
//
// PERCHÉ ESISTE. `finestraIdratazione.test.js` verifica che `Tasks.list` sappia
// chiedere una finestra. Qui si verifica ciò che quella query da sola non dice:
// chi la chiede stretta, chi la chiede intera, e — la parte che si rompe in
// silenzio — che una volta chiesta intera resti intera per il resto della
// sessione.
//
// Il difetto che questi test impediscono ha una forma precisa e non produce
// alcun errore: si apre il Cestino (che si carica il proprio storico), si
// blocca lo schermo, si torna dopo un minuto. `useDebouncedTableSubscription`
// fa il reload di riconnessione — l'unico corretto, dato che non c'è modo di
// sapere cosa si è perso — e se quel reload tornasse alla finestra, il cestino
// si svuoterebbe sotto gli occhi di chi lo sta guardando. Nessuna eccezione,
// nessun toast: una vista che si svuota da sola e si riempie premendo F5.
//
// Lo stesso vale al contrario per la corsa fra le due richieste: la risposta
// della finestra può arrivare DOPO quella dello storico, e sostituirla
// significherebbe potare lo stato con dati più vecchi e più stretti.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, render, screen, waitFor, act } from "@testing-library/react";

const handlers = new Map();
const vuoto = { data: [], error: null };
const risposta = async () => vuoto;

// `Tasks.list` registra gli ARGOMENTI di ogni chiamata: sono loro il contratto
// che questo file verifica, non il valore di ritorno.
let rispostaTasks = () => Promise.resolve(vuoto);
const TasksAPI = { list: vi.fn((opts) => rispostaTasks(opts)) };

vi.mock("../../lib/api.js", () => ({
  subscribeToTable: vi.fn((tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  }),
  Tasks: TasksAPI,
  Notices: { list: vi.fn(risposta) },
  Categories: { list: vi.fn(risposta) },
  TaskThreads: { comments: vi.fn(risposta), history: vi.fn(risposta) },
  Users: { listAll: vi.fn(risposta), getContacts: vi.fn(async () => ({ data: null })) },
  Clients: { list: vi.fn(risposta) },
  MessageTemplates: { list: vi.fn(risposta) },
}));

const { useAppHydration } = await import("../../hooks/useAppHydration.js");

const differita = () => {
  let risolvi;
  const promise = new Promise((res) => { risolvi = res; });
  return { promise, risolvi };
};

const monta = (over = {}) => renderHook(() => useAppHydration({
  enabled: true, currentUserId: "u1", dispatch: vi.fn(), onError: vi.fn(), ...over,
}));

// Gli argomenti dell'ultima chiamata a `Tasks.list`.
const ultimaList = () => TasksAPI.list.mock.calls[TasksAPI.list.mock.calls.length - 1][0];

// Fa scattare il reload di riconnessione: `useDebouncedTableSubscription`
// ricarica tutto (`tabelle = null`) quando la rete torna. È l'evento `online` e
// non `visibilitychange` perché il secondo ha una soglia di 30 s sul tempo
// passato in background (vedi realtimeReconnect.test.jsx); qui interessa il
// reload, non quale dei due segnali lo provoca.
const riconnetti = async () => {
  await act(async () => {
    window.dispatchEvent(new Event("online"));
    await new Promise(r => setTimeout(r, 400)); // oltre il debounce dedicato (300ms)
  });
};

beforeEach(() => {
  handlers.clear();
  TasksAPI.list.mockClear();
  rispostaTasks = () => Promise.resolve(vuoto);
});

describe("useAppHydration — l'idratazione chiede una FINESTRA (A-3)", () => {
  it("all'avvio non chiede il cestino e limita le completate", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const args = TasksAPI.list.mock.calls[0][0];
    expect(args.withComments).toBe(true);
    expect(args.includeDeleted).toBe(false);
    expect(typeof args.completeDal).toBe("string");
  });

  it("la finestra è di 60 giorni, non un valore qualunque", async () => {
    // Il numero è una scelta di prodotto (quanto a lungo una task chiusa viene
    // ancora consultata), non un dettaglio: se cambia, deve cambiarlo qualcuno
    // che sta guardando questo test.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const giorni = (Date.now() - Date.parse(TasksAPI.list.mock.calls[0][0].completeDal)) / 864e5;
    expect(giorni).toBeGreaterThan(59.9);
    expect(giorni).toBeLessThan(60.1);
  });

  it("il confine è una data ISO SENZA millisecondi", async () => {
    // Il valore finisce dentro `or=(…)`, dove il punto separa colonna,
    // operatore e valore: `toISOString()` ci metterebbe dentro il separatore.
    // Non è un dettaglio di formato — è la differenza fra una query che il
    // server accetta e una 400 a ogni idratazione.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const dal = TasksAPI.list.mock.calls[0][0].completeDal;
    expect(dal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(dal).not.toContain(".");
    // …e resta comunque una data valida, non solo una stringa ben formata.
    expect(Number.isNaN(Date.parse(dal))).toBe(false);
  });

  it("senza login non chiede nulla, né la finestra né lo storico", async () => {
    const { result } = monta({ enabled: false });
    await act(async () => { await result.current.storicoTask.richiedi(); });
    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(result.current.storicoTask.caricando).toBe(false);
  });
});

describe("useAppHydration — il corpus intero, su richiesta (A-3)", () => {
  it("richiedi() chiede cestino incluso e nessuna finestra", async () => {
    const dispatch = vi.fn();
    const { result } = monta({ dispatch });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    dispatch.mockClear();

    await act(async () => { await result.current.storicoTask.richiedi(); });

    expect(ultimaList()).toEqual({ withComments: true, includeDeleted: true });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASKS" }));
  });

  it("è idempotente: due viste che la chiedono non fanno due richieste", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    const prima = TasksAPI.list.mock.calls.length;

    await act(async () => {
      await Promise.all([
        result.current.storicoTask.richiedi(),
        result.current.storicoTask.richiedi(),
      ]);
    });

    expect(TasksAPI.list.mock.calls.length).toBe(prima + 1);
  });

  it("il flag `caricando` si alza durante la richiesta e si chiude alla fine", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    const { promise, risolvi } = differita();
    rispostaTasks = () => promise;
    let inVolo;
    act(() => { inVolo = result.current.storicoTask.richiedi(); });
    await waitFor(() => expect(result.current.storicoTask.caricando).toBe(true));

    await act(async () => { risolvi(vuoto); await inVolo; });
    expect(result.current.storicoTask.caricando).toBe(false);
  });

  it("anche un caricamento FALLITO chiude il flag: niente scheletro perpetuo", async () => {
    const onError = vi.fn();
    const { result } = monta({ onError });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    rispostaTasks = () => Promise.resolve({ data: null, error: { message: "rete assente" } });
    await act(async () => { await result.current.storicoTask.richiedi(); });

    expect(result.current.storicoTask.caricando).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});

describe("useAppHydration — lo storico, una volta chiesto, non si pota più", () => {
  it("dopo richiedi() il reload di riconnessione chiede ancora il corpus intero", async () => {
    // È IL test di questo file: senza, il primo `visibilitychange` svuota il
    // Cestino aperto, in silenzio e in modo auto-guarente premendo F5.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    await act(async () => { await result.current.storicoTask.richiedi(); });

    await riconnetti();

    expect(ultimaList().includeDeleted).toBe(true);
    expect(ultimaList().completeDal).toBeNull();
  });

  it("se lo storico FALLISCE l'idratazione torna alla finestra e il tentativo si ripete", async () => {
    // Il ref dice «lo stato DEVE contenere il corpus intero». Se la richiesta
    // non è mai arrivata, tenerlo alzato significherebbe chiedere per sempre
    // qualcosa che non abbiamo — e non riprovare mai.
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    rispostaTasks = () => Promise.resolve({ data: null, error: { message: "rete assente" } });
    await act(async () => { await result.current.storicoTask.richiedi(); });

    rispostaTasks = () => Promise.resolve(vuoto);
    await riconnetti();
    expect(ultimaList().includeDeleted).toBe(false);

    await act(async () => { await result.current.storicoTask.richiedi(); });
    expect(ultimaList().includeDeleted).toBe(true);
  });

  it("una risposta della finestra che arriva DOPO lo storico non pota lo stato", async () => {
    // La corsa: il reload della finestra parte, una vista chiede il corpus
    // intero, e la finestra risponde per ultima. `isCurrent()` non la scarta —
    // è il gen-counter delle richieste dello stesso tipo, e queste due non lo
    // sono.
    const dispatch = vi.fn();
    const { result } = monta({ dispatch });
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));

    // Reload di riconnessione con risposta trattenuta: è la finestra.
    const { promise, risolvi } = differita();
    rispostaTasks = (opts) => (opts.includeDeleted ? Promise.resolve(vuoto) : promise);
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => { await new Promise(r => setTimeout(r, 400)); });
    await waitFor(() => expect(ultimaList().includeDeleted).toBe(false));

    // Nel frattempo una vista chiede lo storico, che risponde subito.
    await act(async () => { await result.current.storicoTask.richiedi(); });
    dispatch.mockClear();

    // E solo ORA arriva la finestra, con un payload più stretto.
    await act(async () => {
      risolvi({ data: [{ id: "t-finestra", title: "vecchia" }], error: null });
      await new Promise(r => setTimeout(r, 0));
    });

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASKS" }));
  });
});

// ─── Lato viste ────────────────────────────────────────────────────────────
// Che l'hook sappia caricare lo storico non serve a nulla se nessuno glielo
// chiede — ed è metà del rilievo A-3: la finestra senza le viste che si
// idratano da sé non è un'ottimizzazione, è una perdita di dati.
//
// Il primo caso è un CONTROLLO POSITIVO: verifica che la sonda sappia
// accorgersi dell'ASSENZA della richiesta. Senza di esso, gli altri
// passerebbero anche con un `useStoricoTaskCompleto` inerte.
const { StoricoTaskProvider } = await import("../../state/StoricoTaskContext.jsx");
const { useStoricoTaskCompleto } = await import("../../state/StoricoTaskContext.jsx");

const Muto = () => <div>non chiede nulla</div>;
const Chiedente = () => {
  const caricando = useStoricoTaskCompleto();
  return <div>{caricando ? "attendo" : "pronto"}</div>;
};

const montaConProvider = (ui, { caricando = false } = {}) => {
  const richiedi = vi.fn();
  const utils = render(
    <StoricoTaskProvider richiedi={richiedi} caricando={caricando}>{ui}</StoricoTaskProvider>
  );
  return { richiedi, ...utils };
};

describe("useStoricoTaskCompleto — il canale fra vista e idratazione", () => {
  it("un componente che NON lo usa non fa partire alcuna richiesta (controllo positivo)", () => {
    const { richiedi } = montaConProvider(<Muto />);
    expect(richiedi).not.toHaveBeenCalled();
  });

  it("un componente che lo usa la fa partire al mount", () => {
    const { richiedi } = montaConProvider(<Chiedente />);
    expect(richiedi).toHaveBeenCalledTimes(1);
  });

  it("restituisce il flag di attesa, che la vista deve poter mostrare", () => {
    montaConProvider(<Chiedente />, { caricando: true });
    expect(screen.getByText("attendo")).toBeInTheDocument();
  });

  it("SOLLEVA fuori dal provider invece di degradare alla sola finestra", () => {
    // Il fallback silenzioso sarebbe la cosa peggiore possibile: un archivio
    // che sembra completo e non lo è.
    const errori = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Chiedente />)).toThrow(/StoricoTaskProvider/);
    errori.mockRestore();
  });
});
