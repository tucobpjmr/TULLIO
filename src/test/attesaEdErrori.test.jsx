// Criticità #9, #11 e #12 — tre difetti piccoli, tutti sullo stesso tema:
// quello che l'app dice (o non dice) quando NON sta mostrando dati.
//
//   #12  il fallback dei chunk lazy era un cerchio che gira e nient'altro:
//        nessun testo, nessun `role`. Per chi usa uno screen reader la vista
//        spariva e al suo posto non compariva niente di leggibile —
//        indistinguibile da una pagina rotta, e proprio quando l'attesa si
//        allunga (rete lenta, chunk grande).
//   #9   il pannello d'errore stampava sempre messaggio + stack dei
//        componenti: rumore illeggibile per l'utente e una mappa della
//        struttura interna dell'app mostrata a chiunque guardi lo schermo.
//   #11  `setSaving(false)` dopo un `await` che, riuscendo, smonta il
//        componente.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { LazyFallback } from "../components/ui/LazyFallback.jsx";
import { useIsMounted } from "../hooks/useIsMounted.js";
import { codiceSegnalazione } from "../lib/errorReporting.js";

afterEach(() => { vi.unstubAllEnvs(); });

describe("LazyFallback — l'attesa è annunciata (#12)", () => {
  it("ha un role=status, un aria-live e un testo leggibile", () => {
    render(<LazyFallback />);
    const stato = screen.getByRole("status");
    expect(stato.getAttribute("aria-live")).toBe("polite");
    expect(stato.textContent).toMatch(/Caricamento/);
  });

  it("vale anche per la variante a tutto schermo dei modali", () => {
    render(<LazyFallback overlay />);
    expect(screen.getByRole("status").textContent).toMatch(/Caricamento/);
  });

  it("il cerchio animato è aria-hidden: non va descritto due volte", () => {
    const { container } = render(<LazyFallback />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe("codiceSegnalazione — l'identificatore da dettare (#9)", () => {
  it("ha un formato riconoscibile e non si ripete", () => {
    const a = codiceSegnalazione();
    expect(a).toMatch(/^VD-[0-9A-Z]+-[0-9A-Z]{4}$/);
    // Cento estrazioni ravvicinate: la parte casuale esiste proprio perché
    // l'istante da solo, in millisecondi, collide fra sessioni parallele.
    const molti = new Set(Array.from({ length: 100 }, codiceSegnalazione));
    expect(molti.size).toBeGreaterThan(90);
  });
});

describe("ErrorDetails — cosa finisce a schermo, e dove (#9)", () => {
  // Il componente legge `import.meta.env.DEV` a ogni render proprio per
  // permettere questo test: con la costante di modulo il ramo di produzione
  // non sarebbe esercitabile affatto.
  const errore = new Error("Cannot read properties of undefined (reading 'assignees')");
  const info = { componentStack: "\n    in TaskCard (at PersonalQueue.jsx:118)" };

  it("in DEV mostra messaggio e stack dei componenti", async () => {
    vi.stubEnv("DEV", true);
    const { ErrorDetails } = await import("../components/ui/ErrorDetails.jsx");
    const { container } = render(
      <ErrorDetails error={errore} info={info} codice="VD-TEST-ABCD" />);
    expect(container.textContent).toMatch(/reading 'assignees'/);
    expect(container.textContent).toMatch(/PersonalQueue\.jsx:118/);
  });

  it("in produzione mostra SOLO il codice: niente messaggio, niente stack", async () => {
    vi.stubEnv("DEV", false);
    const { ErrorDetails } = await import("../components/ui/ErrorDetails.jsx");
    const { container } = render(
      <ErrorDetails error={errore} info={info} codice="VD-TEST-ABCD" />);
    expect(container.textContent).toContain("VD-TEST-ABCD");
    expect(container.textContent).not.toMatch(/assignees/);
    expect(container.textContent).not.toMatch(/PersonalQueue/);
  });
});

describe("useIsMounted — il guard dopo un await (#11)", () => {
  it("è vero da montato e falso dopo lo smontaggio", () => {
    const { result, unmount } = renderHook(() => useIsMounted());
    const montato = result.current;
    expect(montato()).toBe(true);
    unmount();
    expect(montato()).toBe(false);
  });

  it("è vero già al primo render, prima che gli effetti girino", () => {
    // Una promise già risolta (o una risposta dalla cache) si risolve in
    // quella finestra: partire da `false` la farebbe scartare a torto.
    let vistoDurante = null;
    const Sonda = () => {
      const montato = useIsMounted();
      if (vistoDurante === null) vistoDurante = montato();
      return null;
    };
    render(<Sonda />);
    expect(vistoDurante).toBe(true);
  });

  it("mantiene identità stabile fra i render", () => {
    // Va nelle dipendenze di useCallback/useEffect senza rianimarli.
    const { result, rerender } = renderHook(() => useIsMounted());
    const primo = result.current;
    rerender();
    expect(result.current).toBe(primo);
  });
});
