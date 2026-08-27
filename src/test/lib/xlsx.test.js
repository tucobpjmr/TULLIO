import { describe, it, expect, afterEach } from "vitest";
import * as XLSX from "xlsx";
// `Worker` in jsdom arriva da src/test/setup.js (@vitest/web-worker): il parse
// gira in src/lib/xlsxWorker.js e questi test lo attraversano davvero.
import { detectHeaderRowIndex } from "../../lib/xlsxHeader.js";
import { withPrototypePollutionGuard } from "../../lib/prototypeGuard.js";
import { readFirstSheetRows, readFirstSheetRowsAutoHeader, scriviFoglioXlsx, MAX_IMPORT_BYTES } from "../../lib/xlsx.js";

const CLIENT_HINTS = [
  "nome", "ragionesociale", "ragione sociale", "nominativo", "titolo",
  "email", "mail", "telefono", "cellulare", "citta", "città", "indirizzo",
  "codicefiscale", "codice fiscale", "cap", "name", "phone", "city", "address",
];

// Simula un export di gestionale legacy: righe di titolo/metadati vuote prima
// della vera intestazione — lo stesso pattern del file allegato dall'utente
// (Anagrafica clienti), qui con dati sintetici, non reali.
const buildLegacyStyleWorkbook = () => {
  const aoa = [
    ["Esportazione del : 01/01/2026"],
    [],
    [],
    ["Titolo", "RagioneSociale", "CodiceFiscale", "Indirizzo", "Citta", "Telefono1", "Cellulare", "Email", "Cliente"],
    ["Egr.Sig.", "MARIO ROSSI", "RSSMRA80A01H501Z", "VIA ROMA 1", "ROMA", "", "3331234567", "mario.rossi@example.com", "Si"],
    ["Gent.Sig.ra", "ANNA VERDI", "VRDNNA85B02F205X", "VIA MILANO 2", "MILANO", "0212345678", "", "", "Si"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
};

describe("detectHeaderRowIndex", () => {
  it("individua la riga header dopo un blocco di titolo/righe vuote", () => {
    const rows2d = [
      ["Esportazione del : 01/01/2026"],
      [],
      [],
      ["Titolo", "RagioneSociale", "Email", "Telefono1", "Citta"],
      ["Egr.Sig.", "MARIO ROSSI", "mario@example.com", "333", "ROMA"],
    ];
    expect(detectHeaderRowIndex(rows2d, CLIENT_HINTS)).toBe(3);
  });

  it("ripiega sulla riga 0 quando l'intestazione è già in prima posizione", () => {
    const rows2d = [
      ["Nome", "Email", "Telefono"],
      ["Mario Rossi", "mario@example.com", "333"],
    ];
    expect(detectHeaderRowIndex(rows2d, CLIENT_HINTS)).toBe(0);
  });
});

describe("readFirstSheetRowsAutoHeader", () => {
  it("legge le righe dati saltando il blocco di titolo/metadati", async () => {
    const buf = buildLegacyStyleWorkbook();
    const { rows, columns } = await readFirstSheetRowsAutoHeader(buf.buffer ?? buf, CLIENT_HINTS);
    expect(columns).toContain("RagioneSociale");
    expect(rows).toHaveLength(2);
    expect(rows[0].RagioneSociale).toBe("MARIO ROSSI");
    expect(rows[1].RagioneSociale).toBe("ANNA VERDI");
  });
});

// ─── IL CONFINE DEL WORKER (A-1) ───────────────────────────────────────────
// Questi test esercitano la proprietà per cui il worker esiste: i dati di un
// file estraneo entrano nell'applicazione da UN SOLO punto, e quel punto
// scarta i nomi di chiave che più avanti diventerebbero una scrittura sul
// prototipo. Il parse vero gira nel worker, quindi passano anche dal
// trasporto: se domani qualcuno rimettesse SheetJS nel thread principale
// "perché era più semplice", questi continuerebbero a passare — è
// `VIETATO_XLSX_FUORI_DAL_WORKER` in eslint.config.js a presidiare quello,
// non un test.
const workbookDaAoA = (aoa) => {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out.buffer ?? out;
};

describe("readFirstSheetRows (via worker)", () => {
  it("legge le righe del primo foglio con l'intestazione in riga 0", async () => {
    const rows = await readFirstSheetRows(workbookDaAoA([
      ["Titolo", "Cliente"],
      ["Prenotazione Roma", "MARIO ROSSI"],
    ]));
    expect(rows).toHaveLength(1);
    expect(rows[0].Titolo).toBe("Prenotazione Roma");
    expect(rows[0].Cliente).toBe("MARIO ROSSI");
  });

  it("nessuna chiave pericolosa sopravvive a un'intestazione ostile", async () => {
    const rows = await readFirstSheetRows(workbookDaAoA([
      ["Titolo", "__proto__", "constructor", "prototype"],
      ["Prenotazione", "pwned", "pwned", "pwned"],
    ]));
    expect(rows).toHaveLength(1);
    for (const k of ["__proto__", "constructor", "prototype"]) {
      expect(Object.keys(rows[0])).not.toContain(k);
    }
    // e soprattutto: nessuna traccia sul prototipo di questo realm
    expect({}.pwned).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("pwned");

    // ⚠️ Osservato scrivendo questo test, e vale la pena lasciarlo scritto.
    // Su QUESTO percorso le chiavi pericolose non arrivano mai intatte al
    // filtro: SheetJS le consegna già storpiate in `__proto___NaN` e
    // `constructor_NaN`. Il motivo è che la sua deduplica dei nomi di colonna
    // interroga l'accumulatore con `in`, che trova `__proto__` e `constructor`
    // su Object.prototype anche quando non sono stati inseriti: li considera
    // duplicati e vi appende un contatore che è `undefined + 1`. È un accesso
    // non sicuro al prototipo dentro la libreria — innocuo di per sé, ma è la
    // stessa disattenzione da cui nasce la CVE, vista da vicino.
    //
    // Il filtro non è quindi ridondante: sull'altro percorso (`header: 1`) le
    // chiavi le costruiamo NOI da `righeDaGriglia`, e lì `__proto__` arriva
    // letterale — è il test qui sotto a dimostrarlo.
    expect(Object.keys(rows[0])).toContain("Titolo");
  });

  it("scarta le stesse chiavi anche sul percorso auto-header", async () => {
    const { rows, columns } = await readFirstSheetRowsAutoHeader(workbookDaAoA([
      ["Esportazione del : 01/01/2026"],
      [],
      ["Nome", "Email", "__proto__"],
      ["MARIO ROSSI", "mario@example.com", "pwned"],
    ]), CLIENT_HINTS);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("__proto__");
    expect(rows[0].Nome).toBe("MARIO ROSSI");
    // `columns` resta la lista GREZZA dell'intestazione: è quella che la UI di
    // mappatura mostra all'utente, e nascondergli una colonna presente nel file
    // sarebbe più confondente che mostrarla e non importarla.
    expect(columns).toContain("__proto__");
  });

  it("rifiuta un buffer oltre MAX_IMPORT_BYTES senza nemmeno avviare il worker", async () => {
    const troppoGrande = new ArrayBuffer(MAX_IMPORT_BYTES + 1);
    await expect(readFirstSheetRows(troppoGrande)).rejects.toThrow(/troppo grande/i);
  });

  it("un file che non è un foglio torna vuoto, non in errore", async () => {
    // Contratto controintuitivo ma reale, e i due componenti di import devono
    // conoscerlo: SheetJS interpreta byte arbitrari come un CSV di una riga,
    // quindi un PDF rinominato .csv non solleva niente — arriva come ZERO
    // righe. "Nessuna riga" è perciò il modo NORMALE in cui si presenta un
    // file sbagliato, e la UI deve dirlo all'utente invece di trattarlo come
    // un import riuscito su un file vuoto.
    const spazzatura = new TextEncoder().encode("non e' un foglio di calcolo").buffer;
    await expect(readFirstSheetRows(spazzatura)).resolves.toEqual([]);
  });
});

describe("scriviFoglioXlsx (via worker)", () => {
  it("produce un Blob .xlsx rileggibile", async () => {
    const blob = await scriviFoglioXlsx([{ ID: "t-1", Titolo: "Prenotazione" }], "Task");
    expect(blob.type).toMatch(/spreadsheetml\.sheet/);
    const riletto = await readFirstSheetRows(await blob.arrayBuffer());
    expect(riletto).toEqual([{ ID: "t-1", Titolo: "Prenotazione" }]);
  });
});

// Verifica la mitigazione applicativa per la Prototype Pollution di SheetJS
// 0.18.5 (GHSA-4r6h-8v6p-xvw6), fintanto che non si migra al tarball CDN.
describe("withPrototypePollutionGuard", () => {
  afterEach(() => {
    // pulizia difensiva nel caso un test lasci residui
    delete Object.prototype.__polluted__;
  });

  it("restituisce il valore della callback quando non c'è pollution", () => {
    expect(withPrototypePollutionGuard(() => 42)).toBe(42);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("__polluted__");
  });

  it("rileva, rimuove e rifiuta se il parse inquina Object.prototype", () => {
    expect(() =>
      withPrototypePollutionGuard(() => {
        // simula ciò che farebbe un file .xlsx malevolo durante il parsing
        Object.prototype.__polluted__ = "pwned";
        return "unreachable";
      })
    ).toThrow(/prototype pollution/i);

    // la proprietà iniettata deve essere stata rimossa da Object.prototype
    expect("__polluted__" in {}).toBe(false);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("__polluted__");
  });

  it("non segnala come pollution le proprietà legittime pre-esistenti", () => {
    // hasOwnProperty & co. esistono già nel baseline: non devono far fallire
    expect(() =>
      withPrototypePollutionGuard(() => {
        void Object.prototype.hasOwnProperty;
        return "ok";
      })
    ).not.toThrow();
  });

  it("rileva la sovrascrittura di una proprietà esistente (toString)", () => {
    const originale = Object.prototype.toString;
    let errore = null;
    try {
      withPrototypePollutionGuard(() => {
        // il nome "toString" c'era già: un guard che guarda solo l'insieme
        // dei nomi non vede questa mutazione, ma è pollution lo stesso
        Object.prototype.toString = () => "pwned";
        return "unreachable";
      });
    } catch (e) {
      errore = e;
    } finally {
      // il guard non ripristina le sovrascritture (solo le aggiunte): tocca al
      // test riportare il baseline reale allo stato di partenza — PRIMA di
      // qualunque expect(), perché i matcher di Vitest usano internamente
      // Object.prototype.toString.call() e un toString ancora avvelenato li
      // manda fuori strada
      Object.prototype.toString = originale;
    }
    expect(errore).not.toBeNull();
    expect(errore.message).toMatch(/prototype pollution/i);
  });

  it("rileva l'inquinamento di Array.prototype, non solo di Object.prototype", () => {
    expect(() =>
      withPrototypePollutionGuard(() => {
        Array.prototype.__polluted__ = "pwned";
        return "unreachable";
      })
    ).toThrow(/prototype pollution/i);
    expect(Object.getOwnPropertyNames(Array.prototype)).not.toContain("__polluted__");
  });
});
