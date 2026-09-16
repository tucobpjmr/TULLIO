// La deduzione del nome del passeggero dal nome del file.
//
// È la funzione su cui poggia l'import massivo: sbagliarla significa mille
// righe da correggere a mano nell'archivio. Qui si fissano le due cose che
// contano — che cosa riconosce, e soprattutto che cosa NON dà per riconosciuto,
// perché un nome sbagliato si conferma per distrazione mentre un campo vuoto si
// vede.
import { describe, it, expect } from "vitest";
import { nomeDaFile, analizzaFile } from "../../components/documenti/nomeDaFile.js";

describe("nomeDaFile", () => {
  it("riconosce la convenzione COGNOME_NOME", () => {
    expect(nomeDaFile("LEPORE_PAOLO.jpg")).toEqual({ passeggero: "LEPORE PAOLO", riconosciuto: true });
  });

  it("accetta gli altri separatori usati al posto dello spazio", () => {
    for (const nome of ["ROSSI-MARIA.png", "ROSSI.MARIA.jpeg", "ROSSI MARIA.pdf", "ROSSI+MARIA.webp"]) {
      expect(nomeDaFile(nome).passeggero).toBe("ROSSI MARIA");
      expect(nomeDaFile(nome).riconosciuto).toBe(true);
    }
  });

  it("conserva i nomi composti invece di troncarli al secondo elemento", () => {
    expect(nomeDaFile("DE_LUCA_MARIA_ROSA.jpg").passeggero).toBe("DE LUCA MARIA ROSA");
  });

  // Il punto della funzione: NON riordina. `chiaveCliente` non lo fa, e
  // invertire d'ufficio produrrebbe un nome che il file non diceva.
  it("non riordina cognome e nome", () => {
    expect(nomeDaFile("LEPORE_PAOLO.jpg").passeggero).not.toBe("PAOLO LEPORE");
  });

  it("toglie i suffissi dei duplicati e del fronte/retro", () => {
    expect(nomeDaFile("ROSSI_MARIA (1).jpg").passeggero).toBe("ROSSI MARIA");
    expect(nomeDaFile("ROSSI_MARIA_2.jpg").passeggero).toBe("ROSSI MARIA");
    expect(nomeDaFile("ROSSI_MARIA_retro.jpg").passeggero).toBe("ROSSI MARIA");
    expect(nomeDaFile("ROSSI_MARIA - copia.jpg").passeggero).toBe("ROSSI MARIA");
  });

  // Due file fronte/retro devono ricadere sullo STESSO passeggero: è la
  // ragione per cui il suffisso numerico si toglie invece di diventare parte
  // del nome.
  it("fronte e retro danno lo stesso passeggero", () => {
    expect(nomeDaFile("ROSSI_MARIA_1.jpg").passeggero).toBe(nomeDaFile("ROSSI_MARIA_2.jpg").passeggero);
  });

  it("non inventa un nome dai file nominati dalla fotocamera", () => {
    for (const nome of [
      "IMG_4821.jpg", "IMG-20240612.jpg", "DSC00931.JPG", "PXL_20240612_101112.jpg",
      "Screenshot 2024-06-12 alle 10.11.12.png", "WhatsApp Image 2024-06-12.jpeg",
      "foto1.jpg", "scan_003.pdf", "20240612.jpg",
    ]) {
      expect(nomeDaFile(nome)).toEqual({ passeggero: "", riconosciuto: false });
    }
  });

  // Una parola sola può essere un cognome corretto: non si scarta il valore,
  // si scarta la CERTEZZA — nell'anteprima la riga resta evidenziata.
  it("una parola sola si propone ma non si dà per riconosciuta", () => {
    expect(nomeDaFile("LEPORE.jpg")).toEqual({ passeggero: "LEPORE", riconosciuto: false });
  });

  it("un nome vuoto o senza lettere non è riconosciuto", () => {
    expect(nomeDaFile("").riconosciuto).toBe(false);
    expect(nomeDaFile(".jpg").riconosciuto).toBe(false);
    expect(nomeDaFile(undefined).riconosciuto).toBe(false);
  });
});

describe("analizzaFile", () => {
  const f = (name) => ({ name, size: 100 });

  it("mantiene l'ordine dei file e allega la deduzione", () => {
    const righe = analizzaFile([f("ROSSI_MARIA.jpg"), f("IMG_1.jpg")]);
    expect(righe.map((r) => r.passeggero)).toEqual(["ROSSI MARIA", ""]);
    expect(righe.map((r) => r.riconosciuto)).toEqual([true, false]);
  });

  // Il segnale che la convenzione dei nomi non è quella attesa: vale la pena
  // accorgersene prima di caricare mille file, non dopo.
  it("marca i passeggeri che compaiono in più file", () => {
    const righe = analizzaFile([f("ROSSI_MARIA_1.jpg"), f("ROSSI_MARIA_2.jpg"), f("LEPORE_PAOLO.jpg")]);
    expect(righe.map((r) => r.duplicato)).toEqual([true, true, false]);
  });

  // Le righe senza nome dedotto NON sono tutte duplicate fra loro: il
  // conteggio salta la stringa vuota, altrimenti venti file di fotocamera
  // risulterebbero venti copie dello stesso passeggero.
  it("non considera duplicati i file senza nome dedotto", () => {
    const righe = analizzaFile([f("IMG_1.jpg"), f("IMG_2.jpg")]);
    expect(righe.every((r) => r.duplicato === false)).toBe(true);
  });

  it("regge un elenco vuoto o assente", () => {
    expect(analizzaFile([])).toEqual([]);
    expect(analizzaFile(undefined)).toEqual([]);
  });
});
