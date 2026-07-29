// Helper puri del modulo Liste viaggio: formattazione e ordinamento.
// Sono il punto in cui il porting dalla SPA vanilla può divergere in silenzio,
// quindi valgono un test anche se sono poche righe.
import { describe, it, expect, vi } from "vitest";

// listeApi importa il client Supabase condiviso, che senza VITE_SUPABASE_URL
// non si costruisce. Qui interessano solo gli helper puri: stessa strategia di
// api.test.js, il client è mockato e mai usato.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const {
  docHtml, eur, fmtDate, parseImporto, riepilogoTesto, saldoClass, todayISO,
} = await import("../lib/listeApi.js");
const { ordinaListe } = await import("../components/liste/ListeViaggio.jsx");

describe("listeApi — formattazione", () => {
  it("eur formatta in valuta italiana", () => {
    // Niente assert sul separatore delle migliaia: dipende dai dati di locale
    // ICU del runtime (Node in CI può non averli, il browser sì). Qui conta
    // che decimali e valuta siano quelli italiani.
    expect(eur(1234.5)).toMatch(/1\.?234,50\s*€/);
    expect(eur(0)).toMatch(/0,00\s*€/);
    expect(eur(null)).toMatch(/0,00\s*€/);
    expect(eur(-12.5)).toMatch(/-\s*12,50\s*€/);
  });

  it("fmtDate converte YYYY-MM-DD in gg/mm/aaaa senza passare da Date", () => {
    // new Date("2026-07-28") sarebbe interpretata come UTC: in Italia
    // renderebbe il giorno precedente. Il parsing è testuale apposta.
    expect(fmtDate("2026-07-28")).toBe("28/07/2026");
    expect(fmtDate(null)).toBe("");
    expect(fmtDate("")).toBe("");
  });

  it("todayISO produce la data LOCALE, non quella UTC", () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    expect(todayISO()).toBe(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  });

  it("saldoClass tratta come 'in pari' gli scarti sotto mezzo centesimo", () => {
    expect(saldoClass(10)).toBe("pos");
    expect(saldoClass(-10)).toBe("neg");
    expect(saldoClass(0)).toBe("zero");
    expect(saldoClass(-0.001)).toBe("zero");
  });
});

describe("listeApi — parseImporto", () => {
  it("accetta virgola e punto come separatore decimale", () => {
    expect(parseImporto("12,50")).toBe(12.5);
    expect(parseImporto("12.50")).toBe(12.5);
  });

  it("applica il segno passato, ignorando quello digitato", () => {
    expect(parseImporto("12,50", -1)).toBe(-12.5);
    expect(parseImporto("-12,50", 1)).toBe(12.5);
  });

  it("rifiuta zero e valori non numerici", () => {
    // La RPC li respinge comunque con check_violation: qui evitiamo il round-trip.
    expect(parseImporto("0")).toBeNull();
    expect(parseImporto("")).toBeNull();
    expect(parseImporto("abc")).toBeNull();
    expect(parseImporto(null)).toBeNull();
  });
});

describe("ordinaListe", () => {
  const liste = [
    { id: "a", clients: { name: "ROSSI" } },
    { id: "b", clients: { name: "BIANCHI" } },
    { id: "c", clients: { name: "VERDI" } },
  ];
  const saldi = {
    a: { saldo: 100, ultimo_movimento: "2026-07-01" },
    b: { saldo: 300, ultimo_movimento: "2026-07-20" },
    c: { saldo: 200, ultimo_movimento: null }, // lista senza movimenti
  };
  const ids = (arr) => arr.map((l) => l.id);

  it("'recenti' lascia l'ordine del database", () => {
    expect(ids(ordinaListe(liste, saldi, "recenti"))).toEqual(["a", "b", "c"]);
  });

  it("'nome' ordina per cliente A–Z", () => {
    expect(ids(ordinaListe(liste, saldi, "nome"))).toEqual(["b", "a", "c"]);
  });

  it("'saldo' ordina dal saldo più alto", () => {
    expect(ids(ordinaListe(liste, saldi, "saldo"))).toEqual(["b", "c", "a"]);
  });

  it("le liste senza movimenti finiscono in fondo in ENTRAMBI i versi", () => {
    // Ordinando dal più vecchio, una lista senza data occuperebbe le prime
    // righe se la si trattasse come stringa vuota.
    expect(ids(ordinaListe(liste, saldi, "mov_recente"))).toEqual(["b", "a", "c"]);
    expect(ids(ordinaListe(liste, saldi, "mov_vecchio"))).toEqual(["a", "b", "c"]);
  });

  it("non riordina l'array ricevuto", () => {
    const originale = [...liste];
    ordinaListe(liste, saldi, "nome");
    expect(liste).toEqual(originale);
  });
});

// docHtml costruisce a mano una stringa HTML (non JSX): a differenza del
// rendering React qui l'escaping non è automatico, quindi vale la pena
// verificarlo esplicitamente — un nome cliente o una descrizione con `<`/`&`
// non deve rompere il markup del documento Word generato.
describe("docHtml — export Word 'copia agente'", () => {
  const lista = { clients: { name: 'ROSSI & <FIGLI>' }, titolo: "Buono 2026", stato: "attiva" };
  const movimenti = [
    { data_movimento: "2026-07-01", descrizione: "Acconto <iniziale>", importo: 100, metodo: "bonifico" },
    { data_movimento: "2026-07-10", descrizione: "Prelievo", importo: -30, metodo: null },
  ];

  it("include cliente, movimenti e saldo, con il testo HTML-escaped", () => {
    const html = docHtml(lista, movimenti, [], {});
    expect(html).toContain("LISTA ROSSI &amp; &lt;FIGLI&gt;");
    expect(html).toContain("Acconto &lt;iniziale&gt;");
    expect(html).not.toContain("<iniziale>");
    expect(html).toContain("COPIA AGENTE");
    expect(html).toContain("SALDO: € 70,00");
    expect(html).toContain("BONIFICO");
  });

  it("segna LISTA ESAURITA solo se lo stato lo è", () => {
    expect(docHtml(lista, movimenti, [], {})).not.toContain("LISTA ESAURITA");
    expect(docHtml({ ...lista, stato: "esaurita" }, movimenti, [], {})).toContain("LISTA ESAURITA");
  });

  it("include lo storico modifiche risolvendo l'attore per nome, quando presente", () => {
    const storico = [{ actor_id: "u1", action: "lista_creata", created_at: "2026-07-01T10:00:00Z" }];
    const html = docHtml(lista, movimenti, storico, { u1: "Marco Rossi" });
    expect(html).toContain("Storico modifiche");
    expect(html).toContain("Marco Rossi");
    expect(html).toContain("ha creato la lista");
  });

  it("omette la sezione storico se vuota o assente", () => {
    expect(docHtml(lista, movimenti, [], {})).not.toContain("Storico modifiche");
    expect(docHtml(lista, movimenti, undefined, {})).not.toContain("Storico modifiche");
  });
});

describe("riepilogoTesto — riepilogo per il cliente (testo semplice)", () => {
  const lista = { clients: { name: "ROSSI MARIO" }, titolo: "Buono 2026", stato: "attiva" };

  it("elenca i movimenti e il saldo finale", () => {
    const movimenti = [
      { data_movimento: "2026-07-01", descrizione: "Acconto", importo: 100 },
      { data_movimento: "2026-07-10", descrizione: "Prelievo", importo: -30 },
    ];
    const testo = riepilogoTesto(lista, movimenti);
    expect(testo).toContain("RIEPILOGO BUONO VIAGGIO");
    expect(testo).toContain("ROSSI MARIO — Buono 2026");
    expect(testo).toContain("Acconto");
    expect(testo).toMatch(/SALDO: 70,00\s*€/);
    expect(testo).not.toContain("LISTA ESAURITA");
  });

  it("segnala l'assenza di movimenti invece di una lista vuota", () => {
    expect(riepilogoTesto(lista, [])).toContain("Nessun movimento registrato.");
  });

  it("segnala una lista esaurita", () => {
    expect(riepilogoTesto({ ...lista, stato: "esaurita" }, [])).toContain("LISTA ESAURITA");
  });

  it("non include mai le note interne, anche quando valorizzate", () => {
    // Le note interne (lista.note) sono a uso team: il riepilogo per il
    // cliente non deve mai riportarle, indipendentemente dal contenuto.
    const conNote = { ...lista, note: "Cliente da richiamare, sconto agenzia 5%" };
    const testo = riepilogoTesto(conNote, []);
    expect(testo).not.toContain("richiamare");
    expect(testo).not.toContain("sconto agenzia");
  });
});
