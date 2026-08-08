// Il suggeritore cliente condiviso (M-2).
//
// PERCHÉ ESISTE. La logica testata qui era scritta quattro volte — TaskSlideOver,
// QuickAddTask, ManualTab, TemplateTab — e nessuna delle quattro copie aveva un
// test. Non è codice banale: il filtro per sottostringa, il taglio a sei, la
// regola "nascondi se l'unico match è esatto" e il ritardo di 150ms sul blur
// sono quattro decisioni distinte, e finché vivevano in quattro punti una
// modifica ne toccava uno solo.
//
// Ora la definizione è una, quindi anche il test può essere uno.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen } from "@testing-library/react";
import { useClientSuggestions, ClientSuggestions } from "../components/ui/ClientAutocomplete.jsx";

const CLIENTI = [
  { id: "c1", name: "Famiglia Rossi", phone: "333", city: "Roma" },
  { id: "c2", name: "Rossini Viaggi", email: "info@rossini.it" },
  { id: "c3", name: "Bianchi Tour" },
  { id: "c4", name: "Verdi SRL" },
  { id: "c5", name: "Neri & Co" },
  { id: "c6", name: "Gialli Travel" },
  { id: "c7", name: "Blu Holidays" },
];

// Il focus non è uno stato che il test può passare come prop: si ottiene solo
// chiamando l'handler che il componente monterà sull'input.
const conFocus = (result) => act(() => { result.current.inputProps.onFocus(); });

describe("useClientSuggestions", () => {
  it("filtra per sottostringa, senza distinzione fra maiuscole e minuscole", () => {
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ROSS"));
    expect(result.current.matches.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("taglia i suggerimenti a sei anche quando il campo è vuoto", () => {
    // Campo vuoto = mostra l'anagrafica, ma non tutta: sette clienti, sei righe.
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, ""));
    expect(result.current.matches).toHaveLength(6);
  });

  it("resta chiusa finché l'input non prende il focus", () => {
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ross"));
    expect(result.current.visible).toBe(false);
    conFocus(result);
    expect(result.current.visible).toBe(true);
  });

  it("nasconde la tendina quando l'unico match coincide con quanto digitato", () => {
    // È il caso "cliente appena selezionato": ripetergli il nome che ha già
    // scelto non è un suggerimento.
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "Bianchi Tour"));
    conFocus(result);
    expect(result.current.matches).toHaveLength(1);
    expect(result.current.visible).toBe(false);
  });

  it("resta aperta se il match esatto NON è l'unico", () => {
    // La regola è "unico match ed esatto", non "esiste un match esatto": qui
    // "Rossi" coincide con quanto digitato ma "Rossi Tour" è ancora un
    // suggerimento utile, quindi la tendina deve restare.
    const omonimi = [
      { id: "a", name: "Rossi" },
      { id: "b", name: "Rossi Tour" },
    ];
    const { result } = renderHook(() => useClientSuggestions(omonimi, "Rossi"));
    conFocus(result);
    expect(result.current.matches).toHaveLength(2);
    expect(result.current.visible).toBe(true);
  });

  it("non si apre mai con enabled: false", () => {
    // TaskSlideOver in sola lettura: l'utente non può modificare il campo,
    // quindi suggerire sarebbe rumore.
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ross", { enabled: false }));
    conFocus(result);
    expect(result.current.visible).toBe(false);
  });

  it("regge clients e valore non valorizzati", () => {
    const { result } = renderHook(() => useClientSuggestions(undefined, undefined));
    expect(result.current.matches).toEqual([]);
    expect(result.current.visible).toBe(false);
  });
});

describe("useClientSuggestions — chiusura al blur", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("ritarda la chiusura di 150ms, così il mousedown sulla voce arriva prima", () => {
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ross"));
    conFocus(result);

    act(() => { result.current.inputProps.onBlur(); });
    // Ancora aperta: chiuderla subito smonterebbe il bottone prima che il
    // click venga registrato, e la selezione andrebbe persa.
    expect(result.current.visible).toBe(true);

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current.visible).toBe(false);
  });

  it("close() chiude subito, senza aspettare il timer", () => {
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ross"));
    conFocus(result);
    act(() => { result.current.close(); });
    expect(result.current.visible).toBe(false);
  });
});

describe("ClientSuggestions", () => {
  it("non rende nulla quando non è visibile", () => {
    const { container } = render(
      <ClientSuggestions matches={CLIENTI} visible={false} onPick={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra nome e riga di dettaglio con i contatti disponibili", () => {
    render(<ClientSuggestions matches={CLIENTI.slice(0, 3)} visible onPick={() => {}} />);
    expect(screen.getByText("Famiglia Rossi")).toBeInTheDocument();
    expect(screen.getByText("333 · Roma")).toBeInTheDocument();
    expect(screen.getByText("info@rossini.it")).toBeInTheDocument();
    // Bianchi Tour non ha contatti: nessuna riga di dettaglio vuota.
    expect(screen.getByText("Bianchi Tour")).toBeInTheDocument();
  });

  it("chiama onPick su mousedown, non su click", () => {
    // È la differenza che rende la selezione affidabile: il click arriverebbe
    // dopo il blur dell'input, cioè dopo la chiusura della tendina.
    const onPick = vi.fn();
    render(<ClientSuggestions matches={CLIENTI.slice(0, 1)} visible onPick={onPick} />);
    const voce = screen.getByRole("button", { name: /Famiglia Rossi/ });

    voce.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).not.toHaveBeenCalled();

    voce.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(CLIENTI[0]);
  });

  it("la variante compatta alza lo z-index per scavalcare il modale bulk", () => {
    const { container: normale } = render(
      <ClientSuggestions matches={CLIENTI.slice(0, 1)} visible onPick={() => {}} />
    );
    const { container: compatta } = render(
      <ClientSuggestions matches={CLIENTI.slice(0, 1)} visible onPick={() => {}} compact />
    );
    const z = (c) => Number(c.firstChild.style.zIndex);
    expect(z(compatta)).toBeGreaterThan(z(normale));
  });
});
