// A-1 dell'audit UX/errori del 31 agosto — la seconda variante della striscia.
//
// `OfflineBanner` è nato dalla criticità #7 con una tesi giusta e una sorgente
// sola: `navigator.onLine`. Il limite era già dichiarato per iscritto in
// useOnlineStatus.js — «`true` significa soltanto che esiste una connessione,
// non che Supabase risponda» — e il caso scoperto non è di laboratorio: un
// portatile che esce dalla sospensione, un proxy che chiude le connessioni
// idle, il passaggio Wi-Fi→LTE.
//
// I due casi che questi test tengono fermi:
//   · la striscia realtime compare quando i canali sono giù ED è ORO, non rossa
//     — offline le scritture falliscono, qui passano tutte, e chi legge deve
//     poter distinguere le due cose;
//   · l'offline VINCE quando sono vere insieme, perché mostrarle entrambe
//     direbbe due volte la stessa cosa con due rimedi diversi, di cui uno
//     («Ricarica») inapplicabile senza rete.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { OfflineBanner } from "../../components/shell/OfflineBanner.jsx";
import { segnalaStatoCanale, _resetFreschezza } from "../../lib/freschezzaRealtime.js";

const impostaOnline = (valore) => {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => valore });
};

beforeEach(() => { _resetFreschezza(); impostaOnline(true); });
afterEach(() => { _resetFreschezza(); impostaOnline(true); });

describe("OfflineBanner — la condizione realtime", () => {
  it("con tutto a posto non disegna niente", () => {
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("un canale rotto accende la striscia, con il rimedio che serve", async () => {
    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "CHANNEL_ERROR"); });

    expect(screen.getByText(/Aggiornamenti automatici interrotti/i)).toBeInTheDocument();
    // La frase deve dire ANCHE cosa continua a funzionare: senza, «interrotti»
    // si legge come «non salvare niente», che è falso e ferma il lavoro.
    expect(screen.getByText(/Le tue modifiche vengono salvate normalmente/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ricarica/i })).toBeInTheDocument();
  });

  it("il riaggancio la spegne da sola", async () => {
    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "TIMED_OUT"); });
    expect(screen.getByText(/Aggiornamenti automatici interrotti/i)).toBeInTheDocument();

    await act(async () => { segnalaStatoCanale("tasks#1", "SUBSCRIBED"); });
    expect(screen.queryByText(/Aggiornamenti automatici interrotti/i)).not.toBeInTheDocument();
  });

  it("non è chiudibile: chiuderla toglierebbe l'unica cosa che spiega i dati fermi", async () => {
    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "CHANNEL_ERROR"); });
    // L'unico bottone è il rimedio, non una X.
    const bottoni = screen.getAllByRole("button");
    expect(bottoni).toHaveLength(1);
    expect(bottoni[0]).toHaveTextContent(/Ricarica/i);
  });
});

describe("OfflineBanner — la priorità fra le due condizioni", () => {
  it("offline vince sul realtime degradato", async () => {
    impostaOnline(false);
    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "CHANNEL_ERROR"); });

    expect(screen.getByText(/Sei offline/i)).toBeInTheDocument();
    // Non entrambe: due strisce sovrapposte con due rimedi diversi, di cui uno
    // inapplicabile senza rete.
    expect(screen.queryByText(/Aggiornamenti automatici interrotti/i)).not.toBeInTheDocument();
  });

  it("tornando online resta la striscia realtime, se i canali sono ancora giù", async () => {
    impostaOnline(false);
    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "CHANNEL_ERROR"); });
    expect(screen.getByText(/Sei offline/i)).toBeInTheDocument();

    await act(async () => {
      impostaOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/Sei offline/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Aggiornamenti automatici interrotti/i)).toBeInTheDocument();
  });
});

describe("OfflineBanner — come lo legge uno screen reader", () => {
  it("l'offline interrompe (assertive), il realtime degradato aspetta (polite)", async () => {
    impostaOnline(false);
    const { rerender, container } = render(<OfflineBanner />);
    expect(container.querySelector('[aria-live="assertive"]')).not.toBeNull();

    await act(async () => {
      impostaOnline(true);
      window.dispatchEvent(new Event("online"));
      segnalaStatoCanale("tasks#1", "CHANNEL_ERROR");
    });
    rerender(<OfflineBanner />);
    // Qui non c'è niente di urgente da interrompere: l'utente può continuare a
    // lavorare e le sue scritture arrivano. Ciò che non arriva è il lavoro
    // degli altri.
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('[aria-live="assertive"]')).toBeNull();
  });
});

describe("OfflineBanner — il bottone Ricarica", () => {
  it("ricarica la pagina, che è l'unica azione utile su un chunk di eventi perso", async () => {
    const reload = vi.fn();
    const originale = window.location;
    delete window.location;
    window.location = { ...originale, reload };

    render(<OfflineBanner />);
    await act(async () => { segnalaStatoCanale("tasks#1", "CHANNEL_ERROR"); });
    await act(async () => { screen.getByRole("button", { name: /Ricarica/i }).click(); });
    expect(reload).toHaveBeenCalled();

    window.location = originale;
  });
});
