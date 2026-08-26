// Ricerca globale (pannello della lente in Topbar): l'unico punto dell'app
// che cerca insieme task e liste viaggio.
//
// Cercava però le liste con criteri PIÙ STRETTI del modulo Liste: solo
// titolare, titolo e note, senza i cointestatari. Una lista intestata a ROSSI
// con BIANCHI cointestataria si trovava digitando "BIANCHI" dentro il modulo e
// non si trovava qui — cioè nel posto dove l'utente cerca quando non sa dove
// guardare.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { withAppData } from "../helpers/appData.jsx";

// ─── Contesto app per il render ─────────────────────────────────────────────
// Sostituisce setTeam()/setCurrentUser() sui globali eliminati: il team e
// l'utente corrente non sono più variabili di modulo lette dai componenti al
// render, ma props del provider. Restano impostabili con le stesse due
// chiamate — `ctxTeam` / `ctxUser` — così ogni test dichiara da quale team
// dipende, e `render` le applica montando l'albero dentro <AppDataProvider>.
let appCtx = { team: [], categories: {}, currentUserId: null };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
// M-2 (25 agosto): `dispatch` arriva per contesto, quindi il render lo prende
// fra le opzioni invece che come prop del componente sotto esame.
const render = (ui, { dispatch, ...options } = {}) => {
  const utils = rtlRender(withAppData(ui, { ...appCtx, dispatch }), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, { ...appCtx, dispatch })) };
};


vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));

// Il pannello legge le liste al mount; i task arrivano per prop.
vi.mock("../../components/liste/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      list: vi.fn(async () => ({ data: [], error: null })),
      listTrash: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

// Le notifiche push non c'entrano con la ricerca ma vivono nello stesso file.
vi.mock("../../lib/push.js", () => ({
  getPushSupport: () => ({ supported: false }),
  getPushState: async () => ({ enabled: false }),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  syncPushSubscription: vi.fn(),
  sendTestPush: vi.fn(),
}));

const { ListeAPI } = await import("../../components/liste/listeApi.js");
const { AdvancedSearchPanel } = await import("../../components/search/AdvancedSearchPanel.jsx");

const TEAM = [{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }];

const LISTA_COINTESTATA = {
  id: "33333333-3333-4333-8333-333333333333",
  client_id: "c-ros",
  titolo: null,
  note: null,
  stato: "attiva",
  deleted_at: null,
  clients: { name: "ROSSI MARIO" },
  lista_beneficiari: [{ client_id: "c-bia", clients: { name: "MARIA BIANCHI" } }],
};

const LISTA_APOSTROFO = {
  id: "55555555-5555-4555-8555-555555555555",
  client_id: "c-dam",
  titolo: null,
  note: null,
  stato: "esaurita",
  deleted_at: null,
  clients: { name: "D'AMATO PATRIZIA" },
  lista_beneficiari: [],
};

const renderPanel = async (keyword, liste) => {
  ListeAPI.list.mockResolvedValue({ data: liste, error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [], error: null });
  render(
    <AdvancedSearchPanel
      tasks={[]}
      onClose={vi.fn()}
      keyword={keyword}
      onKeyword={vi.fn()}
      currentUserId="marco"
    />,
  );
  await waitFor(() => expect(ListeAPI.list).toHaveBeenCalled());
};

beforeEach(() => {
  vi.clearAllMocks();
  ctxTeam(TEAM.map((m) => ({ ...m })));
  ctxUser("marco");
});

describe("ricerca globale — liste viaggio", () => {
  it("trova una lista per COINTESTATARIO, come fa il modulo Liste", async () => {
    await renderPanel("bianchi", [LISTA_COINTESTATA]);
    expect(await screen.findByText(/MARIO ROSSI e MARIA BIANCHI|ROSSI MARIO e MARIA BIANCHI/)).toBeInTheDocument();
  });

  it("trova le liste anche senza accenti, apostrofi o nell'ordine giusto", async () => {
    await renderPanel("patrizia d amato", [LISTA_APOSTROFO]);
    expect(await screen.findByText(/D'AMATO PATRIZIA/)).toBeInTheDocument();
  });

  it("non allarga a chi soddisfa solo un termine", async () => {
    await renderPanel("rossi luigi", [LISTA_COINTESTATA]);
    await waitFor(() => expect(screen.queryByText(/liste viaggio/)).toBeNull());
  });
});

// ─── A-2 · l'indice non cambia ciò che si trova ─────────────────────────────
// (audit performance/UX del 19 agosto)
//
// Il rilievo era di costo, non di correttezza: `matchTermini` normalizzava i
// campi per ogni riga a ogni battuta, e la correzione è precalcolare l'indice
// sulla riga. Il rischio della correzione è quindi tutto qui — che nel
// passaggio si perda un campo o una regola, cioè che una task smetta di
// trovarsi e nessuno se ne accorga finché qualcuno non la cerca.
//
// I casi sotto sono le tre regole che `searchUtils.js` dichiara (ordine delle
// parole libero, apostrofi e accenti ignorati, termini tutti obbligatori) più
// il campo che questo pannello ha in più di ogni altra ricerca dell'app: i
// COMMENTI. Il lato liste è già coperto dai tre casi qui sopra, che ora
// esercitano il proprio indice invece di `matchTermini`.
const TASK_COMMENTATA = {
  id: "t-1", title: "Conferma volo", category: "booking", priority: "medium",
  status: "todo", assignees: [], client: "D'AMATO PATRIZIA", praticaRef: "PR-2026-001",
  description: "", dueDate: null, deletedAt: null,
  comments: [{ user: "marco", text: "Cliente ricontattato, attende voucher", time: null }],
};

const renderTask = async (keyword, tasks) => {
  ListeAPI.list.mockResolvedValue({ data: [], error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [], error: null });
  render(
    <AdvancedSearchPanel
      tasks={tasks}
      onClose={vi.fn()}
      keyword={keyword}
      onKeyword={vi.fn()}
      currentUserId="marco"
    />,
  );
  await waitFor(() => expect(ListeAPI.list).toHaveBeenCalled());
};

describe("A-2 · ricerca globale — task, con l'indice precalcolato", () => {
  it("trova per testo di un COMMENTO, che è il campo esclusivo di questa ricerca", async () => {
    await renderTask("voucher", [TASK_COMMENTATA]);
    expect(await screen.findByText("Conferma volo")).toBeInTheDocument();
  });

  it("trova per cliente senza apostrofo e con le parole invertite", async () => {
    await renderTask("patrizia d amato", [TASK_COMMENTATA]);
    expect(await screen.findByText("Conferma volo")).toBeInTheDocument();
  });

  it("trova per numero di pratica", async () => {
    await renderTask("PR-2026-001", [TASK_COMMENTATA]);
    expect(await screen.findByText("Conferma volo")).toBeInTheDocument();
  });

  it("i termini restano tutti obbligatori: non allarga", async () => {
    await renderTask("voucher bicicletta", [TASK_COMMENTATA]);
    await waitFor(() => expect(screen.queryByText("Conferma volo")).toBeNull());
  });

  it("i filtri strutturali continuano a valere insieme al testo", async () => {
    // Il testo corrisponde ma la task è cestinata e «includi nel cestino» è
    // spento: il filtro strutturale deve vincere, come prima dell'indice.
    await renderTask("voucher", [{ ...TASK_COMMENTATA, deletedAt: "2026-08-01T00:00:00Z" }]);
    await waitFor(() => expect(screen.queryByText("Conferma volo")).toBeNull());
  });
});

// La forma, non il comportamento: che nessuno dei due filtri sia tornato alla
// normalizzazione per battuta. È il gemello del controllo `lazy() senza
// boundary` — una proprietà che si legge dal sorgente e che nessun test
// funzionale può vedere, perché le due strade danno gli stessi risultati.
const SORGENTE_PANNELLO =
  (await import("../../components/search/AdvancedSearchPanel.jsx?raw")).default;

describe("A-2 · il pannello non normalizza più a ogni battuta", () => {
  const sorgente = SORGENTE_PANNELLO;

  it("non importa più `matchTermini`", () => {
    expect(/import\s*\{[^}]*\bmatchTermini\b/.test(sorgente)).toBe(false);
  });

  it("costruisce DUE indici — task e liste — con `tasks`/`liste` come sola dipendenza", () => {
    // Il controllo positivo: senza, il test sopra passerebbe anche se il
    // filtro fosse stato tolto del tutto.
    expect(/const indiceTask = useMemo\([\s\S]{0,400}\[tasks\]\)/.test(sorgente)).toBe(true);
    expect(/const indiceListe = useMemo\([\s\S]{0,400}\[liste\]\)/.test(sorgente)).toBe(true);
  });
});
