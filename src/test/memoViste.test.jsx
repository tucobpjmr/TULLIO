// src/test/memoViste.test.jsx
// ST-1 e ST-2 — il `memo` di viste e guscio deve DAVVERO saltare il render.
//
// PERCHÉ ESISTE. `VoyageDesk.jsx` e `state/TasksContext.jsx` dichiarano
// un'invariante precisa: le viste non ricevono `state`, ricevono fette a
// identità stabile, e sono `memo` — così un'azione che non le riguarda (un
// toast, un carattere digitato nella ricerca della Topbar) non le
// ri-renderizza. Tre sessioni di lavoro sono state spese per ottenerla.
//
// Non era verificata da nessun test, e infatti non valeva: `openChatTo` era
// una funzione nuda nel corpo di VoyageDeskInner, quindi la prop `onOpenChat`
// della Dashboard cambiava identità a OGNI render e il confronto del memo
// falliva sempre. Misurato prima della correzione: 3 render della Dashboard
// per 3 caratteri digitati. Nessun test funzionale diventava rosso, perché
// l'app si comportava correttamente — costava solo il triplo.
//
// Questo file misura la proprietà invece di fidarsi della lettura. Le viste e
// la nav sono stub `memo` che contano i propri render: se le prop che
// VoyageDesk passa loro hanno identità stabile, il contatore non si muove.
// Un contatore che si muove qui è una prop instabile — la sola cosa che questo
// test esiste per intercettare.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { memo } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
// L'app monta UserSwitcher → useAuth(). Senza login reale il provider non c'è.
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ signOut: () => {}, session: null, profile: null }),
  AuthProvider: ({ children }) => children,
}));

const conteggio = { dashboard: 0, sidebar: 0, bottomNav: 0 };

// Gli stub sono `memo` come i componenti veri: è la loro memoizzazione che
// stiamo misurando, non la loro implementazione.
vi.mock("../components/dashboard/Dashboard.jsx", () => ({
  Dashboard: memo(function Dashboard() {
    conteggio.dashboard += 1;
    return <div data-testid="dash" />;
  }),
}));
vi.mock("../components/shell/Sidebar.jsx", () => ({
  Sidebar: memo(function Sidebar() {
    conteggio.sidebar += 1;
    return <div data-testid="sidebar" />;
  }),
}));
vi.mock("../components/shell/BottomNav.jsx", () => ({
  BottomNav: memo(function BottomNav() {
    conteggio.bottomNav += 1;
    return <div data-testid="bottomnav" />;
  }),
}));

const VoyageDesk = (await import("../VoyageDesk.jsx")).default;

const inputRicerca = () => document.querySelector("input[aria-label='Cerca']");

beforeEach(() => {
  conteggio.dashboard = 0;
  conteggio.sidebar = 0;
  conteggio.bottomNav = 0;
});

describe("digitare nella ricerca non ri-renderizza ciò che non mostra la ricerca", () => {
  it("la vista attiva e la nav restano ferme, la Topbar aggiorna il campo", () => {
    render(<VoyageDesk />);
    expect(screen.getByTestId("dash")).toBeTruthy();
    const dopoMount = { ...conteggio };

    const input = inputRicerca();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.change(input, { target: { value: "abc" } });

    // Il controllo positivo: l'app HA ri-renderizzato — il campo mostra il
    // testo nuovo, che arriva dal `searchQuery` di VoyageDeskInner attraverso
    // la Topbar. Senza questa asserzione il test passerebbe anche se non
    // fosse successo nulla.
    expect(input.value).toBe("abc");

    // ST-1: era 3 render della Dashboard, uno per carattere.
    expect(conteggio.dashboard).toBe(dopoMount.dashboard);
    // ST-2: la nav non ha campi di input e non mostra la ricerca.
    expect(conteggio.sidebar).toBe(dopoMount.sidebar);
    expect(conteggio.bottomNav).toBe(dopoMount.bottomNav);
  });

  it("nemmeno dieci caratteri consecutivi le svegliano", () => {
    // Un carattere potrebbe non muovere il contatore per caso (batching di
    // React); dieci no. Il numero serve a distinguere "memoizzato" da
    // "fortunato".
    render(<VoyageDesk />);
    const dopoMount = { ...conteggio };
    const input = inputRicerca();
    for (const c of "famiglia r") {
      fireEvent.change(input, { target: { value: input.value + c } });
    }
    expect(input.value).toBe("famiglia r");
    expect(conteggio.dashboard).toBe(dopoMount.dashboard);
    expect(conteggio.sidebar).toBe(dopoMount.sidebar);
    expect(conteggio.bottomNav).toBe(dopoMount.bottomNav);
  });
});
