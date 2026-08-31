// M-1 dell'audit UX/errori del 31 agosto — i quattro modali del modulo Liste
// migrati dalla validazione a toast (la frase che validators.js cita
// testualmente come l'anti-pattern) al pattern per-campo di AddMovBox.
//
// In un file suo, nella cartella `liste/` (B-3 dell'audit del 26 agosto:
// i test stanno in cartelle per area, non allo stesso livello con un prefisso
// nel nome) — anche perché tenerli in `ui/validazioneInline.test.jsx` avrebbe
// sforato il tetto di 500 righe di quel file (docs/CLAUDE.md).
//
// Le tre proprietà che questi test fissano sono le stesse di
// `ui/validazioneInline.test.jsx`: il messaggio è LEGATO all'input, il FOCUS
// va sul primo campo sbagliato, l'errore si spegne appena si corregge.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditMovimentoModal } from "../../components/liste/modals/EditMovimentoModal.jsx";
import { NuovaListaModal } from "../../components/liste/modals/NuovaListaModal.jsx";
import { AggiungiBeneficiarioModal } from "../../components/liste/modals/AggiungiBeneficiarioModal.jsx";
import { BulkMovimentiModal } from "../../components/liste/modals/BulkMovimentiModal.jsx";

// M-1 dell'audit UX/errori del 31 agosto: era ancora sulla frase che
// validators.js cita testualmente come l'anti-pattern («Compila data,
// descrizione e importo» via toast) — AddMovBox, gli STESSI campi sullo
// stesso denaro, era già migrato.
describe("EditMovimentoModal — un campo per volta, sotto il campo, non un toast coi tre nomi", () => {
  const movimento = { id: "m1", data_movimento: "2026-07-28", descrizione: "BONIFICO", importo: "150.00", metodo: "bonifico" };

  it("la descrizione vuota lo dice sotto il campo, con focus lì, e non parte niente", async () => {
    const run = vi.fn(async () => true);
    const onError = vi.fn();
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError }} />);

    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/descrizione/i);
    const campo = screen.getByLabelText("Descrizione");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    // Il vecchio comportamento: un solo toast che nomina i TRE campi insieme.
    expect(onError).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("un importo non interpretabile lo dice sul proprio campo, non su un altro", async () => {
    const run = vi.fn(async () => true);
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Importo €"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/importo/i);
    expect(document.activeElement).toBe(screen.getByLabelText("Importo €"));
    expect(run).not.toHaveBeenCalled();
  });

  it("l'errore si spegne appena si corregge quel campo, e poi il salvataggio parte", async () => {
    const run = vi.fn(async () => true);
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "BONIFICO CORRETTO" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ id: "m1", descrizione: "BONIFICO CORRETTO" }),
    ));
  });

  it("Invio nel campo descrizione invia il form (M-4: è un <form>, non un <div>)", async () => {
    const run = vi.fn(async () => true);
    render(<EditMovimentoModal movimento={movimento} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const campo = screen.getByLabelText("Descrizione");
    fireEvent.change(campo, { target: { value: "BONIFICO CORRETTO" } });
    fireEvent.submit(campo.closest("form"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});

// M-1 dell'audit UX/errori del 31 agosto — stessa regola condivisa
// (regoleCliente.js) usata anche da AggiungiBeneficiarioModal qui sotto.
describe("NuovaListaModal — cliente e nome del nuovo cliente, un campo alla volta", () => {
  const CLIENTI = [{ id: "c1", name: "ROSSI MARIO" }];

  it("nessun cliente scelto: l'avviso è sul select, non su un toast", async () => {
    const run = vi.fn(async () => true);
    const onError = vi.fn();
    render(<NuovaListaModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError }} />);

    fireEvent.click(screen.getByRole("button", { name: "Crea lista" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/scegli un cliente/i);
    const campo = screen.getByLabelText("Cliente");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    expect(onError).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("'+ Nuovo cliente…' senza nome: l'avviso è sul campo nome, non su 'Cliente'", async () => {
    const run = vi.fn(async () => true);
    render(<NuovaListaModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "__new__" } });
    fireEvent.click(screen.getByRole("button", { name: "Crea lista" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/nome del nuovo cliente/i);
    expect(document.activeElement).toBe(screen.getByLabelText("Nome nuovo cliente"));
    expect(run).not.toHaveBeenCalled();
  });

  it("Invio nel campo titolo invia il form (M-4)", async () => {
    const run = vi.fn(async () => true);
    render(<NuovaListaModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError: vi.fn() }} presetClientId="c1" />);

    fireEvent.submit(screen.getByLabelText(/Titolo/).closest("form"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});

describe("AggiungiBeneficiarioModal — cliente e nome del nuovo cliente, un campo alla volta", () => {
  const CLIENTI = [{ id: "c1", name: "ROSSI MARIO" }];

  it("nessun cliente scelto: l'avviso è sul select, non su un toast", async () => {
    const run = vi.fn(async () => true);
    const onError = vi.fn();
    render(<AggiungiBeneficiarioModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError }} />);

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/scegli un cliente/i);
    expect(document.activeElement).toBe(screen.getByLabelText("Cliente"));
    expect(onError).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("'+ Nuovo cliente…' senza nome: l'avviso è sul campo nome", async () => {
    const run = vi.fn(async () => true);
    render(<AggiungiBeneficiarioModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError: vi.fn() }} />);

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "__new__" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/nome del nuovo cliente/i);
    expect(document.activeElement).toBe(screen.getByLabelText("Nome nuovo cliente"));
    expect(run).not.toHaveBeenCalled();
  });

  it("l'errore si spegne appena si sceglie un cliente, e il salvataggio parte", async () => {
    const run = vi.fn(async () => true);
    render(<AggiungiBeneficiarioModal clients={CLIENTI} onClose={vi.fn()} onCreate={{ run, onError: vi.fn() }} />);

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "c1" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Aggiungi" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "c1" }),
    ));
  });
});

// M-1 dell'audit UX/errori del 31 agosto — il caso peggiore: «3 righe hanno
// descrizione o importo mancante» su una tabella di dieci righe non diceva
// QUALI tre. Qui l'errore va sotto la cella sbagliata, riga per riga.
describe("BulkMovimentiModal — l'errore va sulla RIGA, non in un riassunto", () => {
  it("una riga con solo l'importo compilato: l'avviso è sotto QUELLA descrizione", async () => {
    const run = vi.fn(async () => true);
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const importi = screen.getAllByLabelText("Importo del movimento");
    fireEvent.change(importi[1], { target: { value: "100,00" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra tutti" }));

    const avvisi = await screen.findAllByRole("alert");
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0].textContent).toMatch(/descrizione/i);
    const descrizioni = screen.getAllByLabelText("Descrizione del movimento");
    // È la SECONDA riga (indice 1) quella marcata, non la prima.
    expect(descrizioni[1].getAttribute("aria-describedby")).toBe(avvisi[0].id);
    expect(document.activeElement).toBe(descrizioni[1]);
    expect(run).not.toHaveBeenCalled();
  });

  it("una riga con importo non interpretabile: l'avviso è sotto QUELL'importo", async () => {
    const run = vi.fn(async () => true);
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const descrizioni = screen.getAllByLabelText("Descrizione del movimento");
    const importi = screen.getAllByLabelText("Importo del movimento");
    fireEvent.change(descrizioni[0], { target: { value: "ROSSI MARIO" } });
    fireEvent.change(importi[0], { target: { value: "non un numero" } });
    fireEvent.click(screen.getByRole("button", { name: "Registra tutti" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/importo/i);
    expect(document.activeElement).toBe(importi[0]);
    expect(run).not.toHaveBeenCalled();
  });

  it("righe tutte vuote alla registrazione: un avviso generale, non un toast, senza scrivere", async () => {
    const run = vi.fn(async () => true);
    const onError = vi.fn();
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run, onError }} />);

    fireEvent.click(screen.getByRole("button", { name: "Registra tutti" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/compila almeno una riga/i);
    expect(onError).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("togliere l'ultima riga rimasta dà un avviso invece di un toast", async () => {
    const onError = vi.fn();
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run: vi.fn(), onError }} />);

    const togli = screen.getAllByRole("button", { name: "Togli riga" });
    fireEvent.click(togli[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Togli riga" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Togli riga" })[0]);

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/serve almeno una riga/i);
    expect(onError).not.toHaveBeenCalled();
    // La riga resta: non si è azzerato il form.
    expect(screen.getAllByLabelText("Descrizione del movimento")).toHaveLength(1);
  });

  it("l'errore di una riga si spegne appena si corregge quella riga, e le altre righe compilate vengono registrate", async () => {
    const run = vi.fn(async () => true);
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const descrizioni = screen.getAllByLabelText("Descrizione del movimento");
    const importi = screen.getAllByLabelText("Importo del movimento");
    fireEvent.change(descrizioni[0], { target: { value: "ROSSI MARIO" } });
    fireEvent.change(importi[0], { target: { value: "100,00" } });
    fireEvent.change(importi[1], { target: { value: "50,00" } }); // riga 2 incompleta
    fireEvent.click(screen.getByRole("button", { name: "Registra tutti" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(descrizioni[1], { target: { value: "BIANCHI MARIA" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Registra tutti" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({
      movimenti: [
        { descrizione: "ROSSI MARIO", importo: 100 },
        { descrizione: "BIANCHI MARIA", importo: 50 },
      ],
    })));
  });

  it("Invio in un campo del form invia (M-4: è un <form>, non un <div>)", async () => {
    const run = vi.fn(async () => true);
    render(<BulkMovimentiModal onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    const descrizioni = screen.getAllByLabelText("Descrizione del movimento");
    fireEvent.change(descrizioni[0], { target: { value: "ROSSI MARIO" } });
    fireEvent.change(screen.getAllByLabelText("Importo del movimento")[0], { target: { value: "10,00" } });
    fireEvent.submit(descrizioni[0].closest("form"));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });
});
