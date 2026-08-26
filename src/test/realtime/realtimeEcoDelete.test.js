// src/test/realtimeEcoDelete.test.js
// Il filtro anti-eco di subscribeToTable, guidato sul codice VERO e non su un
// mock dell'hook: tutti gli altri test del realtime (clientiRealtime,
// realtimeGranularita, useListeData, listeReload) mockano `subscribeToTable`
// per pilotare gli handler, quindi la sua logica di filtro non era coperta da
// nessuno.
//
// Il caso che questi test blindano è quello dei DELETE. `.delete()` di
// supabase-js non accetta un payload, quindi una cancellazione non può
// trasportare l'origine di CHI cancella: `payload.old.origin_client` — leggibile
// solo dove la tabella è a REPLICA IDENTITY FULL — è l'origine dell'ULTIMA
// SCRITTURA della riga. Leggerla invertiva il senso del filtro proprio per
// l'utente più coinvolto: chi aveva modificato la riga per ultimo scartava la
// cancellazione altrui e se la teneva in lista fino al reload successivo.
import { describe, it, expect, vi, beforeEach } from "vitest";

const MIO = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ALTRUI = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

vi.mock("../../lib/clientId.js", () => ({ getClientId: () => MIO }));

// Canale finto: cattura l'handler passato a .on() così i test possono
// consegnargli i payload che vogliono, come farebbe il server.
let handlerRegistrato = null;
const removeChannel = vi.fn();

vi.mock("../../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch = {
        on: vi.fn((_evento, _filtro, cb) => { handlerRegistrato = cb; return ch; }),
        subscribe: vi.fn(() => ch),
      };
      return ch;
    }),
    removeChannel: (...a) => removeChannel(...a),
  },
}));

const { subscribeToTable } = await import("../../lib/api.js");

describe("subscribeToTable — filtro dell'eco della propria scrittura", () => {
  let ricevuti;

  beforeEach(() => {
    handlerRegistrato = null;
    ricevuti = [];
    subscribeToTable("tasks", (p) => ricevuti.push(p));
  });

  it("scarta l'eco di una INSERT nostra (l'UI è già aggiornata in ottimistico)", () => {
    handlerRegistrato({ eventType: "INSERT", new: { id: "t1", origin_client: MIO } });
    expect(ricevuti).toHaveLength(0);
  });

  it("consegna una INSERT altrui", () => {
    handlerRegistrato({ eventType: "INSERT", new: { id: "t1", origin_client: ALTRUI } });
    expect(ricevuti).toHaveLength(1);
  });

  it("scarta l'eco di una UPDATE nostra", () => {
    handlerRegistrato({ eventType: "UPDATE", new: { id: "t1", origin_client: MIO } });
    expect(ricevuti).toHaveLength(0);
  });

  it("consegna una UPDATE su una tabella senza la colonna (origine assente)", () => {
    handlerRegistrato({ eventType: "UPDATE", new: { id: "l1" } });
    expect(ricevuti).toHaveLength(1);
  });

  // ── Il caso della regressione ──────────────────────────────────────────────
  it("consegna un DELETE altrui anche quando l'ULTIMA scrittura era nostra", () => {
    // Scenario reale: A modifica il task (origin = A), B lo purga dal cestino.
    // Con REPLICA IDENTITY FULL payload.old porta ancora l'origine di A: prima
    // A scartava la cancellazione e si teneva in lista un task inesistente.
    handlerRegistrato({ eventType: "DELETE", old: { id: "t1", origin_client: MIO } });
    expect(ricevuti).toHaveLength(1);
    expect(ricevuti[0].old.id).toBe("t1");
  });

  it("consegna un DELETE anche quando l'origine è di un altro client", () => {
    handlerRegistrato({ eventType: "DELETE", old: { id: "t1", origin_client: ALTRUI } });
    expect(ricevuti).toHaveLength(1);
  });

  it("consegna un DELETE su tabella a replica identity default (old = sola PK)", () => {
    handlerRegistrato({ eventType: "DELETE", old: { id: "c1" } });
    expect(ricevuti).toHaveLength(1);
  });

  it("l'unsubscribe rimuove il canale", () => {
    const unsub = subscribeToTable("clients", () => {});
    unsub();
    expect(removeChannel).toHaveBeenCalled();
  });
});
