// A-1 dell'audit del 2 settembre. Il preambolo di state/persistence.js dice
// che una mutazione ottimistica senza compensazione lascia la UI divergente
// dal database — e nulla la riporta indietro, perché una scrittura RESPINTA
// non emette alcun evento realtime. Questo test rende quella frase misurabile
// invece che affidata a chi legge il file per intero: era il modo in cui
// ADD_NOTICE e ADD_COMMENT sono restate le due sole mutazioni ottimistiche
// senza rollback per tre settimane senza che nulla lo segnalasse.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks: { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments: { create: vi.fn(ok) },
    Notices: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users: { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients: { create: vi.fn(ok), createMany: vi.fn(() => Promise.resolve({ error: null, scritti: 0 })), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    MessageTemplates: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../../state/persistence.js");

// L'elenco delle eccezioni è ESPLICITO e non uno `skip`: chi ne aggiunge una
// deve scrivere qui accanto perché quella mutazione può permettersi di non
// tornare indietro. Le sei di oggi sono tabelle di configurazione, scritte
// dai soli admin dal pannello e senza refetch concorrente — le loro
// sottoscrizioni sono `senzaCanale` (B-3 dell'audit del 2 settembre, che
// propone di dichiararle qui invece di aggiungere cinque compensazioni a
// basso impatto).
const SENZA_COMPENSAZIONE = new Set([
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "ADD_MESSAGE_TEMPLATE", "UPDATE_MESSAGE_TEMPLATE", "DELETE_MESSAGE_TEMPLATE",
]);

describe("persistence — contratto del rollback", () => {
  it("ogni entry che scrive ha una compensazione, o è dichiarata fra le eccezioni", () => {
    const senza = Object.entries(PERSISTENCE)
      .filter(([tipo, spec]) => spec.persist && !spec.rollback && !SENZA_COMPENSAZIONE.has(tipo))
      .map(([tipo]) => tipo);
    expect(senza).toEqual([]);
  });

  it("l'elenco delle eccezioni non contiene azioni che un rollback ce l'hanno già", () => {
    // Il controllo opposto: un'entry rimossa dall'eccezione senza toglierla
    // da qui sopra la nasconderebbe di nuovo, stavolta come falso negativo.
    const superflue = [...SENZA_COMPENSAZIONE].filter(tipo => PERSISTENCE[tipo]?.rollback);
    expect(superflue).toEqual([]);
  });
});
