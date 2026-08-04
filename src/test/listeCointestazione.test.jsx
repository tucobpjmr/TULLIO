// Cointestazione delle liste viaggio: più beneficiari sulla stessa lista
// (es. marito e moglie), ciascuno con una propria scheda in anagrafica.
//
// `liste_viaggio.client_id` resta il titolare; `lista_beneficiari` aggiunge i
// cointestatari. Questi test coprono il lato client: gli helper puri che
// costruiscono l'intestazione da mostrare, il flusso interattivo di
// aggiunta/rimozione nel dettaglio lista, la ricerca nella home che deve
// trovare una lista anche dal nome di un cointestatario, e la scheda cliente
// che deve mostrare la lista — con entrambi i nomi — anche quando il cliente
// aperto è un cointestatario e non il titolare.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// Lista con un cointestatario, riusata da più describe qui sotto (home,
// scheda cliente): stesso identikit, contesti diversi.
const LISTA_COINTESTATA = {
  id: "l2",
  client_id: "cl-titolare",
  clients: { name: "MARIO ROSSI" },
  titolo: null,
  stato: "attiva",
  lista_beneficiari: [{ client_id: "cl-maria", clients: { name: "MARIA BIANCHI" } }],
};

// Un solo vi.mock per modulo: Vitest lo registra una volta per l'intero file,
// una seconda chiamata sullo stesso path lo sovrascriverebbe silenziosamente
// invece di comporsi con la prima. Tutti i metodi usati da ListaDetail,
// ListeViaggio e ClienteListePanel in questo file stanno quindi in un unico
// oggetto, mescolato sopra le implementazioni reali (le pure functions come
// intestazioneLista/beneficiariNomi restano quelle vere).
const ListeAPIMock = {
  aggiungiBeneficiario: vi.fn(async () => ({ data: "nuovo-id", error: null })),
  rimuoviBeneficiario: vi.fn(async () => ({ data: null, error: null })),
  spostaTitolare: vi.fn(async () => ({ data: null, error: null })),
  list: vi.fn(async () => ({ data: [LISTA_COINTESTATA], error: null })),
  listTrash: vi.fn(async () => ({ data: [], error: null })),
  saldi: vi.fn(async () => ({ data: [], error: null })),
  listByClient: vi.fn(async () => ({ data: [LISTA_COINTESTATA], error: null })),
  saldiByClient: vi.fn(async () => ({ data: [{ lista_id: "l2", saldo: 50, num_movimenti: 1 }], error: null })),
};
const downloadBlobMock = vi.fn();

vi.mock("../lib/listeApi.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ListeAPI: { ...actual.ListeAPI, ...ListeAPIMock }, downloadBlob: downloadBlobMock };
});

const { beneficiariNomi, intestazioneLista } = await import("../lib/listeApi.js");
const { ListaDetail } = await import("../components/liste/ListaDetail.jsx");
const { ListeViaggio } = await import("../components/liste/ListeViaggio.jsx");
const { ClienteListePanel } = await import("../components/liste/ClienteListePanel.jsx");

describe("beneficiariNomi / intestazioneLista", () => {
  const conBenef = (...nomi) => ({
    clients: { name: "MARIO ROSSI" },
    lista_beneficiari: nomi.map((n, i) => ({ client_id: `b${i}`, clients: { name: n } })),
  });

  it("senza cointestatari: solo il titolare", () => {
    expect(beneficiariNomi(conBenef())).toEqual([]);
    expect(intestazioneLista(conBenef())).toBe("MARIO ROSSI");
  });

  it("un cointestatario: unito con 'e'", () => {
    expect(intestazioneLista(conBenef("MARIA BIANCHI"))).toBe("MARIO ROSSI e MARIA BIANCHI");
  });

  it("più cointestatari: virgola tra i primi, 'e' prima dell'ultimo", () => {
    expect(intestazioneLista(conBenef("MARIA BIANCHI", "LUCA ROSSI")))
      .toBe("MARIO ROSSI, MARIA BIANCHI e LUCA ROSSI");
  });

  it("input mancanti: non esplode", () => {
    expect(intestazioneLista({ lista_beneficiari: [] })).toBe("");
    expect(intestazioneLista(null)).toBe("");
    expect(beneficiariNomi(null)).toEqual([]);
  });
});

describe("ListaDetail — cointestatari", () => {
  const LISTA = {
    id: "l1",
    client_id: "cl-titolare",
    titolo: "Buono 2026",
    stato: "attiva",
    clients: { name: "MARIO ROSSI" },
    lista_beneficiari: [{ client_id: "cl-maria", clients: { name: "MARIA BIANCHI" } }],
  };
  const CLIENTS = [
    { id: "cl-titolare", name: "MARIO ROSSI" },
    { id: "cl-maria", name: "MARIA BIANCHI" },
    { id: "cl-altro", name: "LUCA VERDI" },
  ];

  const setup = (onReload = vi.fn()) => {
    const dispatch = vi.fn();
    render(
      <ListaDetail
        lista={LISTA}
        movimenti={[]}
        history={[]}
        usersById={{}}
        dispatch={dispatch}
        onReload={onReload}
        onArchived={vi.fn()}
        clients={CLIENTS}
      />,
    );
    return { dispatch };
  };

  beforeEach(() => vi.clearAllMocks());

  it("mostra il cointestatario già presente come chip", () => {
    setup();
    expect(screen.getByText("MARIA BIANCHI")).toBeTruthy();
  });

  it("'+ cointestatario' esclude dal picker il titolare e chi è già cointestatario", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "+ cointestatario" }));
    const select = screen.getByLabelText("Cliente");
    const opzioni = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(opzioni).toContain("LUCA VERDI");
    expect(opzioni).not.toContain("MARIO ROSSI");
    expect(opzioni).not.toContain("MARIA BIANCHI");
  });

  it("aggiunge un cliente esistente e ricarica", async () => {
    const onReload = vi.fn();
    setup(onReload);
    fireEvent.click(screen.getByRole("button", { name: "+ cointestatario" }));
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "cl-altro" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(ListeAPIMock.aggiungiBeneficiario).toHaveBeenCalledWith({
      listaId: "l1", clientId: "cl-altro", newClientName: null,
    }));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  });

  it("crea e aggiunge un nuovo cliente", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "+ cointestatario" }));
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "__new__" } });
    fireEvent.change(screen.getByLabelText("Nome nuovo cliente"), { target: { value: "Nuovo Cointestatario" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    await waitFor(() => expect(ListeAPIMock.aggiungiBeneficiario).toHaveBeenCalledWith({
      listaId: "l1", clientId: null, newClientName: "Nuovo Cointestatario",
    }));
  });

  it("rimuovere un cointestatario chiede conferma prima di chiamare la RPC", async () => {
    const onReload = vi.fn();
    setup(onReload);
    fireEvent.click(screen.getByRole("button", { name: "Rimuovi MARIA BIANCHI come cointestatario" }));
    expect(ListeAPIMock.rimuoviBeneficiario).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi" }));
    await waitFor(() => expect(ListeAPIMock.rimuoviBeneficiario).toHaveBeenCalledWith("l1", "cl-maria"));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  });
});

// ─── ListaDetail: spostare il titolare su un cliente diverso ───────────────
// Chiude il cerchio dell'anagrafica: un "intestatario-evento" nato
// dall'import dei documenti Word può essere ricondotto alla persona vera,
// già in anagrafica come cliente CRM pulito.
describe("ListaDetail — sposta il titolare su un altro cliente", () => {
  const LISTA = {
    id: "l1",
    client_id: "cl-titolare",
    titolo: "Buono 2026",
    stato: "attiva",
    clients: { name: "MARIO ROSSI" },
    lista_beneficiari: [{ client_id: "cl-maria", clients: { name: "MARIA BIANCHI" } }],
  };
  const CLIENTS = [
    { id: "cl-titolare", name: "MARIO ROSSI" },
    { id: "cl-maria", name: "MARIA BIANCHI" },
    { id: "cl-altro", name: "LUCA VERDI" },
  ];

  const setup = (onReload = vi.fn()) => {
    render(
      <ListaDetail
        lista={LISTA}
        movimenti={[]}
        history={[]}
        usersById={{}}
        dispatch={vi.fn()}
        onReload={onReload}
        onArchived={vi.fn()}
        clients={CLIENTS}
      />,
    );
  };

  beforeEach(() => vi.clearAllMocks());

  it("il picker esclude il titolare attuale ma include i cointestatari (si può promuovere)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sposta la lista su un altro cliente" }));
    const select = screen.getByLabelText("Nuovo titolare");
    const opzioni = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(opzioni).not.toContain("MARIO ROSSI");
    expect(opzioni).toContain("MARIA BIANCHI");
    expect(opzioni).toContain("LUCA VERDI");
  });

  it("scegliendo un cliente che NON è cointestatario, sposta senza avvisi di promozione", async () => {
    const onReload = vi.fn();
    setup(onReload);
    fireEvent.click(screen.getByRole("button", { name: "Sposta la lista su un altro cliente" }));
    fireEvent.change(screen.getByLabelText("Nuovo titolare"), { target: { value: "cl-altro" } });
    expect(screen.queryByText(/verrà tolto dai cointestatari/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sposta" }));
    await waitFor(() => expect(ListeAPIMock.spostaTitolare).toHaveBeenCalledWith("l1", "cl-altro"));
    await waitFor(() => expect(onReload).toHaveBeenCalled());
  });

  it("scegliendo un cointestatario, avvisa che verrà promosso prima di spostare", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sposta la lista su un altro cliente" }));
    fireEvent.change(screen.getByLabelText("Nuovo titolare"), { target: { value: "cl-maria" } });

    expect(screen.getByText(/verrà tolto dai cointestatari/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sposta" }));
    await waitFor(() => expect(ListeAPIMock.spostaTitolare).toHaveBeenCalledWith("l1", "cl-maria"));
  });
});

describe("ListeViaggio — la ricerca trova anche i cointestatari", () => {
  const TEAM = [{ id: "marco", name: "Marco Rossi", role: "admin", active: true, pending: false }];
  const baseState = () => ({ currentUserId: "marco", team: TEAM, clients: [], listeTarget: null });

  beforeEach(() => vi.clearAllMocks());

  it("cerca 'BIANCHI': trova la lista intestata a ROSSI con BIANCHI cointestataria", async () => {
    setTeam(TEAM.map((m) => ({ ...m })));
    setCurrentUser("marco");
    render(<ListeViaggio state={baseState()} dispatch={vi.fn()} />);
    await waitFor(() => expect(ListeAPIMock.list).toHaveBeenCalled());

    expect(await screen.findByText("MARIO ROSSI e MARIA BIANCHI")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bianchi" } });
    expect(screen.getByText("MARIO ROSSI e MARIA BIANCHI")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nessuno cosi" } });
    expect(screen.queryByText("MARIO ROSSI e MARIA BIANCHI")).toBeNull();
  });
});

describe("ClienteListePanel — vista dal lato del cointestatario", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MARIA (cointestataria, non titolare) vede comunque la lista con entrambi i nomi", async () => {
    // listByClient qui è mockata per restituire la lista a prescindere
    // dall'id passato: nella realtà è la vista lista_partecipanti (titolare
    // UNION cointestatari) a garantire che la query la trovi anche per
    // "cl-maria", che di questa lista non è la colonna client_id.
    render(<ClienteListePanel cliente={{ id: "cl-maria", name: "MARIA BIANCHI" }} dispatch={vi.fn()} />);

    expect(await screen.findByText("MARIO ROSSI e MARIA BIANCHI")).toBeTruthy();
    expect(ListeAPIMock.listByClient).toHaveBeenCalledWith("cl-maria");
  });
});
