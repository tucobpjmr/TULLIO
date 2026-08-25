// `lib/searchTask.js` e `lib/searchListe.js` — il filtraggio della ricerca
// avanzata, estratto da `AdvancedSearchPanel.jsx` (M-5, audit del 26 agosto).
//
// PERCHÉ QUESTO TEST ESISTE. Prima dell'estrazione queste ~110 righe erano
// pure ma irraggiungibili: verificarle voleva dire montare un pannello con sei
// provider, e nessuno l'aveva fatto. Sono anche le righe che promettono le tre
// cose delicate del pannello, tutte e tre già andate storte una volta:
//   · si cerca DENTRO IL CESTINO quando la casella è spuntata;
//   · si cerca DENTRO LE COMPLETATE (qui: che nessun filtro le escluda da sé);
//   · una lista si trova DAI COINTESTATARI, non solo dal titolare — il caso
//     che il commento in `filtraListe` racconta essere già stato «stessa
//     ricerca, due esiti diversi».
// Una ricerca che non trova non dice «non ho cercato lì», dice «non c'è».
import { describe, it, expect } from "vitest";
import { indicizzaTask, filtraTask } from "../lib/searchTask.js";
import { indicizzaListe, filtraListe } from "../lib/searchListe.js";

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma", description: "", client: "ROSSI MARIO",
  praticaRef: "", comments: [], status: "todo", category: "voli",
  assignees: ["marco"], dueDate: "2026-09-10", deletedAt: null, ...over,
});
const cerca = (tasks, filtri = {}, keyword = "") =>
  filtraTask(indicizzaTask(tasks), filtri, keyword).map(t => t.id);

describe("filtraTask — il cestino e le completate", () => {
  it("NON mostra le cestinate per default", () => {
    expect(cerca([task(), task({ id: "t2", deletedAt: "2026-08-01" })], {}, "roma"))
      .toEqual(["t1"]);
  });

  it("le mostra quando `includeTrashed` è vero: è la promessa della casella", () => {
    expect(cerca([task(), task({ id: "t2", deletedAt: "2026-08-01" })],
      { includeTrashed: true }, "roma")).toEqual(["t1", "t2"]);
  });

  it("una task COMPLETATA non è esclusa da niente che non sia il filtro stato", () => {
    const done = task({ id: "t2", status: "done" });
    expect(cerca([task(), done], {}, "roma")).toEqual(["t1", "t2"]);
    expect(cerca([task(), done], { stats: ["done"] }, "roma")).toEqual(["t2"]);
  });
});

describe("filtraTask — i filtri strutturali", () => {
  it("categoria, stato e assegnatario si combinano in AND", () => {
    const t = [
      task(),
      task({ id: "t2", category: "hotel" }),
      task({ id: "t3", assignees: ["laura"] }),
    ];
    expect(cerca(t, { cats: ["voli"], agents: ["marco"] }, "roma")).toEqual(["t1"]);
  });

  it("un filtro a scelta multipla vuoto NON filtra", () => {
    expect(cerca([task(), task({ id: "t2", category: "hotel" })], { cats: [] }, "roma"))
      .toEqual(["t1", "t2"]);
  });

  it("una task SENZA scadenza resta fuori da un filtro per periodo", () => {
    // «dal 1° al 30» è una domanda sulle date, e «nessuna data» non è una data
    // dentro l'intervallo.
    const senza = task({ id: "t2", dueDate: null });
    expect(cerca([task(), senza], { dateFrom: "2026-09-01" }, "roma")).toEqual(["t1"]);
    expect(cerca([task(), senza], { dateTo: "2026-12-31" }, "roma")).toEqual(["t1"]);
  });

  it("le date includono i due estremi, giorno locale intero", () => {
    expect(cerca([task()], { dateFrom: "2026-09-10", dateTo: "2026-09-10" }, "roma"))
      .toEqual(["t1"]);
  });
});

describe("filtraTask — il testo", () => {
  it("cerca anche dentro i COMMENTI, non solo nel titolo", () => {
    const t = task({ id: "t2", title: "Pratica X", client: "", comments: [{ text: "confermato con BIANCHI" }] });
    expect(cerca([t], {}, "bianchi")).toEqual(["t2"]);
  });

  it("ignora accenti e ordine delle parole, come l'anagrafica", () => {
    const t = task({ id: "t2", title: "Città di Nizza", client: "" });
    expect(cerca([t], {}, "nizza citta")).toEqual(["t2"]);
  });

  it("senza keyword restano i soli filtri strutturali", () => {
    expect(cerca([task(), task({ id: "t2", category: "hotel" })], { cats: ["hotel"] }, ""))
      .toEqual(["t2"]);
  });
});

describe("filtraTask — l'ordinamento", () => {
  it("per scadenza crescente, e le task senza scadenza in FONDO", () => {
    // `null` non è «presto»: metterle in testa sposterebbe in cima proprio le
    // righe di cui non si sa nulla.
    const t = [
      task({ id: "tardi", dueDate: "2026-12-01" }),
      task({ id: "mai", dueDate: null }),
      task({ id: "presto", dueDate: "2026-09-01" }),
    ];
    expect(cerca(t, {}, "roma")).toEqual(["presto", "tardi", "mai"]);
  });
});

// ─── liste ──────────────────────────────────────────────────────────────────
const beneficiari = (l) => l.beneficiari || [];
const lista = (over = {}) => ({
  id: "l1", clients: { name: "ROSSI MARIO" }, titolo: "Crociera",
  note: "", stato: "aperta", deleted_at: null, beneficiari: [], ...over,
});
const cercaListe = (liste, filtri = {}, keyword = "") =>
  filtraListe(indicizzaListe(liste, beneficiari), filtri, keyword).map(l => l.id);

describe("filtraListe", () => {
  it("trova una lista DAI COINTESTATARI, non solo dal titolare", () => {
    // Il caso già andato storto una volta: nel modulo Liste cercando "BIANCHI"
    // si trovava, nella ricerca globale no — stessa ricerca, due esiti.
    const l = lista({ id: "l2", beneficiari: ["BIANCHI ANNA"] });
    expect(cercaListe([l], {}, "bianchi")).toEqual(["l2"]);
  });

  it("cerca anche nelle NOTE interne, che il modulo Liste non indicizza", () => {
    expect(cercaListe([lista({ id: "l2", note: "richiamare VERDI" })], {}, "verdi"))
      .toEqual(["l2"]);
  });

  it("rispetta il cestino con la stessa semantica dei task", () => {
    const l = [lista(), lista({ id: "l2", deleted_at: "2026-08-01" })];
    expect(cercaListe(l, {}, "rossi")).toEqual(["l1"]);
    expect(cercaListe(l, { includeTrashed: true }, "rossi")).toEqual(["l1", "l2"]);
  });

  it("filtra per stato e per cliente", () => {
    const l = [lista(), lista({ id: "l2", stato: "chiusa", clients: { name: "VERDI" } })];
    expect(cercaListe(l, { listeStati: ["chiusa"] }, "")).toEqual(["l2"]);
    expect(cercaListe(l, { listeClienti: ["ROSSI MARIO"] }, "")).toEqual(["l1"]);
  });

  it("ordina per nome del titolare, con le regole dell'italiano", () => {
    const l = [
      lista({ id: "z", clients: { name: "ZANI" } }),
      lista({ id: "a", clients: { name: "ÀBATE" } }),
      lista({ id: "m", clients: { name: "MORI" } }),
    ];
    expect(cercaListe(l, {}, "")).toEqual(["a", "m", "z"]);
  });

  it("una lista senza titolare non fa esplodere l'ordinamento", () => {
    expect(cercaListe([lista({ id: "l2", clients: null }), lista()], {}, "")).toEqual(["l2", "l1"]);
  });
});
