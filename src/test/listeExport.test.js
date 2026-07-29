// Documenti del modulo Liste viaggio.
//
// La regola che questi test difendono davvero è la separazione fra i due
// documenti: la copia agente è interna e porta metodi di pagamento e storico,
// il riepilogo si consegna al cliente e non deve contenere né gli uni né
// l'altro. È una distinzione di riservatezza, non di stile: se il porting la
// perdesse, il cliente si vedrebbe consegnare il registro interno.
import { describe, it, expect, vi } from "vitest";

// listeExport importa listeApi, che senza VITE_SUPABASE_URL non costruisce il
// client. Qui servono solo funzioni pure: stessa strategia degli altri test.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

const {
  BACKUP_APP, buildBackup, docHtml, esc, leggiBackup, nomeFileDoc,
  riepilogoTesto, saldoOf,
} = await import("../lib/listeExport.js");

const LISTA = {
  id: "l1",
  titolo: "Buono viaggio 2026",
  stato: "attiva",
  clients: { name: "ROSSI MARIO" },
};

// Le descrizioni non nominano di proposito alcun metodo di pagamento: così
// l'assenza di "bonifico"/"POS" nel riepilogo prova davvero che è escluso il
// CAMPO metodo, e non è un artefatto del testo libero.
const MOVS = [
  { id: "m1", data_movimento: "2026-07-01", descrizione: "VERSAMENTO DA ROSSI", importo: 500, metodo: "bonifico" },
  { id: "m2", data_movimento: "2026-07-20", descrizione: "HOTEL CASA MORGANO", importo: -180.5, metodo: "pos" },
];

describe("esc", () => {
  it("scappa i caratteri che romperebbero il documento", () => {
    // I nomi con "&" sono frequenti in anagrafica ("ROSSI & FIGLI").
    expect(esc('ROSSI & <b>"FIGLI"</b>')).toBe("ROSSI &amp; &lt;b&gt;&quot;FIGLI&quot;&lt;/b&gt;");
  });

  it("rende stringa vuota null e undefined", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("saldoOf", () => {
  it("somma gli importi con il loro segno", () => {
    expect(saldoOf(MOVS)).toBeCloseTo(319.5, 2);
  });

  it("regge la lista senza movimenti", () => {
    expect(saldoOf([])).toBe(0);
    expect(saldoOf(null)).toBe(0);
  });
});

describe("nomeFileDoc", () => {
  it("usa il nome cliente con gli spazi in underscore", () => {
    expect(nomeFileDoc(LISTA)).toBe("LISTA_ROSSI_MARIO.doc");
    expect(nomeFileDoc(LISTA, "_COPIA_AGENTE")).toBe("LISTA_ROSSI_MARIO_COPIA_AGENTE.doc");
  });

  it("neutralizza i caratteri di percorso nel nome cliente", () => {
    // "ROSSI E/O BIANCHI" con lo slash troncherebbe il nome del file scaricato.
    const l = { clients: { name: "ROSSI E/O BIANCHI" } };
    expect(nomeFileDoc(l)).toBe("LISTA_ROSSI_E-O_BIANCHI.doc");
  });

  it("ha un ripiego quando la lista non ha cliente", () => {
    expect(nomeFileDoc({})).toBe("LISTA_CLIENTE.doc");
  });
});

describe("docHtml — copia agente (uso interno)", () => {
  it("porta i metodi di pagamento", () => {
    const html = docHtml(LISTA, MOVS);
    expect(html).toContain("BONIFICO");
    expect(html).toContain("POS");
  });

  it("si dichiara copia interna", () => {
    expect(docHtml(LISTA, MOVS)).toContain("COPIA AGENTE — USO INTERNO");
  });

  it("riporta il saldo e le descrizioni dei movimenti", () => {
    const html = docHtml(LISTA, MOVS);
    expect(html).toContain("HOTEL CASA MORGANO");
    expect(html).toMatch(/SALDO:.*319,50/);
  });

  it("include lo storico solo quando gli viene passato", () => {
    const storico = [{
      id: "h1", actor_id: "u1", action: "movimento_aggiunto",
      created_at: "2026-07-01T10:00:00Z", old_value: null, new_value: "500",
    }];
    const con = docHtml(LISTA, MOVS, storico, { u1: "Giulia Neri" });
    expect(con).toContain("Storico modifiche");
    expect(con).toContain("Giulia Neri");

    // L'export massivo non carica lo storico: la sezione non deve comparire
    // vuota né rompere il documento.
    const senza = docHtml(LISTA, MOVS);
    expect(senza).not.toContain("Storico modifiche");
  });

  it("scappa una descrizione ostile invece di iniettarla nel documento", () => {
    const movs = [{ ...MOVS[0], descrizione: '<script>alert(1)</script>' }];
    const html = docHtml(LISTA, movs);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("segnala le liste esaurite", () => {
    expect(docHtml({ ...LISTA, stato: "esaurita" }, MOVS)).toContain("LISTA ESAURITA");
    expect(docHtml(LISTA, MOVS)).not.toContain("LISTA ESAURITA");
  });
});

describe("riepilogoTesto — copia per il cliente", () => {
  it("NON contiene i metodi di pagamento", () => {
    // È la differenza sostanziale con la copia agente: il metodo con cui
    // l'agenzia ha incassato è un dato interno.
    const testo = riepilogoTesto(LISTA, MOVS);
    expect(testo).not.toMatch(/bonifico/i);
    expect(testo).not.toMatch(/\bPOS\b/);
  });

  it("conserva invece il metodo scritto a mano dentro la descrizione", () => {
    // Gli agenti scrivono spesso "POS" o "CASH" dentro la descrizione: è testo
    // libero della riga, non il campo Metodo, e va consegnato al cliente com'è.
    // Senza questa distinzione si finirebbe per censurare le descrizioni.
    const movs = [{ ...MOVS[0], descrizione: "SALDO POS DEL 12/07", metodo: "bonifico" }];
    const testo = riepilogoTesto(LISTA, movs);
    expect(testo).toContain("SALDO POS DEL 12/07");
    expect(testo).not.toMatch(/bonifico/i);
  });

  it("NON si dichiara copia interna né riporta lo storico", () => {
    const testo = riepilogoTesto(LISTA, MOVS);
    expect(testo).not.toContain("COPIA AGENTE");
    expect(testo).not.toContain("Storico");
  });

  it("riporta cliente, titolo, movimenti e saldo", () => {
    const testo = riepilogoTesto(LISTA, MOVS);
    expect(testo).toContain("ROSSI MARIO");
    expect(testo).toContain("Buono viaggio 2026");
    expect(testo).toContain("HOTEL CASA MORGANO");
    expect(testo).toMatch(/SALDO:.*319,50/);
  });

  it("lo dice quando non c'è nulla da riepilogare", () => {
    expect(riepilogoTesto(LISTA, [])).toContain("Nessun movimento registrato.");
  });

  it("segnala le liste esaurite", () => {
    expect(riepilogoTesto({ ...LISTA, stato: "esaurita" }, MOVS)).toContain("LISTA ESAURITA");
  });
});

describe("buildBackup / leggiBackup", () => {
  it("il backup si dichiara con app e versione", () => {
    const b = buildBackup([{ id: "c1" }], [LISTA], MOVS);
    expect(b.app).toBe(BACKUP_APP);
    expect(b.versione).toBe(1);
    expect(b.liste).toHaveLength(1);
    expect(b.movimenti).toHaveLength(2);
  });

  it("un backup appena costruito si rilegge senza sospetti", () => {
    const b = buildBackup([{ id: "c1" }], [LISTA], MOVS);
    const esito = leggiBackup(JSON.stringify(b));
    expect(esito.ok).toBe(true);
    expect(esito.sospetto).toBe(false);
    expect(esito.payload.liste).toHaveLength(1);
  });

  it("rifiuta un file che non è JSON", () => {
    const esito = leggiBackup("questo non e' json");
    expect(esito.ok).toBe(false);
    expect(esito.errore).toMatch(/JSON/);
  });

  it("segnala come sospetto un JSON estraneo, senza rifiutarlo", () => {
    // Non lo blocca: l'interfaccia chiede conferma esplicita, perché un backup
    // di una versione futura resta comunque caricabile.
    const esito = leggiBackup(JSON.stringify({ app: "altra-app", liste: [] }));
    expect(esito.ok).toBe(true);
    expect(esito.sospetto).toBe(true);
  });

  it("normalizza i campi mancanti ad array vuoti", () => {
    const esito = leggiBackup(JSON.stringify({ app: BACKUP_APP }));
    expect(esito.payload).toEqual({ clients: [], liste: [], movimenti: [] });
    expect(esito.sospetto).toBe(true); // manca l'elenco liste
  });
});
