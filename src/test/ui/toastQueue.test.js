import { describe, it, expect, beforeEach } from "vitest";
import { reducer, makeInitialState } from "../../state/reducer.js";

// Team di prova: un admin (marco) e una junior agent (gina), come in
// reducer.test.js. Qui i test sono mirati solo alla coda `state.toasts`.
const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "gina", name: "Gina", role: "junior agent", active: true, pending: false },
];

function freshState(uid = "marco") {
  return makeInitialState({ team: TEAM_FIXTURE, currentUserId: uid });
}

describe("reducer — coda dei toast", () => {
  let s;
  beforeEach(() => { s = freshState("marco"); });

  it("makeInitialState() produce toasts: [] e non più toast: null", () => {
    expect(s.toasts).toEqual([]);
    expect(s.toast).toBeUndefined();
  });

  it("SHOW_TOAST accoda invece di sovrascrivere", () => {
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Primo", type: "success" } });
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Secondo", type: "error" } });
    expect(s.toasts).toHaveLength(2);
    expect(s.toasts.map(t => t.message)).toEqual(["Primo", "Secondo"]);
  });

  it("dedup: due SHOW_TOAST con lo stesso messaggio lasciano un solo elemento", () => {
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Rete assente", type: "error" } });
    const primoId = s.toasts[0].id;
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Rete assente", type: "error" } });
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0].message).toBe("Rete assente");
    // Il duplicato non è ignorato: viene rimpiazzato con un id fresco (nuovo tentativo).
    expect(s.toasts[0].id).not.toBe(primoId);
  });

  it("cap a 3: il quarto SHOW_TOAST fa sparire il più vecchio", () => {
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Uno", type: "error" } });
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Due", type: "error" } });
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Tre", type: "error" } });
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Quattro", type: "error" } });
    expect(s.toasts).toHaveLength(3);
    expect(s.toasts.map(t => t.message)).toEqual(["Due", "Tre", "Quattro"]);
  });

  it("CLEAR_TOAST rimuove solo il toast con l'id indicato", () => {
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Uno", type: "error" } });
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Due", type: "success" } });
    const [primo, secondo] = s.toasts;
    s = reducer(s, { type: "CLEAR_TOAST", payload: primo.id });
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0].id).toBe(secondo.id);
  });

  it("CLEAR_TOAST con un id non presente non tocca la coda", () => {
    s = reducer(s, { type: "SHOW_TOAST", payload: { message: "Uno", type: "error" } });
    const next = reducer(s, { type: "CLEAR_TOAST", payload: "id-inesistente" });
    expect(next.toasts).toEqual(s.toasts);
  });

  // Il caso concreto che motiva tutto il refactor: un successo non ancora
  // letto (es. l'ultimo salvataggio andato a buon fine) non deve sparire
  // solo perché arriva un'azione negata per permessi subito dopo.
  it("un'azione negata per permessi accoda un errore senza cancellare un successo preesistente", () => {
    let gina = freshState("gina");
    gina = reducer(gina, { type: "ADD_TASK", payload: {
      id: "11111111-2222-4333-8444-555555555555", title: "Volo Roma", category: "booking",
      priority: "high", status: "todo", assignees: ["gina"], comments: [],
    } });
    expect(gina.toasts).toHaveLength(1);
    expect(gina.toasts[0].type).toBe("success");

    // SET_VIEW verso "admin" da non-admin passa da _denied: prima del refactor
    // avrebbe sovrascritto il successo appena prodotto sopra.
    const next = reducer(gina, { type: "SET_VIEW", payload: "admin" });
    expect(next.toasts).toHaveLength(2);
    expect(next.toasts[0].type).toBe("success");
    expect(next.toasts[1].type).toBe("error");
  });

  it("un'azione ADMIN_ONLY negata (guard del wrapper) accoda invece di sovrascrivere", () => {
    let gina = freshState("gina");
    gina = reducer(gina, { type: "SHOW_TOAST", payload: { message: "Salvataggio riuscito", type: "success" } });
    expect(gina.toasts).toHaveLength(1);

    const next = reducer(gina, { type: "ADD_CATEGORY", payload: { key: "x", label: "X" } });
    expect(next.toasts).toHaveLength(2);
    expect(next.toasts[0]).toMatchObject({ message: "Salvataggio riuscito", type: "success" });
    expect(next.toasts[1]).toMatchObject({ type: "error" });
    expect(next.categories.x).toBeUndefined();
  });
});

// ─── B-2 · il successo ottimistico si RITIRA quando il server smentisce ────
// L'UI ottimistica accoda «Task aggiornato!» nel reducer, cioè prima che la
// scrittura parta. Se fallisce, l'utente vedeva in colonna «Task aggiornato!»
// e «Salvataggio fallito: …» — due affermazioni contraddittorie, con quella
// FALSA in cima. In un gestionale dove si registrano movimenti di denaro
// «credo di aver salvato» è il difetto più costoso possibile.
describe("reducer — ritiro del toast smentito (B-2)", () => {
  const TASK = {
    id: "t1", title: "Pratica Rossi", status: "todo", category: "booking",
    priority: "medium", assignees: ["marco"], comments: [],
  };
  const conTask = () => ({ ...freshState("marco"), tasks: [TASK] });

  it("ogni toast porta l'azione che l'ha prodotto", () => {
    const s = reducer(conTask(), { type: "UPDATE_TASK", payload: { id: "t1", title: "X" } });
    expect(s.toasts.at(-1)).toMatchObject({ message: "Task aggiornato!", azione: "UPDATE_TASK" });
  });

  it("RETRACT_TOASTS toglie il successo di QUELL'azione", () => {
    let s = reducer(conTask(), { type: "UPDATE_TASK", payload: { id: "t1", title: "X" } });
    s = reducer(s, { type: "RETRACT_TOASTS", payload: "UPDATE_TASK" });
    expect(s.toasts).toHaveLength(0);
  });

  it("non tocca i successi di un'ALTRA azione andata a buon fine", () => {
    // Ritirare tutti i successi a schermo sarebbe la stessa bugia al contrario:
    // «Task creato con successo!» è vero, la scrittura è arrivata.
    let s = reducer(conTask(), { type: "ADD_TASK", payload: { ...TASK, id: "t2", title: "Nuova" } });
    s = reducer(s, { type: "UPDATE_TASK", payload: { id: "t1", title: "X" } });
    s = reducer(s, { type: "RETRACT_TOASTS", payload: "UPDATE_TASK" });
    expect(s.toasts.map(t => t.message)).toEqual(["Task creato con successo!"]);
  });

  it("non tocca gli ERRORI, nemmeno della stessa azione", () => {
    // Un rifiuto per permessi è un fatto già accaduto: si ritira ciò che il
    // server non ha confermato, non ciò che ha respinto.
    let s = reducer(freshState("gina"), { type: "UPDATE_TASK", payload: { id: "t1", title: "X" } });
    s = reducer({ ...s, tasks: [TASK] }, { type: "SHOW_TOAST", payload: { message: "Salvataggio fallito: rete", type: "error" } });
    s = reducer(s, { type: "RETRACT_TOASTS", payload: "SHOW_TOAST" });
    expect(s.toasts.map(t => t.message)).toEqual(["Salvataggio fallito: rete"]);
  });

  it("su una coda che non contiene niente di quell'azione non cambia nulla", () => {
    const s = freshState("marco");
    expect(reducer(s, { type: "RETRACT_TOASTS", payload: "UPDATE_TASK" }).toasts).toEqual([]);
  });
});
