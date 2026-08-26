// Il contratto delle fette di dominio con reducer proprio.
//
// PERCHÉ ESISTE. Dal 23 agosto lo switch di `state/reducer.js` non è più
// l'unico posto in cui uno state può cambiare: la bacheca avvisi
// (`noticesReducer`) e i template messaggi (`messageTemplatesReducer`) hanno un
// file ciascuno, e `baseReducer` li interroga PRIMA del proprio switch. È
// l'estrazione che ha chiuso la deroga a `max-lines` del reducer, ma introduce
// due modi di rompere l'app che prima non esistevano — entrambi silenziosi,
// entrambi impossibili da vedere leggendo il file principale:
//
//   1. UNA FETTA CHE RITORNA `state` INVECE DI `null`. Il contratto è che una
//      fetta risponda `null` a ciò che non possiede: `null` significa «non è
//      mia, continua». Uno `state` invariato significa «l'ho gestita io e non
//      cambia nulla» — e siccome la delega sta in cima, la prima fetta si
//      mangerebbe OGNI azione dell'app. Niente errori, niente eccezioni: la UI
//      semplicemente smette di rispondere. È un `return state` di troppo in un
//      `default`, cioè la cosa più naturale del mondo da scrivere in un
//      reducer.
//
//   2. UN CASE IN DUE FILE. Se un case rimasto nello switch principale porta
//      lo stesso nome di uno di una fetta, vince la fetta e l'altro non gira
//      mai. A schermo sembra funzionare finché non serve il ramo perduto.
//
// Le due proprietà si verificano sul CONTRATTO e sul SORGENTE, non su un
// elenco scritto a mano: una fetta nuova entra nel test aggiungendola qui
// sotto, che è anche il solo posto in cui va aggiunta.
import { describe, it, expect } from "vitest";
import { reducer, makeInitialState } from "../../state/reducer.js";
import { noticesReducer } from "../../state/noticesReducer.js";
import { messageTemplatesReducer } from "../../state/messageTemplatesReducer.js";

const FETTE = [
  { nome: "noticesReducer", fn: noticesReducer, sorgente: "../../state/noticesReducer.js?raw" },
  { nome: "messageTemplatesReducer", fn: messageTemplatesReducer, sorgente: "../../state/messageTemplatesReducer.js?raw" },
];

const TEAM = [{ id: "admin1", name: "Admin", role: "Admin", active: true, pending: false }];
const statoBase = () => makeInitialState({ team: TEAM, currentUserId: "admin1" });

const casiDi = (testo) => [...testo.matchAll(/case "([A-Z_]+)"/g)].map(m => m[1]);

describe("fette di dominio — il contratto null", () => {
  for (const { nome, fn } of FETTE) {
    it(`${nome} ritorna null per un'azione che non è sua`, () => {
      // "MOVE_TASK" non è una scelta a caso: è gestita dallo switch
      // principale, quindi se questa fetta rispondesse un oggetto la delega
      // impedirebbe per sempre di spostare una task fra colonne.
      expect(fn(statoBase(), { type: "MOVE_TASK", payload: { taskId: "t1", status: "done" } })).toBeNull();
      // E per un tipo che non esiste affatto: il `default` deve essere `null`
      // anche quando nessuno rivendica l'azione.
      expect(fn(statoBase(), { type: "AZIONE_INESISTENTE" })).toBeNull();
    });
  }

  it("nessun tipo di azione è gestito da due file", async () => {
    const perFile = { "state/reducer.js": casiDi((await import("../../state/reducer.js?raw")).default) };
    for (const { nome, sorgente } of FETTE) {
      perFile[nome] = casiDi((await import(/* @vite-ignore */ sorgente)).default);
    }
    const visto = new Map();
    const doppi = [];
    for (const [file, casi] of Object.entries(perFile)) {
      for (const c of casi) {
        if (visto.has(c) && visto.get(c) !== file) doppi.push(`${c} (${visto.get(c)} e ${file})`);
        else visto.set(c, file);
      }
    }
    expect(
      doppi,
      "un case che vive in due file è ombreggiato dalla delega in cima a " +
      `baseReducer e il secondo non gira mai: ${doppi.join(", ")}`,
    ).toEqual([]);
  });
});

describe("fette di dominio — le azioni arrivano ancora a destinazione", () => {
  // La delega è un pezzo di cablaggio: che le fette funzionino da sole non
  // dice che `reducer` le stia chiamando. Questi due casi passano dalla porta
  // d'ingresso vera, quella che usa l'app.
  it("un avviso pubblicato finisce in bacheca passando da reducer()", () => {
    const dopo = reducer(statoBase(), {
      type: "ADD_NOTICE",
      payload: { id: "n1", title: "Chiusura estiva", body: "…", authorId: "admin1" },
    });
    expect(dopo.notices.map(n => n.id)).toContain("n1");
    expect(dopo.toasts.at(-1).message).toBe("Avviso pubblicato in bacheca");
  });

  it("l'idratazione dei template passa da reducer()", () => {
    const dopo = reducer(statoBase(), {
      type: "SET_MESSAGE_TEMPLATES",
      payload: [{ id: "mt1", label: "Benvenuto", text: "Ciao!" }],
    });
    expect(dopo.messageTemplates).toHaveLength(1);
    // Idratazione silenziosa: nessun toast, come le altre SET_*.
    expect(dopo.toasts).toEqual(statoBase().toasts);
  });

  it("il pre-check admin del wrapper vale ancora per una fetta", () => {
    // ADD_MESSAGE_TEMPLATE è admin-only e il gate NON è dentro la fetta: sta
    // in ADMIN_ONLY_ACTIONS, cioè prima della delega. Se l'estrazione avesse
    // portato via anche quella decisione, un agent scriverebbe i template.
    const daAgente = {
      ...makeInitialState({
        team: [...TEAM, { id: "agent1", name: "Agent", role: "Senior Agent", active: true, pending: false }],
        currentUserId: "agent1",
      }),
    };
    const dopo = reducer(daAgente, { type: "ADD_MESSAGE_TEMPLATE", payload: { label: "X", text: "Y" } });
    expect(dopo.messageTemplates).toEqual(daAgente.messageTemplates);
    expect(dopo.toasts.at(-1).message).toMatch(/Solo Admin/);
  });
});
