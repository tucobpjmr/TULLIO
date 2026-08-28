// A-3 dell'audit del 28 agosto — il team è la quarta entità realtime, e finora
// era l'unica senza la protezione delle scritture in volo.
//
// IL DIFETTO CHE QUESTI TEST BLOCCANO. `SET_TEAM` sostituiva l'array secco, e
// nessuna delle cinque entry del registry che mutano il team dichiarava
// `entityId`: mancavano ENTRAMBE le metà del meccanismo, e questo è il modo in
// cui la classe si nasconde — non c'era nemmeno una metà presente a fare da
// indizio dell'altra.
//
// La sequenza è quella descritta in state/pendingWrites.js, su un'entità in
// realtime dal primo giorno (`users`, sottoscrizione con debounce 800 ms):
//
//   1. un admin disattiva un membro → lo stato cambia subito e la Edge Function
//      parte;
//   2. nella stessa finestra un evento su `users` causato da ALTRI — un signup,
//      un invito accettato, un ruolo cambiato da un secondo admin — fa partire
//      `UsersAPI.listAll()`;
//   3. la risposta è più recente per tutte le righe TRANNE la nostra, che il
//      server serve ancora con `active: true`: SET_TEAM sostituisce l'array e
//      la disattivazione si annulla a schermo, sopra il toast verde che la dà
//      per riuscita;
//   4. l'eco della nostra scrittura porta il nostro `origin_client` e viene
//      scartata: nessun reload viene a correggere.
//
// ⚠️ QUI LA POSTA È PIÙ ALTA CHE SULLE ALTRE TRE ENTITÀ. `state.team` è il dato
// da cui `state/AppDataContext.jsx` costruisce `io`/`per`, cioè le decisioni di
// autorizzazione lato client: una riga riportata indietro non è un campo
// sbagliato a schermo, è un ruolo revocato che torna, o un account disattivato
// che risulta di nuovo attivo.
import { describe, it, expect, vi } from "vitest";

// Come in pendingWritesClientiAvvisi.test.js: il registry importa il data
// layer, che al modulo costruisce il client Supabase. Qui servono le sole
// dichiarazioni delle entry, non la rete.
vi.mock("../../lib/api.js", () => {
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

const { reducer, makeInitialState } = await import("../../state/reducer.js");
const { PERSISTENCE } = await import("../../state/persistence.js");

const membro = (id, over = {}) => ({
  id, name: `Agente ${id}`, role: "agent", active: true, pending: false, ...over,
});

const statoBase = (over = {}) => ({
  ...makeInitialState({ team: [membro("u1", { role: "admin", name: "Admin" })], currentUserId: "u1" }),
  ...over,
});

const inVolo = (...ids) => new Map(ids.map(id => [id, 1]));

describe("SET_TEAM non annulla la mutazione sul team che stiamo scrivendo", () => {
  it("una disattivazione in volo non torna attiva per colpa di un refetch concorrente", () => {
    const state = statoBase({
      team: [membro("u1", { role: "admin" }), membro("u2", { active: false })],
      pendingWrites: inVolo("u2"),
    });
    // Il server sta ancora servendo il pre-immagine di u2 (attivo), e la riga
    // di un membro nuovo appena approvato da un altro admin.
    const next = reducer(state, {
      type: "SET_TEAM",
      payload: [membro("u1", { role: "admin" }), membro("u2"), membro("u3")],
    });

    expect(next.team.find(m => m.id === "u2").active).toBe(false);
    expect(next.team.find(m => m.id === "u3")).toBeTruthy();
  });

  it("un cambio di ruolo in volo non viene riportato indietro", () => {
    // La revoca dei privilegi: il caso per cui UPDATE_TEAM_MEMBER è stato
    // persistito in primo luogo. Vederla annullarsi a schermo significa non
    // sapere se sia arrivata al database.
    const state = statoBase({
      team: [membro("u1", { role: "admin" }), membro("u2", { role: "agent" })],
      pendingWrites: inVolo("u2"),
    });
    const next = reducer(state, {
      type: "SET_TEAM",
      payload: [membro("u1", { role: "admin" }), membro("u2", { role: "manager" })],
    });
    expect(next.team.find(m => m.id === "u2").role).toBe("agent");
  });

  it("un membro eliminato in ottimistico non riappare perché il server lo serve ancora", () => {
    const state = statoBase({
      team: [membro("u1", { role: "admin" })],
      pendingWrites: inVolo("u2"),
    });
    const next = reducer(state, {
      type: "SET_TEAM",
      payload: [membro("u1", { role: "admin" }), membro("u2")],
    });
    expect(next.team.map(m => m.id)).toEqual(["u1"]);
  });

  it("il proprio profilo appena salvato non viene riportato indietro", () => {
    // UPDATE_OWN_PROFILE scrive la PROPRIA riga in public.users, cioè la stessa
    // che vive in state.team: senza marcatura, nome, avatar, email e telefono
    // tornavano quelli di prima con la modale già chiusa.
    const state = statoBase({
      team: [membro("u1", { role: "admin", name: "Nome nuovo", email: "nuova@esempio.it" })],
      pendingWrites: inVolo("u1"),
    });
    const next = reducer(state, {
      type: "SET_TEAM",
      payload: [membro("u1", { role: "admin", name: "Nome vecchio", email: "vecchia@esempio.it" })],
    });
    expect(next.team[0].name).toBe("Nome nuovo");
    expect(next.team[0].email).toBe("nuova@esempio.it");
  });

  it("senza scritture in volo il refetch resta la fonte di verità", () => {
    // La contropartita, e non è una formalità: una fusione che tenesse SEMPRE
    // la riga locale renderebbe il team un dato che non si aggiorna più — un
    // ruolo cambiato da un altro admin non arriverebbe mai.
    const state = statoBase({ team: [membro("u1", { role: "admin" })] });
    const next = reducer(state, { type: "SET_TEAM", payload: [membro("u1", { role: "manager" })] });
    expect(next.team[0].role).toBe("manager");
  });
});

// L'altra metà. Senza `entityId` il registry non marca nulla e la fusione qui
// sopra lavora su una mappa sempre vuota: è la metà che si dimentica, perché
// tutto continua a funzionare tranne in una finestra di qualche centinaio di ms.
describe("le cinque entry del team dichiarano gli id che scrivono", () => {
  const ATTESE = [
    ["UPDATE_TEAM_MEMBER", { payload: { id: "u2" } }, "u2"],
    ["APPROVE_TEAM_MEMBER", { payload: { id: "u2", role: "agent" } }, "u2"],
    ["REMOVE_TEAM_MEMBER", { payload: "u2" }, "u2"],
    ["TOGGLE_TEAM_MEMBER_ACTIVE", { payload: "u2" }, "u2"],
  ];

  it.each(ATTESE)("%s marca la riga che scrive", (tipo, action, atteso) => {
    const spec = PERSISTENCE[tipo];
    expect(spec.entityId, `${tipo} non dichiara entityId`).toBeTypeOf("function");
    expect(spec.entityId(action)).toBe(atteso);
  });

  it("UPDATE_OWN_PROFILE marca l'utente loggato, che nel payload non c'è", () => {
    // È l'unica mutazione dell'app il cui SOGGETTO non sta nell'azione, ed è la
    // ragione per cui la firma di `entityId` è `(action, state, uid)` come
    // quella di `normalize`: l'alternativa era farle aggiungere l'id in
    // `normalize`, cioè mettere nello stato React un campo che esiste solo per
    // farsi rileggere dall'orchestratore.
    const spec = PERSISTENCE.UPDATE_OWN_PROFILE;
    expect(spec.entityId).toBeTypeOf("function");
    const stato = statoBase({ currentUserId: "u1" });
    expect(spec.entityId({ payload: { name: "X" } }, stato, "u1")).toBe("u1");
  });
});
