// A-2 dell'audit del 23 agosto (secondo passaggio) — le due proprietà che il
// freno al doppio invio, da solo, non dà.
//
// PERCHÉ ESISTE. `bulkDoubleSubmit.test.jsx` fissa già la prima metà del
// contratto: due tap ravvicinati creano un batch solo. Fissava però una
// proprietà del RITMO — due click senza un render fra i due — e le quattro tab
// la ottenevano con un `busyRef` scritto a mano. Quel ref aveva due difetti
// che nessun test guardava, entrambi visibili solo sul percorso d'ERRORE:
//
//   1. Il teardown `busyRef.current = false; setBusy(false)` era ricopiato in
//      ogni punto di uscita e non stava in un `finally`. Se `onCreate` o
//      `TaskFiles.upload` SOLLEVAVA invece di ritornare `{ error }` — rete che
//      cade a metà upload — nessun punto di uscita veniva raggiunto: il ref
//      restava `true` per sempre e la guardia in testa rifiutava ogni
//      tentativo successivo. Modale viva, bottone spento, nessun messaggio.
//
//   2. Dopo un upload fallito su task GIÀ CREATE il ref tornava a `false`,
//      quindi «Crea» tornava premibile — e un secondo tentativo creava un
//      secondo batch identico, perché le task del primo esistevano già.
//
// I due casi sono l'opposto l'uno dell'altro (il primo blocca ciò che
// dovrebbe ripartire, il secondo lascia ripartire ciò che va bloccato), e
// questo è esattamente il motivo per cui il contratto va tenuto in un posto
// solo: `useSalvataggio` ha un `try` attorno a `esegui` per il primo e il
// terzo esito `{ avviso }` per il secondo.
//
// Le asserzioni guardano il BOTTONE e non uno stato interno: è ciò che
// l'utente ha davanti, e la differenza fra i due difetti è precisamente se
// quel bottone torni premibile o no.
import { describe, it, expect, vi } from "vitest";
import { act } from "react";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

const render = (ui, options) => renderWithAppData(ui, DEMO_APP_CTX, options);

const upload = vi.fn(async () => ({ error: null }));
vi.mock("../lib/api.js", () => ({
  TaskFiles: { upload: (...a) => upload(...a) },
}));

const { BulkTaskCreator } = await import("../components/modals/BulkTaskCreator.jsx");

// Compila la tab Manuale con una riga valida e ritorna il bottone «Crea».
const preparaUnaRiga = (props) => {
  render(<BulkTaskCreator existingTasks={[]} onClose={vi.fn()} {...props} />);
  fireEvent.click(screen.getByText("Manuale"));
  fireEvent.change(screen.getAllByPlaceholderText("Titolo task...")[0], {
    target: { value: "Prenotare volo" },
  });
  return screen.getByText(/Crea 1 task/);
};

describe("BulkTaskCreator — il percorso d'errore non congela e non duplica", () => {
  it("un throw di onCreate lascia il bottone premibile e lo dice", async () => {
    // Il caso che il vecchio `busyRef` senza `try` non sopravviveva: non un
    // `{ error }` ritornato — quello i quattro teardown lo gestivano — ma
    // un'eccezione, che li saltava tutti.
    const onCreate = vi.fn(async () => { throw new Error("rete caduta"); });
    const bottone = preparaUnaRiga({ onCreate });

    await act(async () => { fireEvent.click(bottone); });

    expect(onCreate).toHaveBeenCalledTimes(1);
    // Non congelato: il difetto lasciava `disabled` per sempre.
    await waitFor(() => expect(bottone).not.toBeDisabled());
    // E lo dice, invece di restare muto.
    expect(screen.getByText(/rete caduta/)).toBeInTheDocument();
    // I dati inseriti sono ancora lì: è la ragione per cui il pannello resta
    // aperto, non il messaggio.
    expect(screen.getAllByPlaceholderText("Titolo task...")[0]).toHaveValue("Prenotare volo");

    // E il secondo tentativo riparte davvero — «non congelato» significa
    // questo, non solo che il bottone sia dipinto attivo.
    await act(async () => { fireEvent.click(bottone); });
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it("una creazione riuscita con upload fallito BLOCCA il secondo tentativo", async () => {
    // Qui la creazione passa: le task ESISTONO. Riprovare ne farebbe una
    // seconda serie, che è il motivo per cui questo esito non è un errore.
    const onCreate = vi.fn(async () => ({ error: null }));
    upload.mockResolvedValueOnce({ error: new Error("bucket pieno") });

    render(<BulkTaskCreator existingTasks={[]} onCreate={onCreate} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Manuale"));
    fireEvent.change(screen.getAllByPlaceholderText("Titolo task...")[0], {
      target: { value: "Prenotare volo" },
    });

    // Un allegato sulla prima riga: senza, non si arriva alla fase di upload.
    // Stessa forma di bulkRowAttachments.test.jsx.
    const inputFile = screen.getAllByTitle(/Allega file a questa task/)[0]
      .parentElement.querySelector('input[type="file"]');
    const file = new File(["x"], "voucher.pdf", { type: "application/pdf" });
    await act(async () => {
      fireEvent.change(inputFile, { target: { files: [file] } });
    });

    const bottone = screen.getByText(/Crea 1 task/);
    await act(async () => { fireEvent.click(bottone); });

    expect(onCreate).toHaveBeenCalledTimes(1);
    // Dice dov'è finito il pezzo mancante — il nome del file da solo non
    // basterebbe come asserzione: compare anche nel chip dell'allegato sulla
    // riga, che c'è comunque. Qui si cerca la frase che dice che le task ci
    // sono e dove recuperare l'allegato.
    expect(
      screen.getByText(/Task create, ma l'upload di "voucher\.pdf".*è fallito/),
    ).toBeInTheDocument();
    // …e soprattutto NON lascia ripartire la creazione.
    await waitFor(() => expect(bottone).toBeDisabled());

    await act(async () => { fireEvent.click(bottone); });
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
