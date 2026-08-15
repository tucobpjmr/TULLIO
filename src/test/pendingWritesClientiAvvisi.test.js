// A-1 dell'audit del 14 agosto (terzo passaggio) — la protezione delle
// scritture in volo vale anche per clienti e avvisi.
//
// IL DIFETTO CHE QUESTI TEST BLOCCANO. `pendingWrites` esisteva per i soli
// task: SET_TASKS non sostituiva una riga che stavamo scrivendo, SET_CLIENTS e
// SET_NOTICES sostituivano l'array intero senza guardare nulla. Finché
// `clients` non era in realtime la cosa era innocua — nessun refetch
// concorrente da cui difendersi — ma dalla migrazione 20260807215625 la
// tabella è pubblicata, quindi la scrittura di un ALTRO utente fa ripartire
// ClientsAPI.list() mentre la nostra UPDATE è ancora in volo. La risposta è
// più vecchia per la NOSTRA riga soltanto, e sostituendola la modifica sparisce
// dallo schermo — senza che nulla venga poi a rimetterla, perché l'eco della
// nostra scrittura porta il nostro origin_client e viene scartata.
//
// Il sintomo per l'utente è il peggiore possibile su un'anagrafica: il
// salvataggio si annulla da solo qualche istante dopo il toast verde, e sul
// database invece è andato a buon fine.
import { describe, it, expect, vi } from "vitest";

// Il registry importa il data layer, che al modulo costruisce il client
// Supabase: qui interessano solo le dichiarazioni delle entry, non la rete.
vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  const ns = (...m) => Object.fromEntries(m.map(k => [k, vi.fn(ok)]));
  return {
    Tasks: ns("create", "createMany", "update", "softDelete", "restore", "hardDelete", "hardDeleteMany"),
    Comments: ns("create"),
    Notices: ns("create", "update", "remove", "togglePin"),
    Users: ns("approve", "deleteUser", "setActive", "updateProfile", "updateContact"),
    Clients: ns("create", "createMany", "update", "remove"),
    Categories: ns("create", "update", "remove"),
    MessageTemplates: ns("create", "update", "remove"),
  };
});

const { fondiScrittureInVolo } = await import("../state/pendingWrites.js");
const { reducer, makeInitialState } = await import("../state/reducer.js");
const { PERSISTENCE } = await import("../state/persistence.js");

const statoBase = (over = {}) => ({
  ...makeInitialState({ team: [{ id: "u1", name: "Admin", role: "admin", active: true, pending: false }], currentUserId: "u1" }),
  ...over,
});

const inVolo = (...ids) => new Map(ids.map(id => [id, 1]));

describe("fondiScrittureInVolo — l'invariante, una volta sola per tre entità", () => {
  it("senza scritture in volo la lista del server passa intatta", () => {
    const dalServer = [{ id: "a" }, { id: "b" }];
    expect(fondiScrittureInVolo(dalServer, [{ id: "a", vecchio: true }], new Map())).toBe(dalServer);
  });

  it("per un id in volo vince la riga locale, non quella del server", () => {
    const out = fondiScrittureInVolo(
      [{ id: "a", nome: "vecchio" }, { id: "b", nome: "altro" }],
      [{ id: "a", nome: "nuovo" }],
      inVolo("a"),
    );
    expect(out.find(r => r.id === "a").nome).toBe("nuovo");
    expect(out.find(r => r.id === "b").nome).toBe("altro");
  });

  it("una riga cancellata in ottimistico non riappare perché il server la serve ancora", () => {
    const out = fondiScrittureInVolo([{ id: "a" }, { id: "b" }], [{ id: "b" }], inVolo("a"));
    expect(out.map(r => r.id)).toEqual(["b"]);
  });

  it("una riga creata in ottimistico non sparisce perché il server non la serve ancora", () => {
    const out = fondiScrittureInVolo([{ id: "b" }], [{ id: "a", nuovo: true }, { id: "b" }], inVolo("a"));
    expect(out.map(r => r.id).sort()).toEqual(["a", "b"]);
  });

  it("un payload non-array (errore a monte) vale come risposta vuota, senza esplodere", () => {
    // Le righe in volo sopravvivono comunque: sono proprio quelle che il
    // server non ha ancora, quindi "risposta vuota" non le smentisce.
    expect(fondiScrittureInVolo(null, [{ id: "a" }], inVolo("a"))).toEqual([{ id: "a" }]);
    expect(fondiScrittureInVolo(undefined, [], new Map())).toEqual([]);
  });
});

describe("SET_CLIENTS non annulla una scheda cliente che stiamo salvando", () => {
  it("il refetch concorrente non riporta indietro il valore pre-scrittura", () => {
    const state = statoBase({
      clients: [{ id: "c1", name: "Rossi Mario", email: "nuova@esempio.it" }],
      pendingWrites: inVolo("c1"),
    });
    // Il server sta ancora servendo il pre-immagine della riga che stiamo
    // scrivendo, e la riga aggiornata di un altro utente.
    const next = reducer(state, {
      type: "SET_CLIENTS",
      payload: [
        { id: "c1", name: "Rossi Mario", email: "vecchia@esempio.it" },
        { id: "c2", name: "Bianchi Ada" },
      ],
    });
    expect(next.clients.find(c => c.id === "c1").email).toBe("nuova@esempio.it");
    expect(next.clients.find(c => c.id === "c2")).toBeTruthy();
  });

  it("senza scritture in volo il refetch resta la fonte di verità", () => {
    const state = statoBase({ clients: [{ id: "c1", name: "Vecchio" }] });
    const next = reducer(state, { type: "SET_CLIENTS", payload: [{ id: "c1", name: "Nuovo dal server" }] });
    expect(next.clients).toEqual([{ id: "c1", name: "Nuovo dal server" }]);
  });
});

describe("SET_NOTICES non annulla un avviso che stiamo salvando", () => {
  it("il refetch concorrente non riporta indietro il testo pre-scrittura", () => {
    const state = statoBase({
      notices: [{ id: "n1", text: "testo nuovo" }],
      pendingWrites: inVolo("n1"),
    });
    const next = reducer(state, {
      type: "SET_NOTICES",
      payload: [{ id: "n1", text: "testo vecchio" }, { id: "n2", text: "altrui" }],
    });
    expect(next.notices.find(n => n.id === "n1").text).toBe("testo nuovo");
    expect(next.notices.find(n => n.id === "n2")).toBeTruthy();
  });
});

// La protezione funziona solo se le entry DICHIARANO quali id stanno
// scrivendo: senza `entityId` il registry non marca nulla e la fusione qui
// sopra non ha su cosa lavorare. È la metà del meccanismo che si dimentica
// quando si aggiunge una entry nuova, perché tutto continua a funzionare —
// tranne in una finestra di qualche centinaio di ms che nessun test tocca.
describe("le entry di clienti e avvisi dichiarano gli id che scrivono", () => {
  const ATTESE = [
    ["ADD_CLIENT", { payload: { id: "c1" } }, "c1"],
    ["UPDATE_CLIENT", { payload: { id: "c1" } }, "c1"],
    ["DELETE_CLIENT", { payload: "c1" }, "c1"],
    ["ADD_NOTICE", { payload: { id: "n1" } }, "n1"],
    ["UPDATE_NOTICE", { payload: { id: "n1" } }, "n1"],
    ["DELETE_NOTICE", { payload: "n1" }, "n1"],
    ["TOGGLE_PIN_NOTICE", { payload: "n1" }, "n1"],
  ];

  it.each(ATTESE)("%s marca la riga che scrive", (tipo, action, atteso) => {
    const spec = PERSISTENCE[tipo];
    expect(spec.entityId, `${tipo} non dichiara entityId`).toBeTypeOf("function");
    expect(spec.entityId(action)).toBe(atteso);
  });

  it("ADD_CLIENTS_BULK marca tutte le righe del batch", () => {
    const ids = PERSISTENCE.ADD_CLIENTS_BULK.entityId({ payload: [{ id: "c1" }, { id: "c2" }] });
    expect(ids).toEqual(["c1", "c2"]);
  });
});
