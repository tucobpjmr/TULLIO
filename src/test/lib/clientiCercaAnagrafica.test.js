// src/test/lib/clientiCercaAnagrafica.test.js
// A-1 (audit del 30 agosto) — Clients.cercaAnagrafica(), il lato JS della RPC
// `cerca_clienti` (supabase/migrations/20260830190000_clienti_ricerca_trgm.sql).
//
// Il client Supabase è mockato: qui si verifica solo la parte che questo
// modulo possiede — normalizzazione della query in termini, invocazione della
// RPC con gli argomenti giusti, ed estrazione di count/errore dal risultato —
// non il comportamento SQL, verificato a mano sul progetto di staging prima
// di scrivere la migrazione (vedi il preambolo del file SQL).
import { describe, it, expect, vi } from "vitest";

const rpcMock = vi.fn();
vi.mock("../../lib/supabase", () => {
  const supabase = { rpc: rpcMock };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { Clients } = await import("../../lib/api.js");

describe("Clients.cercaAnagrafica", () => {
  it("query vuota: non chiama la RPC, ritorna un elenco vuoto", async () => {
    const r = await Clients.cercaAnagrafica("   ");
    expect(rpcMock).not.toHaveBeenCalled();
    expect(r).toEqual({ data: [], count: 0, error: null });
  });

  it("normalizza la query come searchUtils prima di passarla alla RPC", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await Clients.cercaAnagrafica("D'Amato Mario", { limite: 10 });
    // Stessa normalizzazione di normalizzaTesto/chiaveCliente: minuscolo,
    // accenti e punteggiatura tolti, split sui termini — è quella che rende
    // i termini comparabili con le colonne generate `testo_ricerca*`.
    expect(rpcMock).toHaveBeenCalledWith("cerca_clienti", {
      termini: ["d", "amato", "mario"],
      limite: 10,
    });
  });

  it("usa il limite di default (200) quando non specificato", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await Clients.cercaAnagrafica("rossi");
    expect(rpcMock).toHaveBeenCalledWith("cerca_clienti", { termini: ["rossi"], limite: 200 });
  });

  it("estrae il conteggio totale dalla prima riga e lo toglie dai risultati", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { id: "a", name: "Rossi Mario", totale: 42 },
        { id: "b", name: "Rossi Anna", totale: 42 },
      ],
      error: null,
    });
    const r = await Clients.cercaAnagrafica("rossi");
    expect(r.count).toBe(42);
    expect(r.data).toEqual([{ id: "a", name: "Rossi Mario" }, { id: "b", name: "Rossi Anna" }]);
    expect(r.error).toBeNull();
  });

  it("nessun match: count 0, nessun errore", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const r = await Clients.cercaAnagrafica("zzzznonesiste");
    expect(r).toEqual({ data: [], count: 0, error: null });
  });

  it("un errore della RPC si propaga senza dati residui", async () => {
    const errore = new Error("rete");
    rpcMock.mockResolvedValue({ data: null, error: errore });
    const r = await Clients.cercaAnagrafica("rossi");
    expect(r).toEqual({ data: [], count: 0, error: errore });
  });
});
