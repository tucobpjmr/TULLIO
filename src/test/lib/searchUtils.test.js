// Ricerca testuale condivisa fra anagrafica clienti ed elenco liste viaggio.
//
// I casi qui sotto non sono inventati: sono nomi reali dell'anagrafica, che è
// la fusione di due popolazioni con convenzioni diverse (schede del
// gestionale e intestatari dei buoni viaggio ricavati dai documenti Word).
// La sottostringa secca non li copriva, e il sintomo era il peggiore
// possibile: la ricerca non dava errore, dava zero risultati.
import { describe, it, expect } from "vitest";
import {
  indicizza, matchIndice, matchTermini, normalizzaTesto, terminiRicerca,
} from "../../lib/searchUtils.js";

const trova = (q, ...campi) => matchTermini(terminiRicerca(q), ...campi);

describe("normalizzaTesto", () => {
  it("abbassa, toglie accenti e riduce la punteggiatura a spazi", () => {
    expect(normalizzaTesto("D'AMATO PATRIZIA")).toBe("d amato patrizia");
    expect(normalizzaTesto("FAM. SCURO TEODORO")).toBe("fam scuro teodoro");
    expect(normalizzaTesto("50° RICCARDO SCAMARCIO")).toBe("50 riccardo scamarcio");
    expect(normalizzaTesto("NICOLÒ  DALÌ")).toBe("nicolo dali");
    expect(normalizzaTesto("  DICENSI-BALSAMO ")).toBe("dicensi balsamo");
  });

  it("regge null/undefined e stringhe di sola punteggiatura", () => {
    expect(normalizzaTesto(null)).toBe("");
    expect(normalizzaTesto(undefined)).toBe("");
    expect(normalizzaTesto(" -- ")).toBe("");
  });
});

describe("terminiRicerca", () => {
  it("spezza la query nei suoi termini", () => {
    expect(terminiRicerca("COLUCCI GIA")).toEqual(["colucci", "gia"]);
  });

  it("una query vuota (o di sola punteggiatura) non filtra nulla", () => {
    expect(terminiRicerca("")).toEqual([]);
    expect(terminiRicerca("   ")).toEqual([]);
    expect(matchTermini(terminiRicerca(""), "QUALSIASI")).toBe(true);
  });
});

describe("matchTermini", () => {
  it("trova il prefisso digitato dall'utente (caso COLUCCI GIANNICOLA)", () => {
    expect(trova("COLUCCI GIA", "COLUCCI GIANNICOLA")).toBe(true);
    expect(trova("colucci gia", "COLUCCI GIANNICOLA")).toBe(true);
  });

  it("ignora l'ordine delle parole: l'anagrafica non ha una convenzione unica", () => {
    // Convivono "COLUCCI GIANNICOLA" (cognome nome) e "ELENA GIANCIPPOLI"
    // (nome cognome): chi cerca deve poter digitare l'ordine che ha in testa.
    expect(trova("GIA COLUCCI", "COLUCCI GIANNICOLA")).toBe(true);
    expect(trova("GIANCIPPOLI ELENA", "ELENA GIANCIPPOLI 40°")).toBe(true);
  });

  it("ignora accenti e apostrofi, compreso l'apice tipografico da tastiera mobile", () => {
    expect(trova("d amato patrizia", "D'AMATO PATRIZIA")).toBe(true);
    expect(trova("d’amato", "D'AMATO PATRIZIA")).toBe(true);
    expect(trova("dellacqua", "DELL'ACQUA CARLO")).toBe(true);
    expect(trova("nicolo", "NICOLÒ ROSSI")).toBe(true);
  });

  it("i termini possono distribuirsi su campi diversi", () => {
    expect(trova("colucci massafra", "COLUCCI ANGELA", "MASSAFRA")).toBe(true);
  });

  it("accetta array di campi (i cointestatari di una lista)", () => {
    expect(trova("bianchi", "MARIO ROSSI", null, ["MARIA BIANCHI"])).toBe(true);
  });

  it("richiede TUTTI i termini: non allarga a chi ne soddisfa solo uno", () => {
    expect(trova("COLUCCI GIA", "COLUCCI ANGELA")).toBe(false);
    expect(trova("COLUCCI GIA", "GIANCIPPOLI ELENA")).toBe(false);
  });

  it("il confronto senza spazi è tollerante per scelta, non per caso", () => {
    // Il confronto avviene anche sul testo con gli spazi rimossi: è ciò che
    // fa trovare "dellacqua" → "DELL'ACQUA". Il prezzo è che un termine può
    // accavallarsi su due parole ("rossimaria" trova "ROSSI MARIA"): è un
    // falso positivo innocuo — chi digita così sta comunque cercando quella
    // scheda — e vale il caso frequente dei cognomi elisi.
    expect(trova("rossimaria", "ROSSI MARIA")).toBe(true);
    // Le parole devono però esserci tutte: non basta un pezzo qualsiasi.
    expect(trova("rossiluigi", "ROSSI MARIA")).toBe(false);
  });

  it("un record senza nessun campo utile non si trova", () => {
    expect(trova("rossi", null, "", undefined)).toBe(false);
  });
});

// ─── M-3 · l'indice precalcolato ───────────────────────────────────────────
// La normalizzazione dipende dalla RIGA e non dalla query, quindi si calcola
// quando cambiano i dati e non a ogni battuta (6,32 ms → 0,19 ms per battuta
// su 835 clienti). Il rischio della correzione è uno solo, ed è ciò che questi
// test guardano: che l'indice abbia cambiato le REGOLE senza dirlo. Le
// asserzioni sopra restano quindi la definizione della semantica, e queste
// verificano che le due strade portino sempre alla stessa risposta.
describe("indicizza / matchIndice", () => {
  const CASI = [
    ["COLUCCI GIA", ["COLUCCI GIANNICOLA"]],
    ["GIA COLUCCI", ["COLUCCI GIANNICOLA"]],
    ["d’amato", ["D'AMATO PATRIZIA"]],
    ["dellacqua", ["DELL'ACQUA CARLO"]],
    ["colucci massafra", ["COLUCCI ANGELA", "MASSAFRA"]],
    ["bianchi", ["MARIO ROSSI", null, ["MARIA BIANCHI"]]],
    ["COLUCCI GIA", ["COLUCCI ANGELA"]],
    ["rossiluigi", ["ROSSI MARIA"]],
    ["rossi", [null, "", undefined]],
    ["", ["QUALSIASI"]],
  ];

  it("dà sempre la stessa risposta di matchTermini", () => {
    for (const [query, campi] of CASI) {
      const termini = terminiRicerca(query);
      expect([query, matchIndice(termini, indicizza(...campi))])
        .toEqual([query, matchTermini(termini, ...campi)]);
    }
  });

  it("l'indice porta con sé anche la variante senza spazi", () => {
    // È il pezzo che rende `matchIndice` un confronto e non una seconda
    // normalizzazione: se `attaccato` non fosse precalcolato, il `replace`
    // tornerebbe a girare per riga per battuta.
    expect(indicizza("DELL'ACQUA CARLO")).toEqual({
      testo: "dell acqua carlo", attaccato: "dellacquacarlo",
    });
  });

  it("una riga senza campi utili produce un indice vuoto, che non si trova", () => {
    const idx = indicizza(null, "", undefined);
    expect(idx.testo).toBe("");
    expect(matchIndice(terminiRicerca("rossi"), idx)).toBe(false);
    // …ma una query vuota non filtra nulla, nemmeno quella riga.
    expect(matchIndice(terminiRicerca(""), idx)).toBe(true);
  });
});
