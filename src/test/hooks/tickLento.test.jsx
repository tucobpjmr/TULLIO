// B-5 e B-6 dell'audit di architettura del 16 agosto — ciò che invecchia col
// tempo, e chi paga il render che lo fa invecchiare.
//
// PERCHÉ ESISTONO INSIEME. Sono lo stesso problema visto dalle due estremità.
// Alcune cose a schermo non cambiano perché cambiano i dati ma perché passa il
// tempo: una task «entro 24h» lo diventa da sola, un pallino di presenza
// sbiadisce da verde a grigio senza che nessuno scriva niente. React non lo sa,
// e i due modi sbagliati di dirglielo erano entrambi in produzione:
//
//   B-5 — `Date.now()` letto DENTRO un `useMemo` che non ha il tempo fra le
//   dipendenze: il valore resta congelato al momento del calcolo. Una Dashboard
//   lasciata aperta non vedeva una task diventare urgente. Nella pratica il
//   realtime rimescolava `tasks` abbastanza spesso da nasconderlo, il che è
//   anche il motivo per cui non era mai stato notato.
//
//   B-6 — un `setInterval` che forza il render dal punto più ALTO dell'albero:
//   `usePresence` sostituiva uno stato del guscio ogni 30 s per far invecchiare
//   dei pallini visibili solo dentro il pannello chat, e solo quando è aperto.
//
// La correzione è una sola, `hooks/useTickLento.js`: il tick vive nel
// componente che MOSTRA la cosa che invecchia, e il valore che ritorna entra
// nelle dipendenze del memo — il tempo diventa una dipendenza dichiarata invece
// di una lettura nascosta.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { useMemo } from "react";
import { useTickLento } from "../../hooks/useTickLento.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useTickLento", () => {
  const Sonda = ({ intervallo = 1000, attivo = true }) => {
    const istante = useTickLento(intervallo, attivo);
    // Un `useMemo` che dipende dall'istante: è la forma d'uso vera, non una
    // lettura diretta del valore.
    const calcolato = useMemo(() => `t=${istante}`, [istante]);
    return <span data-testid="v">{calcolato}</span>;
  };

  it("il valore avanza a ogni intervallo", () => {
    render(<Sonda intervallo={1000} />);
    const primo = screen.getByTestId("v").textContent;
    act(() => { vi.advanceTimersByTime(1000); });
    const secondo = screen.getByTestId("v").textContent;
    expect(secondo).not.toBe(primo);
  });

  it("prima dell'intervallo non cambia: non è un render a ogni frame", () => {
    render(<Sonda intervallo={60_000} />);
    const primo = screen.getByTestId("v").textContent;
    act(() => { vi.advanceTimersByTime(59_000); });
    expect(screen.getByTestId("v").textContent).toBe(primo);
  });

  it("con `attivo` a false non arma alcun timer", () => {
    // È il caso del Driver, che non vede le urgenze: senza questo parametro
    // pagherebbe un render al minuto per una lista sempre vuota.
    render(<Sonda intervallo={1000} attivo={false} />);
    const primo = screen.getByTestId("v").textContent;
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("v").textContent).toBe(primo);
  });

  it("allo smontaggio il timer si spegne", () => {
    // Un intervallo che sopravvive al componente è un render su un albero che
    // non c'è più, per sempre.
    const { unmount } = render(<Sonda intervallo={1000} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ─── B-6 · il tick di presenza non vive più nel guscio ─────────────────────
// La proprietà è di FORMA e si verifica leggendo il sorgente: «questo hook non
// forza un render periodico» non è osservabile montando `usePresence` in
// isolamento senza rifare mezza app attorno, mentre l'assenza del timer è
// esattamente ciò che il rilievo chiede.
// Il corpo senza commenti: il file SPIEGA il tick che non ha più, e cercarlo a
// testo pieno troverebbe la spiegazione invece del codice.
const CODICE_PRESENCE = (await import("../../hooks/usePresence.js?raw")).default
  .replace(/\/\/[^\n]*/g, "");

describe("usePresence non è più l'unico render periodico dell'app", () => {
  const codice = CODICE_PRESENCE;

  it("non contiene un setInterval che sostituisce presenceMap per l'ageing", () => {
    expect(/setInterval[\s\S]{0,120}setPresenceMap/.test(codice)).toBe(false);
  });

  it("il rinfresco periodico resta, ma passa dal CANALE e non dal database", () => {
    // Il controllo positivo dell'assertion sopra: se togliessi anche questo,
    // il primo test passerebbe per il motivo sbagliato.
    //
    // ⚠️ Era `setInterval(() => beat())`, cioè la UsersAPI.setPresence ogni 30
    // secondi. A-3 (audit del 19 agosto) l'ha sostituita con `canale.track()`:
    // stessa cadenza, ma scrive nello stato del canale invece che in una riga
    // di `public.users`, quindi non genera un evento postgres_changes da
    // consegnare a tutte le sessioni collegate. La forma da cercare cambia con
    // il meccanismo — altrimenti questo controllo positivo continuerebbe a
    // pretendere il difetto appena chiuso.
    expect(/setInterval\([\s\S]{0,60}\.track\(\)/.test(codice)).toBe(true);
  });

  it("e NON c'è più una scrittura di presenza dentro un intervallo", () => {
    // Il rilievo A-3 in negativo: la cadenza può restare, la UPDATE no.
    expect(/setInterval[\s\S]{0,120}setPresence/.test(codice)).toBe(false);
  });
});

const CONSUMATORI_PRESENZA = {
  "chat/ConversationList.jsx": (await import("../../components/chat/ConversationList.jsx?raw")).default,
  "chat/ConversationView.jsx": (await import("../../components/chat/ConversationView.jsx?raw")).default,
  // A-3 · Il pannello Admin disegna gli stessi pallini con la stessa funzione
  // (`computePresence` è salita in lib/presenza.js) e quindi deve invecchiarli
  // con lo stesso tick: da quando la presenza live sta nel canale,
  // `users.status` è l'ultimo stato SCRITTO e senza ageing mostrerebbe
  // «Online» per chi ha chiuso il browser stamattina.
  "admin/tabs/AdminTeamTab.jsx": (await import("../../components/admin/tabs/AdminTeamTab.jsx?raw")).default,
};

describe("l'ageing della presenza vive dove la presenza si mostra", () => {
  const consumatori = CONSUMATORI_PRESENZA;

  it.each(Object.keys(consumatori))("%s arma il proprio tick", (nome) => {
    expect(/useTickLento\(\s*TICK_PRESENZA_MS\s*\)/.test(consumatori[nome])).toBe(true);
  });
});
