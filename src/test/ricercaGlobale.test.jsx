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

// Il pannello legge le liste al mount; i task arrivano per prop.
vi.mock("../components/liste/listeApi.js", async (importOriginal) => {
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
vi.mock("../lib/push.js", () => ({
  getPushSupport: () => ({ supported: false }),
  getPushState: async () => ({ enabled: false }),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
  syncPushSubscription: vi.fn(),
  sendTestPush: vi.fn(),
}));

const { ListeAPI } = await import("../components/liste/listeApi.js");
const { AdvancedSearchPanel } = await import("../components/search/AdvancedSearchPanel.jsx");

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
      dispatch={vi.fn()}
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
