// Regressione avvio bloccato su "Caricamento…" (deadlock lock auth).
// gotrue-js emette gli eventi di onAuthStateChange (compreso INITIAL_SESSION,
// sparato subito alla sottoscrizione) TENENDO il lock auth e ASPETTANDO che il
// callback finisca. Un callback async che faceva `await loadProfile(...)`
// (query supabase → getSession() → stesso lock) creava un'attesa circolare:
// spinner "Caricamento…" bloccato a ogni avvio, desktop e mobile, sbloccabile
// solo con un refresh manuale. Il fix rende il callback sincrono e rimanda il
// caricamento profilo fuori dal lock con setTimeout(0). Questi test verificano
// entrambe le proprietà: callback sincrono (niente Promise di ritorno) e app
// che esce comunque dal caricando con il profilo caricato.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, renderHook } from "@testing-library/react";
import { AuthProvider, useAuth, REVOCA_PUSH_TIMEOUT_MS } from "../../auth/AuthContext.jsx";

const ME = { id: "u1", name: "Tullio", role: "admin", photo_url: null, pending: false };
const SESSION = { user: { id: "u1" }, access_token: "tok" };

vi.mock("../../lib/api.js", () => ({
  Users: { deleteAccount: vi.fn(async () => ({ error: null })) },
  // B-4 dell'audit del 5 settembre: serve allo spy del describe qui sotto.
  svuotaCacheUrl: vi.fn(),
}));

// A-1 dell'audit del 4 novembre: il logout revoca le push del dispositivo.
// `vi.hoisted` perché la factory di vi.mock gira prima degli import.
const { revocaPushAlLogout } = vi.hoisted(() => ({ revocaPushAlLogout: vi.fn(async () => {}) }));
vi.mock("../../lib/push.js", () => ({ revocaPushAlLogout }));

// getSession/onAuthStateChange passano da lib/supabaseAuth.js (B-2 dell'audit
// del 30 agosto): AuthContext non tocca più il client pieno per l'auth.
// `state.session` è mutabile (default SESSION quando non impostato) così un
// test può simulare il percorso anonimo assegnandogli `null` prima del
// render. NOTA: `SESSION` è letta dentro la closure di `getSession`, non
// nell'inizializzazione di `state` — la factory di vi.mock è hoisted sopra
// gli import e girerebbe prima che `const SESSION` qui sotto sia inizializzata
// (TDZ) se la leggesse a costruzione invece che a chiamata.
vi.mock("../../lib/supabaseAuth.js", () => {
  const state = { callback: null, session: undefined };
  const supabaseAuth = {
    getSession: () => Promise.resolve({
      data: { session: state.session !== undefined ? state.session : SESSION },
    }),
    onAuthStateChange: (cb) => {
      state.callback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    // B-4 dell'audit del 5 settembre: signOut/signOutOvunque/deleteAccount lo
    // chiamano prima di svuotare la cache delle signed URL.
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { supabaseAuth, default: supabaseAuth, __authState: state };
});

// caricaProfilo importa lib/supabase.js DINAMICAMENTE (solo quando una
// sessione esiste): il mock resta necessario per le query postgrest del
// profilo, ma non serve più esporre `.auth` qui. `from` è un vi.fn così un
// test può verificare che NON venga mai chiamato sul percorso anonimo — è la
// prova che il client pieno resta fuori da quel percorso, non solo un'ipotesi.
vi.mock("../../lib/supabase", () => {
  const from = vi.fn((table) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: ME, error: null }),
        maybeSingle: () => Promise.resolve({ data: { email: "t@x.it", phone: null }, error: null }),
      }),
      order: () => Promise.resolve({ data: [ME], error: null }),
      _table: table,
    }),
  }));
  const supabase = { from };
  return { supabase, default: supabase, getSupabase: () => Promise.resolve(supabase) };
});

function Probe() {
  const { caricando, profile } = useAuth();
  if (caricando) return <div>PROBE_LOADING</div>;
  return <div>PROBE_READY:{profile?.name ?? "nessuno"}</div>;
}

describe("AuthContext — avvio senza deadlock sul lock auth", () => {
  it("il callback di onAuthStateChange è sincrono (non restituisce una Promise)", async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(__authState.callback).toBeTypeOf("function"));

    let returned;
    act(() => {
      returned = __authState.callback("INITIAL_SESSION", SESSION);
    });
    // Se qualcuno reintroduce `async (_event, s) => …` il callback torna una
    // Promise: gotrue la aspetterebbe tenendo il lock auth → deadlock all'avvio.
    expect(returned).toBeUndefined();
  });

  it("esce dal caricando e carica il profilo dopo INITIAL_SESSION", async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    expect(screen.getByText("PROBE_LOADING")).toBeInTheDocument();

    await waitFor(() => expect(__authState.callback).toBeTypeOf("function"));
    act(() => {
      __authState.callback("INITIAL_SESSION", SESSION);
    });

    await waitFor(() => expect(screen.getByText("PROBE_READY:Tullio")).toBeInTheDocument());
  });
});

describe("AuthContext — B-2, il percorso anonimo non tocca il client pieno", () => {
  beforeEach(async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    __authState.callback = null;
    const { supabase } = await import("../../lib/supabase");
    supabase.from.mockClear();
  });

  it("senza sessione, caricaProfilo non importa mai il client pieno (nessuna query postgrest)", async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    __authState.session = null; // percorso anonimo: nessuna sessione da getSession()

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("PROBE_READY:nessuno")).toBeInTheDocument());

    // Verifica che caricaProfilo abbia preso il ramo `if (!userId) { … return; }`
    // — quello che l'import dinamico di lib/supabase.js non raggiunge mai —
    // invece di limitarsi a controllare lo stato finale, che sarebbe vero
    // anche se il client pieno venisse scaricato e poi ignorato.
    const { supabase } = await import("../../lib/supabase");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("con una sessione, caricaProfilo interroga il client pieno per il profilo", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText("PROBE_READY:Tullio")).toBeInTheDocument());

    const { supabase } = await import("../../lib/supabase");
    expect(supabase.from).toHaveBeenCalledWith("users");
  });
});

// B-4 dell'audit del 5 settembre. `signOut()` non ricarica la pagina — la SPA
// torna alla LoginScreen nella STESSA scheda — quindi senza svuotare la cache
// delle signed URL (src/lib/api/storage.js) chi entra dopo un logout vedrebbe,
// per il resto del loro TTL, gli avatar e gli allegati di chi è appena uscito.
// I tre call site (signOut, signOutOvunque, deleteAccount riuscito) condividono
// lo stesso helper: qui si verifica che ciascuno lo richiami DAVVERO, non solo
// che esista da qualche parte nel file.
describe("AuthContext — B-4, le signed URL non sopravvivono al logout", () => {
  beforeEach(async () => {
    const { __authState, supabaseAuth } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    supabaseAuth.signOut.mockClear();
    const { svuotaCacheUrl } = await import("../../lib/api.js");
    svuotaCacheUrl.mockClear();
  });

  // Aspetta che la sequenza di init (getSession + onAuthStateChange) sia
  // finita prima di restituire l'hook: altrimenti l'aggiornamento di stato
  // dell'init e quello dell'azione in prova potrebbero sovrapporsi fuori da
  // un act() solo.
  const montaAuth = async () => {
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.caricando).toBe(false));
    return rendered;
  };

  it("signOut() svuota la cache delle signed URL", async () => {
    const { result } = await montaAuth();
    await act(async () => { await result.current.signOut(); });

    const { svuotaCacheUrl } = await import("../../lib/api.js");
    expect(svuotaCacheUrl).toHaveBeenCalledTimes(1);
  });

  it("signOutOvunque() svuota la cache delle signed URL", async () => {
    const { result } = await montaAuth();
    await act(async () => { await result.current.signOutOvunque(); });

    const { svuotaCacheUrl } = await import("../../lib/api.js");
    expect(svuotaCacheUrl).toHaveBeenCalledTimes(1);
  });

  it("deleteAccount() riuscito svuota la cache delle signed URL", async () => {
    const { result } = await montaAuth();
    await act(async () => { await result.current.deleteAccount(); });

    const { svuotaCacheUrl } = await import("../../lib/api.js");
    expect(svuotaCacheUrl).toHaveBeenCalledTimes(1);
  });

  it("deleteAccount() fallito NON svuota la cache (nessun logout avvenuto)", async () => {
    const { Users } = await import("../../lib/api.js");
    Users.deleteAccount.mockResolvedValueOnce({ error: { message: "denied" } });

    const { result } = await montaAuth();
    await act(async () => { await result.current.deleteAccount(); });

    const { svuotaCacheUrl } = await import("../../lib/api.js");
    expect(svuotaCacheUrl).not.toHaveBeenCalled();
  });
});

// ─── A-1 dell'audit del 4 novembre · il logout revoca le push ──────────────
// Su un PC condiviso la sottoscrizione push restava dell'utente uscito: chi
// entrava dopo riceveva le sue notifiche, anteprime della chat comprese. Qui
// si verifica che i tre punti d'uscita chiamino la revoca, che la chiamino
// PRIMA del signOut (la DELETE su push_subscriptions passa dalla RLS e serve
// il JWT) e che una revoca appesa non blocchi l'uscita.
describe("AuthContext — A-1, le push non sopravvivono al logout", () => {
  beforeEach(async () => {
    const { __authState, supabaseAuth } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    supabaseAuth.signOut.mockClear();
    revocaPushAlLogout.mockReset();
    revocaPushAlLogout.mockImplementation(async () => {});
    // Già in cache prima dell'azione: l'import dinamico in AuthContext si
    // risolve allora in un giro di microtask, anche sotto i timer finti.
    await import("../../lib/push.js");
  });

  const montaAuth = async () => {
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.caricando).toBe(false));
    return rendered;
  };

  const primaDelSignOut = async () => {
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    expect(revocaPushAlLogout.mock.invocationCallOrder[0])
      .toBeLessThan(supabaseAuth.signOut.mock.invocationCallOrder[0]);
  };

  it("signOut() revoca le push di questo dispositivo, prima di uscire", async () => {
    const { result } = await montaAuth();
    await act(async () => { await result.current.signOut(); });

    expect(revocaPushAlLogout).toHaveBeenCalledWith("u1", { ovunque: false });
    await primaDelSignOut();
  });

  it("signOutOvunque() revoca le push su tutti i dispositivi, prima di uscire", async () => {
    const { result } = await montaAuth();
    await act(async () => { await result.current.signOutOvunque(); });

    expect(revocaPushAlLogout).toHaveBeenCalledWith("u1", { ovunque: true });
    await primaDelSignOut();
  });

  it("deleteAccount() riuscito revoca le push; fallito no", async () => {
    const { Users } = await import("../../lib/api.js");
    const { result } = await montaAuth();

    Users.deleteAccount.mockResolvedValueOnce({ error: { message: "denied" } });
    await act(async () => { await result.current.deleteAccount(); });
    expect(revocaPushAlLogout).not.toHaveBeenCalled();

    await act(async () => { await result.current.deleteAccount(); });
    expect(revocaPushAlLogout).toHaveBeenCalledTimes(1);
  });

  it("una revoca che fallisce non impedisce l'uscita", async () => {
    revocaPushAlLogout.mockRejectedValueOnce(new Error("rete"));
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    const { result } = await montaAuth();

    let esito;
    await act(async () => { esito = await result.current.signOut(); });
    expect(supabaseAuth.signOut).toHaveBeenCalledTimes(1);
    expect(esito).toEqual({ error: null });
  });

  it("senza rete la revoca appesa non blocca l'uscita oltre il tetto di tempo", async () => {
    revocaPushAlLogout.mockImplementationOnce(() => new Promise(() => {}));
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    const { result } = await montaAuth();

    vi.useFakeTimers();
    try {
      let finito = false;
      await act(async () => {
        const uscita = result.current.signOut().then(() => { finito = true; });
        await vi.advanceTimersByTimeAsync(REVOCA_PUSH_TIMEOUT_MS - 1);
        expect(finito).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await uscita;
      });
      expect(finito).toBe(true);
      expect(supabaseAuth.signOut).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
