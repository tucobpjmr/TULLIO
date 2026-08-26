// La chiave d'identità di un cliente — M-4 dell'audit del 25 agosto.
//
// Prima esisteva in quattro copie (`chiaveNome` in clientNotes.js, `normName`
// in ClientImportModal, `chiaveCliente` nello script di import, e
// `normalizzaTesto` in searchUtils per la ricerca) che si DICHIARAVANO gemelle
// e non lo erano: la punteggiatura le divideva in due famiglie. Qui si fissano
// sia la regola sia il fatto che sia una sola — inclusa la convergenza con la
// normalizzazione della ricerca, che ora deriva da questa funzione invece di
// riscriverla.
import { describe, it, expect } from "vitest";
import { chiaveCliente, tasksDelCliente } from "../../lib/chiaveCliente.js";
import { normalizzaTesto } from "../../lib/searchUtils.js";
import { chiaveCliente as chiaveDelloScript } from "../../../scripts/importa-liste/parser.js";

describe("chiaveCliente", () => {
  it("ignora maiuscole, accenti e spazi doppi", () => {
    expect(chiaveCliente("Rossi  Mario")).toBe(chiaveCliente("ROSSI MARIO"));
    expect(chiaveCliente("Nicolò Perù")).toBe("NICOLO PERU");
  });

  // La divergenza che M-4 chiude: lo script di import toglieva la
  // punteggiatura, l'app no. Sull'anagrafica reale — apostrofi, abbreviazioni
  // con punto, gradi — significava che i due lati dello stesso import non
  // erano d'accordo su chi fosse chi.
  it("ignora la punteggiatura: apostrofi, punti, virgole, gradi", () => {
    expect(chiaveCliente("D'AMATO PATRIZIA")).toBe(chiaveCliente("D AMATO PATRIZIA"));
    expect(chiaveCliente("DELL’ACQUA CARLO")).toBe(chiaveCliente("DELL'ACQUA CARLO"));
    expect(chiaveCliente("FAM. SCURO TEODORO")).toBe(chiaveCliente("FAM SCURO TEODORO"));
    expect(chiaveCliente("Rossi, Mario")).toBe(chiaveCliente("ROSSI  MARIO"));
    expect(chiaveCliente("50° RICCARDO SCAMARCIO")).toBe("50 RICCARDO SCAMARCIO");
  });

  // Fondere "ROSSI MARIO" e "MARIO ROSSI" d'ufficio unirebbe le liste di due
  // persone diverse in caso di omonimia parziale. È l'UNICO asse su cui
  // identità e ricerca differiscono, ed è voluto.
  it("non riordina le parole", () => {
    expect(chiaveCliente("ROSSI MARIO")).not.toBe(chiaveCliente("MARIO ROSSI"));
  });

  it("un nome vuoto non identifica nessuno", () => {
    expect(chiaveCliente(null)).toBe("");
    expect(chiaveCliente(undefined)).toBe("");
    expect(chiaveCliente("  --  ")).toBe("");
  });
});

describe("una sola implementazione", () => {
  // Lo script di import fa combaciare i clienti dei documenti con quelli del
  // backup dell'app: due definizioni diverse ai due lati significano id
  // riusati per clienti che l'app non collegherà mai.
  it("lo script di import usa la stessa chiave dell'app", () => {
    for (const nome of ["FAM. SCURO TEODORO", "D'AMATO PATRIZIA", "Nicolò Perù", "Rossi, Mario"]) {
      expect(chiaveDelloScript(nome)).toBe(chiaveCliente(nome));
    }
  });

  // La ricerca è la stessa normalizzazione in minuscolo: la tolleranza
  // sull'ordine delle parole è uno strato SOPRA (terminiRicerca/matchIndice),
  // non una seconda definizione di cosa si ignora.
  it("la ricerca è la chiave d'identità in minuscolo", () => {
    for (const nome of ["D'AMATO PATRIZIA", "FAM. SCURO TEODORO", "50° RICCARDO SCAMARCIO", "NICOLÒ  DALÌ"]) {
      expect(normalizzaTesto(nome)).toBe(chiaveCliente(nome).toLowerCase());
    }
  });
});

describe("tasksDelCliente", () => {
  it("collega i task per nome esatto, non per sottostringa", () => {
    const tasks = [
      { id: "t1", client: "rossi mario" },
      { id: "t2", client: "ROSSI MARIO E FIGLI" },
      { id: "t3", client: null },
    ];
    expect(tasksDelCliente(tasks, "ROSSI MARIO").map(t => t.id)).toEqual(["t1"]);
    expect(tasksDelCliente(tasks, "")).toEqual([]);
  });

  it("la punteggiatura non spezza il legame task ↔ cliente", () => {
    const tasks = [{ id: "t1", client: "FAM. SCURO TEODORO" }];
    expect(tasksDelCliente(tasks, "FAM SCURO TEODORO").map(t => t.id)).toEqual(["t1"]);
  });
});
