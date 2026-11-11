// Banca di appoggio (BNL / BANCO NAPOLI) per i movimenti POS e bonifico:
// facoltativa, visibile solo con quei due metodi, e mai inviata con un altro.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditMovimentoModal } from "../../components/liste/modals/EditMovimentoModal.jsx";

// Import DINAMICI, come in listeApi.test.js: i moduli interni del modulo Liste
// sono privati (no-restricted-imports, deroga dei test in eslint.config.js).
const { etichettaMetodo, metodoConBanca } = await import("../../components/liste/listeFormato.js");
const { docHtml } = await import("../../components/liste/listeDocumenti.js");

describe("etichettaMetodo", () => {
  it("unisce metodo e banca per POS e bonifico", () => {
    expect(etichettaMetodo("pos", "bnl")).toBe("POS · BNL");
    expect(etichettaMetodo("bonifico", "banco_napoli")).toBe("BONIFICO · BANCO NAPOLI");
  });

  it("senza banca, o con un metodo che non la prevede, mostra il solo metodo", () => {
    expect(etichettaMetodo("pos", null)).toBe("POS");
    expect(etichettaMetodo("contanti", "bnl")).toBe("CONTANTI");
    expect(etichettaMetodo(null, "bnl")).toBe("");
  });

  it("solo POS e bonifico hanno una banca", () => {
    expect(["pos", "bonifico", "contanti", "assegno", "altro", null].filter(metodoConBanca))
      .toEqual(["pos", "bonifico"]);
  });
});

describe("copia agente (docHtml)", () => {
  it("riporta la banca accanto al metodo", () => {
    const html = docHtml({ titolo: "" }, [
      { data_movimento: "2026-11-11", descrizione: "VERSAMENTO", importo: 100, metodo: "bonifico", banca: "banco_napoli" },
    ], null, {}, 100);
    expect(html).toContain("BONIFICO · BANCO NAPOLI");
  });
});

describe("EditMovimentoModal — campo Banca", () => {
  const movimento = { id: "m1", data_movimento: "2026-11-11", descrizione: "VERSAMENTO", importo: "100.00", metodo: "pos", banca: "bnl" };

  it("con POS mostra la banca del record e la salva", async () => {
    const run = vi.fn(async () => true);
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const banca = screen.getByLabelText("Banca");
    expect(banca.value).toBe("bnl");
    fireEvent.change(banca, { target: { value: "banco_napoli" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(run.mock.calls[0][0]).toMatchObject({ metodo: "pos", banca: "banco_napoli" });
  });

  it("passando a CONTANTI il campo sparisce e la banca non viene inviata", async () => {
    const run = vi.fn(async () => true);
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Metodo"), { target: { value: "contanti" } });
    expect(screen.queryByLabelText("Banca")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    await waitFor(() => expect(run).toHaveBeenCalled());
    expect(run.mock.calls[0][0]).toMatchObject({ metodo: "contanti", banca: null });
  });
});
