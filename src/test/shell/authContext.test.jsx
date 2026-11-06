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
// M-4: il logout svuota la coda offline di chi esce.
const { svuotaScrittureDi } = vi.hoisted(() => ({ svuotaScrittureDi: vi.fn(async () => {}) }));
vi.mock("../../state/codaDispositivo.js", () => ({ svuotaScrittureDi }));

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
    // A-3 dell'analisi del 6 novembre: cambiaPassword e updatePassword.
    updateUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
  };
  return { supabaseAuth, default: supabaseAuth, __authState: state };
});

// caricaProfilo importa lib/supabase.js DINAMICAMENTE (solo quando una
// sessione esiste): il mock resta necessario per le query postgrest del
// profilo, ma non serve più esporre `.auth` qui. `from` è un vi.fn così un
// test può verificare che NON venga mai chiamato sul percorso anonimo — è la
// prova che il client pieno resta fuori da quel percorso, non solo un'ipotesi.
// B-1: `rispostaTeam.righe` sostituisce la risposta della rubrica (null = [ME]).
const { rispostaTeam } = vi.hoisted(() => ({ rispostaTeam: { righe: null } }));
vi.mock("../../lib/supabase", () => {
  const from = vi.fn((table) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: ME, error: null }),
        maybeSingle: () => Promise.resolve({ data: { email: "t@x.it", phone: null }, error: null }),
      }),
      order: () => Promise.resolve({ data: rispostaTeam.righe ?? [ME], error: null }),
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

// ─── M-4 dell'audit del 4 novembre · la coda offline non sopravvive al logout
describe("AuthContext — M-4, le scritture in attesa di chi esce si tolgono", () => {
  beforeEach(async () => {
    const { __authState, supabaseAuth } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    supabaseAuth.signOut.mockClear();
    svuotaScrittureDi.mockClear();
    revocaPushAlLogout.mockReset();
    revocaPushAlLogout.mockImplementation(async () => {});
    await import("../../state/codaDispositivo.js");
    await import("../../lib/push.js");
  });

  const montaAuth = async () => {
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.caricando).toBe(false));
    return rendered;
  };

  it.each([["signOut"], ["signOutOvunque"]])("%s() svuota la coda di chi esce, prima di uscire", async (uscita) => {
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    const { result } = await montaAuth();
    await act(async () => { await result.current[uscita](); });

    expect(svuotaScrittureDi).toHaveBeenCalledWith("u1");
    expect(svuotaScrittureDi.mock.invocationCallOrder[0])
      .toBeLessThan(supabaseAuth.signOut.mock.invocationCallOrder[0]);
  });

  it("deleteAccount() riuscito la svuota; fallito no", async () => {
    const { Users } = await import("../../lib/api.js");
    const { result } = await montaAuth();

    Users.deleteAccount.mockResolvedValueOnce({ error: { message: "denied" } });
    await act(async () => { await result.current.deleteAccount(); });
    expect(svuotaScrittureDi).not.toHaveBeenCalled();

    await act(async () => { await result.current.deleteAccount(); });
    expect(svuotaScrittureDi).toHaveBeenCalledWith("u1");
  });
});

// ─── B-1 dell'analisi del 4 novembre · un team vuoto è un errore ───────────
// Prima un team arrivato vuoto faceva montare l'app in «modalità demo», cioè
// senza persistenza: con una session valida ogni modifica restava in memoria.
// Ora caricaProfilo lo tratta come una risposta incoerente (la propria riga è
// sempre leggibile) e, dopo i retry, lo segnala con authError.
describe("AuthContext — B-1, un team senza chi ha fatto login non monta l'app", () => {
  beforeEach(async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    // In cache prima dei timer finti: l'import dinamico si risolve in microtask.
    await import("../../lib/supabase");
  });

  it("team vuoto → authError, nessun profilo e nessun team", async () => {
    rispostaTeam.righe = [];
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useAuth(), {
        wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
      });
      // Tre tentativi con le loro pause (1,2 s + 2,4 s): 10 s li coprono.
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(result.current.caricando).toBe(false);
      expect(result.current.authError?.message).toMatch(/Team vuoto/);
      expect(result.current.profile).toBeNull();
      expect(result.current.team).toEqual([]);
    } finally {
      vi.useRealTimers();
      rispostaTeam.righe = null;
    }
  });

  it("controllo positivo: con la propria riga nel team il profilo si carica", async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(result.current.profile?.id).toBe("u1"));
    expect(result.current.authError).toBeNull();
    expect(result.current.team.map((u) => u.id)).toEqual(["u1"]);
  });
});

// ─── B-2 dell'analisi del 4 novembre · il rinnovo del token è silenzioso ───
// TOKEN_REFRESHED arriva circa ogni ora: non deve rileggere profilo e team né
// cambiare l'identità di `session` (cioè del value del contesto). Un cambio
// d'utente o il logout sì.
describe("AuthContext — B-2, TOKEN_REFRESHED non ricarica e non sostituisce la session", () => {
  beforeEach(async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    __authState.callback = null;
  });

  const montaAuth = async () => {
    const { __authState } = await import("../../lib/supabaseAuth.js");
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.profile?.id).toBe("u1"));
    await waitFor(() => expect(__authState.callback).toBeTypeOf("function"));
    return { ...rendered, emetti: (evento, s) => act(async () => {
      __authState.callback(evento, s);
      await new Promise((r) => setTimeout(r, 0));
    }) };
  };

  it("TOKEN_REFRESHED: nessuna query e stessa session", async () => {
    const { result, emetti } = await montaAuth();
    const { supabase } = await import("../../lib/supabase");
    const sessionPrima = result.current.session;
    supabase.from.mockClear();

    await emetti("TOKEN_REFRESHED", { ...SESSION, access_token: "nuovo" });

    expect(supabase.from).not.toHaveBeenCalled();
    expect(result.current.session).toBe(sessionPrima);
  });

  it("stesso utente su un altro evento: la session resta la stessa", async () => {
    const { result, emetti } = await montaAuth();
    const sessionPrima = result.current.session;
    await emetti("USER_UPDATED", { ...SESSION, access_token: "nuovo" });
    expect(result.current.session).toBe(sessionPrima);
  });

  it("controllo positivo: il logout azzera la session", async () => {
    const { result, emetti } = await montaAuth();
    await emetti("SIGNED_OUT", null);
    expect(result.current.session).toBeNull();
    await waitFor(() => expect(result.current.profile).toBeNull());
  });

  it("controllo positivo: un utente diverso sostituisce la session", async () => {
    const { result, emetti } = await montaAuth();
    const altra = { user: { id: "u2" }, access_token: "tok2" };
    await emetti("SIGNED_IN", altra);
    expect(result.current.session).toBe(altra);
  });
});

// ─── A-3 dell'analisi del 6 novembre · la password attuale arriva a GoTrue ──
// Il controllo lo fa il server (opzione «Require current password when
// changing password»): qui si verifica che il client la MANDI, nel campo che
// GoTrue legge, e che il recupero password continui a non mandarla.
describe("AuthContext — A-3, le operazioni irreversibili portano la password", () => {
  beforeEach(async () => {
    const { __authState, supabaseAuth } = await import("../../lib/supabaseAuth.js");
    __authState.session = SESSION;
    supabaseAuth.updateUser.mockClear();
    const { Users } = await import("../../lib/api.js");
    Users.deleteAccount.mockClear();
  });

  const montaAuth = async () => {
    const rendered = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(rendered.result.current.caricando).toBe(false));
    return rendered;
  };

  it("cambiaPassword manda la password attuale come current_password", async () => {
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    const { result } = await montaAuth();
    let esito;
    await act(async () => { esito = await result.current.cambiaPassword("Vecchia1234567", "Nuova12345678"); });
    // `current_password`, con l'underscore: supabase-js 2.108 mette gli
    // attributi nel corpo così come sono, e GoTrue legge quel nome.
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: "Nuova12345678", current_password: "Vecchia1234567" });
    expect(esito.error).toBeNull();
  });

  it("il rifiuto di GoTrue torna in italiano, con il codice originale accanto", async () => {
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    supabaseAuth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "current_password_mismatch", message: "Current password required when setting new password." },
    });
    const { result } = await montaAuth();
    let esito;
    await act(async () => { esito = await result.current.cambiaPassword("sbagliata", "Nuova12345678"); });
    expect(esito.error.message).toBe("La password attuale non è corretta.");
    expect(esito.error.code).toBe("current_password_mismatch");
  });

  it("updatePassword (recupero e invito) NON manda current_password: lì non esiste", async () => {
    const { supabaseAuth } = await import("../../lib/supabaseAuth.js");
    const { result } = await montaAuth();
    await act(async () => { await result.current.updatePassword("Nuova12345678"); });
    expect(supabaseAuth.updateUser).toHaveBeenCalledWith({ password: "Nuova12345678" });
  });

  it("deleteAccount consegna la password al data layer", async () => {
    const { Users } = await import("../../lib/api.js");
    const { result } = await montaAuth();
    await act(async () => { await result.current.deleteAccount("LaMiaPassword1"); });
    expect(Users.deleteAccount).toHaveBeenCalledWith("LaMiaPassword1");
  });
});
