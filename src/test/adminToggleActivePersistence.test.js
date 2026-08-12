// TOGGLE_TEAM_MEMBER_ACTIVE — suggerimento strategico n. 3 dell'audit
// dell'11 agosto: "disattivare" nel pannello Team ora REVOCA davvero la
// sessione, non è più un flag applicativo.
//
// PERCHÉ ESISTE. Prima `UsersAPI.setActive` scriveva `active` direttamente
// sulla tabella `public.users`. La RLS (`rls_active_only`) lo fa rispettare
// su ogni query, ma non tocca la sessione dell'utente: il suo access token
// restava valido fino a scadenza, e il refresh token continuava a
// rinnovarlo. Ora `setActive` passa dalla Edge Function `set-user-active`
// (`supabase/functions/set-user-active/index.ts`), che oltre al flag chiama
// `auth.admin.updateUserById(id, { ban_duration })` — la stessa idea di
// `delete-account`, ma reversibile.
//
// Estratto in un file suo (non una sezione di persistenceGuards.test.js)
// perché quel file era già alla soglia delle 500 righe effettive: "un file,
// una responsabilità" (docs/CLAUDE.md) vale anche per i test.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), createMany: vi.fn(() => Promise.resolve({ error: null, scritti: 0 })), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    MessageTemplates: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { reducer, makeInitialState, ADMIN_ONLY_ACTIONS } = await import("../state/reducer.js");
const { Users: UsersAPI } = await import("../lib/api.js");
const { isAdmin } = await import("../lib/permissions.js");

const TEAM = [
  { id: "admin1",  name: "Admin",  role: "Admin",        active: true, pending: false },
  { id: "senior1", name: "Senior", role: "Senior Agent", active: true, pending: false },
  { id: "junior1", name: "Junior", role: "Junior Agent", active: true, pending: false },
  { id: "driver1", name: "Driver", role: "Driver",       active: true, pending: false },
];

function statoCon(uid) {
  return { ...makeInitialState({ team: TEAM, currentUserId: uid }), toasts: [] };
}

// Il reducer ha davvero applicato l'azione? Stessa definizione di
// persistenceGuards.test.js: un rifiuto per permessi produce un toast
// "error", un no-op ritorna lo stesso oggetto state.
const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toasts?.at(-1)?.type !== "error";
};

beforeEach(() => { vi.clearAllMocks(); });

describe("persistence — TOGGLE_TEAM_MEMBER_ACTIVE revoca davvero", () => {
  const azione = (payload = "senior1") => ({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload });

  it("un admin che disattiva un altro membro chiama la Edge Function", async () => {
    const state = statoCon("admin1"); // team di default: senior1 attivo
    const action = azione("senior1");
    expect(PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.guard(state, action, "admin1")).toBe(true);
    expect(reducerHaApplicato(state, action)).toBe(true);

    await PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.persist(state, action, "admin1");
    // setActive riceve `!active` corrente: senior1 parte attivo, quindi la
    // chiamata deve chiedere di disattivarlo.
    expect(UsersAPI.setActive).toHaveBeenCalledWith("senior1", false);
  });

  it("un admin non può disattivare se stesso: negato da entrambi i livelli", () => {
    const state = statoCon("admin1");
    const action = azione("admin1");
    expect(PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.guard(state, action, "admin1")).toBe(false);
    expect(reducerHaApplicato(state, action)).toBe(false);
  });

  it("il rollback ridispatcha la stessa action: due toggle tornano al punto di partenza", () => {
    const state = statoCon("admin1");
    const action = azione("senior1");
    const undo = PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.rollback(state, action);
    expect(undo).toEqual({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "senior1" });

    // La prova che conta: applicare l'azione e poi il suo rollback riporta
    // "active" esattamente al valore di partenza.
    const dopoToggle = reducer(state, action);
    const dopoRollback = reducer(dopoToggle, undo);
    const trova = (s) => s.team.find(m => m.id === "senior1").active;
    expect(trova(dopoRollback)).toBe(trova(state));
  });

  it("un non-admin è respinto da entrambi i livelli", () => {
    for (const uid of ["senior1", "junior1", "driver1"]) {
      const state = statoCon(uid);
      const action = azione("junior1");
      const permesso = ADMIN_ONLY_ACTIONS.has("TOGGLE_TEAM_MEMBER_ACTIVE") && !isAdmin(state.team, uid)
        ? false
        : PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.guard(state, action, uid);
      expect(permesso).toBe(false);
      expect(reducerHaApplicato(state, action)).toBe(false);
    }
  });

  it("mapError espone il messaggio della Edge Function", () => {
    const testo = PERSISTENCE.TOGGLE_TEAM_MEMBER_ACTIVE.mapError({ message: "sessione non revocata" });
    expect(testo).toBe("sessione non revocata");
  });
});
