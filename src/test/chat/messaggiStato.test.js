// A-2 dell'analisi del 10 novembre — le trasformazioni pure della mappa dei
// messaggi: eventi riga per riga, fusione con il corpus, pagine di storia.
import { describe, it, expect } from "vitest";
import { applicaRighe, fondiCorpus, aggiungiPagina } from "../../components/chat/messaggiStato.js";

const m = (id, minuto, conv = "c1", extra = {}) => ({
  id, conversation_id: conv, time: new Date(Date.UTC(2026, 0, 1, 0, minuto)).toISOString(), ...extra,
});

describe("applicaRighe", () => {
  const base = { c1: [m("a", 1), m("b", 2)] };

  it("ins: aggiunge in coda, e in una conversazione mai vista", () => {
    const out = applicaRighe(base, [{ tipo: "ins", m: m("c", 3) }, { tipo: "ins", m: m("x", 1, "c2") }]);
    expect(out.c1.map(x => x.id)).toEqual(["a", "b", "c"]);
    expect(out.c2.map(x => x.id)).toEqual(["x"]);
    expect(base.c1).toHaveLength(2); // non muta l'ingresso
  });

  it("ins fuori ordine: la lista resta in ordine di tempo", () => {
    const out = applicaRighe(base, [{ tipo: "ins", m: m("z", 0) }]);
    expect(out.c1.map(x => x.id)).toEqual(["z", "a", "b"]);
  });

  it("ins di un id già presente: sostituisce, non duplica", () => {
    const out = applicaRighe(base, [{ tipo: "ins", m: m("a", 1, "c1", { text: "nuovo" }) }]);
    expect(out.c1).toHaveLength(2);
    expect(out.c1[0].text).toBe("nuovo");
  });

  it("upd: sostituisce se presente, ignora se assente", () => {
    const out = applicaRighe(base, [
      { tipo: "upd", m: m("b", 2, "c1", { pinned: true }) },
      { tipo: "upd", m: m("ignoto", 0) },
    ]);
    expect(out.c1.map(x => x.id)).toEqual(["a", "b"]);
    expect(out.c1[1].pinned).toBe(true);
  });

  it("del: toglie, anche senza conoscere la conversazione", () => {
    expect(applicaRighe(base, [{ tipo: "del", id: "a", convId: "c1" }]).c1.map(x => x.id)).toEqual(["b"]);
    expect(applicaRighe(base, [{ tipo: "del", id: "b", convId: null }]).c1.map(x => x.id)).toEqual(["a"]);
  });

  it("nessun cambiamento: torna la stessa mappa (nessun render)", () => {
    expect(applicaRighe(base, [{ tipo: "upd", m: m("ignoto", 0) }, { tipo: "del", id: "nessuno", convId: "c1" }])).toBe(base);
  });
});

describe("fondiCorpus", () => {
  it("corpus intero: il server è tutta la verità (un messaggio cancellato sparisce)", () => {
    const prima = { c1: [m("a", 1), m("b", 2)] };
    const server = { c1: [m("b", 2)] };
    expect(fondiCorpus(prima, server, { troncato: false })).toBe(server);
  });

  it("corpus troncato: restano i messaggi più vecchi della soglia, senza doppioni", () => {
    const prima = { c1: [m("vecchio", 1), m("b", 10)], c2: [m("solo-vecchio", 2)] };
    const server = { c1: [m("b", 10), m("c", 11)], c3: [m("d", 12)] };
    const out = fondiCorpus(prima, server, { troncato: true });
    expect(out.c1.map(x => x.id)).toEqual(["vecchio", "b", "c"]);
    expect(out.c2.map(x => x.id)).toEqual(["solo-vecchio"]);
    expect(out.c3.map(x => x.id)).toEqual(["d"]);
  });

  it("corpus troncato: un messaggio dentro la finestra del server ma assente è stato cancellato", () => {
    const prima = { c1: [m("a", 10), m("cancellato", 11), m("c", 12)] };
    const server = { c1: [m("a", 10), m("c", 12)] };
    expect(fondiCorpus(prima, server, { troncato: true }).c1.map(x => x.id)).toEqual(["a", "c"]);
  });
});

describe("aggiungiPagina", () => {
  it("mette la pagina in testa e conta solo i nuovi", () => {
    const mappa = { c1: [m("c", 3)] };
    const { mappa: out, nuovi } = aggiungiPagina(mappa, "c1", [m("a", 1), m("b", 2), m("c", 3)]);
    expect(out.c1.map(x => x.id)).toEqual(["a", "b", "c"]);
    expect(nuovi).toBe(2);
  });

  it("nessun nuovo: stessa mappa, zero", () => {
    const mappa = { c1: [m("c", 3)] };
    expect(aggiungiPagina(mappa, "c1", [m("c", 3)])).toEqual({ mappa, nuovi: 0 });
  });
});
