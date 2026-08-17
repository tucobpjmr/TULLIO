// Granularità del realtime: ricaricare SOLO ciò che l'evento può aver
// invalidato, e non lasciare fuori nessuna entità di dominio.
//
// Due correzioni sono blindate qui, ed entrambe hanno la stessa forma: un
// comportamento che era corretto quando i dati erano pochi e non lo è più.
//
//   A-1  useDebouncedTableSubscription non diceva a chi ricarica QUALE tabella
//        avesse generato l'evento, quindi chi si sottoscrive a più tabelle era
//        costretto a ricaricare tutto per costruzione. Nel modulo Liste questo
//        significava: ogni movimento registrato — l'operazione più frequente
//        del modulo — scaricava l'elenco completo delle liste e il cestino
//        completo su ogni client connesso.
//
//   A-2  `clients` era l'unica entità senza subscription. Un cliente creato da
//        un altro utente non arrivava MAI in sessione, e il sintomo era il
//        doppione in anagrafica (l'autocomplete non lo trovava e l'utente lo
//        ricreava a mano), non un dato visibilmente mancante.
//
//   B-1  Lo stesso di A-1 sui task: `useAppHydration` si sottoscriveva a tre
//        tabelle (tasks, comments, task_history) e ricaricava il grafo
//        completo per ognuna. Un commento aggiunto faceva girare
//        TASK_SELECT_WITH_COMMENTS — join sui nomi, cestino incluso, nessuna
//        paginazione — su ogni client connesso. Le tabelle sono poi diventate
//        DUE (A-3, passo 3): `task_history` è uscita del tutto, vedi il caso
//        dedicato più sotto.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// ─── Doppi ───────────────────────────────────────────────────────────────────
// subscribeToTable registra gli handler per tabella, così i test possono
// emettere un evento su una tabella specifica — che è precisamente ciò che le
// correzioni qui sopra rendono distinguibile.
const handlers = new Map();
const subscribeToTable = vi.fn((tabella, handler) => {
  handlers.set(tabella, handler);
  return () => handlers.delete(tabella);
});
const emetti = (tabella, payload = { eventType: "INSERT", new: {} }) =>
  handlers.get(tabella)?.(payload);

const ListeAPI = {
  list: vi.fn(async () => ({ data: [{ id: "l1" }], error: null })),
  listTrash: vi.fn(async () => ({ data: [{ id: "l2" }], error: null })),
  saldi: vi.fn(async () => ({ data: [{ lista_id: "l1", saldo: 10 }], error: null })),
};

// Le API di dominio che useAppHydration idrata. Solo `tasks` e le sue due
// tabelle figlie hanno un comportamento da verificare qui (B-1); le altre
// esistono perché l'hook le sottoscrive comunque al mount.
const vuoto = async () => ({ data: [], error: null });
const TasksAPI = { list: vi.fn(async () => ({ data: [{ id: "t1", title: "Volo" }], error: null })) };
const TaskThreadsAPI = {
  comments: vi.fn(async () => ({ data: [{ id: "k1", task_id: "t1", text: "ok", created_at: "2026-08-01T10:00:00Z", users: { name: "Marco" } }], error: null })),
  // A-3 (passo 3): non è più una lettura per corpus, e soprattutto non è più
  // una lettura di questo hook. Resta nel doppio per poter asserire che
  // useAppHydration NON la chiami mai.
  historyForTask: vi.fn(async () => ({ data: [], error: null })),
};
const NoticesAPI = { list: vi.fn(vuoto) };
const UsersAPI = { listAll: vi.fn(vuoto), getContacts: vi.fn(async () => ({ data: null })) };
const ClientsAPI = { list: vi.fn(vuoto) };
const CategoriesAPI = { list: vi.fn(vuoto) };
const MessageTemplatesAPI = { list: vi.fn(vuoto) };

// ST-4: la chat, come i task (B-1), ricaricava tutto a ogni evento su
// `messages` o `conversations`. `ConversationsAPI` conta le chiamate a
// listMine: è il costo che un messaggio nuovo non deve più generare.
const ConversationsAPI = { listMine: vi.fn(vuoto) };
const MessagesAPI = { listAll: vi.fn(vuoto) };

vi.mock("../lib/api.js", () => ({
  subscribeToTable: (...a) => subscribeToTable(...a),
  Tasks: TasksAPI,
  TaskThreads: TaskThreadsAPI,
  Notices: NoticesAPI,
  Users: UsersAPI,
  Clients: ClientsAPI,
  Categories: CategoriesAPI,
  MessageTemplates: MessageTemplatesAPI,
  Conversations: ConversationsAPI,
  Messages: MessagesAPI,
}));
vi.mock("../components/liste/listeApi.js", () => ({ ListeAPI }));

const { useDebouncedTableSubscription } = await import("../hooks/useDebouncedTableSubscription.js");
const { useListeData } = await import("../components/liste/useListeData.js");
const { useAppHydration } = await import("../hooks/useAppHydration.js");
const { useChatData } = await import("../hooks/useChatData.js");

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  ListeAPI.list.mockResolvedValue({ data: [{ id: "l1" }], error: null });
  ListeAPI.listTrash.mockResolvedValue({ data: [{ id: "l2" }], error: null });
  ListeAPI.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 10 }], error: null });
  ConversationsAPI.listMine.mockResolvedValue({
    data: [{ id: "c1", updated_at: "2026-08-01T10:00:00Z" }], error: null,
  });
  MessagesAPI.listAll.mockResolvedValue({ data: [], error: null });
});

describe("useDebouncedTableSubscription — quale tabella ha generato l'evento", () => {
  it("l'idratazione iniziale riceve null, non un Set vuoto", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    // I due casi devono restare distinguibili: "nessun evento, carica tutto"
    // non è "eventi da un insieme vuoto di tabelle", che non esiste.
    expect(reload.mock.calls[0][1]).toBeNull();
  });

  it("passa a reload solo le tabelle che hanno davvero emesso", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 1 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("b");
      await new Promise(r => setTimeout(r, 20));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect([...reload.mock.calls[1][1]]).toEqual(["b"]);
  });

  it("coalesce più tabelle nella stessa finestra di debounce", async () => {
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 5 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => {
      emetti("a"); emetti("b"); emetti("a");
      await new Promise(r => setTimeout(r, 30));
    });

    expect(reload).toHaveBeenCalledTimes(2);
    expect([...reload.mock.calls[1][1]].sort()).toEqual(["a", "b"]);
  });

  it("svuota le tabelle accumulate fra una finestra e la successiva", async () => {
    // Senza il reset, il secondo reload vedrebbe anche le tabelle del primo e
    // ricaricherebbe più del necessario per sempre — il bug si manifesterebbe
    // solo dopo il PRIMO evento, che è il modo più subdolo di sbagliare.
    const reload = vi.fn();
    renderHook(() => useDebouncedTableSubscription(["a", "b"], reload, { enabled: true, delay: 5 }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    await act(async () => { emetti("a"); await new Promise(r => setTimeout(r, 30)); });
    await act(async () => { emetti("b"); await new Promise(r => setTimeout(r, 30)); });

    expect([...reload.mock.calls[2][1]]).toEqual(["b"]);
  });
});

describe("useListeData — un movimento non ricarica l'elenco", () => {
  it("un evento su movimenti_lista ricarica SOLO i saldi", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();
    ListeAPI.saldi.mockResolvedValue({ data: [{ lista_id: "l1", saldo: 999 }], error: null });

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    // È il cuore della correzione: registrare un movimento è l'operazione più
    // frequente del modulo, e non può costare il download dell'intero elenco.
    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
    expect(ListeAPI.list).not.toHaveBeenCalled();
    expect(ListeAPI.listTrash).not.toHaveBeenCalled();
    expect(result.current.saldi).toEqual({ l1: { lista_id: "l1", saldo: 999 } });
  });

  it("il reload parziale non azzera liste e cestino già in stato", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    expect(result.current.liste).toEqual([{ id: "l1" }]);
    expect(result.current.cestino).toEqual([{ id: "l2" }]);
  });

  it("un evento su liste_viaggio ricarica tutto", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    await act(async () => {
      emetti("liste_viaggio");
      await new Promise(r => setTimeout(r, 250));
    });

    // Una lista creata, rinominata, archiviata o ripristinata cambia elenco e
    // cestino: qui il refetch completo è quello giusto, non uno spreco.
    expect(ListeAPI.list).toHaveBeenCalledTimes(1);
    expect(ListeAPI.listTrash).toHaveBeenCalledTimes(1);
    expect(ListeAPI.saldi).toHaveBeenCalledTimes(1);
  });

  // A-1 dell'audit del 16 agosto. `lista_beneficiari` non era né sottoscritta
  // né pubblicata su supabase_realtime: aggiungere un cointestatario non
  // emetteva alcun evento, e l'intestazione della lista (che LISTA_SELECT
  // incorpora e `intestazioneLista` compone) restava vecchia su ogni altro
  // client fino al reload della pagina.
  it("si sottoscrive anche a lista_beneficiari", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect([...handlers.keys()]).toContain("lista_beneficiari");
  });

  it("un evento su lista_beneficiari ricarica l'ELENCO, non i soli saldi", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.clearAllMocks();

    await act(async () => {
      emetti("lista_beneficiari");
      await new Promise(r => setTimeout(r, 250));
    });

    // Il cointestatario cambia le RIGHE dell'elenco, non un saldo: se cadesse
    // nel ramo parziale la sottoscrizione ci sarebbe ma non servirebbe a
    // nulla, che è il modo più silenzioso di lasciare aperto il difetto.
    expect(ListeAPI.list).toHaveBeenCalledTimes(1);
    expect(ListeAPI.listTrash).toHaveBeenCalledTimes(1);
  });

  it("un errore sul reload parziale diventa loadError", async () => {
    const { result } = renderHook(() => useListeData({ enabled: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    ListeAPI.saldi.mockResolvedValue({ data: null, error: { message: "RLS negata" } });

    await act(async () => {
      emetti("movimenti_lista");
      await new Promise(r => setTimeout(r, 250));
    });

    expect(result.current.loadError).toBe("RLS negata");
    spy.mockRestore();
  });
});

// ─── B-1 · un commento non ricarica il grafo dei task ────────────────────────
// Stessa forma di A-1, un piano più in basso. `TASK_SELECT_WITH_COMMENTS` porta
// con sé commenti e cronologia con i join sui nomi, include il cestino e non è
// paginata: farla girare perché qualcuno ha commentato è il caso più frequente
// e insieme il più caro.
describe("useAppHydration — un commento non ricarica i task", () => {
  const idrata = () => {
    const dispatch = vi.fn();
    const utils = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "marco", dispatch, onError: vi.fn(),
    }));
    return { dispatch, ...utils };
  };

  it("l'idratazione iniziale carica i task per intero", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    // Nessun evento: non c'è modo di sapere cosa è cambiato, quindi si carica
    // tutto. È il caso in cui `tabelle` vale null e non un Set vuoto.
    expect(TaskThreadsAPI.comments).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASKS" }));
  });

  it("un evento su comments ricarica SOLO i commenti", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => { emetti("comments"); await new Promise(r => setTimeout(r, 250)); });

    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.comments).toHaveBeenCalledTimes(1);
    // Nemmeno la cronologia: un commento non la tocca — e da A-3 (passo 3)
    // questo hook non la legge in nessun caso.
    expect(TaskThreadsAPI.historyForTask).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_TASK_THREADS",
      payload: {
        comments: { t1: [{ id: "k1", user: "Marco", user_id: undefined, text: "ok", time: "2026-08-01T10:00:00Z" }] },
      },
    });
  });

  // A-3, passo 3 · IL CONTRATTO SI È INVERTITO, e questo caso lo dice.
  //
  // Fino al 17 agosto qui c'era «un evento su task_history ricarica SOLO la
  // cronologia», e per allora era la granularità giusta: la cronologia stava
  // nello stato globale, quindi qualcuno doveva rileggerla. Ora non ci sta
  // più — `task_history` è l'unica tabella dell'app che cresce e non si pota
  // mai, e il suo unico lettore è il pannello dello slide-over, che se la
  // carica per il task aperto e si sottoscrive per conto proprio.
  //
  // Quindi l'idratazione non è più sottoscritta a quella tabella: l'asserzione
  // forte è la prima — `handlers` non ha nemmeno la chiave — perché senza di
  // essa il caso passerebbe anche con una sottoscrizione viva che si limita a
  // non fare nulla, cioè con il costo del canale ancora lì.
  it("non è più sottoscritta a task_history: quel percorso non esiste più", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    expect(handlers.has("task_history")).toBe(false);
    expect(handlers.has("tasks")).toBe(true);
    expect(handlers.has("comments")).toBe(true);

    // E se l'evento arrivasse comunque (un'altra sottoscrizione viva sulla
    // stessa tabella — il pannello ne apre una, filtrata sul proprio task),
    // questo hook non deve reagirci in alcun modo.
    await act(async () => { emetti("task_history"); await new Promise(r => setTimeout(r, 250)); });

    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.comments).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.historyForTask).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASK_THREADS" }));
  });

  // Suggerimento strategico n.1 dell'audit del 16 agosto: un evento su `tasks`
  // NON ricarica più tutto — applica la riga arrivata nel payload. Il
  // comportamento precedente ("un evento su tasks ricarica tutto") era
  // l'esatto costo che questa correzione elimina: TASK_SELECT_WITH_COMMENTS
  // per un solo campo cambiato di un solo task.
  it("un evento su tasks APPLICA LA RIGA, non ricarica tutto", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("tasks", { eventType: "UPDATE", new: { id: "t1", title: "Aggiornato da un altro agente" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.comments).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MERGE_TASK_ROW",
      payload: { eventType: "UPDATE", row: expect.objectContaining({ id: "t1", title: "Aggiornato da un altro agente" }) },
    });
  });

  it("un DELETE su tasks (purge/svuota cestino altrove) applica la rimozione, non ricarica", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("tasks", { eventType: "DELETE", old: { id: "t1" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MERGE_TASK_ROW",
      payload: { eventType: "DELETE", id: "t1" },
    });
  });

  // `comments`/`task_history` non passano da applyRow (restano sul reload
  // selettivo esistente): un evento su `tasks` insieme a uno su `comments`
  // nella stessa finestra di debounce deve applicare la riga di `tasks` FUORI
  // dal debounce e lasciare `comments` seguire il proprio percorso invariato
  // — non più "tasks vince e la query completa riporta comunque i commenti"
  // (comportamento di prima), perché non c'è più alcuna query completa da
  // vincere.
  it("tasks (applicato per riga) e comments (reload selettivo) restano indipendenti nella stessa finestra", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("comments");
      emetti("tasks", { eventType: "UPDATE", new: { id: "t1", title: "Aggiornato" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TasksAPI.list).not.toHaveBeenCalled();
    expect(TaskThreadsAPI.comments).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "MERGE_TASK_ROW" }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASK_THREADS" }));
  });

  it("un evento su tasks senza id utilizzabile ricade sul reload completo (rete di sicurezza)", async () => {
    idrata();
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      // Payload malformato: nessun `new.id` da cui costruire la riga.
      emetti("tasks", { eventType: "UPDATE", new: {} });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(TasksAPI.list).toHaveBeenCalledTimes(1);
  });

  it("un errore sul reload parziale arriva a onError e non tocca lo stato", async () => {
    const dispatch = vi.fn();
    const onError = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHook(() => useAppHydration({ enabled: true, currentUserId: "marco", dispatch, onError }));
    await waitFor(() => expect(TasksAPI.list).toHaveBeenCalledTimes(1));
    dispatch.mockClear();
    TaskThreadsAPI.comments.mockResolvedValueOnce({ data: null, error: { message: "RLS negata" } });

    await act(async () => { emetti("comments"); await new Promise(r => setTimeout(r, 250)); });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("RLS negata"));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_TASK_THREADS" }));
    spy.mockRestore();
  });
});

// ─── Suggerimento strategico n.1 (audit del 16 agosto) · notices e clients ──
// Stessa forma del blocco tasks qui sopra, per le altre due entità "piatte":
// nessun join annidato, quindi nessuna ragione per riscaricare l'elenco
// intero quando l'evento porta già la riga.
describe("useAppHydration — un evento su notices applica la riga, non ricarica tutto", () => {
  const idrata = () => {
    const dispatch = vi.fn();
    const utils = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "marco", dispatch, onError: vi.fn(),
    }));
    return { dispatch, ...utils };
  };

  it("un UPDATE applica la riga senza richiamare Notices.list", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(NoticesAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("notices", { eventType: "UPDATE", new: { id: "n1", text: "Riunione spostata", pinned: true } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(NoticesAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MERGE_NOTICE_ROW",
      payload: { eventType: "UPDATE", row: expect.objectContaining({ id: "n1", text: "Riunione spostata", pinned: true }) },
    });
  });

  it("un DELETE applica la rimozione senza richiamare Notices.list", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(NoticesAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("notices", { eventType: "DELETE", old: { id: "n1" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(NoticesAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "MERGE_NOTICE_ROW", payload: { eventType: "DELETE", id: "n1" } });
  });
});

describe("useAppHydration — un evento su clients applica la riga, non ricarica tutto", () => {
  const idrata = () => {
    const dispatch = vi.fn();
    const utils = renderHook(() => useAppHydration({
      enabled: true, currentUserId: "marco", dispatch, onError: vi.fn(),
    }));
    return { dispatch, ...utils };
  };

  it("un UPDATE applica la riga senza richiamare Clients.list", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(ClientsAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("clients", { eventType: "UPDATE", new: { id: "c1", name: "Rossi Mario", city: "Milano" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(ClientsAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MERGE_CLIENT_ROW",
      payload: { eventType: "UPDATE", row: expect.objectContaining({ id: "c1", name: "Rossi Mario", city: "Milano" }) },
    });
  });

  it("un INSERT applica l'aggiunta senza richiamare Clients.list", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(ClientsAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("clients", { eventType: "INSERT", new: { id: "c2", name: "Bianchi Ada" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(ClientsAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "MERGE_CLIENT_ROW",
      payload: { eventType: "INSERT", row: expect.objectContaining({ id: "c2", name: "Bianchi Ada" }) },
    });
  });

  it("un DELETE applica la rimozione senza richiamare Clients.list", async () => {
    const { dispatch } = idrata();
    await waitFor(() => expect(ClientsAPI.list).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();

    await act(async () => {
      emetti("clients", { eventType: "DELETE", old: { id: "c1" } });
      await new Promise(r => setTimeout(r, 250));
    });

    expect(ClientsAPI.list).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "MERGE_CLIENT_ROW", payload: { eventType: "DELETE", id: "c1" } });
  });
});

// ─── ST-4 · un messaggio non ricarica le conversazioni ─────────────────────
// Stessa forma di A-1 e B-1: un messaggio nuovo cambia i MESSAGGI, non
// l'elenco delle conversazioni (updated_at si muove solo su create/rename/
// pin). La chat è il sottosistema con la frequenza di scrittura più alta
// dell'app — prima di questa correzione ogni messaggio, di chiunque, faceva
// ricaricare listMine() su ogni client connesso.
describe("useChatData — un messaggio non ricarica le conversazioni (ST-4)", () => {
  const idrata = () => renderHook(() => useChatData({
    enabled: true, team: [{ id: "marco" }], currentUserId: "marco",
    onError: vi.fn(), onSuccess: vi.fn(), onConversationRead: vi.fn(),
  }));

  it("l'idratazione iniziale carica conversazioni e messaggi", async () => {
    const { result } = idrata();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(ConversationsAPI.listMine).toHaveBeenCalledTimes(1);
    expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1);
  });

  it("un evento su messages ricarica SOLO i messaggi", async () => {
    idrata();
    await waitFor(() => expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();
    MessagesAPI.listAll.mockResolvedValue({ data: [], error: null });

    await act(async () => { emetti("messages"); await new Promise(r => setTimeout(r, 250)); });

    expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1);
    expect(ConversationsAPI.listMine).not.toHaveBeenCalled();
  });

  it("un evento su conversations ricarica tutto", async () => {
    idrata();
    await waitFor(() => expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1));
    vi.clearAllMocks();
    ConversationsAPI.listMine.mockResolvedValue({ data: [{ id: "c1" }], error: null });
    MessagesAPI.listAll.mockResolvedValue({ data: [], error: null });

    await act(async () => { emetti("conversations"); await new Promise(r => setTimeout(r, 250)); });

    expect(ConversationsAPI.listMine).toHaveBeenCalledTimes(1);
    expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1);
  });

  it("il reload parziale non tocca le conversazioni già in stato", async () => {
    ConversationsAPI.listMine.mockResolvedValue({
      data: [{ id: "c1", type: "group", participants: ["marco", "sofia"] }], error: null,
    });
    const { result } = idrata();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations.map((c) => c.id)).toEqual(["c1"]);

    // Se il reload parziale richiamasse comunque listMine, questo mock
    // farebbe sparire "c1" dalla lista — la prova che non è stato chiamato.
    ConversationsAPI.listMine.mockResolvedValue({ data: [], error: null });

    await act(async () => { emetti("messages"); await new Promise(r => setTimeout(r, 250)); });

    expect(result.current.conversations.map((c) => c.id)).toEqual(["c1"]);
  });

  it("un errore sul reload parziale arriva a onError", async () => {
    const onError = vi.fn();
    renderHook(() => useChatData({
      enabled: true, team: [{ id: "marco" }], currentUserId: "marco",
      onError, onSuccess: vi.fn(), onConversationRead: vi.fn(),
    }));
    await waitFor(() => expect(MessagesAPI.listAll).toHaveBeenCalledTimes(1));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    MessagesAPI.listAll.mockResolvedValueOnce({ data: null, error: { message: "RLS negata" } });

    await act(async () => { emetti("messages"); await new Promise(r => setTimeout(r, 250)); });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining("RLS negata"));
    spy.mockRestore();
  });
});
