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
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth/AuthContext.jsx";

const ME = { id: "u1", name: "Tullio", role: "admin", photo_url: null, pending: false };
const SESSION = { user: { id: "u1" }, access_token: "tok" };

vi.mock("../lib/api.js", () => ({
  Users: { deleteAccount: vi.fn(async () => ({ error: null })) },
}));

vi.mock("../lib/supabase", () => {
  const state = { callback: null };
  const from = (table) => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: ME, error: null }),
        maybeSingle: () => Promise.resolve({ data: { email: "t@x.it", phone: null }, error: null }),
      }),
      order: () => Promise.resolve({ data: [ME], error: null }),
      _table: table,
    }),
  });
  const supabase = {
    from,
    auth: {
      getSession: () => Promise.resolve({ data: { session: SESSION } }),
      onAuthStateChange: (cb) => {
        state.callback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  };
  return { supabase, default: supabase, __authState: state };
});

function Probe() {
  const { caricando, profile } = useAuth();
  if (caricando) return <div>PROBE_LOADING</div>;
  return <div>PROBE_READY:{profile?.name ?? "nessuno"}</div>;
}

describe("AuthContext — avvio senza deadlock sul lock auth", () => {
  it("il callback di onAuthStateChange è sincrono (non restituisce una Promise)", async () => {
    const { __authState } = await import("../lib/supabase");
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
    const { __authState } = await import("../lib/supabase");
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
