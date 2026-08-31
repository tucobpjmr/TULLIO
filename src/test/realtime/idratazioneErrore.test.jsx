// A-3 dell'audit UX/errori del 31 agosto — il TERZO stato dell'idratazione.
//
// Il rilievo: `caricamento[entita]` chiude sia sul successo sia sull'errore —
// scelta dichiarata e giusta (uno scheletro che gira per sempre è disonesto
// quanto un vuoto) — ma la sua conseguenza non era chiusa. Le viste avevano
// DUE stati per rappresentarne TRE, e il terzo si travestiva da vuoto: su un
// fetch fallito la Dashboard diceva «Nessuna task aperta a tuo nome. Buon
// lavoro!». Il canale previsto era il toast, che è effimero contro una
// condizione che dura, e non c'era alcun «Riprova».
//
// ⚠️ Il caso più importante è il TERZO test: una richiesta riuscita deve
// SPEGNERE l'errore precedente. Un allarme che resta acceso dopo che i dati
// sono tornati è la cosa che rende ignorabili tutti gli altri — e chi rimedia
// può essere il reload di una riconnessione, non solo il «Riprova».
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const vuota = async () => ({ data: [], error: null });
// `Tasks.list` è pilotabile per singola chiamata: serve a far fallire il primo
// tentativo e riuscire il secondo, che è tutto il ciclo del rilievo.
let rispostaTasks = vuota;

vi.mock("../../lib/api.js", () => ({
  Tasks: { list: (...a) => rispostaTasks(...a) },
  Notices: { list: vuota },
  Categories: { list: vuota },
  Users: { listAll: vuota, getContacts: async () => ({ data: null }) },
  Clients: { list: vuota },
  MessageTemplates: { list: vuota },
  TaskThreads: { comments: vuota },
  subscribeToTable: () => () => {},
}));

const { useAppHydration } = await import("../../hooks/useAppHydration.js");

const monta = (onError = vi.fn()) => renderHook(() => useAppHydration({
  enabled: true,
  currentUserId: "u1",
  dispatch: vi.fn(),
  onError,
  teamIniziale: null,
}));

beforeEach(() => { rispostaTasks = vuota; });

describe("A-3 · un caricamento fallito non è un elenco vuoto", () => {
  it("un fetch riuscito non lascia alcun errore", async () => {
    const { result } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    expect(result.current.erroriCaricamento.tasks).toBeNull();
  });

  it("un fetch fallito lascia un errore per QUELLA entità, con il suo messaggio", async () => {
    rispostaTasks = async () => ({ data: null, error: { message: "rete giù" } });
    const onError = vi.fn();
    const { result } = monta(onError);

    await waitFor(() => expect(result.current.erroriCaricamento.tasks).not.toBeNull());

    // Il toast resta: annuncia. Ma accanto c'è ora lo stato, che dura.
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("rete giù"));
    expect(result.current.erroriCaricamento.tasks.messaggio).toContain("rete giù");
    expect(typeof result.current.erroriCaricamento.tasks.riprova).toBe("function");

    // Il flag di caricamento CHIUDE lo stesso (criticità #6: niente scheletro
    // perpetuo) — è proprio questo che rendeva il fallimento indistinguibile
    // da un elenco vuoto, e la distinzione ora la porta l'errore.
    expect(result.current.caricamento.tasks).toBe(false);

    // Le altre entità non sono toccate: il fallimento è per entità e non
    // globale, o «l'archivio non si è caricato» diventerebbe «l'app è rotta».
    expect(result.current.erroriCaricamento.notices).toBeNull();
    expect(result.current.erroriCaricamento.team).toBeNull();
  });

  it("«Riprova» rifà la richiesta, e sul successo l'errore si spegne", async () => {
    rispostaTasks = async () => ({ data: null, error: { message: "rete giù" } });
    const { result } = monta();
    await waitFor(() => expect(result.current.erroriCaricamento.tasks).not.toBeNull());

    rispostaTasks = vuota;
    await act(async () => { result.current.erroriCaricamento.tasks.riprova(); });

    await waitFor(() => expect(result.current.erroriCaricamento.tasks).toBeNull());
  });

  it("un secondo tentativo fallito non fa perdere l'errore", async () => {
    rispostaTasks = async () => ({ data: null, error: { message: "rete giù" } });
    const { result } = monta();
    await waitFor(() => expect(result.current.erroriCaricamento.tasks).not.toBeNull());

    await act(async () => { result.current.erroriCaricamento.tasks.riprova(); });
    await waitFor(() => expect(result.current.erroriCaricamento.tasks).not.toBeNull());
  });
});

describe("A-3 · il team, l'unico ramo che non diceva niente", () => {
  it("un `Users.listAll` fallito ora produce sia il toast sia lo stato", async () => {
    // Prima di A-3 questo ramo faceva `console.error` e basta: nessun toast,
    // nessuno stato — e su `state.team` si calcola la matrice dei permessi
    // lato client.
    const api = await import("../../lib/api.js");
    const originale = api.Users.listAll;
    api.Users.listAll = async () => ({ data: null, error: { message: "403" } });
    const onError = vi.fn();

    const { result } = monta(onError);
    await waitFor(() => expect(result.current.erroriCaricamento.team).not.toBeNull());
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("team"));

    api.Users.listAll = originale;
  });
});

describe("A-3 · l'identità dell'oggetto (le viste sono `memo`)", () => {
  it("non cambia quando non cambia nessun errore", async () => {
    const { result, rerender } = monta();
    await waitFor(() => expect(result.current.caricamento.tasks).toBe(false));
    const prima = result.current.erroriCaricamento;
    rerender();
    expect(result.current.erroriCaricamento).toBe(prima);
  });
});
