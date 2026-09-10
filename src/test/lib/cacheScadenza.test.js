// B-1 dell'audit del 10 settembre. Le cache di signed URL avevano una
// scadenza che NON liberava (la voce scaduta veniva saltata, non rimossa) e
// nessun tetto. Qui si verificano le due proprietà separatamente, perché sono
// due: che il contenuto sia corretto (scadenza) e che il consumo sia limitato
// (tetto). Il tempo è iniettato — l'alternativa è un test che aspetta un'ora.
import { describe, it, expect } from "vitest";
import { creaCacheScadenza } from "../../lib/cacheScadenza.js";

// Un orologio a mano: `avanza` è l'unico modo in cui il tempo passa qui.
const orologio = () => {
  let ora = 1_000_000;
  return { adesso: () => ora, avanza: (ms) => { ora += ms; } };
};

describe("cacheScadenza — leggere e scrivere", () => {
  it("rende il valore scritto finché è dentro la scadenza", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "URL-A", t.adesso() + 1000);
    expect(c.leggi("a")).toBe("URL-A");
  });

  it("una chiave mai scritta è null, non undefined", () => {
    const c = creaCacheScadenza({ tetto: 10 });
    expect(c.leggi("mai-vista")).toBeNull();
  });

  it("riscrivere la stessa chiave non aggiunge una voce", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "PRIMA", t.adesso() + 1000);
    c.scrivi("a", "DOPO", t.adesso() + 1000);
    expect(c.conta()).toBe(1);
    expect(c.leggi("a")).toBe("DOPO");
  });

  it("dimentica toglie una chiave sola", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 1000);
    c.scrivi("b", "B", t.adesso() + 1000);
    expect(c.dimentica("a")).toBe(true);
    expect(c.leggi("a")).toBeNull();
    expect(c.leggi("b")).toBe("B");
  });

  it("svuota azzera tutto — è ciò su cui poggia svuotaCacheUrl al logout", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 1000);
    c.scrivi("b", "B", t.adesso() + 1000);
    c.svuota();
    expect(c.conta()).toBe(0);
  });
});

describe("cacheScadenza — la scadenza LIBERA, non si limita a saltare", () => {
  it("una voce scaduta non viene restituita", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 1000);
    t.avanza(1001);
    expect(c.leggi("a")).toBeNull();
  });

  it("e viene RIMOSSA nell'istante in cui la si guarda: è il difetto di B-1", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 1000);
    t.avanza(1001);
    expect(c.conta()).toBe(1); // finché nessuno la guarda, la potatura è pigra
    c.leggi("a");
    expect(c.conta()).toBe(0);
  });

  it("l'istante esatto di scadenza conta come scaduta, non come buona", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 10, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 1000);
    t.avanza(1000);
    expect(c.leggi("a")).toBeNull();
  });
});

describe("cacheScadenza — il tetto limita il consumo", () => {
  it("non si superano mai `tetto` voci, per quante se ne scrivano", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 3, adesso: t.adesso });
    for (let i = 0; i < 50; i++) c.scrivi(`k${i}`, `V${i}`, t.adesso() + 10_000);
    expect(c.conta()).toBe(3);
  });

  it("oltre il tetto si sacrificano PRIMA le scadute, anche se recenti", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 2, adesso: t.adesso });
    c.scrivi("vecchia-ma-viva", "V", t.adesso() + 10_000);
    c.scrivi("scaduta", "S", t.adesso() + 100);
    t.avanza(200); // "scaduta" è morta, "vecchia-ma-viva" no
    c.scrivi("nuova", "N", t.adesso() + 10_000);
    expect(c.conta()).toBe(2);
    expect(c.leggi("vecchia-ma-viva")).toBe("V");
    expect(c.leggi("nuova")).toBe("N");
  });

  it("se sono tutte vive si sacrifica la meno usata di recente, non la più vecchia", () => {
    const t = orologio();
    const c = creaCacheScadenza({ tetto: 2, adesso: t.adesso });
    c.scrivi("a", "A", t.adesso() + 10_000);
    c.scrivi("b", "B", t.adesso() + 10_000);
    // Rileggere "a" la promuove: da qui in poi la meno usata è "b".
    expect(c.leggi("a")).toBe("A");
    c.scrivi("c", "C", t.adesso() + 10_000);
    expect(c.leggi("b")).toBeNull();
    expect(c.leggi("a")).toBe("A");
    expect(c.leggi("c")).toBe("C");
  });

  it("un tetto abbassato non lascia indietro l'avanzo: si pota finché serve", () => {
    // Non è un caso della UI — il tetto è una costante — ma è la ragione per
    // cui la potatura è un `while` e non un `if`: con un `if` una cache già
    // piena si assesterebbe a `tetto + n` senza che nulla lo segnali.
    const t = orologio();
    const stretta = creaCacheScadenza({ tetto: 1, adesso: t.adesso });
    stretta.scrivi("a", "A", t.adesso() + 10_000);
    stretta.scrivi("b", "B", t.adesso() + 10_000);
    stretta.scrivi("c", "C", t.adesso() + 10_000);
    expect(stretta.conta()).toBe(1);
    expect(stretta.leggi("c")).toBe("C");
  });
});
