// useSyncedDispatch — orchestrazione fra reducer e Supabase.
//
// Copre il contratto che prima era sepolto nello switch da 283 righe di
// VoyageDesk.jsx: cosa viene dispatchato, quando parte una scrittura sul
// server, e cosa succede quando quella scrittura fallisce.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks:      { create: vi.fn(ok), createMany: vi.fn(ok), update: vi.fn(ok), softDelete: vi.fn(ok), restore: vi.fn(ok), hardDelete: vi.fn(ok), hardDeleteMany: vi.fn(ok) },
    Comments:   { create: vi.fn(ok) },
    Notices:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok), togglePin: vi.fn(ok) },
    Users:      { approve: vi.fn(ok), deleteUser: vi.fn(ok), setActive: vi.fn(ok), updateProfile: vi.fn(ok), updateContact: vi.fn(ok) },
    Clients:    { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
    Categories: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { useSyncedDispatch } = await import("../../hooks/useSyncedDispatch.js");
const { makeInitialState } = await import("../../state/reducer.js");
const { Tasks: TasksAPI, Clients: ClientsAPI, Users: UsersAPI, Categories: CategoriesAPI } = await import("../../lib/api.js");

const TEAM = [
  { id: "admin1",  name: "Admin",  role: "Admin",        active: true, pending: false },
  { id: "junior1", name: "Junior", role: "Junior Agent", active: true, pending: false },
];

const uuid = (n) => `${String(n).repeat(8)}-2222-4333-8444-555555555555`;

const task = (over = {}) => ({
  id: uuid(1), title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: ["junior1"], comments: [], ...over,
});

function setup({ uid = "admin1", tasks = [], clients = [], enabled = true } = {}) {
  const rawDispatch = vi.fn();
  const state = { ...makeInitialState({ team: TEAM, currentUserId: uid }), tasks, clients, toasts: [] };
  const view = renderHook(
    ({ s }) => useSyncedDispatch(s, rawDispatch, { enabled }),
    { initialProps: { s: state } },
  );
  return { dispatch: view.result.current, rawDispatch, state, view };
}

const azioniDispatchate = (rawDispatch) => rawDispatch.mock.calls.map(([a]) => a);
const nessunaChiamataApi = () =>
  [...Object.values(TasksAPI), ...Object.values(ClientsAPI)].every(fn => fn.mock.calls.length === 0);

beforeEach(() => { vi.clearAllMocks(); });

describe("useSyncedDispatch — modalità senza Supabase", () => {
  it("dispatcha al reducer e non tocca mai il server", async () => {
    const { dispatch, rawDispatch } = setup({ enabled: false });
    const res = await dispatch({ type: "ADD_TASK", payload: task() });

    expect(rawDispatch).toHaveBeenCalledTimes(1);
    expect(nessunaChiamataApi()).toBe(true);
    expect(res).toEqual({ error: null });
  });

  it("non normalizza l'id: senza DB non c'è nulla da tenere allineato", async () => {
    const { dispatch, rawDispatch } = setup({ enabled: false });
    await dispatch({ type: "ADD_TASK", payload: task({ id: "temp-1" }) });
    expect(azioniDispatchate(rawDispatch)[0].payload.id).toBe("temp-1");
  });
});

describe("useSyncedDispatch — percorso consentito", () => {
  it("normalizza il payload PRIMA del dispatch e persiste lo stesso id", async () => {
    const { dispatch, rawDispatch } = setup();
    await act(async () => { await dispatch({ type: "ADD_TASK", payload: task({ id: "temp-1" }) }); });

    const dispatchato = azioniDispatchate(rawDispatch)[0];
    expect(dispatchato.payload.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(TasksAPI.create).toHaveBeenCalledTimes(1);
    // L'id che finisce nello stato React e quello scritto sul DB devono
    // coincidere, altrimenti l'eco realtime creerebbe un doppione.
    expect(TasksAPI.create.mock.calls[0][0].id).toBe(dispatchato.payload.id);
  });

  it("ritorna { error: null } così i chiamanti possono concatenare (es. upload allegati)", async () => {
    const { dispatch } = setup({ tasks: [task()] });
    let res;
    await act(async () => { res = await dispatch({ type: "UPDATE_TASK", payload: { id: uuid(1), title: "X" } }); });
    expect(res).toEqual({ error: null });
  });

  it("un'azione senza entry nel registry resta puramente locale", async () => {
    const { dispatch, rawDispatch } = setup();
    await dispatch({ type: "SET_VIEW", payload: "calendar" });
    expect(rawDispatch).toHaveBeenCalledTimes(1);
    expect(nessunaChiamataApi()).toBe(true);
  });
});

describe("useSyncedDispatch — difesa in profondità sui permessi", () => {
  // Il punto centrale del refactor: un'azione che il reducer rifiuta non deve
  // nemmeno partire verso Supabase. Prima partiva comunque, lasciando la RLS
  // lato server come unica barriera.
  it("categoria vietata al Junior: nessuna scrittura sul server", async () => {
    const { dispatch, rawDispatch } = setup({ uid: "junior1" });
    await act(async () => { await dispatch({ type: "ADD_TASK", payload: task({ category: "payment" }) }); });

    expect(TasksAPI.create).not.toHaveBeenCalled();
    // Il reducer riceve comunque l'azione: è lui a produrre il toast di rifiuto.
    expect(rawDispatch).toHaveBeenCalledTimes(1);
  });

  it("un'azione negata ritorna un ERRORE, non un successo", async () => {
    // A-1 dell'audit del 4 settembre, ed è la lacuna che questo blocco aveva.
    // I casi qui attorno verificano tutti che nessuna chiamata parta verso il
    // server — vero, e insufficiente: nessuno guardava il valore RESTITUITO,
    // che era `{ error: null }`, cioè la risposta di una scrittura riuscita.
    // Chi attende quell'esito è `useSalvataggio`, il modo in cui quindici form
    // decidono se chiudersi: davanti a un successo chiudeva la modale buttando
    // via quanto l'utente aveva scritto.
    const { dispatch } = setup({ uid: "junior1" });
    let esito;
    await act(async () => { esito = await dispatch({ type: "ADD_TASK", payload: task({ category: "payment" }) }); });

    expect(esito.error).toBeTruthy();
    // Il `name` e non solo la presenza: è ciò che permette a useSalvataggio di
    // distinguere «non ti è permesso» da «la scrittura è fallita» e di non
    // aggiungere un «riprova» che qui sarebbe un consiglio sbagliato.
    expect(esito.error.name).toBe("PermessoNegato");
  });

  it("anche un'azione ADMIN-ONLY negata ritorna un errore", async () => {
    // L'altro dei due rami di `denied`: qui a negare non è il guard di una
    // entry ma ADMIN_ONLY_ACTIONS, e il valore di ritorno deve essere lo
    // stesso — per il chiamante le due negazioni sono la stessa cosa.
    const { dispatch } = setup({ uid: "junior1" });
    let esito;
    await act(async () => { esito = await dispatch({ type: "REMOVE_CATEGORY", payload: "booking" }); });

    expect(esito.error?.name).toBe("PermessoNegato");
  });

  it("quando l'azione è negata si dispatcha l'originale, non quella normalizzata", async () => {
    const { dispatch, rawDispatch } = setup({ uid: "junior1" });
    const originale = { type: "ADD_TASK", payload: task({ id: "temp-1", category: "admin" }) };
    await act(async () => { await dispatch(originale); });
    expect(azioniDispatchate(rawDispatch)[0]).toBe(originale);
  });

  it("task altrui in coda globale: il Junior non lo cancella nemmeno sul server", async () => {
    const { dispatch } = setup({ uid: "junior1", tasks: [task({ assignees: [] })] });
    await act(async () => { await dispatch({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(TasksAPI.softDelete).not.toHaveBeenCalled();
  });

  it("azione admin-only da un non-admin: bloccata prima della rete", async () => {
    const { dispatch } = setup({ uid: "junior1" });
    await act(async () => { await dispatch({ type: "REMOVE_CATEGORY", payload: "booking" }); });
    expect(nessunaChiamataApi()).toBe(true);
  });

  it("la stessa azione da un admin arriva al server", async () => {
    const { dispatch } = setup({ uid: "admin1", tasks: [task()] });
    await act(async () => { await dispatch({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(TasksAPI.softDelete).toHaveBeenCalledWith(uuid(1));
  });
});

describe("useSyncedDispatch — fallimenti di persistenza", () => {
  it("errore restituito: rollback dichiarato + toast d'errore", async () => {
    TasksAPI.createMany.mockResolvedValueOnce({ data: null, error: { message: "vincolo violato" } });
    const { dispatch, rawDispatch } = setup();

    await act(async () => {
      await dispatch({ type: "ADD_TASKS_BULK", payload: [task({ id: uuid(1) }), task({ id: uuid(2) })] });
    });

    // L'ordine è parte del contratto: la marcatura precede la scrittura e la
    // liberazione segue il rollback, così una ri-idratazione concorrente non
    // può sovrascrivere né lo stato ottimistico né la sua compensazione.
    // `RETRACT_TOASTS` sta fra il rollback e il toast d'errore (B-2): ritira il
    // successo ottimistico DOPO la compensazione — che riporterebbe indietro
    // anche lui — e PRIMA dell'errore che lo smentisce.
    const tipi = azioniDispatchate(rawDispatch).map(a => a.type);
    expect(tipi).toEqual([
      "ADD_TASKS_BULK", "MARK_PENDING_WRITE",
      "ROLLBACK_TASKS_BULK", "RETRACT_TOASTS", "SHOW_TOAST", "UNMARK_PENDING_WRITE",
    ]);

    const rollback = azioniDispatchate(rawDispatch)[2];
    expect(rollback.payload).toEqual([uuid(1), uuid(2)]);

    const toast = azioniDispatchate(rawDispatch).find(a => a.type === "SHOW_TOAST");
    expect(toast.payload.type).toBe("error");
    expect(toast.payload.message).toContain("vincolo violato");
  });

  it("promise rigettata: toast con il fallback 'errore di rete'", async () => {
    // ADD_CATEGORY non ha mapError (né rollback, vedi il test sotto — B-3
    // dell'audit del 2 settembre): è l'azione giusta per il fallback GENERICO
    // dell'infrastruttura, che altrimenti finirebbe coperto dal mapError
    // specifico di una entry. Era ADD_COMMENT finché A-1 dello stesso audit
    // non le ha dato entrambi.
    CategoriesAPI.create.mockRejectedValueOnce(new Error(""));
    const { dispatch, rawDispatch } = setup();

    let res;
    await act(async () => {
      res = await dispatch({ type: "ADD_CATEGORY", payload: { key: "test", label: "Test" } });
    });

    const toast = azioniDispatchate(rawDispatch).find(a => a.type === "SHOW_TOAST");
    expect(toast.payload.message).toContain("errore di rete");
    expect(res.error).toBeInstanceOf(Error);
  });

  it("mapError sostituisce il messaggio Postgres grezzo con uno actionable", async () => {
    ClientsAPI.remove.mockResolvedValueOnce({
      error: { code: "23503", message: 'violates foreign key constraint "liste_viaggio_client_id_fkey"' },
    });
    const cliente = { id: "c1", name: "Rossi" };
    const { dispatch, rawDispatch } = setup({ clients: [cliente] });

    await act(async () => { await dispatch({ type: "DELETE_CLIENT", payload: "c1" }); });

    // Le azioni si cercano per TIPO e non per posizione: da A-1 del terzo
    // passaggio anche DELETE_CLIENT dichiara `entityId`, quindi fra l'azione
    // e la sua compensazione c'è ora un MARK_PENDING_WRITE. Un indice fisso
    // qui avrebbe fatto fallire un test che verifica tutt'altro.
    const azioni = azioniDispatchate(rawDispatch);
    expect(azioni.find(a => a.type === "RESTORE_CLIENT")).toEqual({
      type: "RESTORE_CLIENT", payload: cliente, meta: { compensazione: true },
    });
    const toastErrore = azioni.find(a => a.type === "SHOW_TOAST");
    expect(toastErrore.payload.message).toMatch(/liste viaggio collegate/i);
    expect(toastErrore.payload.message).not.toMatch(/foreign key/i);
  });

  it("senza rollback dichiarato si mostra solo il toast", async () => {
    // A-1 dell'audit del 1 settembre ha dato un rollback a tutte le mutazioni
    // sui task (era 1 entry su 8), e A-1 del 2 settembre ha chiuso le ultime
    // due del registro senza (ADD_NOTICE, ADD_COMMENT — vedi
    // docs/AUDIT_ARCHITETTURA_SICUREZZA_2026-09-02.md). Le cinque voci di
    // categorie/template restano senza per scelta dichiarata (B-3 dello
    // stesso audit: tabelle di configurazione, scritte dai soli admin, senza
    // sottoscrizione realtime concorrente): ADD_CATEGORY è quindi l'azione
    // giusta per verificare questo percorso.
    CategoriesAPI.create.mockResolvedValueOnce({ error: { message: "boom" } });
    const { dispatch, rawDispatch } = setup();

    await act(async () => {
      await dispatch({ type: "ADD_CATEGORY", payload: { key: "test", label: "Test" } });
    });

    // Nessun rollback, ma il ritiro del toast ottimistico c'è comunque: è
    // l'altra metà di B-2, quella che la compensazione da sola non copre.
    // Niente MARK/UNMARK_PENDING_WRITE: ADD_CATEGORY non dichiara `entityId`
    // (nessuna sottoscrizione concorrente da cui difendersi, vedi sopra).
    expect(azioniDispatchate(rawDispatch).map(a => a.type))
      .toEqual(["ADD_CATEGORY", "RETRACT_TOASTS", "SHOW_TOAST"]);
  });

  // M-2 dell'audit del 14 agosto (secondo passaggio): RENAME_CLIENT_IN_TASKS
  // è passata da Promise.all (un solo errore fa fallire l'intero fan-out,
  // esito degli altri N-1 ignoto) a Promise.allSettled con compensazione
  // mirata sui soli id falliti — l'orchestratore deve accorgersi comunque
  // dell'errore, e il messaggio ora conta quanti invece di riportare il testo
  // grezzo di Postgrest.
  it("un update fallito su N non impedisce agli altri di procedere, e il toast conta quanti", async () => {
    TasksAPI.update
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "riga bloccata" } });
    const tasks = [
      task({ id: uuid(1), client: "Rossi Mario", assignees: ["junior1"] }),
      task({ id: uuid(2), client: "rossi  mario", assignees: ["junior1"] }),
    ];
    const { dispatch, rawDispatch } = setup({ tasks });

    await act(async () => {
      await dispatch({ type: "RENAME_CLIENT_IN_TASKS", payload: { from: "Rossi Mario", to: "Bianchi" } });
    });

    expect(TasksAPI.update).toHaveBeenCalledTimes(2); // entrambi tentati, nessuno short-circuit
    const toast = azioniDispatchate(rawDispatch).find(a => a.type === "SHOW_TOAST");
    expect(toast.payload.message).toContain("1 task su 2 non aggiornati");
  });

  it("il task fallito torna al nome PRECEDENTE, quello riuscito resta rinominato", async () => {
    TasksAPI.update
      .mockResolvedValueOnce({ error: { message: "riga bloccata" } })
      .mockResolvedValueOnce({ error: null });
    const tasks = [
      task({ id: uuid(1), client: "Rossi Mario", assignees: ["junior1"] }),
      task({ id: uuid(2), client: "rossi  mario", assignees: ["junior1"] }),
    ];
    const { dispatch, rawDispatch } = setup({ tasks });

    await act(async () => {
      await dispatch({ type: "RENAME_CLIENT_IN_TASKS", payload: { from: "Rossi Mario", to: "Bianchi" } });
    });

    const undo = azioniDispatchate(rawDispatch).find(a => a.type === "ROLLBACK_RENAME_CLIENT_IN_TASKS");
    expect(undo).toBeTruthy();
    expect(undo.payload).toEqual({ ids: [uuid(1)], from: "Rossi Mario" });
    expect(undo.meta.compensazione).toBe(true);
  });

  it("se tutte le update riescono non c'è alcun rollback", async () => {
    const tasks = [task({ id: uuid(1), client: "Rossi Mario", assignees: ["junior1"] })];
    const { dispatch, rawDispatch } = setup({ tasks });

    await act(async () => {
      await dispatch({ type: "RENAME_CLIENT_IN_TASKS", payload: { from: "Rossi Mario", to: "Bianchi" } });
    });

    expect(azioniDispatchate(rawDispatch).some(a => a.type === "ROLLBACK_RENAME_CLIENT_IN_TASKS")).toBe(false);
    expect(azioniDispatchate(rawDispatch).some(a => a.type === "SHOW_TOAST")).toBe(false);
  });

  // ─── M-1 · i rollback non si annunciano come successi ─────────────────────
  // Il rollback di UPDATE_OWN_PROFILE è un altro UPDATE_OWN_PROFILE: il case
  // del reducer non sa di essere una compensazione e accodava il proprio
  // "Profilo aggiornato!" accanto all'errore, che nella pila (cap 3) restano
  // fianco a fianco — e il primo è quello a cui l'utente crede. Il flag lo
  // mette l'orchestratore perché descrive il percorso, non l'azione.
  it("marca il rollback con meta.compensazione", async () => {
    UsersAPI.updateProfile.mockResolvedValueOnce({ error: { message: "rls" } });
    const { dispatch, rawDispatch } = setup();

    await act(async () => {
      await dispatch({ type: "UPDATE_OWN_PROFILE", payload: { name: "Nuovo" } });
    });

    const undo = azioniDispatchate(rawDispatch).find(
      (a, i) => i > 0 && a.type === "UPDATE_OWN_PROFILE",
    );
    expect(undo?.meta?.compensazione).toBe(true);
  });

  it("l'azione originale NON è marcata come compensazione", async () => {
    const { dispatch, rawDispatch } = setup();
    await act(async () => {
      await dispatch({ type: "UPDATE_OWN_PROFILE", payload: { name: "Nuovo" } });
    });
    expect(azioniDispatchate(rawDispatch)[0].meta).toBeUndefined();
  });

  // ─── M-4 · EMPTY_TRASH ────────────────────────────────────────────────────
  it("EMPTY_TRASH purga in blocco e, se fallisce, rimette i task in lista", async () => {
    TasksAPI.hardDeleteMany.mockResolvedValueOnce({ error: { message: "riga bloccata" } });
    const cestinati = [
      { ...task({ id: uuid(1) }), deletedAt: "2026-01-01T10:00:00Z" },
      { ...task({ id: uuid(2) }), deletedAt: "2026-01-01T10:00:00Z" },
    ];
    const { dispatch, rawDispatch } = setup({ tasks: cestinati });

    await act(async () => { await dispatch({ type: "EMPTY_TRASH" }); });

    // Una chiamata sola con tutti gli id, non una per task.
    expect(TasksAPI.hardDeleteMany).toHaveBeenCalledTimes(1);
    expect(TasksAPI.hardDeleteMany.mock.calls[0][0]).toEqual([uuid(1), uuid(2)]);

    const azioni = azioniDispatchate(rawDispatch);
    const undo = azioni.find(a => a.type === "ROLLBACK_EMPTY_TRASH");
    // Gli oggetti interi, non gli id: la purge non ha un inverso sul server da
    // cui rileggere i task.
    expect(undo.payload.map(t => t.id)).toEqual([uuid(1), uuid(2)]);
    expect(undo.meta.compensazione).toBe(true);
    expect(azioni.find(a => a.type === "SHOW_TOAST").payload.message).toContain("riga bloccata");
  });

  it("EMPTY_TRASH riuscito non dispatcha nessun rollback", async () => {
    const cestinati = [{ ...task({ id: uuid(1) }), deletedAt: "2026-01-01T10:00:00Z" }];
    const { dispatch, rawDispatch } = setup({ tasks: cestinati });

    await act(async () => { await dispatch({ type: "EMPTY_TRASH" }); });

    expect(azioniDispatchate(rawDispatch).map(a => a.type)).toEqual(["EMPTY_TRASH"]);
  });

  // ─── Suggerimento strategico n. 3 · TOGGLE_TEAM_MEMBER_ACTIVE ──────────────
  // "Disattivare" ora chiama la Edge Function set-user-active (ban lato auth),
  // non più una scrittura diretta sulla tabella: qui si copre l'orchestrazione
  // vera, dal guard al rollback, passando dallo stesso useSyncedDispatch che
  // gira in produzione.
  it("un admin disattiva un altro membro: la Edge Function riceve l'id giusto", async () => {
    const { dispatch, rawDispatch } = setup();
    await act(async () => { await dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "junior1" }); });

    expect(UsersAPI.setActive).toHaveBeenCalledWith("junior1", false); // junior1 parte attivo
    // A-3 (audit del 28 agosto): la coppia di marcatura è entrata qui il giorno
    // in cui il team ha smesso di essere l'entità realtime senza scritture in
    // volo. Restano assenti le due che questo caso sorveglia — nessun rollback
    // e nessun toast d'errore su una scrittura riuscita.
    expect(azioniDispatchate(rawDispatch).map(a => a.type)).toEqual([
      "TOGGLE_TEAM_MEMBER_ACTIVE", "MARK_PENDING_WRITE", "UNMARK_PENDING_WRITE",
    ]);
  });

  it("un admin non può disattivare se stesso: il guard blocca PRIMA della rete", async () => {
    const { dispatch, rawDispatch } = setup();
    await act(async () => { await dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "admin1" }); });

    expect(UsersAPI.setActive).not.toHaveBeenCalled();
    const azioni = azioniDispatchate(rawDispatch);
    expect(azioni).toHaveLength(1);
    expect(azioni[0]).toEqual({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "admin1" });
  });

  it("se la Edge Function fallisce, il rollback ritoggla e si marca come compensazione", async () => {
    UsersAPI.setActive.mockResolvedValueOnce({ error: { message: "sessione non revocata" } });
    const { dispatch, rawDispatch } = setup();

    await act(async () => { await dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "junior1" }); });

    const azioni = azioniDispatchate(rawDispatch);
    const undo = azioni.find((a, i) => i > 0 && a.type === "TOGGLE_TEAM_MEMBER_ACTIVE");
    expect(undo).toEqual({
      type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "junior1",
      meta: { compensazione: true },
    });
    expect(azioni.find(a => a.type === "SHOW_TOAST").payload.message).toContain("sessione non revocata");
  });
});

describe("useSyncedDispatch — identità stabile", () => {
  // Se `dispatch` cambiasse identità a ogni mutazione dello state, ogni figlio
  // che lo riceve come prop si invaliderebbe: è la ragione per cui lo state
  // viaggia in un ref invece che nelle deps della useCallback.
  it("non cambia riferimento quando lo state cambia", () => {
    const rawDispatch = vi.fn();
    const s1 = { ...makeInitialState({ team: TEAM, currentUserId: "admin1" }), tasks: [] };
    const { result, rerender } = renderHook(
      ({ s }) => useSyncedDispatch(s, rawDispatch, { enabled: true }),
      { initialProps: { s: s1 } },
    );
    const primo = result.current;
    rerender({ s: { ...s1, tasks: [task()] } });
    expect(result.current).toBe(primo);
  });

  it("legge comunque lo state aggiornato dopo un re-render", async () => {
    const rawDispatch = vi.fn();
    const s1 = { ...makeInitialState({ team: TEAM, currentUserId: "junior1" }), tasks: [] };
    const { result, rerender } = renderHook(
      ({ s }) => useSyncedDispatch(s, rawDispatch, { enabled: true }),
      { initialProps: { s: s1 } },
    );

    // Il task non esiste ancora: il guard nega, niente rete.
    await act(async () => { await result.current({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(TasksAPI.softDelete).not.toHaveBeenCalled();

    // Dopo il re-render il task c'è ed è del Junior: ora passa.
    rerender({ s: { ...s1, tasks: [task({ assignees: ["junior1"] })] } });
    await act(async () => { await result.current({ type: "DELETE_TASK", payload: uuid(1) }); });
    expect(TasksAPI.softDelete).toHaveBeenCalledWith(uuid(1));
  });
});
