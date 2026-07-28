// Helper puri del modulo Liste viaggio: formattazione e ordinamento.
// Sono il punto in cui il porting dalla SPA vanilla può divergere in silenzio,
// quindi valgono un test anche se sono poche righe.
import { describe, it, expect, vi } from "vitest";

// listeApi importa il client Supabase condiviso, che senza VITE_SUPABASE_URL
// non si costruisce. Qui interessano solo gli helper puri: stessa strategia di
// api.test.js, il client è mockato e mai usato.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const { eur, fmtDate, parseImporto, saldoClass, todayISO } = await import("../lib/listeApi.js");
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
