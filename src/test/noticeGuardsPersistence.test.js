// UPDATE_NOTICE/DELETE_NOTICE/TOGGLE_PIN_NOTICE — A-1 dell'audit del 14 agosto.
//
// PERCHÉ ESISTE. Erano le uniche mutazioni del registry di persistenza senza
// guard NÉ rollback, mentre sono anche le uniche su cui la RLS nega davvero
// qualcosa (`author_id = auth.uid() OR is_manager_or_admin()`, migrazione
// iniziale — canEditNotice in lib/permissions.js rispecchia esattamente
// `notices_update`/`notices_delete`). Senza guard, un non-autore vedeva il
// reducer applicare l'azione in ottimistico ("Avviso aggiornato/rimosso"), poi
// la scrittura falliva lato server; senza rollback, l'avviso restava
// disallineato dal database finché non arrivava un reload completo — una
// DELETE fallita non produce un evento realtime che la corregga.
//
// Estratto in un file suo (non una sezione di persistenceGuards.test.js)
// perché quel file era già alla soglia delle 500 righe effettive: "un file,
// una responsabilità" (docs/CLAUDE.md) vale anche per i test — stesso motivo
// per cui TOGGLE_TEAM_MEMBER_ACTIVE ha adminToggleActivePersistence.test.js.
//
// La metà UI della correzione (i pulsanti compaiono solo per chi la RLS
// lascerebbe agire) è in noticeBoardPermessi.test.jsx: le due vanno lette
// insieme, non una sola.
import { describe, it, expect, vi } from "vitest";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Notices: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { reducer, makeInitialState } = await import("../state/reducer.js");

// Il reducer ha davvero applicato l'azione? Stessa definizione di
// persistenceGuards.test.js: un rifiuto per permessi produce un toast
// "error", un record fantasma (`if (!prev) return state`) ritorna lo stesso
// oggetto state — entrambi significano "non persistere".
const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toasts?.at(-1)?.type !== "error";
};

// Un team a sé, con un manager vero: "autore o manager/admin" ha tre rami
// distinti da provare (autore, privilegiato-non-autore, né l'uno né l'altro),
// non due.
const TEAM_NOTICES = [
  { id: "admin1",   name: "Admin",   role: "admin",   active: true, pending: false },
  { id: "manager1", name: "Manager", role: "manager", active: true, pending: false },
  { id: "autore1",  name: "Autore",  role: "agent",   active: true, pending: false },
  { id: "agente1",  name: "Agente",  role: "agent",   active: true, pending: false },
  { id: "driver1",  name: "Driver",  role: "driver",  active: true, pending: false },
];

const AVVISO = { id: "notice1", text: "Riunione venerdì", color: "#FFF3B0", author: "autore1", pinned: false };

const statoConAvviso = (uid, notice = AVVISO) => {
  const base = makeInitialState({ team: TEAM_NOTICES, currentUserId: uid });
  return { ...base, notices: [notice], toasts: [] };
};

describe("persistence — bacheca avvisi: guard e rollback (A-1)", () => {
  describe.each([
    ["UPDATE_NOTICE", (id) => ({ type: "UPDATE_NOTICE", payload: { id, text: "Modificato" } })],
    ["DELETE_NOTICE", (id) => ({ type: "DELETE_NOTICE", payload: id })],
    ["TOGGLE_PIN_NOTICE", (id) => ({ type: "TOGGLE_PIN_NOTICE", payload: id })],
  ])("%s", (tipo, azione) => {
    it.each([
      ["l'autore", "autore1", true],
      ["un manager (non autore)", "manager1", true],
      ["un admin (non autore)", "admin1", true],
      ["un agente diverso dall'autore", "agente1", false],
      ["un driver", "driver1", false],
    ])("%s → guard concorda col reducer", (_, uid, atteso) => {
      const state = statoConAvviso(uid);
      const action = azione("notice1");
      expect(PERSISTENCE[tipo].guard(state, action, uid)).toBe(atteso);
      expect(reducerHaApplicato(state, action)).toBe(atteso);
    });

    it("nega senza sollevare quando l'avviso non esiste (record fantasma)", () => {
      const state = statoConAvviso("autore1");
      const action = azione("notice-fantasma");
      expect(PERSISTENCE[tipo].guard(state, action, "autore1")).toBe(false);
      // Anche il reducer: `if (!prev) return state` — nessun toast, nessun
      // cambiamento, non un rifiuto travestito da successo.
      expect(reducerHaApplicato(state, action)).toBe(false);
    });
  });

  it("UPDATE_NOTICE.rollback rimanda l'avviso INTERO pre-dispatch, non solo il patch", () => {
    const state = statoConAvviso("autore1");
    const action = { type: "UPDATE_NOTICE", payload: { id: "notice1", text: "Modificato", color: "#000" } };
    expect(PERSISTENCE.UPDATE_NOTICE.rollback(state, action))
      .toEqual({ type: "UPDATE_NOTICE", payload: AVVISO });
  });

  it("UPDATE_NOTICE.rollback applicato dal reducer ripristina davvero i campi", () => {
    const prima = statoConAvviso("autore1");
    const modifica = { type: "UPDATE_NOTICE", payload: { id: "notice1", text: "Modificato", color: "#000" } };
    const dopo = reducer(prima, modifica);
    expect(dopo.notices[0].text).toBe("Modificato");

    const undo = PERSISTENCE.UPDATE_NOTICE.rollback(prima, modifica);
    const ripristinato = reducer(dopo, undo);
    expect(ripristinato.notices[0].text).toBe("Riunione venerdì");
    expect(ripristinato.notices[0].color).toBe("#FFF3B0");
  });

  it("DELETE_NOTICE.rollback ripristina l'avviso rimosso in ottimistico", () => {
    const state = statoConAvviso("autore1");
    const action = { type: "DELETE_NOTICE", payload: "notice1" };
    expect(PERSISTENCE.DELETE_NOTICE.rollback(state, action))
      .toEqual({ type: "RESTORE_NOTICE", payload: AVVISO });

    // Applicato per davvero: prima la DELETE lo toglie, poi RESTORE_NOTICE lo
    // rimette — stesso giro round-trip di UPDATE_NOTICE qui sopra.
    const dopoDelete = reducer(state, action);
    expect(dopoDelete.notices).toEqual([]);
    const undo = PERSISTENCE.DELETE_NOTICE.rollback(state, action);
    const ripristinato = reducer(dopoDelete, undo);
    expect(ripristinato.notices).toEqual([AVVISO]);
  });

  it("DELETE_NOTICE.rollback non fa nulla se l'avviso non c'era già più", () => {
    const state = statoConAvviso("autore1");
    const action = { type: "DELETE_NOTICE", payload: "notice-fantasma" };
    expect(PERSISTENCE.DELETE_NOTICE.rollback(state, action)).toBeNull();
  });

  it("TOGGLE_PIN_NOTICE.rollback è la propria inversa (nessuno snapshot necessario)", () => {
    const state = statoConAvviso("autore1");
    const action = { type: "TOGGLE_PIN_NOTICE", payload: "notice1" };
    expect(PERSISTENCE.TOGGLE_PIN_NOTICE.rollback(state, action))
      .toEqual({ type: "TOGGLE_PIN_NOTICE", payload: "notice1" });
  });

  it("mapError dà un messaggio stabile per tutte e tre le azioni", () => {
    expect(PERSISTENCE.UPDATE_NOTICE.mapError()).toBe("avviso non aggiornato");
    expect(PERSISTENCE.DELETE_NOTICE.mapError()).toBe("avviso non eliminato");
    expect(PERSISTENCE.TOGGLE_PIN_NOTICE.mapError()).toBe("pin non aggiornato");
  });
});
