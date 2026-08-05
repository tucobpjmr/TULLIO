// Anagrafica clienti e Liste viaggio condividono la tabella `clients`: le
// liste puntano al cliente con una foreign key e ne mostrano il `name` come
// intestazione. Modificare una scheda ha quindi effetti fuori dall'anagrafica,
// e questi test coprono i punti in cui quell'effetto va dichiarato PRIMA:
//
//  - il badge "N liste viaggio" sulle card (quali schede sono anche buoni viaggio);
//  - l'avviso in modifica quando si cambia il nome condiviso;
//  - il blocco dell'eliminazione di un cliente con liste (la FK la rifiuta comunque);
//  - la spunta esplicita per rinominare l'anagrafica dal modulo Liste.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { withAppData } from "./helpers/appData.jsx";

// ─── Contesto app per il render ─────────────────────────────────────────────
// Sostituisce setTeam()/setCurrentUser() sui globali eliminati: il team e
// l'utente corrente non sono più variabili di modulo lette dai componenti al
// render, ma props del provider. Restano impostabili con le stesse due
// chiamate — `ctxTeam` / `ctxUser` — così ogni test dichiara da quale team
// dipende, e `render` le applica montando l'albero dentro <AppDataProvider>.
let appCtx = { team: [], categories: {}, currentUserId: null };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
const render = (ui, options) => {
  const utils = rtlRender(withAppData(ui, appCtx), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, appCtx)) };
};


vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// Due liste attive e una nel cestino per "cl1" (MARIO ROSSI); nessuna per "cl2".
const RIGHE_LISTE = [
  { client_id: "cl1", deleted_at: null },
  { client_id: "cl1", deleted_at: null },
  { client_id: "cl1", deleted_at: "2026-07-30T10:00:00Z" },
];

vi.mock("../lib/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      clientiConListe: vi.fn(async () => ({ data: RIGHE_LISTE, error: null })),
      listByClient: vi.fn(async () => ({ data: [], error: null })),
      saldiByClient: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

const { ClientiView } = await import("../components/clients/ClientiView.jsx");
const { EditListaModal } = await import("../components/liste/listeModals.jsx");

const TEAM = [{ id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false }];

const CLIENTI = [
  { id: "cl1", name: "MARIO ROSSI", city: "Roma", notes: "Codice Fiscale: RSSMRA80A01H501U\nCap: 00100", createdAt: "2026-01-01T00:00:00Z" },
  { id: "cl2", name: "50° RICCARDO SCAMARCIO", city: "", notes: null, createdAt: "2026-01-02T00:00:00Z" },
];

const TASKS = [
  { id: "t1", title: "Volo", category: "booking", priority: "high", status: "todo", assignees: ["marco"], client: "MARIO ROSSI", comments: [] },
  { id: "t2", title: "Hotel", category: "hotel", priority: "low", status: "todo", assignees: ["marco"], client: "ALTRO CLIENTE", comments: [] },
];

const baseState = () => ({
  currentUserId: "marco", team: TEAM, tasks: TASKS, notices: [], clients: CLIENTI, categories: {},
});

const renderView = () => {
  ctxTeam(TEAM.map(m => ({ ...m })));
  ctxUser("marco");
  const dispatch = vi.fn();
  render(<ClientiView state={baseState()} dispatch={dispatch} />);
  return dispatch;
};

// La card di un cliente: si risale dal nome fino al contenitore che porta i
// bottoni di riga. Cercare per indice sarebbe fragile — l'elenco è ordinato
// per nome e "50° RICCARDO SCAMARCIO" precede "MARIO ROSSI".
const cardDi = (nome) => {
  let el = screen.getByText(nome);
  while (el && !within(el).queryByText("✏️")) el = el.parentElement;
  return el;
};

describe("Anagrafica — visibilità del legame con le liste viaggio", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra sulla card quante liste viaggio usano quel nome, cestino compreso", async () => {
    renderView();
    // 2 attive + 1 archiviata: la lista nel cestino tiene comunque la FK sul
    // cliente, quindi conta per capire se la scheda è eliminabile.
    expect(await screen.findByText("🧾 3 liste viaggio")).toBeInTheDocument();
  });

  it("permette di separare le anagrafiche dagli intestatari delle liste", async () => {
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Solo anagrafica (1)" }));
    expect(screen.getByText("50° RICCARDO SCAMARCIO")).toBeInTheDocument();
    expect(screen.queryByText("MARIO ROSSI")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Con liste viaggio (1)" }));
    expect(screen.getByText("MARIO ROSSI")).toBeInTheDocument();
    expect(screen.queryByText("50° RICCARDO SCAMARCIO")).toBeNull();
  });

  // I dati fiscali ereditati dall'import finivano nelle note e la card li
  // mostrava come una descrizione tagliata a metà.
  it("in elenco i dati anagrafici importati si contano, non si riversano", async () => {
    renderView();
    expect(await screen.findByText("📇 2 dati anagrafici")).toBeInTheDocument();
    expect(screen.queryByText(/RSSMRA80A01H501U/)).toBeNull();
  });
});

describe("Anagrafica — modifica di un nome condiviso", () => {
  beforeEach(() => vi.clearAllMocks());

  const apriModifica = async () => {
    const dispatch = renderView();
    await screen.findByText("🧾 3 liste viaggio");
    fireEvent.click(within(cardDi("MARIO ROSSI")).getByText("✏️"));
    return dispatch;
  };

  it("finché il nome non cambia, avvisa senza allarmare", async () => {
    await apriModifica();
    expect(screen.getByText("Questa scheda è collegata")).toBeInTheDocument();
    expect(screen.getByText(/3 liste viaggio usano/)).toBeInTheDocument();
    // Nessuna spunta: non c'è niente da propagare.
    expect(screen.queryByText(/Aggiorna anche/)).toBeNull();
  });

  it("cambiando il nome dice che cosa trascina con sé e offre di allineare i task", async () => {
    const dispatch = await apriModifica();
    fireEvent.change(screen.getByPlaceholderText("Nome completo o ragione sociale"), {
      target: { value: "ROSSI MARIO" },
    });

    expect(screen.getByText("⚠️ Stai cambiando un nome condiviso")).toBeInTheDocument();
    expect(screen.getByText(/cambia l'intestazione di tutte/)).toBeInTheDocument();
    // Un solo task cita il cliente per nome (t2 è di un altro).
    expect(screen.getByText("Aggiorna anche il task collegato")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_CLIENT", payload: expect.objectContaining({ id: "cl1", name: "ROSSI MARIO" }) }),
    ));
    expect(dispatch).toHaveBeenCalledWith({
      type: "RENAME_CLIENT_IN_TASKS",
      payload: { from: "MARIO ROSSI", to: "ROSSI MARIO" },
    });
  });

  it("togliendo la spunta i task restano com'erano", async () => {
    const dispatch = await apriModifica();
    fireEvent.change(screen.getByPlaceholderText("Nome completo o ragione sociale"), {
      target: { value: "ROSSI MARIO" },
    });
    fireEvent.click(screen.getByLabelText("Aggiorna anche il task collegato"));
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));

    await waitFor(() => expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "UPDATE_CLIENT" }),
    ));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "RENAME_CLIENT_IN_TASKS" }));
  });
});

describe("Anagrafica — eliminazione di un cliente con liste", () => {
  beforeEach(() => vi.clearAllMocks());

  // Prima si scopriva provando: la DELETE partiva, il database rispondeva
  // 23503 e l'utente leggeva un errore dopo aver confermato.
  it("spiega perché non si può, invece di far premere Rimuovi", async () => {
    const dispatch = renderView();
    await screen.findByText("🧾 3 liste viaggio");
    fireEvent.click(within(cardDi("MARIO ROSSI")).getByText("🗑️"));

    const modale = screen.getByText("Non si può rimuovere").parentElement;
    expect(within(modale).getByText(/3 liste viaggio/)).toBeInTheDocument();
    expect(within(modale).getByText(/1 nel cestino/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rimuovi" })).toBeNull();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "DELETE_CLIENT" }));
  });

  it("resta possibile eliminare un cliente senza liste", async () => {
    const dispatch = renderView();
    await screen.findByText("🧾 3 liste viaggio");
    fireEvent.click(within(cardDi("50° RICCARDO SCAMARCIO")).getByText("🗑️"));

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "DELETE_CLIENT", payload: "cl2" });
  });
});

describe("Modulo Liste — rinominare il cliente è una scelta esplicita", () => {
  const lista = { id: "l1", titolo: "Buono 2026", clients: { name: "MARIO ROSSI" } };

  it("salvando solo il titolo non tocca l'anagrafica", async () => {
    const run = vi.fn(async () => true);
    render(<EditListaModal lista={lista} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Titolo della lista (facoltativo)"), { target: { value: "Buono 2027" } });
    // Il nome cliente non è modificabile finché non lo si sblocca.
    expect(screen.getByLabelText(/Nome del titolare/)).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ id: "l1", titolo: "Buono 2027", clientName: null }));
  });

  it("con la spunta invia il nuovo nome cliente e avvisa dell'effetto", async () => {
    const run = vi.fn(async () => true);
    render(<EditListaModal lista={lista} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.click(screen.getByLabelText("Rinomina il titolare in anagrafica"));
    expect(screen.getByText(/cambia l'intestazione di tutte le liste di questo cliente/)).toBeInTheDocument();

    const campo = screen.getByLabelText(/Nome del titolare/);
    expect(campo).not.toBeDisabled();
    fireEvent.change(campo, { target: { value: "ROSSI MARIO" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(run).toHaveBeenCalledWith({ id: "l1", titolo: "Buono 2026", clientName: "ROSSI MARIO" }));
  });

  it("togliendo la spunta il nome digitato viene scartato", async () => {
    const run = vi.fn(async () => true);
    render(<EditListaModal lista={lista} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const spunta = screen.getByLabelText("Rinomina il titolare in anagrafica");
    fireEvent.click(spunta);
    fireEvent.change(screen.getByLabelText(/Nome del titolare/), { target: { value: "NOME SBAGLIATO" } });
    fireEvent.click(spunta);

    expect(screen.getByLabelText(/Nome del titolare/)).toHaveValue("MARIO ROSSI");
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({ id: "l1", titolo: "Buono 2026", clientName: null }));
  });
});

describe("Scheda cliente — dati anagrafici ereditati", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nel pannello i campi importati sono leggibili per intero", async () => {
    renderView();
    await screen.findByText("🧾 3 liste viaggio");
    fireEvent.click(screen.getByText("MARIO ROSSI"));

    const pannello = screen.getByText("Task").closest("div").parentElement;
    expect(within(pannello).getByText("Codice Fiscale")).toBeInTheDocument();
    expect(within(pannello).getByText("RSSMRA80A01H501U")).toBeInTheDocument();
    expect(within(pannello).getByText("Cap")).toBeInTheDocument();
    expect(within(pannello).getByText("00100")).toBeInTheDocument();
  });
});
