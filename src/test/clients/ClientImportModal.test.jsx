import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { ClientImportModal } from "../../components/clients/ClientImportModal.jsx";
import { ConfirmProvider } from "../../state/ConfirmContext.jsx";

// Criticità #8: chiudere con un file caricato e non importato chiede conferma
// (era un window.confirm), e useConfirm() solleva fuori dal provider.
const render = (ui) => rtlRender(<ConfirmProvider>{ui}</ConfirmProvider>);

// Export sintetico nello stesso formato del gestionale legacy citato
// dall'utente ("ExportAnagrafica"): righe di titolo/metadati vuote prima
// della vera intestazione, colonna-flag "Cliente" (Si/No) che NON deve
// essere scambiata per il nome, e colonne identificative extra (codice
// fiscale, data di nascita) da ripiegare nelle Note. Dati di fantasia.
const buildLegacyExportFile = () => {
  const aoa = [
    ["Esportazione del : 01/01/2026"],
    [],
    [],
    ["Titolo", "RagioneSociale", "CodiceFiscale", "Indirizzo", "Citta", "Telefono1", "Cellulare", "Email", "Cliente", "DataNascita"],
    ["Egr.Sig.", "MARIO ROSSI", "RSSMRA80A01H501Z", "VIA ROMA 1", "ROMA", "", "3331234567", "mario.rossi@example.com", "Si", "1 Gennaio 1980"],
    ["Gent.Sig.ra", "ANNA VERDI", "VRDNNA85B02F205X", "VIA MILANO 2", "MILANO", "0212345678", "", "", "Si", "2 Febbraio 1985"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buf], "ExportAnagrafica.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};

const uploadFile = async (file) => {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText(/MARIO ROSSI/)).toBeInTheDocument());
};

describe("ClientImportModal", () => {
  it("rileva l'header dopo il blocco di titolo, mappa i campi senza confondere la colonna-flag 'Cliente' col nome, e ripiega gli extra nelle Note", async () => {
    const onImport = vi.fn();
    render(<ClientImportModal existingClients={[]} onImport={onImport} onClose={vi.fn()} />);

    await uploadFile(buildLegacyExportFile());

    // Entrambe le righe dati sono in anteprima (il blocco titolo non è stato
    // scambiato per una riga cliente).
    expect(screen.getByText(/MARIO ROSSI/)).toBeInTheDocument();
    expect(screen.getByText(/ANNA VERDI/)).toBeInTheDocument();
    // Città/telefono mostrati in anteprima confermano il mapping automatico.
    expect(screen.getByText(/ROMA · 3331234567 · mario\.rossi@example\.com/)).toBeInTheDocument();

    // La selezione di default è impostata in un useEffect, che React esegue
    // dopo il commit in cui compaiono le righe in anteprima: nel frattempo il
    // pulsante mostra ancora "Importa 0 clienti". Va quindi atteso il conteggio
    // definitivo (findByText) invece di leggerlo subito (getByText), altrimenti
    // il test fallisce a intermittenza.
    fireEvent.click(await screen.findByText(/Importa 2 client/));
    expect(onImport).toHaveBeenCalledTimes(1);
    const imported = onImport.mock.calls[0][0];
    expect(imported).toHaveLength(2);
    const mario = imported.find(c => c.name === "MARIO ROSSI");
    expect(mario.city).toBe("ROMA");
    expect(mario.phone).toBe("3331234567"); // Cellulare preferito su Telefono1 vuoto
    expect(mario.email).toBe("mario.rossi@example.com");
    // Il codice fiscale e la data di nascita non hanno un campo dedicato:
    // devono finire nelle Note invece di essere persi silenziosamente.
    expect(mario.notes).toMatch(/Codice Fiscale: RSSMRA80A01H501Z/);
    expect(mario.notes).toMatch(/Data Nascita: 1 Gennaio 1980/);
    // La colonna "Cliente" (flag Si/No) non deve diventare il nome.
    expect(mario.name).not.toBe("Si");
  });

  it("marca come duplicato (e deseleziona di default) un cliente già presente in anagrafica con lo stesso nome", async () => {
    const onImport = vi.fn();
    render(
      <ClientImportModal
        existingClients={[{ id: "x1", name: "Mario Rossi" }]}
        onImport={onImport}
        onClose={vi.fn()}
      />
    );

    await uploadFile(buildLegacyExportFile());

    expect(screen.getByText("già presente")).toBeInTheDocument();
    // Solo ANNA VERDI selezionata di default (1 di 2). Come sopra, il
    // conteggio arriva con l'effect: va atteso, non letto subito.
    fireEvent.click(await screen.findByText(/Importa 1 client/));
    const imported = onImport.mock.calls[0][0];
    expect(imported).toHaveLength(1);
    expect(imported[0].name).toBe("ANNA VERDI");
  });

  // Regressione S-06: il limite dentro readFirstSheetRowsAutoHeader scattava
  // solo DOPO che FileReader aveva già caricato l'intero file in memoria. Un
  // file oltre soglia deve essere rifiutato guardando file.size, prima di
  // qualunque lettura — qui lo verifichiamo dal solo esito visibile (errore
  // mostrato, nessuna riga in anteprima), senza dover costruire davvero 15MB
  // di contenuto XLSX: basta che l'oggetto File dichiari quella dimensione.
  it("rifiuta un file oltre il limite prima di leggerlo, senza mostrare righe in anteprima", async () => {
    const onImport = vi.fn();
    render(<ClientImportModal existingClients={[]} onImport={onImport} onClose={vi.fn()} />);

    const oversized = new File([new Uint8Array(16 * 1024 * 1024)], "enorme.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [oversized] } });

    expect(await screen.findByText(/File troppo grande/)).toBeInTheDocument();
    expect(screen.queryByText(/MARIO ROSSI/)).not.toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });
});
