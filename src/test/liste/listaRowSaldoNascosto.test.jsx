// ListaRow — il saldo nella home delle Liste viaggio parte nascosto e si
// svela con l'icona a occhio, senza aprire la lista.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ListaRow } from "../../components/liste/ListaRow.jsx";

const lista = { id: "l1", stato: "attiva", titolo: "Viaggio", clients: { name: "ROSSI MARIO" } };
const saldo = { saldo: 2500, num_movimenti: 9, ultimo_movimento: "2026-10-10" };
// Regex: Intl mette uno spazio non separabile prima di "€" (e in it-IT
// non raggruppa le migliaia sotto le 10.000).
const importo = /2\.?500,00/;

describe("ListaRow — saldo nascosto", () => {
  it("di default l'importo non è visibile", () => {
    render(<ListaRow lista={lista} saldo={saldo} onOpen={() => {}} />);
    expect(screen.queryByText(importo)).toBeNull();
    expect(screen.getByRole("button", { name: "Mostra saldo" })).toBeTruthy();
  });

  it("l'occhio svela e nasconde il saldo senza aprire la lista", () => {
    const onOpen = vi.fn();
    render(<ListaRow lista={lista} saldo={saldo} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra saldo" }));
    expect(screen.getByText(importo)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Nascondi saldo" }));
    expect(screen.queryByText(importo)).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("la riga resta apribile con click e con Invio", () => {
    const onOpen = vi.fn();
    render(<ListaRow lista={lista} saldo={saldo} onOpen={onOpen} />);
    const riga = screen.getByText("ROSSI MARIO").closest(".lv-lista-row");
    fireEvent.click(riga);
    fireEvent.keyDown(riga, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
