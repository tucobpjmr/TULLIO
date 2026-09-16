// L'anteprima dell'import massivo.
//
// È il passaggio che sta fra «ho scelto una cartella» e «ho scritto mille
// righe nell'archivio», e il suo compito è uno solo: non lasciar partire un
// caricamento che qualcuno dovrà poi correggere riga per riga. Qui si fissa
// che il pulsante resti BLOCCATO finché ci sono file senza un nome, e che si
// sblocchi appena quel nome viene scritto a mano.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImportDocumentiModal } from "../../components/documenti/ImportDocumentiModal.jsx";

// La compressione tocca la canvas, che in jsdom non produce blob: il modulo
// reale ricadrebbe comunque sull'originale (è il suo contratto indulgente), ma
// sostituirlo qui tiene il test sul comportamento della MODALE.
vi.mock("../../lib/comprimiImmagine.js", () => ({
  comprimiSePossibile: async (file) => ({ blob: file, compresso: false, tipo: file.type }),
}));

const file = (name) => new File(["x"], name, { type: "image/jpeg" });

// `webkitdirectory` non esiste in jsdom, ma l'input sì: si seleziona dal
// secondo campo («Scegli i file»), che è lo stesso `onChange`.
function scegliFile(files) {
  const input = document.querySelector('input[type="file"]:not([webkitdirectory])');
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
}

describe("ImportDocumentiModal", () => {
  let onCarica;
  beforeEach(() => { onCarica = vi.fn(async () => ({ error: null })); });

  it("mostra il nome dedotto da ogni file", () => {
    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} />);
    scegliFile([file("LEPORE_PAOLO.jpg"), file("ROSSI_MARIA.jpg")]);

    expect(screen.getByLabelText("Passeggero per LEPORE_PAOLO.jpg")).toHaveValue("LEPORE PAOLO");
    expect(screen.getByLabelText("Passeggero per ROSSI_MARIA.jpg")).toHaveValue("ROSSI MARIA");
  });

  // Il punto dell'anteprima: un file di fotocamera non deve poter entrare
  // nell'archivio con un nome inventato.
  it("blocca il caricamento finché un file resta senza nome", () => {
    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} />);
    scegliFile([file("LEPORE_PAOLO.jpg"), file("IMG_4821.jpg")]);

    expect(screen.getByRole("button", { name: /Carica 2 documenti/ })).toBeDisabled();
    expect(screen.getByText(/1 file su 2 non hanno un nome riconoscibile/)).toBeInTheDocument();
  });

  it("si sblocca appena il nome mancante viene scritto a mano", async () => {
    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} />);
    scegliFile([file("IMG_4821.jpg")]);

    const campo = screen.getByLabelText("Passeggero per IMG_4821.jpg");
    fireEvent.change(campo, { target: { value: "LEPORE PAOLO" } });

    const carica = screen.getByRole("button", { name: /Carica 1 documenti/ });
    await waitFor(() => expect(carica).not.toBeDisabled());
  });

  it("carica ogni file con il proprio passeggero e il tipo scelto per il blocco", async () => {
    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} onFatto={vi.fn()} />);
    scegliFile([file("LEPORE_PAOLO.jpg")]);

    fireEvent.change(screen.getByLabelText(/Tipo per tutti i documenti/), {
      target: { value: "carta_identita" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Carica 1 documenti/ }));

    await waitFor(() => expect(onCarica).toHaveBeenCalledTimes(1));
    expect(onCarica).toHaveBeenCalledWith(
      expect.anything(),
      "LEPORE_PAOLO.jpg",
      { tipo: "carta_identita", passeggero: "LEPORE PAOLO" },
    );
  });

  // Su mille file un rifiuto è normale: l'esito deve DIRLO, invece di
  // chiudersi con un successo che nasconde i file mancanti.
  it("il riepilogo finale distingue caricati e non caricati", async () => {
    onCarica = vi.fn(async (_b, nomeFile) =>
      (nomeFile === "ROSSI_MARIA.jpg" ? { error: { message: "File troppo grande" } } : { error: null }));

    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} onFatto={vi.fn()} />);
    scegliFile([file("LEPORE_PAOLO.jpg"), file("ROSSI_MARIA.jpg")]);
    fireEvent.click(screen.getByRole("button", { name: /Carica 2 documenti/ }));

    expect(await screen.findByText(/1 non caricati/)).toBeInTheDocument();
    expect(screen.getByText(/ROSSI_MARIA.jpg — File troppo grande/)).toBeInTheDocument();
  });

  it("avvisa quando la cartella scelta ha molti più file del previsto", () => {
    render(<ImportDocumentiModal onChiudi={vi.fn()} onCarica={onCarica} />);
    scegliFile(Array.from({ length: 1201 }, (_, i) => file(`ROSSI_MARIA${i}.jpg`)));

    expect(screen.getByText(/Hai selezionato 1201 file/)).toBeInTheDocument();
  });
});
