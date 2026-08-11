// ST-9 · La finestra dell'anagrafica, e ST-11 · i clienti dal contesto.
//
// PERCHÉ QUESTI TEST ESISTONO. ClientiView montava una ClienteCard per ogni
// riga dell'anagrafica — ✅ 818 oggi — mentre il modulo Liste nello stesso repo
// sfoglia 616 liste dieci alla volta. Il difetto non produceva un errore: la
// vista funzionava, costava. Un test che conta le card è l'unico modo perché la
// finestra non torni ad aprirsi per intero senza che nulla diventi rosso.
//
// Il riazzeramento (terzo test) è la metà che si dimentica: senza, chi cerca
// "Rossi" vede i primi 24 di una finestra aperta su un'altra ricerca, e la
// vista mente su quanti clienti corrispondono.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

vi.mock("../lib/api.js", () => ({
  Clients: { list: vi.fn(async () => ({ data: [], error: null })) },
  TaskFiles: { upload: vi.fn(async () => ({ error: null })) },
}));
// Il pannello liste è un chunk lazy e non è in prova qui.
vi.mock("../components/liste/listeModuleApi.js", () => ({
  conteggioListePerCliente: vi.fn(async () => ({})),
  listeRicercabili: vi.fn(async () => []),
}));

const { ClientiView } = await import("../components/clients/ClientiView.jsx");

const PAGINA = 24;
const anagrafica = (n) => Array.from({ length: n }, (_, i) => ({
  // Nomi ordinabili e distinguibili: "Cliente 001" … così l'asserzione può
  // guardare CHI è visibile, non solo quanti.
  id: `c${i}`,
  name: `Cliente ${String(i).padStart(3, "0")}`,
  city: "Roma", email: "", phone: "", notes: "",
  createdAt: new Date(2026, 0, 1 + i).toISOString(),
}));

const monta = (clients) => renderWithAppData(
  <ClientiView tasks={[]} dispatch={vi.fn()} loading={false} showListe={false} />,
  { ...DEMO_APP_CTX, clients },
);

// Le card portano il nome del cliente come testo: contarle significa contare i
// nomi presenti, senza dipendere dal markup interno di ClienteCard.
const cardVisibili = () => screen.queryAllByText(/^Cliente \d{3}$/).length;

describe("ClientiView — finestra di paginazione (ST-9)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("con più clienti della pagina ne disegna solo PAGINA, non tutti", () => {
    monta(anagrafica(100));
    expect(cardVisibili()).toBe(PAGINA);
    // Il totale resta vero: "24" e "24 di 100" sono due affermazioni diverse.
    expect(screen.getByText(`${PAGINA} di 100 clienti`)).toBeTruthy();
  });

  it("il bottone dice quanti ne mancano e li aggiunge", () => {
    monta(anagrafica(100));
    const bottone = screen.getByText(`Mostra altri ${PAGINA} di ${100 - PAGINA}`);
    fireEvent.click(bottone);
    expect(cardVisibili()).toBe(PAGINA * 2);
    expect(screen.getByText(`${PAGINA * 2} di 100 clienti`)).toBeTruthy();
  });

  it("sull'ultima pagina il bottone sparisce e si vedono tutti", () => {
    monta(anagrafica(30));
    fireEvent.click(screen.getByText(`Mostra altri 6 di 6`));
    expect(cardVisibili()).toBe(30);
    expect(screen.queryByText(/Mostra altri/)).toBeNull();
  });

  it("sotto la soglia non compare nessun bottone", () => {
    monta(anagrafica(5));
    expect(cardVisibili()).toBe(5);
    expect(screen.queryByText(/Mostra altri/)).toBeNull();
  });

  it("una ricerca RIAZZERA la finestra invece di ereditarla", () => {
    // Il caso che il rilievo descrive: la finestra è stata allargata, poi si
    // cerca. Senza riazzeramento si vedrebbero i primi 48 risultati filtrati.
    monta(anagrafica(100));
    fireEvent.click(screen.getByText(/Mostra altri/));
    expect(cardVisibili()).toBe(PAGINA * 2);

    fireEvent.change(screen.getByPlaceholderText(/Cerca/i), { target: { value: "Cliente 0" } });
    // "Cliente 0xx" = 100 nomi su 100 nel dataset di prova, quindi il filtro non
    // riduce: se la finestra non fosse stata riazzerata, resterebbero 48.
    expect(cardVisibili()).toBe(PAGINA);
  });

  it("cambiare ordinamento riazzera la finestra", () => {
    // Cambiare l'ordine ridefinisce QUALI sono i primi 24: tenere la finestra
    // larga mostrerebbe un insieme che non corrisponde a nessuna scelta.
    monta(anagrafica(100));
    fireEvent.click(screen.getByText(/Mostra altri/));
    fireEvent.click(screen.getByText("Nome Z-A"));
    expect(cardVisibili()).toBe(PAGINA);
    expect(screen.getByText("Cliente 099")).toBeTruthy();
  });

  it("la finestra parte dai PRIMI dell'ordinamento, non da un punto qualsiasi", () => {
    monta(anagrafica(100));
    expect(screen.getByText("Cliente 000")).toBeTruthy();
    expect(screen.queryByText("Cliente 099")).toBeNull();
  });
});

describe("ClientiView — l'anagrafica arriva dal contesto (ST-11)", () => {
  it("legge i clienti da useClients(), senza prop `clients`", () => {
    // Il componente qui sopra è montato SEMPRE senza la prop: se leggesse
    // ancora da lì, l'elenco sarebbe vuoto e il conteggio direbbe zero.
    monta(anagrafica(3));
    expect(cardVisibili()).toBe(3);
    const intestazione = screen.getByText(/Tutti \(3\)|3 client/i, { exact: false });
    expect(intestazione).toBeTruthy();
  });

  it("senza clienti mostra il vuoto vero, non uno stato a metà", () => {
    monta([]);
    expect(cardVisibili()).toBe(0);
    expect(screen.getByText("Nessun cliente ancora")).toBeTruthy();
  });
});
