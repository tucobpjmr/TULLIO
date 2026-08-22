// src/test/verificaVolumi.test.js
//
// M-2 dell'audit del 23 agosto. La metà pura di `verifica:volumi`.
//
// Il controllo esiste perché una soglia scritta in un documento non è un
// controllo; questo test esiste perché un controllo che non si sa rompere non
// è un controllo. Ogni caso ha il proprio gemello in positivo: «zero soglie
// superate» e «zero soglie guardate» sono la stessa cifra e due affermazioni
// diverse — è il difetto che l'audit del 23 agosto ha trovato in tre punti.
import { describe, it, expect } from "vitest";
import { SOGLIE, estraiConteggi, valutaVolumi } from "../../scripts/verifica-volumi/volumi.js";

const soglie = [
  { tabella: "messages", max: 1500, perche: "p", rimedio: "r" },
  { tabella: "clients", max: 3000, perche: "p", rimedio: "r" },
];

describe("valutaVolumi", () => {
  it("non fallisce quando tutte le tabelle sono sotto soglia", () => {
    const e = valutaVolumi({ messages: 13, clients: 879 }, soglie);
    expect(e.fallisce).toBe(false);
    expect(e.superate).toHaveLength(0);
    // Il controllo positivo: se `ok` fosse vuoto, «nessuna superata» sarebbe
    // vero anche per un controllo che non ha guardato niente.
    expect(e.ok).toHaveLength(2);
  });

  it("fallisce, e nomina la tabella e il rimedio, quando una soglia è superata", () => {
    const e = valutaVolumi({ messages: 1501, clients: 879 }, soglie);
    expect(e.fallisce).toBe(true);
    expect(e.superate.map((v) => v.tabella)).toEqual(["messages"]);
    expect(e.superate[0].rimedio).toBeTruthy();
    expect(e.ok.map((v) => v.tabella)).toEqual(["clients"]);
  });

  it("il confine è stretto: esattamente alla soglia NON fallisce", () => {
    expect(valutaVolumi({ messages: 1500, clients: 0 }, soglie).fallisce).toBe(false);
    expect(valutaVolumi({ messages: 1501, clients: 0 }, soglie).fallisce).toBe(true);
  });

  it("una tabella non misurata non vale zero: finisce fra le mancanti", () => {
    // È il caso che rende inutile il controllo se trattato male: con
    // `conteggi.messages === undefined` un `> max` sarebbe false, e la tabella
    // che ha smesso di essere misurata risulterebbe la più tranquilla di tutte.
    const e = valutaVolumi({ clients: 879 }, soglie);
    expect(e.mancanti).toEqual(["messages"]);
    expect(e.superate).toHaveLength(0);
    expect(e.ok.map((v) => v.tabella)).toEqual(["clients"]);
  });

  it("NaN è una misura mancata, non un numero", () => {
    expect(valutaVolumi({ messages: NaN, clients: 1 }, soglie).mancanti).toEqual(["messages"]);
  });

  it("riporta la percentuale, che è ciò che rende leggibile un preavviso", () => {
    const e = valutaVolumi({ messages: 1350, clients: 1 }, soglie);
    expect(e.ok.find((v) => v.tabella === "messages").percentuale).toBe(90);
  });
});

describe("SOGLIE — l'elenco reale", () => {
  it("ogni soglia dichiara perché esiste e come si chiude", () => {
    // Senza rimedio una soglia superata è un allarme senza istruzioni, e chi
    // lo legge fra sei mesi non avrà letto l'audit che l'ha generata.
    for (const s of SOGLIE) {
      expect(s.tabella).toBeTruthy();
      expect(s.max).toBeGreaterThan(0);
      expect(s.perche.length).toBeGreaterThan(20);
      expect(s.rimedio.length).toBeGreaterThan(20);
    }
  });

  it("copre `messages`, che è la soglia da cui nasce il controllo (ST-4 passo 2)", () => {
    const m = SOGLIE.find((s) => s.tabella === "messages");
    expect(m).toBeDefined();
    expect(m.max).toBe(1500);
  });

  it("nessuna tabella compare due volte", () => {
    const nomi = SOGLIE.map((s) => s.tabella);
    expect(new Set(nomi).size).toBe(nomi.length);
  });
});

describe("estraiConteggi — la forma della risposta non è un contratto nostro", () => {
  it("legge un array di righe, che è la forma attesa", () => {
    expect(estraiConteggi([{ tabella: "messages", righe: 13 }])).toEqual({ messages: 13 });
  });

  it("legge anche { data: [...] }, l'altra forma nota", () => {
    expect(estraiConteggi({ data: [{ tabella: "clients", righe: 879 }] })).toEqual({ clients: 879 });
  });

  it("un bigint serializzato come stringa resta un numero", () => {
    // Il tipo della colonna non è un alias che scegliamo noi: count(*)::bigint
    // può arrivare come "6115" a seconda di come l'API serializza.
    expect(estraiConteggi([{ tabella: "movimenti_lista", righe: "6115" }]))
      .toEqual({ movimenti_lista: 6115 });
  });

  it("ritorna null su una forma non riconosciuta, non un oggetto vuoto", () => {
    // È la distinzione che tiene onesto il controllo: {} passerebbe da
    // valutaVolumi come «nessuna soglia superata», cioè verde, quando in
    // realtà non si è letto niente. null è inconcludenza.
    expect(estraiConteggi({ risultato: "boh" })).toBeNull();
    expect(estraiConteggi(null)).toBeNull();
    expect(estraiConteggi("stringa")).toBeNull();
  });

  it("una riga malformata viene saltata, non fa cadere l'intera lettura", () => {
    const c = estraiConteggi([
      { tabella: "messages", righe: 13 },
      { qualcosa: "altro" },
      null,
      { tabella: "clients", righe: 879 },
    ]);
    expect(c).toEqual({ messages: 13, clients: 879 });
  });

  it("il ponte con valutaVolumi: una forma ignota non diventa mai un verde", () => {
    // Il caso che conta davvero, e la ragione per cui estraiConteggi ritorna
    // null invece di {}: le due funzioni insieme non devono poter produrre
    // «tutto sotto soglia» partendo da una risposta illeggibile.
    const c = estraiConteggi({ risultato: "boh" });
    expect(c).toBeNull();
    // e se qualcuno un domani lo passasse comunque a valutaVolumi:
    const e = valutaVolumi({}, SOGLIE);
    expect(e.fallisce).toBe(false);
    expect(e.ok).toHaveLength(0);
    expect(e.mancanti).toHaveLength(SOGLIE.length);
  });
});
