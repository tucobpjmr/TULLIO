// Lo stato di scadenza di un documento.
//
// `oggi` è un argomento apposta (vedi il preambolo di scadenze.js): qui si
// vede perché — ogni caso fissa una data e non dipende dall'orologio di chi
// esegue i test.
import { describe, it, expect } from "vitest";
import {
  giorniAllaScadenza, statoScadenza, testoScadenza, filtraPerScadenza,
  GIORNI_AVVISO, ETICHETTE_STATO, FILTRI_SCADENZA,
} from "../../components/documenti/scadenze.js";

const OGGI = new Date("2026-09-16T14:30:00Z");

describe("giorniAllaScadenza", () => {
  it("conta i giorni interi fino alla scadenza", () => {
    expect(giorniAllaScadenza("2026-09-26", OGGI)).toBe(10);
    expect(giorniAllaScadenza("2026-09-16", OGGI)).toBe(0);
    expect(giorniAllaScadenza("2026-09-06", OGGI)).toBe(-10);
  });

  // Il conto è su mezzanotte, non sull'istante: un documento che scade oggi
  // deve dire «scade oggi» sia alle 9 sia alle 23 dello stesso giorno.
  it("non dipende dall'ora del giorno", () => {
    const mattina = new Date("2026-09-16T06:00:00Z");
    const sera = new Date("2026-09-16T23:00:00Z");
    expect(giorniAllaScadenza("2026-09-16", mattina)).toBe(giorniAllaScadenza("2026-09-16", sera));
  });

  it("ignora la parte oraria di una scadenza scritta come timestamp", () => {
    expect(giorniAllaScadenza("2026-09-26T08:00:00Z", OGGI)).toBe(10);
  });

  it("restituisce null per una data assente o illeggibile", () => {
    expect(giorniAllaScadenza(null, OGGI)).toBeNull();
    expect(giorniAllaScadenza("", OGGI)).toBeNull();
    expect(giorniAllaScadenza("non-una-data", OGGI)).toBeNull();
  });
});

describe("statoScadenza", () => {
  it("distingue scaduto, in scadenza e valido", () => {
    expect(statoScadenza({ scadenza: "2026-09-15" }, OGGI)).toBe("scaduto");
    expect(statoScadenza({ scadenza: "2026-12-01" }, OGGI)).toBe("inScadenza");
    expect(statoScadenza({ scadenza: "2030-01-01" }, OGGI)).toBe("valido");
  });

  // La soglia esiste perché molti paesi esigono sei mesi di validità residua:
  // il giorno esatto del confine è parte del contratto, non un dettaglio.
  it("la soglia dei sei mesi è inclusiva", () => {
    const alConfine = new Date(Date.UTC(2026, 8, 16) + GIORNI_AVVISO * 86400000);
    const iso = alConfine.toISOString().slice(0, 10);
    expect(statoScadenza({ scadenza: iso }, OGGI)).toBe("inScadenza");
  });

  // `senzaData` NON è `valido`: sull'archivio appena importato sarà lo stato
  // della maggioranza delle righe, e confonderlo con «tutto a posto»
  // direbbe all'agenzia il contrario di quello che sa.
  it("un documento senza data ha uno stato proprio", () => {
    expect(statoScadenza({ scadenza: null }, OGGI)).toBe("senzaData");
    expect(statoScadenza({}, OGGI)).toBe("senzaData");
    expect(statoScadenza(undefined, OGGI)).toBe("senzaData");
  });

  it("ogni stato ha un'etichetta", () => {
    for (const stato of ["scaduto", "inScadenza", "valido", "senzaData"]) {
      expect(ETICHETTE_STATO[stato]?.testo).toBeTruthy();
      expect(ETICHETTE_STATO[stato]?.colore).toBeTruthy();
    }
  });
});

describe("testoScadenza", () => {
  it("usa giorni sotto i due mesi e mesi sopra", () => {
    expect(testoScadenza({ scadenza: "2026-09-16" }, OGGI)).toBe("Scade oggi");
    expect(testoScadenza({ scadenza: "2026-09-17" }, OGGI)).toBe("Scade fra 1 giorno");
    expect(testoScadenza({ scadenza: "2026-09-26" }, OGGI)).toBe("Scade fra 10 giorni");
    expect(testoScadenza({ scadenza: "2027-03-16" }, OGGI)).toBe("Scade fra 6 mesi");
    expect(testoScadenza({ scadenza: "2030-09-16" }, OGGI)).toBe("Scade fra 4 anni");
  });

  it("dice da quanto è scaduto", () => {
    expect(testoScadenza({ scadenza: "2026-09-15" }, OGGI)).toBe("Scaduto da 1 giorno");
    expect(testoScadenza({ scadenza: "2026-09-06" }, OGGI)).toBe("Scaduto da 10 giorni");
    expect(testoScadenza({ scadenza: "2026-03-16" }, OGGI)).toBe("Scaduto da 6 mesi");
  });

  it("senza data non inventa un testo", () => {
    expect(testoScadenza({ scadenza: null }, OGGI)).toBe("—");
  });
});

describe("filtraPerScadenza", () => {
  const documenti = [
    { id: "a", scadenza: "2026-09-15" },  // scaduto
    { id: "b", scadenza: "2026-12-01" },  // in scadenza
    { id: "c", scadenza: "2030-01-01" },  // valido
    { id: "d", scadenza: null },          // senza data
  ];

  it("«Tutti» non filtra", () => {
    expect(filtraPerScadenza(documenti, "tutti", OGGI)).toHaveLength(4);
  });

  it("«Da rinnovare» prende scaduti e in scadenza, non i senza data", () => {
    expect(filtraPerScadenza(documenti, "daRinnovare", OGGI).map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("«Scaduti» e «Senza data» prendono un solo stato", () => {
    expect(filtraPerScadenza(documenti, "scaduti", OGGI).map((d) => d.id)).toEqual(["a"]);
    expect(filtraPerScadenza(documenti, "senzaData", OGGI).map((d) => d.id)).toEqual(["d"]);
  });

  // Una chiave che non esiste non deve svuotare l'elenco in silenzio: è il
  // caso di un filtro rinominato senza aggiornare chi lo usa.
  it("una chiave sconosciuta non filtra invece di nascondere tutto", () => {
    expect(filtraPerScadenza(documenti, "inventata", OGGI)).toHaveLength(4);
    expect(filtraPerScadenza(undefined, "tutti", OGGI)).toEqual([]);
  });

  it("ogni filtro dichiarato è applicabile", () => {
    for (const f of FILTRI_SCADENZA) {
      expect(() => filtraPerScadenza(documenti, f.chiave, OGGI)).not.toThrow();
    }
  });
});
