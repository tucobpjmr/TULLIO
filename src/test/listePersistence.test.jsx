// Registry delle scritture del modulo Liste viaggio.
//
// PERCHÉ QUESTO TEST ESISTE. Il modulo non passa dal reducer: le sue diciotto
// operazioni erano chiamate `runListeCall(dispatch, ListeAPI.x(args), "msg")`
// sparse in quattro file, ognuna con il nome della RPC, il messaggio di
// successo e l'eventuale controllo di ruolo scelti a mano al call site. Due
// conseguenze concrete: lo stesso messaggio ricopiato in file diversi (con il
// drift che ne segue), e il reset totale — l'unica operazione irreversibile del
// modulo — protetto lato client dal solo fatto che il bottone non venisse
// renderizzato ai non-admin.
//
// Il registry sposta quelle tre decisioni in un posto solo. Questi test
// verificano che il posto solo funzioni: guard applicati PRIMA della rete,
// messaggi giusti, errori instradati nel toast, e un'operazione non dichiarata
// che fallisce rumorosamente invece di essere saltata in silenzio.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const ok = (data = null) => Promise.resolve({ data, error: null });

const ListeAPIMock = {
  crea: vi.fn(() => ok("nuova-lista")),
  modifica: vi.fn(() => ok()),
  modificaNote: vi.fn(() => ok()),
  cambiaStato: vi.fn(() => ok()),
  archivia: vi.fn(() => ok()),
  ripristina: vi.fn(() => ok()),
  eliminaDefinitiva: vi.fn(() => ok()),
  spostaTitolare: vi.fn(() => ok()),
  aggiungiBeneficiario: vi.fn(() => ok()),
  rimuoviBeneficiario: vi.fn(() => ok()),
  addMovimento: vi.fn(() => ok()),
  addMovimenti: vi.fn(() => ok(3)),
  modificaMovimento: vi.fn(() => ok()),
  annullaMovimento: vi.fn(() => ok()),
  importaBackup: vi.fn(() => ok({ clients_added: 1 })),
  resetCompleto: vi.fn(() => ok({ liste_deleted: 3, movimenti_deleted: 5 })),
};

vi.mock("../components/liste/listeApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ListeAPI: ListeAPIMock,
}));

const { withAppData } = await import("./helpers/appData.jsx");
const { LISTE_WRITES, useListeWrite, CONFERMA_RESET } =
  await import("../components/liste/listePersistence.js");

const TEAM = [
  { id: "admin1", name: "Admin", role: "admin", active: true, pending: false },
  { id: "agent1", name: "Agente", role: "agent", active: true, pending: false },
];

// Monta l'hook dentro il provider, come fa qualunque componente del modulo.
const montaEsecutore = (uid = "agent1") => {
  const dispatch = vi.fn();
  const { result } = renderHook(() => useListeWrite(dispatch), {
    wrapper: ({ children }) => withAppData(children, { team: TEAM, currentUserId: uid }),
  });
  return { esegui: result.current, dispatch };
};

const toastDi = (dispatch, tipo) => dispatch.mock.calls
  .map(([a]) => a)
  .filter((a) => a.type === "SHOW_TOAST" && a.payload.type === tipo)
  .map((a) => a.payload.message);

describe("LISTE_WRITES — forma del registry", () => {
  it("ogni operazione dichiara come si esegue", () => {
    for (const [nome, spec] of Object.entries(LISTE_WRITES)) {
      expect(spec.run, `${nome} senza run`).toBeTypeOf("function");
    }
  });

  it("copre tutte e diciotto le operazioni di scrittura del modulo", () => {
    // Il conteggio è volutamente esplicito: se una scrittura viene aggiunta
    // altrove e non qui, il modulo torna ad avere due posti in cui si scrive.
    expect(Object.keys(LISTE_WRITES)).toHaveLength(18);
  });

  it("i messaggi di successo non si ripetono fra operazioni diverse", () => {
    // "Lista creata" era scritto in ListeViaggio e in ClienteListePanel:
    // due copie della stessa stringa, ciascuna modificabile senza l'altra.
    const statici = Object.values(LISTE_WRITES)
      .map((s) => s.successMsg)
      .filter((m) => typeof m === "string");
    expect(new Set(statici).size).toBe(statici.length);
  });
});

describe("useListeWrite — esecuzione", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("esegue l'operazione e annuncia il successo con il messaggio dichiarato", async () => {
    const { esegui, dispatch } = montaEsecutore();

    let esito;
    await act(async () => { esito = await esegui("cestinaLista", "l1"); });

    expect(ListeAPIMock.archivia).toHaveBeenCalledWith("l1");
    expect(esito).toEqual({ ok: true, data: null });
    expect(toastDi(dispatch, "success")).toEqual(["Lista spostata nel cestino"]);
  });

  it("restituisce i dati della RPC al chiamante", async () => {
    const { esegui } = montaEsecutore();
    let esito;
    await act(async () => { esito = await esegui("creaLista", { clientId: "c1" }); });
    expect(esito).toEqual({ ok: true, data: "nuova-lista" });
  });

  it("il messaggio può dipendere dagli argomenti", async () => {
    const { esegui, dispatch } = montaEsecutore();

    await act(async () => { await esegui("modificaTitolo", { id: "l1", titolo: "Buono 2026" }); });
    await act(async () => { await esegui("modificaTitolo", { id: "l1", titolo: null }); });

    expect(toastDi(dispatch, "success")).toEqual(["Titolo aggiornato", "Titolo rimosso"]);
    // clientName null: la RPC lascia invariato il nome del cliente. È il
    // registry a garantirlo, non più ogni singolo call site.
    expect(ListeAPIMock.modifica).toHaveBeenCalledWith({ id: "l1", titolo: "Buono 2026", clientName: null });
  });

  it("riapri ed esaurisci sono due operazioni distinte sulla stessa RPC", async () => {
    const { esegui, dispatch } = montaEsecutore();

    await act(async () => { await esegui("riapriLista", "l1"); });
    await act(async () => { await esegui("esaurisciLista", "l1"); });

    expect(ListeAPIMock.cambiaStato).toHaveBeenNthCalledWith(1, "l1", "attiva");
    expect(ListeAPIMock.cambiaStato).toHaveBeenNthCalledWith(2, "l1", "esaurita");
    expect(toastDi(dispatch, "success")).toEqual(["Lista riaperta", "Lista segnata come ESAURITA"]);
  });

  it("un'operazione senza messaggio non produce toast di successo", async () => {
    // registraMovimenti: il testo lo compone il chiamante dal numero di righe.
    const { esegui, dispatch } = montaEsecutore();
    await act(async () => { await esegui("registraMovimenti", { listaId: "l1", movimenti: [] }); });
    expect(toastDi(dispatch, "success")).toEqual([]);
  });

  it("un errore della RPC diventa un toast e ok:false", async () => {
    ListeAPIMock.archivia.mockResolvedValueOnce({ data: null, error: { message: "row level security" } });
    const { esegui, dispatch } = montaEsecutore();

    let esito;
    await act(async () => { esito = await esegui("cestinaLista", "l1"); });

    expect(esito).toEqual({ ok: false, data: null });
    expect(toastDi(dispatch, "error")).toEqual(["Errore: row level security"]);
    expect(toastDi(dispatch, "success")).toEqual([]);
  });

  it("un'operazione non dichiarata solleva invece di essere saltata in silenzio", async () => {
    const { esegui } = montaEsecutore();
    await expect(esegui("cancellaTutto", "l1")).rejects.toThrow(/non dichiarata/);
  });
});

describe("useListeWrite — guard di ruolo", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("il reset totale è negato a un non-admin, senza toccare la rete", async () => {
    // Prima del registry l'unico gate lato client era che il bottone non
    // venisse renderizzato: chiunque raggiungesse la funzione la eseguiva.
    const { esegui, dispatch } = montaEsecutore("agent1");

    let esito;
    await act(async () => { esito = await esegui("resetTotale"); });

    expect(esito).toEqual({ ok: false, data: null });
    expect(ListeAPIMock.resetCompleto).not.toHaveBeenCalled();
    expect(toastDi(dispatch, "error")).toEqual(["Non hai i permessi per questa operazione"]);
  });

  it("un admin lo esegue, con la conferma testuale esatta che la RPC pretende", async () => {
    const { esegui } = montaEsecutore("admin1");

    let esito;
    await act(async () => { esito = await esegui("resetTotale"); });

    expect(ListeAPIMock.resetCompleto).toHaveBeenCalledWith(CONFERMA_RESET);
    expect(CONFERMA_RESET).toBe("RESET TOTALE");
    expect(esito.ok).toBe(true);
  });

  it("le operazioni ordinarie restano aperte a un agent", async () => {
    const { esegui } = montaEsecutore("agent1");
    let esito;
    await act(async () => { esito = await esegui("registraMovimento", { listaId: "l1" }); });
    expect(esito.ok).toBe(true);
    expect(ListeAPIMock.addMovimento).toHaveBeenCalled();
  });
});
