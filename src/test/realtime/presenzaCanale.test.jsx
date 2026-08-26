// src/test/presenzaCanale.test.jsx
// A-3 dell'audit performance/UX del 19 agosto — la presenza non passa più dal
// database.
//
// PERCHÉ QUESTI CASI E NON ALTRI. Il rilievo non era «la presenza è lenta»: era
// che il suo costo cresce col QUADRATO delle sessioni collegate, perché ogni
// battito era una `UPDATE` su una tabella in realtime e ogni sessione era
// sottoscritta a quella tabella due volte. Un difetto così non si vede da
// nessuna schermata e non fa fallire nessun test funzionale — la presenza
// funzionava benissimo. Quindi ciò che va fissato qui non è il comportamento
// visibile, è l'ASSENZA di scritture: quante volte si tocca `users` in una
// sessione, e che il rinfresco periodico passi dal canale.
//
// ⚠️ I casi in NEGATIVO («setPresence non è stata chiamata») passerebbero anche
// se l'hook non facesse assolutamente nulla. Per questo ogni gruppo porta
// accanto il proprio controllo POSITIVO: che il `track` sul canale sia partito,
// che la mappa si popoli. Senza, questo file certificherebbe un hook rotto.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const setPresence = vi.fn(async () => ({ error: null }));
const subscribeToTable = vi.fn(() => () => {});
const track = vi.fn();
const unsubscribe = vi.fn();
// L'ultimo `onSync` registrato, per simulare una sincronizzazione del canale.
let ultimoOnSync = null;
let ultimoPayload = null;

vi.mock("../../lib/api.js", () => ({
  Users: { setPresence: (...a) => setPresence(...a) },
  subscribeToTable: (...a) => subscribeToTable(...a),
  subscribeToPresence: ({ payload, onSync }) => {
    ultimoOnSync = onSync;
    ultimoPayload = payload;
    return { track: (...a) => track(...a), unsubscribe: (...a) => unsubscribe(...a) };
  },
}));

const { usePresence } = await import("../../hooks/usePresence.js");
const { daStatoCanale, computePresence, REFRESH_PRESENZA_MS } =
  await import("../../lib/presenza.js");

const TEAM = [{ id: "u1", name: "Marco", color: "#f00" }, { id: "u2", name: "Sofia" }];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setPresence.mockClear();
  subscribeToTable.mockClear();
  track.mockClear();
  unsubscribe.mockClear();
  ultimoOnSync = null;
  ultimoPayload = null;
});
afterEach(() => { vi.useRealTimers(); });

const monta = () => renderHook(
  () => usePresence({ enabled: true, userId: "u1", team: TEAM }),
);

describe("A-3 · la presenza non scrive più su public.users a ogni battito", () => {
  it("una sessione che resta aperta dieci minuti scrive UNA volta sola", async () => {
    monta();
    await waitFor(() => expect(setPresence).toHaveBeenCalledTimes(1));
    expect(setPresence).toHaveBeenCalledWith("u1", "online");

    // Dieci minuti: col vecchio heartbeat sarebbero state venti UPDATE, ognuna
    // consegnata a tutte le sessioni collegate, due volte ciascuna.
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });

    expect(setPresence).toHaveBeenCalledTimes(1);
  });

  it("…e nel frattempo il canale è stato rinfrescato (controllo positivo)", async () => {
    monta();
    await waitFor(() => expect(ultimoOnSync).toBeTruthy());
    track.mockClear();

    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000); });

    // Il rinfresco esiste ed è passato dal canale, non dal database: senza
    // questo caso il precedente passerebbe anche con l'hook spento.
    expect(track).toHaveBeenCalledTimes((10 * 60 * 1000) / REFRESH_PRESENZA_MS);
  });

  it("passare in secondo piano si pubblica sul canale, non sul database", async () => {
    monta();
    await waitFor(() => expect(setPresence).toHaveBeenCalledTimes(1));
    setPresence.mockClear();
    track.mockClear();

    // Su mobile questo evento lo emettono il commutatore di app, la tendina
    // delle notifiche e il selettore di file: era il percorso che scattava
    // più spesso di tutti.
    Object.defineProperty(document, "visibilityState", {
      value: "hidden", configurable: true,
    });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });

    expect(setPresence).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(1);
    expect(ultimoPayload()).toMatchObject({ status: "away" });

    Object.defineProperty(document, "visibilityState", {
      value: "visible", configurable: true,
    });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(setPresence).not.toHaveBeenCalled();
    expect(ultimoPayload()).toMatchObject({ status: "online" });
  });

  it("non apre più un secondo canale su `users` (il fattore ×2 del rilievo)", async () => {
    monta();
    await waitFor(() => expect(ultimoOnSync).toBeTruthy());

    // L'altra sottoscrizione a `users` — il refresh del team — vive in
    // useAppHydration e resta: qui si verifica che la presenza non ne apra
    // una SECONDA sulla stessa tabella per ogni sessione.
    expect(subscribeToTable).not.toHaveBeenCalled();
  });

  it("alla chiusura scrive `offline` e chiude il canale", async () => {
    const { unmount } = monta();
    await waitFor(() => expect(setPresence).toHaveBeenCalledTimes(1));
    setPresence.mockClear();

    unmount();

    expect(setPresence).toHaveBeenCalledWith("u1", "offline");
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("A-3 · lo stato del canale arriva nella mappa di presenza", () => {
  it("il collega collegato risulta online senza che il database dica niente", async () => {
    const { result } = monta();
    await waitFor(() => expect(ultimoOnSync).toBeTruthy());

    // u2 non ha `status`/`last_seen_at` nella riga del team: senza il canale
    // `computePresence` lo direbbe offline.
    expect(computePresence(result.current.presenceMap.u2)).toBe("offline");

    act(() => {
      ultimoOnSync({ u2: [{ status: "online", at: Date.now() }] });
    });

    expect(computePresence(result.current.presenceMap.u2)).toBe("online");
    // ⚠️ E la riga del team sotto NON è stata sostituita: il canale porta la
    // presenza, non il nome e il colore con cui si disegna l'avatar.
    expect(result.current.presenceMap.u2.name).toBe("Sofia");
  });

  it("chi non è nel canale conserva ciò che dice il database", async () => {
    const { result } = monta();
    await waitFor(() => expect(ultimoOnSync).toBeTruthy());

    act(() => { ultimoOnSync({ u1: [{ status: "online", at: Date.now() }] }); });

    // u2 non compare nella sincronizzazione: non deve sparire dalla mappa né
    // ereditare lo stato di qualcun altro.
    expect(result.current.presenceMap.u2).toMatchObject({ name: "Sofia" });
    expect(result.current.presenceMap.u2.status).toBeUndefined();
  });
});

describe("daStatoCanale — più schede della stessa persona", () => {
  it("vince la voce con `at` più recente, non una precedenza fra stati", () => {
    const ora = Date.now();
    const m = daStatoCanale({
      u1: [
        { status: "online", at: ora - 60_000 },
        { status: "away", at: ora },          // l'ultima cosa che ha fatto
      ],
    });
    expect(m.u1.status).toBe("away");

    // E nell'ordine inverso il verdetto si inverte: è la prova che a decidere
    // è `at` e non l'ordine dell'array né una tabella di priorità.
    const m2 = daStatoCanale({
      u1: [
        { status: "away", at: ora - 60_000 },
        { status: "online", at: ora },
      ],
    });
    expect(m2.u1.status).toBe("online");
  });

  it("una voce senza `at` vale come presente adesso, non come assente", () => {
    const m = daStatoCanale({ u1: [{ status: "busy" }] });
    // La connessione ESISTE: scartarla dichiarerebbe offline qualcuno che è
    // collegato, che è l'errore peggiore dei due.
    expect(computePresence(m.u1)).toBe("busy");
  });

  it("stato vuoto o malformato non produce voci fantasma", () => {
    expect(daStatoCanale(undefined)).toEqual({});
    expect(daStatoCanale({ u1: [] })).toEqual({});
    expect(daStatoCanale({ u1: [null] })).toEqual({});
  });
});
