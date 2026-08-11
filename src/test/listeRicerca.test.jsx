// Ricerca nell'elenco Liste viaggio.
//
// Il bug da cui nasce questo file: "COLUCCI GIANNICOLA" ha una lista, il badge
// dell'anagrafica la conta, ma cercandolo nell'elenco liste non compariva
// nulla e l'elenco rispondeva «Nessuna lista qui. Crea la prima con "+ Nuova
// lista"». La lista esisteva: era ESAURITA, e il filtro di default mostra solo
// le attive. La ricerca funzionava, il filtro la nascondeva, e nessun elemento
// della UI lo diceva.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor, fireEvent } from "@testing-library/react";
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

const LISTA_ESAURITA = {
  id: "11111111-1111-4111-8111-111111111111",
  client_id: "c-gia",
  titolo: null,
  stato: "esaurita",
  deleted_at: null,
  updated_at: "2026-08-02T17:54:18Z",
  clients: { name: "COLUCCI GIANNICOLA" },
  lista_beneficiari: [],
};

const LISTA_ATTIVA = {
  id: "22222222-2222-4222-8222-222222222222",
  client_id: "c-ang",
  titolo: null,
  stato: "attiva",
  deleted_at: null,
  updated_at: "2026-08-03T10:00:00Z",
  clients: { name: "COLUCCI ANGELA" },
  lista_beneficiari: [],
};

// Cointestazione: la lista è intestata a un altro, ma D'AMATO è coinvolta.
const LISTA_COINTESTATA = {
  id: "33333333-3333-4333-8333-333333333333",
  client_id: "c-ros",
  titolo: "VIAGGIO NOZZE",
  stato: "attiva",
  deleted_at: null,
  updated_at: "2026-08-01T10:00:00Z",
  clients: { name: "ROSSI MARIO" },
  lista_beneficiari: [{ client_id: "c-dam", clients: { name: "D'AMATO PATRIZIA" } }],
};

vi.mock("../components/liste/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ListeAPI: {
      list: vi.fn(async () => ({ data: [], error: null })),
      listTrash: vi.fn(async () => ({ data: [], error: null })),
      saldi: vi.fn(async () => ({ data: [], error: null })),
    },
  };
});

const { ListeAPI } = await import("../components/liste/listeApi.js");
const { ListeViaggio, filtraListe } = await import("../components/liste/ListeViaggio.jsx");

const TEAM = [{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }];

const renderElenco = async (liste, cestino = []) => {
  ListeAPI.list.mockResolvedValue({ data: liste, error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: cestino, error: null });
  ListeAPI.saldi.mockResolvedValue({ data: [], error: null });
  render(<ListeViaggio dispatch={vi.fn()} />);
  await waitFor(() => expect(screen.queryByText("Caricamento…")).toBeNull());
};

// La ricerca è un input controllato: un solo change con il testo completo è
// equivalente alla digitazione, e non serve @testing-library/user-event (che
// questo progetto non installa).
const cerca = (q) => fireEvent.change(screen.getByRole("searchbox"), { target: { value: q } });

beforeEach(() => {
  vi.clearAllMocks();
  ctxTeam(TEAM.map((m) => ({ ...m })));
  ctxUser("marco");
});

describe("filtraListe", () => {
  const liste = [LISTA_ESAURITA, LISTA_ATTIVA, LISTA_COINTESTATA];

  it("trova il titolare per prefisso, qualunque sia lo stato della lista", () => {
    expect(filtraListe(liste, "COLUCCI GIA")).toEqual([LISTA_ESAURITA]);
  });

  it("trova anche a parole invertite", () => {
    expect(filtraListe(liste, "GIA COLUCCI")).toEqual([LISTA_ESAURITA]);
  });

  it("trova per cointestatario, apostrofo o no", () => {
    expect(filtraListe(liste, "d amato")).toEqual([LISTA_COINTESTATA]);
    expect(filtraListe(liste, "damato")).toEqual([LISTA_COINTESTATA]);
  });

  it("trova per titolo", () => {
    expect(filtraListe(liste, "nozze")).toEqual([LISTA_COINTESTATA]);
  });

  it("query vuota: nessun filtro", () => {
    expect(filtraListe(liste, "   ")).toEqual(liste);
  });
});

describe("elenco liste — risultati nascosti dal filtro", () => {
  it("dice dove sono i risultati invece di sembrare vuoto", async () => {
    await renderElenco([LISTA_ESAURITA, LISTA_ATTIVA]);
    cerca("COLUCCI GIA");

    // Il filtro di default è "Attive": la lista esaurita non si mostra…
    expect(screen.queryByText("COLUCCI GIANNICOLA")).toBeNull();
    // …ma il vuoto non finge più che la lista non esista.
    expect(screen.queryByText(/Crea la prima con/)).toBeNull();
    expect(screen.getByText(/Nessuna lista trovata per/)).toBeInTheDocument();

    // E il bottone porta dove il risultato è.
    fireEvent.click(screen.getByRole("button", { name: "Esaurite (1)" }));
    expect(screen.getByText("COLUCCI GIANNICOLA")).toBeInTheDocument();
  });

  it("segnala i risultati altrove anche quando l'elenco NON è vuoto", async () => {
    // Cercando "COLUCCI" fra le attive si vede COLUCCI ANGELA e non si
    // sospetta la lista esaurita di COLUCCI GIANNICOLA.
    await renderElenco([LISTA_ESAURITA, LISTA_ATTIVA]);
    cerca("COLUCCI");

    expect(screen.getByText("COLUCCI ANGELA")).toBeInTheDocument();
    expect(screen.getByText(/Altri risultati per/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Esaurite (1)" })).toBeInTheDocument();
  });

  it("conta anche il cestino fra i posti dove guardare", async () => {
    const cestinata = { ...LISTA_ESAURITA, id: "44444444-4444-4444-8444-444444444444", deleted_at: "2026-07-30T09:00:00Z" };
    await renderElenco([], [cestinata]);
    cerca("COLUCCI GIA");

    expect(screen.getByRole("button", { name: "Cestino (1)" })).toBeInTheDocument();
  });

  it("senza ricerca il messaggio di elenco vuoto resta quello di prima", async () => {
    await renderElenco([]);
    expect(screen.getByText(/Crea la prima con/)).toBeInTheDocument();
  });

  it("una ricerca senza risultati da nessuna parte non propone scorciatoie", async () => {
    await renderElenco([LISTA_ATTIVA]);
    cerca("ZZZZ");

    expect(screen.getByText(/Nessuna lista trovata per/)).toBeInTheDocument();
    expect(screen.queryByText(/c’è altrove/)).toBeNull();
  });
});
