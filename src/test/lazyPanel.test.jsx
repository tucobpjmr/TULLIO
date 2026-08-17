// A-1 dell'audit performance/UX del 16 agosto (secondo passaggio).
//
// COSA PROVA QUESTO FILE, e perché il controllo POSITIVO è il caso che conta.
// La proprietà da fissare non è «LazyPanel mostra un riquadro d'errore» — è
// che l'errore NON SALE. Un test che monta solo `LazyPanel` e trova il
// riquadro passerebbe identico anche se il boundary non ci fosse, perché in
// `render()` di Testing Library non c'è nessun antenato a cui l'eccezione
// possa arrivare: il caso «senza LazyPanel» qui sotto è quello che rende
// significativo il caso «con LazyPanel», ed è scritto per primo.
//
// Il chunk che risponde 404 dopo un deploy si simula con un `lazy()` la cui
// promise rigetta: è esattamente ciò che fa Vite quando il file con quell'hash
// non esiste più (`Failed to fetch dynamically imported module`).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lazy, Suspense } from "react";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { LazyPanel } from "../components/ui/LazyPanel.jsx";

// React stampa in console ogni errore che un boundary cattura: è rumore
// atteso, non un difetto del test.
beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

const chunkMancante = () =>
  lazy(() => Promise.reject(new Error(
    "Failed to fetch dynamically imported module: /assets/ChatPanel-Jfa-1086.js")));

// L'antenato che nell'app è l'ErrorBoundary di main.jsx: qui serve solo a
// rendere OSSERVABILE la differenza fra un errore confinato e uno che sale.
class Antenato extends React.Component {
  constructor(props) { super(props); this.state = { esploso: false }; }
  static getDerivedStateFromError() { return { esploso: true }; }
  render() {
    return this.state.esploso
      ? <div>l&apos;intera app è stata sostituita</div>
      : this.props.children;
  }
}

describe("LazyPanel — l'errore di un chunk resta nel pannello", () => {
  it("CONTROLLO POSITIVO: con il solo <Suspense> l'errore arriva all'antenato", async () => {
    const Pannello = chunkMancante();
    render(
      <Antenato>
        <div>la dashboard sotto</div>
        <Suspense fallback={<span>attesa…</span>}>
          <Pannello />
        </Suspense>
      </Antenato>
    );
    // È il difetto che A-1 descrive: la dashboard integra sparisce insieme al
    // pannello che non si è riusciti ad aprire.
    await screen.findByText("l'intera app è stata sostituita");
    expect(screen.queryByText("la dashboard sotto")).toBeNull();
  });

  it("con LazyPanel l'antenato non vede niente e il resto resta a schermo", async () => {
    const Pannello = chunkMancante();
    render(
      <Antenato>
        <div>la dashboard sotto</div>
        <LazyPanel resetKey="chat" onReset={() => {}}>
          <Pannello />
        </LazyPanel>
      </Antenato>
    );
    await screen.findByText(/Non è stato possibile aprire questo pannello/);
    expect(screen.getByText("la dashboard sotto")).toBeTruthy();
    expect(screen.queryByText("l'intera app è stata sostituita")).toBeNull();
  });

  it("il bottone del riquadro chiama onReset: un «Chiudi» deve chiudere", async () => {
    const Pannello = chunkMancante();
    const onReset = vi.fn();
    render(
      <LazyPanel resetKey="chat" onReset={onReset}>
        <Pannello />
      </LazyPanel>
    );
    await screen.findByText(/Non è stato possibile aprire questo pannello/);
    fireEvent.click(screen.getByRole("button", { name: /Chiudi/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("finché il chunk è in volo mostra l'attesa annunciata, non il riquadro", async () => {
    // Una promise che non si risolve mai: è lo stato «sto scaricando».
    const Pannello = lazy(() => new Promise(() => {}));
    render(
      <LazyPanel resetKey="chat" onReset={() => {}}>
        <Pannello />
      </LazyPanel>
    );
    const stato = await screen.findByRole("status");
    expect(stato.textContent).toMatch(/Caricamento/);
    expect(screen.queryByText(/Non è stato possibile/)).toBeNull();
  });

  it("si riarma al cambio di resetKey: un crash sul contenuto precedente non resta appeso al nuovo", async () => {
    const Rotto = chunkMancante();
    const Sano = () => <div>il task nuovo</div>;
    const { rerender } = render(
      <LazyPanel resetKey="task-1" onReset={() => {}}><Rotto /></LazyPanel>
    );
    await screen.findByText(/Non è stato possibile aprire questo pannello/);

    rerender(<LazyPanel resetKey="task-2" onReset={() => {}}><Sano /></LazyPanel>);
    await waitFor(() => expect(screen.getByText("il task nuovo")).toBeTruthy());
    expect(screen.queryByText(/Non è stato possibile/)).toBeNull();
  });
});
