// Riepilogo cliente e copia agente, dal dettaglio della lista.
//
// I due comandi producono documenti con destinatari diversi. Qui si verifica
// il confine sull'interfaccia: quello che il cliente vede a schermo (e quindi
// stampa) non deve contenere il metodo di pagamento, che è dato interno.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/listeApi.js", async (importOriginal) => ({
  ...(await importOriginal()),
  ListeAPI: {},
}));

const { ListaDetail } = await import("../components/liste/ListaDetail.jsx");

const LISTA = { id: "l1", titolo: "Buono viaggio 2026", stato: "attiva", clients: { name: "ROSSI MARIO" } };
const MOVS = [
  { id: "m1", data_movimento: "2026-07-01", descrizione: "VERSAMENTO DA ROSSI", importo: 500, metodo: "bonifico" },
  { id: "m2", data_movimento: "2026-07-20", descrizione: "HOTEL CASA MORGANO", importo: -180.5, metodo: "pos" },
];

const mount = (lista = LISTA) => {
  const dispatch = vi.fn();
  render(
    <ListaDetail
      lista={lista}
      movimenti={MOVS}
      history={[]}
      usersById={{}}
      dispatch={dispatch}
      onReload={vi.fn()}
      onBack={vi.fn()}
      onArchived={vi.fn()}
    />,
  );
  return dispatch;
};

// La modale è montata in un portal figlio di <body>: si interroga da lì.
const riepilogo = () => document.getElementById("lv-print-root");

describe("Riepilogo cliente", () => {
  beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; });

  it("si apre dalla barra dei comandi con cliente, titolo e saldo", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));

    const r = within(riepilogo());
    expect(r.getByText("Riepilogo buono viaggio")).toBeTruthy();
    expect(r.getByText("ROSSI MARIO")).toBeTruthy();
    expect(r.getByText("Buono viaggio 2026")).toBeTruthy();
    expect(r.getByText(/319,50/)).toBeTruthy();
  });

  it("NON mostra il metodo di pagamento, né come colonna né come valore", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));

    const r = within(riepilogo());
    expect(r.getByText("HOTEL CASA MORGANO")).toBeTruthy(); // i movimenti ci sono
    expect(r.queryByText("Metodo")).toBeNull();
    expect(r.queryByText(/bonifico/i)).toBeNull();
    expect(r.queryByText(/^POS$/i)).toBeNull();
  });

  it("segnala le liste esaurite", () => {
    mount({ ...LISTA, stato: "esaurita" });
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));
    expect(within(riepilogo()).getByText("LISTA ESAURITA")).toBeTruthy();
  });

  it("i comandi non finiscono nel foglio stampato", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));
    // `no-print` è ciò che le regole @media print nascondono: senza, Chiudi,
    // Invia e Stampa finirebbero sul foglio consegnato al cliente.
    expect(riepilogo().querySelector(".actions.no-print")).toBeTruthy();
  });

  it("marca il body durante l'anteprima e lo ripulisce alla chiusura", () => {
    // La classe è ciò che spegne il resto dell'app in stampa: se restasse
    // appiccicata, una stampa successiva da un'altra vista uscirebbe vuota.
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Riepilogo cliente" }));
    expect(document.body.classList.contains("lv-printing")).toBe(true);

    fireEvent.click(within(riepilogo()).getByRole("button", { name: "Chiudi" }));
    expect(document.body.classList.contains("lv-printing")).toBe(false);
    expect(riepilogo()).toBeNull();
  });
});

describe("Copia agente", () => {
  beforeEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; });

  it("scarica un documento Word col nome del cliente", () => {
    // Il download passa da un <a> temporaneo: intercettiamo il click invece
    // di lasciare che jsdom tenti una navigazione.
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();

    const dispatch = mount();
    fireEvent.click(screen.getByRole("button", { name: "Copia agente" }));

    expect(click).toHaveBeenCalled();
    expect(click.mock.instances[0].download).toBe("LISTA_ROSSI_MARIO_COPIA_AGENTE.doc");
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: "SHOW_TOAST",
      payload: expect.objectContaining({ type: "success" }),
    }));
    click.mockRestore();
  });
});
