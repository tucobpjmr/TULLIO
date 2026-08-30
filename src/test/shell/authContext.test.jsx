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
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../auth/AuthContext.jsx";

const ME = { id: "u1", name: "Tullio", role: "admin", photo_url: null, pending: false };
const SESSION = { user: { id: "u1" }, access_token: "tok" };

vi.mock("../../lib/api.js", () => ({
  Users: { deleteAccount: vi.fn(async () => ({ error: null })) },
}));

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
