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
//
// ─── M-1 (passo 2), 19 agosto: la ricerca è passata sul SERVER ─────────────
// L'hook filtrava un array in memoria, e quell'array era l'anagrafica intera —
// cioè questa tendina era la ragione per cui l'idratazione doveva scaricarla a
// ogni sessione. Ora interroga `Clients.cerca` (debounce + guardia di
// staleness in `hooks/useRicercaClienti.js`) e usa i clienti in stato come
// risultati LOCALI, che restano necessari per due casi: un cliente appena
// creato è suggeribile prima che la scrittura sia confermata, e in dev senza
// Supabase la tendina continua a funzionare.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen, waitFor } from "@testing-library/react";

const cerca = vi.fn(async () => ({ data: [], error: null }));
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({ Clients: { cerca: (...a) => cerca(...a) } }));

const { useClientSuggestions, ClientSuggestions } =
  await import("../components/ui/ClientAutocomplete.jsx");

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
  it("filtra per sottostringa i risultati LOCALI, senza distinzione di maiuscole", () => {
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "ROSS"));
    expect(result.current.matches.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("taglia i suggerimenti a sei anche quando il campo è vuoto", () => {
    // Campo vuoto = mostra ciò che c'è in locale, ma non tutto: sei righe.
    // ⚠️ A campo vuoto NON si interroga il server: una tendina aperta senza
    // che si sia digitato niente non è una ricerca, ed è il caso in cui una
    // query costerebbe di più e servirebbe di meno.
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, ""));
    expect(result.current.matches).toHaveLength(6);
    expect(cerca).not.toHaveBeenCalled();
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


// ─── M-1 (passo 2) · la metà che interroga il server ───────────────────────
describe("useClientSuggestions — la ricerca sul server", () => {
  beforeEach(() => { cerca.mockClear(); cerca.mockResolvedValue({ data: [], error: null }); });

  it("interroga il server dopo il debounce, non a ogni carattere", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { rerender } = renderHook(
      ({ v }) => useClientSuggestions([], v), { initialProps: { v: "r" } });
    rerender({ v: "ro" });
    rerender({ v: "ros" });
    rerender({ v: "rossi" });
    // Prima che il debounce scatti: nessuna richiesta, nonostante quattro
    // battute. È la proprietà che rende sostenibile una ricerca per battuta.
    expect(cerca).not.toHaveBeenCalled();

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(cerca).toHaveBeenCalledTimes(1);
    expect(cerca).toHaveBeenCalledWith("rossi", expect.objectContaining({ limit: 12 }));
    vi.useRealTimers();
  });

  it("i risultati del server compaiono fra i suggerimenti", async () => {
    cerca.mockResolvedValue({
      data: [{ id: "srv1", name: "ROSSI MARIO", city: "Bari" }], error: null,
    });
    const { result } = renderHook(() => useClientSuggestions([], "rossi"));

    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    expect(result.current.matches[0].id).toBe("srv1");
  });

  it("i LOCALI vengono per primi e i duplicati si tolgono per id", async () => {
    // Un cliente appena creato in questa sessione è in stato ma può non essere
    // ancora nella risposta del server — e se c'è in entrambe, è la stessa
    // scheda, non due.
    cerca.mockResolvedValue({
      data: [
        { id: "c1", name: "Famiglia Rossi" },
        { id: "srv2", name: "ROSSI GIUSEPPE" },
      ],
      error: null,
    });
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "rossi"));

    // Si aspetta la voce del SERVER e non «più di uno»: i due locali (c1, c2)
    // ci sono già al primo render, quindi una soglia numerica passerebbe
    // prima che la risposta arrivi — e il caso non verificherebbe niente.
    await waitFor(() =>
      expect(result.current.matches.map(c => c.id)).toContain("srv2"));
    const ids = result.current.matches.map(c => c.id);
    expect(ids[0]).toBe("c1");
    expect(ids.filter(i => i === "c1")).toHaveLength(1);
    expect(ids).toContain("srv2");
  });

  it("i termini si applicano in AND anche ai locali, come fa il server", () => {
    // Senza, digitando due parole i risultati locali sparirebbero mentre
    // quelli remoti restano: due semantiche nella stessa tendina.
    const { result } = renderHook(
      () => useClientSuggestions([{ id: "x", name: "ROSSI MARIO" }], "mario rossi"));
    expect(result.current.matches.map(c => c.id)).toEqual(["x"]);
  });

  it("un errore del server non svuota i suggerimenti locali", async () => {
    cerca.mockResolvedValue({ data: null, error: new Error("rete") });
    const { result } = renderHook(() => useClientSuggestions(CLIENTI, "rossi"));

    await waitFor(() => expect(cerca).toHaveBeenCalled());
    // Un suggerimento mancante non è un errore da mostrare: resta ciò che c'è.
    expect(result.current.matches.map(c => c.id)).toEqual(["c1", "c2"]);
  });

  it("con enabled: false non interroga affatto il server", async () => {
    renderHook(() => useClientSuggestions(CLIENTI, "rossi", { enabled: false }));
    await new Promise(r => setTimeout(r, 320));
    expect(cerca).not.toHaveBeenCalled();
  });
});
