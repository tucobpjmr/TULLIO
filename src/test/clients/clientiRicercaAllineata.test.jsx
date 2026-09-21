// I risultati della ricerca anagrafica seguono le mutazioni locali.
//
// IL CASO IN PRODUZIONE (16 settembre). Un admin cerca "masi alessan", trova la
// scheda e la elimina: `audit_log` registra `clienti.eliminati righe: 1`. La
// card però resta a schermo — l'elenco, a ricerca attiva, disegnava i risultati
// della RPC `cerca_clienti`, che sono uno `useState` dentro
// `hooks/useRicercaAnagrafica.js` e non una fetta del reducer, quindi nessun
// dispatch li tocca. Lui preme Rimuovi una seconda volta, la DELETE parte e non
// trova nulla (`righe: 0` dieci secondi dopo, stesso attore), e siccome
// `count: 0` è indistinguibile da un rifiuto della RLS
// (`lib/esitoScrittura.js`) il gestionale gli risponde «permessi
// insufficienti» — all'utente che ha tutti i permessi e che l'eliminazione
// l'aveva appena completata.
//
// La ricerca dice QUALI schede; `state.clients` dice che cosa sono adesso.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

// La fotografia che il server ha restituito: fissa per costruzione, come la
// RPC vera dopo aver risposto. È il punto del test — non cambia mai, e
// l'elenco deve cambiare lo stesso.
let fotografia = [];
const cercaAnagrafica = vi.fn(async () => ({
  data: fotografia, count: fotografia.length, error: null,
}));
vi.mock("../../lib/api.js", () => ({
  Clients: {
    list: vi.fn(async () => ({ data: [], error: null })),
    cercaAnagrafica: (...a) => cercaAnagrafica(...a),
  },
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));
vi.mock("../../components/liste/listeModuleApi.js", () => ({
  conteggioListePerCliente: vi.fn(async () => ({})),
  listeRicercabili: vi.fn(async () => []),
}));

const { ClientiView } = await import("../../components/clients/ClientiView.jsx");

const cliente = (id, name) => ({
  id, name, city: "MASSAFRA", email: "", phone: "", notes: "",
  createdAt: "2026-07-21T17:49:12.000Z",
});
const MASI = cliente("cl1", "MASI ALESSANDRO");
const MASI_2024 = cliente("cl2", "MASI ALESSANDRO 2024");

// Monta la vista, digita la ricerca e lascia scadere il debounce: da qui in poi
// la fotografia è in mano al componente e non verrà più richiesta.
const montaEcerca = async (clients, { loading = false } = {}) => {
  const ctx = { dispatch: vi.fn(), ...DEMO_APP_CTX, clients };
  const utils = renderWithAppData(<ClientiView loading={loading} />, ctx);
  fireEvent.change(screen.getByPlaceholderText(/Cerca/i), { target: { value: "masi alessan" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  return {
    ...utils,
    // Ri-renderizza con un'anagrafica diversa SENZA toccare la query: è la
    // sequenza reale (dispatch → nuovo state.clients → stessa ricerca aperta).
    conClienti: (prossimi, opts = {}) =>
      utils.rerender(<ClientiView loading={opts.loading ?? loading} />, { ...ctx, clients: prossimi }),
  };
};

describe("ClientiView — la ricerca lato server segue le mutazioni locali", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fotografia = [MASI, MASI_2024];
  });
  afterEach(() => { vi.useRealTimers(); });

  it("un cliente eliminato sparisce dall'elenco senza rifare la ricerca", async () => {
    const vista = await montaEcerca([MASI, MASI_2024]);
    expect(screen.getByText("MASI ALESSANDRO 2024")).toBeTruthy();

    // DELETE_CLIENT è già passato dal reducer: lo state non ha più quella riga.
    vista.conClienti([MASI]);

    expect(screen.queryByText("MASI ALESSANDRO 2024")).toBeNull();
    expect(screen.getByText("MASI ALESSANDRO")).toBeTruthy();
    // La fotografia non è stata richiesta di nuovo: l'allineamento è locale,
    // non un secondo giro di rete a ogni scrittura.
    expect(cercaAnagrafica).toHaveBeenCalledTimes(1);
  });

  it("un cliente rinominato mostra il nome NUOVO, non quello fotografato", async () => {
    const vista = await montaEcerca([MASI, MASI_2024]);

    vista.conClienti([MASI, { ...MASI_2024, name: "MASI ALESSANDRO 2025" }]);

    expect(screen.getByText("MASI ALESSANDRO 2025")).toBeTruthy();
    expect(screen.queryByText("MASI ALESSANDRO 2024")).toBeNull();
  });

  it("con l'anagrafica ancora in volo i risultati del server restano intatti", async () => {
    // Un refetch dell'anagrafica è in corso (realtime, ripresa dopo un buco di
    // rete): finché non ha risposto, l'assenza di una riga da `clients` non
    // significa «eliminata», significa «non ancora arrivata». Riconciliare qui
    // cancellerebbe risultati validi — la stessa famiglia di bugia degli stati
    // di attesa disonesti (docs/CLAUDE.md).
    await montaEcerca([MASI], { loading: true });
    expect(screen.getByText("MASI ALESSANDRO 2024")).toBeTruthy();
    expect(screen.getByText("MASI ALESSANDRO")).toBeTruthy();
  });

  it("a caricamento fallito (corpus vuoto, attesa chiusa) non si cancella nulla", async () => {
    await montaEcerca([], { loading: false });
    expect(screen.getByText("MASI ALESSANDRO 2024")).toBeTruthy();
  });

  it("il pannello aperto sul cliente eliminato si chiude", async () => {
    // Il pannello è la seconda fotografia della stessa scheda (`selectedClient`
    // è l'oggetto com'era al click): senza la stessa regola resterebbe aperto
    // su task e liste di un cliente che non esiste più.
    const vista = await montaEcerca([MASI, MASI_2024]);
    fireEvent.click(screen.getByText("MASI ALESSANDRO 2024"));
    expect(screen.getByLabelText("Chiudi il pannello")).toBeTruthy();

    vista.conClienti([MASI]);

    expect(screen.queryByLabelText("Chiudi il pannello")).toBeNull();
  });
});
