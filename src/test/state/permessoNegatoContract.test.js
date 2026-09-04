// A-1 dell'audit del 4 settembre — l'invariante che rende sicuro il silenzio
// di useSalvataggio su un rifiuto di permesso.
//
// LA CATENA, E DOVE SI SAREBBE ROTTA. Da A-1, `useSyncedDispatch` ritorna un
// errore `PermessoNegato` quando un guard nega, e `useSalvataggio` — davanti a
// quell'errore — NON chiude il pannello e NON scrive un testo inline: si fida
// del toast che il reducer alza in `_denied()`. Quel silenzio è corretto
// finché il toast c'è davvero. Se domani qualcuno aggiungesse un `guard` a una
// entry del registry senza il corrispondente `_denied()` nel reducer, il
// rifiuto diventerebbe MUTO: pannello aperto, nessun messaggio, nessuna idea
// di cosa sia successo — un difetto peggiore di quello che A-1 ha chiuso.
//
// I due livelli sono scritti in file diversi (`state/persistence.js` e
// `state/reducer.js`) e nulla, prima di questo test, li legava. Il reducer lo
// dice già a parole — «il pre-check dell'orchestratore impedisce solo la
// richiesta di rete, non il dispatch che arriva qui, ed è proprio questo
// reducer a dover rifiutare per davvero» — ma una frase in un commento non
// fallisce quando smette di essere vera. Questo test sì. È la stessa forma di
// `rollbackContract.test.js`, che esiste per la stessa ragione su un altro
// invariante del registry.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks: { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments: { create: vi.fn(ok) },
    Notices: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users: { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients: { create: vi.fn(ok), createMany: vi.fn(() => Promise.resolve({ error: null, scritti: 0 })), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    MessageTemplates: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../../state/persistence.js");
const { PERSISTENCE_ADMIN } = await import("../../state/persistenceAdmin.js");
const { reducer, makeInitialState, ADMIN_ONLY_ACTIONS } = await import("../../state/reducer.js");

const TASK_ID   = "11111111-2222-4333-8444-555555555555";
const NOTICE_ID = "22222222-2222-4333-8444-555555555555";
const CLIENT_ID = "33333333-2222-4333-8444-555555555555";

// Il DRIVER è l'utente che nega TUTTO, ed è il solo che lo fa: è fuori da
// canEditClient/canDeleteClient (niente dati commerciali, per disegno), da
// canCreateTaskCategory per ogni categoria che non sia "transfer", da
// canEditTask e canViewTask sui task altrui, e da isAdmin. Un junior agent non
// basterebbe — sull'anagrafica ha i permessi.
const TEAM = [
  { id: "admin1",  name: "Admin",  role: "admin",  active: true, pending: false },
  { id: "driver1", name: "Driver", role: "driver", active: true, pending: false },
];

const statoBase = () => ({
  ...makeInitialState({ team: TEAM, currentUserId: "driver1" }),
  toasts: [],
  // Le entità devono ESISTERE: quasi tutti i case cercano prima la riga e
  // ritornano `state` intatto se non la trovano — un `return state` che il
  // test scambierebbe per un rifiuto muto, dando un falso allarme.
  tasks: [{
    id: TASK_ID, title: "Volo Roma", category: "booking", priority: "high",
    status: "todo", assignees: ["admin1"], comments: [], deletedAt: null,
  }],
  notices: [{ id: NOTICE_ID, text: "Avviso", author: "admin1", pinned: false }],
  clients: [{ id: CLIENT_ID, name: "Rossi" }],
});

// Il payload MINIMO che porta ogni azione fino al proprio controllo di
// permesso. Non è il payload reale dell'app: è quanto basta perché il case
// trovi la riga e arrivi al `_denied()`.
const PAYLOAD = {
  ADD_TASK:          { category: "booking", id: TASK_ID, title: "x" },
  ADD_TASKS_BULK:    [{ category: "booking", id: TASK_ID, title: "x" }],
  UPDATE_TASK:       { id: TASK_ID, title: "y" },
  MOVE_TASK:         { taskId: TASK_ID, newStatus: "doing" },
  DELETE_TASK:       TASK_ID,
  RESTORE_TASK:      TASK_ID,
  PURGE_TASK:        TASK_ID,
  ADD_COMMENT:       { taskId: TASK_ID, comment: { id: "c1", text: "ciao" } },
  UPDATE_NOTICE:     { id: NOTICE_ID, text: "y" },
  DELETE_NOTICE:     NOTICE_ID,
  TOGGLE_PIN_NOTICE: NOTICE_ID,
  ADD_CLIENT:        { id: CLIENT_ID, name: "Nuovo" },
  ADD_CLIENTS_BULK:  [{ id: CLIENT_ID, name: "Nuovo" }],
  UPDATE_CLIENT:     { id: CLIENT_ID, name: "Modificato" },
  DELETE_CLIENT:     CLIENT_ID,
};

const azioniConGuard = () => [
  ...Object.entries(PERSISTENCE),
  ...Object.entries(PERSISTENCE_ADMIN),
].filter(([, spec]) => spec.guard).map(([tipo]) => tipo);

const toastDiErrore = (stato) => (stato.toasts || []).filter(t => t.type === "error");

describe("permessi — ogni rifiuto ha una voce", () => {
  it("ogni entry con guard ha un payload in questo test", () => {
    // Il controllo che tiene il test onesto: senza, una entry nuova con guard
    // sarebbe semplicemente saltata dal caso qui sotto, e la copertura
    // scenderebbe in silenzio — che è il modo in cui questi test smettono di
    // servire. Le due di PERSISTENCE_ADMIN non hanno payload perché sono anche
    // in ADMIN_ONLY_ACTIONS: lì a negare è il wrapper del reducer, prima dello
    // switch, e il payload non viene mai letto.
    const senzaPayload = azioniConGuard()
      .filter(tipo => !(tipo in PAYLOAD) && !ADMIN_ONLY_ACTIONS.has(tipo));
    expect(senzaPayload).toEqual([]);
  });

  it.each(azioniConGuard())(
    "%s negata a un driver: il reducer alza un toast d'errore e non applica nulla",
    (tipo) => {
      const prima = statoBase();
      const dopo = reducer(prima, { type: tipo, payload: PAYLOAD[tipo] ?? {} });

      // 1. Il rifiuto si vede. È questa la riga su cui poggia il silenzio di
      //    useSalvataggio: senza toast, il rifiuto sarebbe muto.
      expect(toastDiErrore(dopo).length).toBeGreaterThan(toastDiErrore(prima).length);

      // 2. E il rifiuto è vero: nessuna delle tre collezioni è cambiata.
      //    Un toast d'errore accanto a una mutazione applicata sarebbe il
      //    difetto opposto — quello che le note su ADD_CLIENT/UPDATE_NOTICE
      //    nel reducer descrivono, e che questo test tiene chiuso da entrambi
      //    i lati.
      expect(dopo.tasks).toEqual(prima.tasks);
      expect(dopo.notices).toEqual(prima.notices);
      expect(dopo.clients).toEqual(prima.clients);
    },
  );

  it.each([...ADMIN_ONLY_ACTIONS])(
    "%s negata a un non-admin: il wrapper del reducer alza un toast d'errore",
    (tipo) => {
      const prima = statoBase();
      const dopo = reducer(prima, { type: tipo, payload: PAYLOAD[tipo] ?? {} });
      expect(toastDiErrore(dopo).length).toBeGreaterThan(toastDiErrore(prima).length);
    },
  );
});
