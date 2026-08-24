// src/test/selectedTaskRealtime.test.js
//
// A-1 · `selectedTask` deve seguire il realtime come `tasks`.
//
// IL DIFETTO CHE QUESTI CASI CHIUDONO. Il reducer aggiorna `selectedTask`
// insieme a `tasks` per le azioni LOCALI (UPDATE_TASK, ADD_COMMENT,
// DELETE_TASK, RENAME_CLIENT_IN_TASKS, UNDO_LAST_ACTION), ma NON per le due
// che portano dentro lo stato ciò che è cambiato sul server: `SET_TASKS` (il
// refetch, da idratazione e da evento realtime) e `MERGE_TASK_ROW` (la singola
// riga). Con lo slide-over aperto, quindi, `state.tasks` si aggiornava e
// `state.selectedTask` restava all'istantanea presa all'apertura.
//
// PERCHÉ CONTA, e perché non è solo cosmetico. `TaskSlideOver` calcola
// `editable = canEditTask(task, currentUserId)` su quell'istantanea, e passa il
// verdetto a `TaskAttachments` come prop `editable`. Gli allegati sono l'unica
// scrittura dell'app che NON passa dal registry di persistenza — e non è una
// dimenticanza, i file vivono nello storage e non nel reducer (vedi
// VIETATE_ENTITA_DELLO_STATE in eslint.config.js, che li esenta di proposito).
// Ma il registry prende i suoi verdetti su `state.tasks`
// (`state.tasks.find(...)` in ogni guard), mentre questo percorso li prendeva
// su `state.selectedTask`: due fonti diverse per la stessa domanda, e solo una
// delle due seguiva il server.
//
// Conseguenza concreta: A apre un task che gli è assegnato, B lo riassegna a C,
// l'evento realtime arriva e aggiorna `tasks` — ma A continua a vedere il
// cestino sugli allegati e la dropzone, perché il suo `selectedTask` dice
// ancora che il task è suo. La RLS dello storage rifiuta comunque la scrittura
// (migrazione 20260629210727), quindi non è un buco di sicurezza: è un comando
// offerto e poi negato dal server, cioè il difetto peggiore da diagnosticare
// per chi lo usa.
//
// La bozza dei campi testo NON è a rischio: `TaskSlideOver` la risincronizza
// su `task?.id` e non sull'oggetto, quindi un aggiornamento del task aperto non
// tocca ciò che si sta digitando (vedi il useEffect con la deps `[task?.id]`).

import { describe, it, expect, beforeEach } from "vitest";
import { reducer, makeInitialState } from "../state/reducer.js";

const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina", role: "junior agent", active: true, pending: false },
  { id: "lea", name: "Lea", role: "junior agent", active: true, pending: false },
];

const UUID = "11111111-2222-4333-8444-555555555555";
const ALTRO = "99999999-2222-4333-8444-555555555555";

const task = (over = {}) => ({
  id: UUID, title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["gina"], comments: [], ...over,
});

// Stato con un task in elenco e lo slide-over aperto su quello stesso task.
function conSlideOverAperto(uid = "gina", over = {}) {
  const s = makeInitialState({ team: TEAM_FIXTURE, currentUserId: uid });
  const t = task(over);
  return { ...s, tasks: [t], selectedTask: t };
}

describe("SET_TASKS — il task aperto segue il refetch", () => {
  let s;
  beforeEach(() => { s = conSlideOverAperto("gina"); });

  it("aggiorna selectedTask quando il refetch porta una versione nuova", () => {
    const aggiornato = task({ title: "Volo Milano", assignees: ["lea"] });
    const next = reducer(s, { type: "SET_TASKS", payload: [aggiornato] });

    expect(next.tasks[0].assignees).toEqual(["lea"]);
    // Il punto del caso: prima restava ["gina"], cioè il verdetto di permesso
    // dello slide-over si sarebbe preso su un dato che il server ha smentito.
    expect(next.selectedTask.assignees).toEqual(["lea"]);
    expect(next.selectedTask.title).toBe("Volo Milano");
  });

  it("chiude lo slide-over se il task aperto non c'è più nel corpus", () => {
    const next = reducer(s, { type: "SET_TASKS", payload: [] });
    expect(next.selectedTask).toBeNull();
  });

  // L'invariante nella sua forma più forte, ed è QUESTA che va tenuta: non
  // «selectedTask ha lo stesso contenuto della riga», ma «selectedTask È la
  // riga». Un confronto per contenuto lascerebbe passare due oggetti
  // equivalenti oggi e divergenti domani; l'identità no. È anche ciò che rende
  // impossibile, per costruzione, che il verdetto di `canEditTask` calcolato
  // sul pannello differisca da quello che i guard del registry calcolano su
  // `state.tasks`.
  it("selectedTask È la riga di tasks, non una copia equivalente", () => {
    const next = reducer(s, { type: "SET_TASKS", payload: [task()] });
    expect(next.selectedTask).toBe(next.tasks[0]);
  });

  it("lascia selectedTask a null quando nessuno slide-over è aperto", () => {
    const chiuso = { ...s, selectedTask: null };
    const next = reducer(chiuso, { type: "SET_TASKS", payload: [task()] });
    expect(next.selectedTask).toBeNull();
  });

});

describe("MERGE_TASK_ROW — il task aperto segue la singola riga", () => {
  let s;
  beforeEach(() => { s = conSlideOverAperto("gina"); });

  it("aggiorna selectedTask sull'UPDATE della riga aperta", () => {
    const next = reducer(s, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: UUID, row: task({ assignees: ["lea"], status: "in_progress" }) },
    });
    expect(next.selectedTask.assignees).toEqual(["lea"]);
    expect(next.selectedTask.status).toBe("in_progress");
  });

  it("preserva i commenti, che non sono una colonna di tasks", () => {
    const conCommenti = { ...task(), comments: [{ id: "c1", text: "ciao" }] };
    const stato = { ...s, tasks: [conCommenti], selectedTask: conCommenti };
    const next = reducer(stato, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: UUID, row: task({ title: "Rinominato" }) },
    });
    expect(next.selectedTask.title).toBe("Rinominato");
    expect(next.selectedTask.comments).toHaveLength(1);
  });

  it("chiude lo slide-over sul DELETE della riga aperta", () => {
    const next = reducer(s, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "DELETE", id: UUID },
    });
    expect(next.selectedTask).toBeNull();
  });

  it("non tocca selectedTask per un evento su un ALTRO task", () => {
    // `s.selectedTask` e non un `task()` nuovo: la precondizione del caso è che
    // l'invariante VALGA già prima del dispatch (il pannello è la riga in
    // elenco). Ricostruendo il task si partirebbe da uno stato che l'invariante
    // deve correggere, e il caso misurerebbe quella correzione invece
    // dell'indifferenza all'evento su un altro id.
    const stato = { ...s, tasks: [s.selectedTask, task({ id: ALTRO, title: "Altro" })] };
    const next = reducer(stato, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: ALTRO, row: task({ id: ALTRO, title: "Altro rinominato" }) },
    });
    expect(next.selectedTask).toBe(stato.selectedTask);
  });

  it("una scrittura in volo sul task aperto vince sull'evento realtime", () => {
    // Stessa invariante di `tasks` (state/pendingWrites.js): fra il dispatch
    // ottimistico e il commit, l'eco del server è più VECCHIA della nostra
    // versione locale. Se `selectedTask` la accettasse mentre `tasks` la
    // scarta, le due divergerebbero — che è esattamente il difetto che questo
    // file chiude, al contrario.
    const inVolo = { ...s, pendingWrites: new Set([UUID]) };
    const next = reducer(inVolo, {
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", id: UUID, row: task({ assignees: ["lea"] }) },
    });
    expect(next.selectedTask.assignees).toEqual(["gina"]);
    expect(next.selectedTask).toBe(inVolo.selectedTask);
  });
});
