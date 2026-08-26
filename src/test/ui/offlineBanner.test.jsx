// Criticità #7 — lo stato di rete deve essere VISIBILE e PERSISTENTE.
//
// PERCHÉ ESISTE. Senza rete l'app non si ferma: continua a mostrare l'ultimo
// stato idratato e ad accettare scritture, che falliscono una alla volta con
// un toast rosso ciascuna. Nulla a schermo distingueva "non c'è nessun task in
// scadenza" da "non lo so più da venti minuti". Il banner è l'unica cosa che
// rende la differenza leggibile, e per farlo deve durare quanto la condizione:
// un toast — che sparisce da solo — non basterebbe.
//
// Il test pilota `navigator.onLine` e gli eventi `online`/`offline` di window,
// che sono esattamente i due segnali su cui il componente si basa.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "../../components/shell/OfflineBanner.jsx";

// jsdom espone `navigator.onLine` come getter di prototipo: si sovrascrive
// sull'istanza e si ripristina dopo ogni test, così l'ordine dei test non
// conta (è lo stesso motivo per cui i globali di appGlobals sono stati tolti).
const setOnLine = (valore) => {
  Object.defineProperty(window.navigator, "onLine", {
    value: valore, configurable: true, writable: true,
  });
};
afterEach(() => {
  delete window.navigator.onLine;
  vi.restoreAllMocks();
});

const emetti = (nome) => act(() => { window.dispatchEvent(new Event(nome)); });

describe("OfflineBanner", () => {
  it("online: non occupa spazio e non dice nulla", () => {
    setOnLine(true);
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("compare quando la rete cade e resta finché non torna", () => {
    setOnLine(true);
    render(<OfflineBanner />);
    expect(screen.queryByText(/Sei offline/)).toBeNull();

    setOnLine(false);
    emetti("offline");
    const banner = screen.getByText(/Sei offline/);
    expect(banner).toBeTruthy();
    // Il messaggio deve dire ENTRAMBE le conseguenze: i dati sono fermi E le
    // scritture non passano. Metà del messaggio lascia l'utente a chiedersi
    // perché il salvataggio non funzioni.
    expect(screen.getByText(/non verranno salvate/)).toBeTruthy();

    setOnLine(true);
    emetti("online");
    expect(screen.queryByText(/Sei offline/)).toBeNull();
  });

  it("è annunciato dagli screen reader (role=status, aria-live)", () => {
    setOnLine(false);
    render(<OfflineBanner />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("assertive");
  });

  it("nasce già visibile se la rete manca al primo render", () => {
    // Il caso della sessione aperta in metropolitana: nessun evento `offline`
    // arriverà mai, perché la rete era già giù prima del mount.
    setOnLine(false);
    render(<OfflineBanner />);
    expect(screen.getByText(/Sei offline/)).toBeTruthy();
  });

  it("non mostra un falso allarme dove navigator.onLine non esiste", () => {
    // In dubbio si assume online: un ambiente che non sa rispondere non deve
    // produrre un allarme permanente e falso.
    Object.defineProperty(window.navigator, "onLine", {
      value: undefined, configurable: true, writable: true,
    });
    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("smontandosi rilascia i listener di rete", () => {
    setOnLine(true);
    const off = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();
    const rimossi = off.mock.calls.map(([nome]) => nome);
    expect(rimossi).toContain("online");
    expect(rimossi).toContain("offline");
  });
});
