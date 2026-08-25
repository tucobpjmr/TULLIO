// La tassonomia keyword→categoria — B-2 dell'audit del 25 agosto.
//
// PERCHÉ ESISTE. La regola viveva dentro `QuickAddTask.jsx`, fra gli stili e il
// JSX, e non era esercitabile da sola: l'unico modo di verificare che "navetta"
// finisse in `transfer` era montare la modale e digitare. È una regola di
// dominio dell'agenzia — dice come questa agenzia classifica il proprio lavoro
// — e ora ha un modulo suo e questi casi.
//
// ⚠️ I casi qui sotto non sono esempi: sono i punti in cui l'ordine
// dell'elenco DECIDE. Il primo match vince, quindi aggiungere una parola
// significa anche chiedersi quali altre voci potrebbe rubare, e la risposta si
// scrive qui.
import { describe, it, expect } from "vitest";
import { categoriaDaTitolo, CATEGORIE_PER_PAROLA } from "../lib/tasks/categoriaDaTitolo.js";

// Il caso «l'utente può usare tutto»: il gate del ruolo è provato a parte.
const TUTTE = Object.fromEntries(CATEGORIE_PER_PAROLA.map((c) => [c.cat, { label: c.cat }]));

describe("categoriaDaTitolo", () => {
  it("riconosce le categorie dai titoli che l'agenzia scrive davvero", () => {
    expect(categoriaDaTitolo("Volo Roma → Tokyo", TUTTE)).toBe("booking");
    expect(categoriaDaTitolo("Navetta aeroporto Fiumicino", TUTTE)).toBe("transfer");
    expect(categoriaDaTitolo("Preventivo hotel Bali", TUTTE)).toBe("itinerary");
    expect(categoriaDaTitolo("Saldo pratica Rossi", TUTTE)).toBe("payment");
    expect(categoriaDaTitolo("Riunione settimanale", TUTTE)).toBe("admin");
  });

  // ⚠️ Il caso per cui `visa` sta SOPRA `booking` nell'elenco. Senza
  // quell'ordine questo titolo finirebbe in `booking`, perché contiene "volo".
  it("l'ordine decide: una pratica di visti col volo dentro resta visa", () => {
    expect(categoriaDaTitolo("Documenti sanitari per il volo", TUTTE)).toBe("visa");
  });

  // Le parole sono PREFISSI (`includes`), e alcune portano uno spazio in coda
  // proprio per non pescare dentro parole che le contengono per caso.
  it("le parole sono prefissi, e lo spazio in coda è significativo", () => {
    expect(categoriaDaTitolo("Pagamenti fornitore giugno", TUTTE)).toBe("payment");
    expect(categoriaDaTitolo("Biglietteria gruppo scolastico", TUTTE)).toBe("booking");
    expect(categoriaDaTitolo("NCC per il cliente Bianchi", TUTTE)).toBe("transfer");
    // "tour " con lo spazio: "tour" da solo non basta, "tour operator" sì.
    expect(categoriaDaTitolo("Tour operator Giappone", TUTTE)).toBe("itinerary");
  });

  it("sotto i quattro caratteri non suggerisce niente: si sta ancora digitando", () => {
    expect(categoriaDaTitolo("vis", TUTTE)).toBeNull();
    expect(categoriaDaTitolo("", TUTTE)).toBeNull();
    expect(categoriaDaTitolo(null, TUTTE)).toBeNull();
  });

  it("un titolo che non dice niente non riceve un suggerimento inventato", () => {
    expect(categoriaDaTitolo("Chiedere conferma a Giulia", TUTTE)).toBeNull();
  });

  // Suggerire una categoria che poi il campo non offre sarebbe un
  // suggerimento che l'utente non può accettare.
  it("non suggerisce una categoria che il ruolo non può usare", () => {
    expect(categoriaDaTitolo("Volo Roma → Tokyo", { itinerary: {} })).toBeNull();
    expect(categoriaDaTitolo("Volo Roma → Tokyo", {})).toBeNull();
  });
});

describe("forma dell'elenco", () => {
  it("nessuna categoria compare due volte", () => {
    const cat = CATEGORIE_PER_PAROLA.map((c) => c.cat);
    expect(new Set(cat).size).toBe(cat.length);
  });

  // Una parola in due voci è una regola che dipende dall'ordine senza dirlo:
  // la seconda occorrenza è irraggiungibile e nessuno se ne accorge.
  it("nessuna parola compare in due categorie diverse", () => {
    const viste = new Map();
    const doppie = [];
    for (const { cat, words } of CATEGORIE_PER_PAROLA) {
      for (const w of words) {
        if (viste.has(w)) doppie.push(`"${w}": ${viste.get(w)} e ${cat}`);
        else viste.set(w, cat);
      }
    }
    expect(doppie).toEqual([]);
  });

  it("le categorie nominate esistono fra quelle del progetto", async () => {
    const { INITIAL_CATEGORIES } = await import("../state/taskCategories.js");
    for (const { cat } of CATEGORIE_PER_PAROLA) {
      expect(INITIAL_CATEGORIES[cat], `categoria "${cat}" sconosciuta`).toBeDefined();
    }
  });
});
