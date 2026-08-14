// UPDATE_TEAM_MEMBER raggiunge il database.
//
// Estratto da persistenceGuards.test.js (M-2 dell'audit del 14 agosto,
// secondo passaggio): quel file aveva superato la soglia di 500 righe
// effettive dopo l'aggiunta di ROLLBACK_RENAME_CLIENT_IN_TASKS all'elenco
// COMPENSAZIONE — un file, una responsabilità (docs/CLAUDE.md) vale anche
// per i test, stessa ragione per cui TOGGLE_TEAM_MEMBER_ACTIVE e le tre
// mutazioni degli avvisi hanno già un file a sé.
//
// Copre: la entry esiste ed è persistita (era local-only — un cambio di
// ruolo non arrivava mai al DB), il fallback quando `users.seniority` non
// esiste ancora, la distinzione fra "schema non migrato" e un errore vero,
// il confronto post-scrittura che smaschera il trigger
// `fix_users_privilege_escalation` quando ripristina in silenzio un campo
// sensibile, normalize, i tre rifiuti (ruolo fuori enum, self-demote,
// non-admin) e il rollback.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Users: { updateProfile: vi.fn(ok) },
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

function statoCon(tasks, uid) {
  const base = makeInitialState({ team: TEAM, currentUserId: uid });
  return { ...base, tasks, toasts: [] };
}

// Il reducer ha davvero applicato l'azione? Un rifiuto per permessi produce un
// toast di tipo "error"; un no-op (record inesistente) restituisce lo stesso
// oggetto state. Entrambi significano "non persistere".
const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toasts?.at(-1)?.type !== "error";
};

describe("persistence — UPDATE_TEAM_MEMBER raggiunge il database", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const azione = (over = {}) => ({
    type: "UPDATE_TEAM_MEMBER",
    payload: { id: "senior1", name: "Senior", role: "driver", color: "#111", capacity: 8, ...over },
  });

  // Il verdetto composito che useSyncedDispatch calcola davvero: gate
  // admin-only del wrapper reducer + guard della entry.
  const permessoDaPersistenza = (state, action, uid) => {
    const spec = PERSISTENCE[action.type];
    if (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(state.team, uid)) return false;
    return spec.guard ? spec.guard(state, action, uid) : true;
  };

  it("la entry esiste ed è persistita (regressione: era local-only)", () => {
    const spec = PERSISTENCE.UPDATE_TEAM_MEMBER;
    expect(spec, "UPDATE_TEAM_MEMBER senza entry = revoca privilegi che non arriva al DB").toBeDefined();
    expect(spec.persist).toBeTypeOf("function");
  });

  it("un admin che cambia il ruolo di un altro scrive su public.users", async () => {
    const state = statoCon([], "admin1");
    const action = azione();
    expect(permessoDaPersistenza(state, action, "admin1")).toBe(true);
    expect(reducerHaApplicato(state, action)).toBe(true);

    await PERSISTENCE.UPDATE_TEAM_MEMBER.persist(state, action, "admin1");
    expect(UsersAPI.updateProfile).toHaveBeenCalledTimes(1);
    const [id, patch] = UsersAPI.updateProfile.mock.calls[0];
    expect(id).toBe("senior1");
    expect(patch.role).toBe("driver");
    // Solo colonne reali di public.users: il payload arriva dalla card del
    // pannello Team e porta con sé anche campi derivati.
    expect(Object.keys(patch).sort()).toEqual(["capacity", "color", "name", "role", "seniority"]);
  });

  it("se users.seniority non esiste ancora, il RUOLO viene salvato lo stesso", async () => {
    // Finestra fra il deploy del codice e l'applicazione manuale della
    // migrazione 20260806120000: il sotto-livello è accessorio, la revoca dei
    // privilegi no.
    UsersAPI.updateProfile
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST204", message: "Could not find the 'seniority' column of 'users' in the schema cache" } })
      .mockResolvedValueOnce({ data: null, error: null });

    const state = statoCon([], "admin1");
    const res = await PERSISTENCE.UPDATE_TEAM_MEMBER.persist(state, azione(), "admin1");

    expect(res.error).toBeNull();
    expect(UsersAPI.updateProfile).toHaveBeenCalledTimes(2);
    const [, secondPatch] = UsersAPI.updateProfile.mock.calls[1];
    expect(secondPatch.role).toBe("driver");
    expect(secondPatch).not.toHaveProperty("seniority");
  });

  it("un errore vero NON viene scambiato per schema non migrato", async () => {
    UsersAPI.updateProfile.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied for table users" } });
    const state = statoCon([], "admin1");
    const res = await PERSISTENCE.UPDATE_TEAM_MEMBER.persist(state, azione(), "admin1");
    expect(res.error).toMatchObject({ code: "42501" });
    expect(UsersAPI.updateProfile).toHaveBeenCalledTimes(1);
  });

  // M-5 dell'audit del 13 agosto: il trigger `fix_users_privilege_escalation`
  // ripristina in silenzio i campi sensibili quando chi scrive non è admin
  // per il database — nessun `error`, la UPDATE "riesce" e basta. Il guard
  // locale non può intercettarlo (giudica sullo state React, che qui è per
  // ipotesi disallineato dal verdetto reale del server); solo confrontare il
  // ruolo tornato dalla `.select()` con quello richiesto lo smaschera.
  it("un ruolo ripristinato in silenzio dal trigger DB viene trattato come fallimento", async () => {
    UsersAPI.updateProfile.mockResolvedValueOnce({
      data: { id: "senior1", role: "agent" }, // il trigger ha annullato il cambio: role invariato
      error: null,
    });
    const state = statoCon([], "admin1");
    const res = await PERSISTENCE.UPDATE_TEAM_MEMBER.persist(state, azione({ role: "driver" }), "admin1");
    expect(res.error).toBeTruthy();
  });

  it("un ruolo scritto correttamente non viene segnalato come fallimento", async () => {
    UsersAPI.updateProfile.mockResolvedValueOnce({
      data: { id: "senior1", role: "driver" },
      error: null,
    });
    const state = statoCon([], "admin1");
    const res = await PERSISTENCE.UPDATE_TEAM_MEMBER.persist(state, azione({ role: "driver" }), "admin1");
    expect(res.error).toBeNull();
  });

  it("normalize appiattisce le vecchie label sull'enum prima del dispatch", () => {
    const state = statoCon([], "admin1");
    const norm = PERSISTENCE.UPDATE_TEAM_MEMBER.normalize(azione({ role: "Junior Agent" }), state, "admin1");
    expect(norm.payload.role).toBe("agent");
    expect(norm.payload.seniority).toBe("junior");
  });

  it("un ruolo fuori enum è rifiutato da entrambi i livelli", () => {
    const state = statoCon([], "admin1");
    const action = azione({ role: "Amministrativo" });
    expect(permessoDaPersistenza(state, action, "admin1")).toBe(false);
    expect(reducerHaApplicato(state, action)).toBe(false);
  });

  it("un admin non può togliere a se stesso i permessi di amministratore", () => {
    const state = statoCon([], "admin1");
    const action = azione({ id: "admin1", role: "agent" });
    expect(permessoDaPersistenza(state, action, "admin1")).toBe(false);
    expect(reducerHaApplicato(state, action)).toBe(false);
  });

  it("un non-admin è respinto da entrambi i livelli", () => {
    for (const uid of ["senior1", "junior1", "driver1"]) {
      const state = statoCon([], uid);
      const action = azione();
      expect(permessoDaPersistenza(state, action, uid)).toBe(false);
      expect(reducerHaApplicato(state, action)).toBe(false);
    }
  });

  it("il rollback riporta il membro allo stato precedente", () => {
    const state = statoCon([], "admin1");
    const undo = PERSISTENCE.UPDATE_TEAM_MEMBER.rollback(state, azione());
    expect(undo).toEqual({
      type: "UPDATE_TEAM_MEMBER",
      payload: state.team.find(m => m.id === "senior1"),
    });
  });
});
