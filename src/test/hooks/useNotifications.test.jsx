// B-1 — compensazioni della campanella.
//
// `remove` e `clearAll` sono ottimistiche: l'elenco si aggiorna subito e, se la
// delete su DB fallisce, si torna indietro. Il difetto era DOVE veniva letto lo
// stato da cui costruire quel "indietro": dentro l'updater di setState
//
//     setNotifications(prev => { snapshot = prev; return prev.filter(…); });
//
// cioè in una funzione che React 18 può invocare più di una volta per lo stesso
// aggiornamento (StrictMode di proposito, il Concurrent rendering rigiocando la
// coda su una base più recente). Un updater che scrive fuori da sé non è puro,
// e quale invocazione vinca non è deciso da questo codice.
//
// La correzione è doppia: lo stato si legge da un ref aggiornato in render, e
// la compensazione è MIRATA — la notifica torna al suo posto, l'elenco non
// viene riscritto per intero. Su un feed vivo la differenza è quella fra
// rimettere a posto un errore e cancellare quello che è arrivato nel frattempo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const Notifications = {
  list: vi.fn(async () => ({ data: [], error: null })),
  markRead: vi.fn(async () => ({ error: null })),
  markAllRead: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
  removeAll: vi.fn(async () => ({ error: null })),
};

// A-2 (28 agosto): l'handler realtime si CATTURA, perché la corsa da
// verificare è proprio «un evento altrui fa ripartire list() mentre la nostra
// scrittura è in volo» — senza poterlo far partire, quella finestra non si
// apre in un test.
const handlers = new Map();
vi.mock("../../lib/api.js", () => ({
  Notifications,
  subscribeToTable: (tabella, handler) => {
    handlers.set(tabella, handler);
    return () => handlers.delete(tabella);
  },
}));

const { useNotifications } = await import("../../hooks/useNotifications.js");

const notifica = (id) => ({ id, type: "mention", read: false, text: `n-${id}` });

// Monta l'hook e semina l'elenco DOPO l'idratazione iniziale (che con `list`
// vuota lo azzererebbe subito dopo).
const conElenco = async (elenco) => {
  const onError = vi.fn();
  const view = renderHook(() => useNotifications({ enabled: true, onError }));
  await waitFor(() => expect(Notifications.list).toHaveBeenCalled());
  await act(async () => { view.result.current.setNotifications(elenco); });
  return { ...view, onError };
};

beforeEach(() => {
  vi.clearAllMocks();
  handlers.clear();
  Notifications.list.mockResolvedValue({ data: [], error: null });
  Notifications.remove.mockResolvedValue({ error: null });
  Notifications.removeAll.mockResolvedValue({ error: null });
});

describe("useNotifications — remove", () => {
  it("toglie la notifica subito e la lascia via se il server conferma", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.remove("a"); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["b"]);
  });

  it("in errore la rimette AL SUO POSTO, non in coda", async () => {
    Notifications.remove.mockResolvedValueOnce({ error: { message: "rls" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, onError } = await conElenco([notifica("a"), notifica("b"), notifica("c")]);

    await act(async () => { result.current.remove("b"); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["a", "b", "c"]);
    expect(onError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("in errore NON cancella ciò che è arrivato mentre la delete era in volo", async () => {
    // È il caso che il rollback allo snapshot intero sbagliava: la campanella è
    // un feed, e fra il click e la risposta del server il realtime consegna.
    let sblocca;
    Notifications.remove.mockReturnValueOnce(new Promise(r => { sblocca = r; }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.remove("a"); });
    // Arriva una notifica nuova mentre la delete è ancora in volo.
    await act(async () => { result.current.setNotifications(prev => [notifica("z"), ...prev]); });
    await act(async () => { sblocca({ error: { message: "rls" } }); });

    const ids = result.current.notifications.map(n => n.id);
    expect(ids).toContain("z");   // l'arrivata non è stata spazzata via
    expect(ids).toContain("a");   // la rimozione fallita è tornata
    errSpy.mockRestore();
  });

  it("un id che non è in elenco non tocca né stato né server", async () => {
    const { result } = await conElenco([notifica("a")]);
    await act(async () => { result.current.remove("inesistente"); });
    expect(Notifications.remove).not.toHaveBeenCalled();
    expect(result.current.notifications.map(n => n.id)).toEqual(["a"]);
  });
});

describe("useNotifications — clearAll", () => {
  it("svuota subito e resta vuoto se il server conferma", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);
    await act(async () => { result.current.clearAll(); });
    expect(result.current.notifications).toEqual([]);
  });

  it("in errore rimette l'elenco di prima", async () => {
    Notifications.removeAll.mockResolvedValueOnce({ error: { message: "rls" } });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, onError } = await conElenco([notifica("a"), notifica("b")]);

    await act(async () => { result.current.clearAll(); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["a", "b"]);
    expect(onError).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("in errore unisce invece di sostituire: l'arrivata resta in testa", async () => {
    let sblocca;
    Notifications.removeAll.mockReturnValueOnce(new Promise(r => { sblocca = r; }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = await conElenco([notifica("a")]);

    await act(async () => { result.current.clearAll(); });
    await act(async () => { result.current.setNotifications([notifica("z")]); });
    await act(async () => { sblocca({ error: { message: "rls" } }); });

    expect(result.current.notifications.map(n => n.id)).toEqual(["z", "a"]);
    errSpy.mockRestore();
  });
});

describe("useNotifications — identità dei comandi", () => {
  it("remove e clearAll non cambiano riferimento quando arriva una notifica", async () => {
    const { result } = await conElenco([notifica("a")]);
    const prima = { remove: result.current.remove, clearAll: result.current.clearAll };

    await act(async () => { result.current.setNotifications(prev => [notifica("z"), ...prev]); });

    // Se lo stato fosse nelle deps della useCallback (invece che in un ref),
    // ogni notifica in arrivo ricreerebbe i comandi e invaliderebbe chi li
    // memoizza.
    expect(result.current.remove).toBe(prima.remove);
    expect(result.current.clearAll).toBe(prima.clearAll);
  });
});

// ─── A-2 (audit del 28 agosto) · le scritture in volo del feed ───────────────
//
// La campanella aveva le mutazioni ottimistiche e non l'altra metà: il reload
// sostituiva l'elenco intero, quindi bastava un evento su `notifications`
// mentre una nostra scrittura era in volo per riportarla indietro. Le notifiche
// nascono da trigger DB con `origin_client` NULL: quell'evento NON è filtrato,
// e l'eco della nostra scrittura — che sarebbe l'unica correzione possibile —
// invece lo è. Lo stato restava divergente dal database, dove la notifica era
// letta davvero, fino a un evento che poteva non arrivare più.
//
// ⚠️ I casi qui sotto FALLISCONO sul codice precedente. È il modo in cui il
// difetto si presenta: nessun errore, nessun toast, il pallino che torna.

// Fa partire un reload come farebbe un trigger DB, e ne aspetta il debounce.
const eventoAltrui = async () => {
  await act(async () => {
    handlers.get("notifications")?.({ eventType: "INSERT", new: {} });
    await new Promise(r => setTimeout(r, 300)); // oltre i 200ms di debounce
  });
};

describe("useNotifications — il refetch non annulla una scrittura in volo", () => {
  it("una notifica appena letta non torna non letta col reload concorrente", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);
    // La scrittura resta in volo per tutta la durata del reload.
    let concludi;
    Notifications.markRead.mockReturnValueOnce(new Promise(r => { concludi = r; }));
    await act(async () => { result.current.markRead("a"); });

    // Il server serve ancora il pre-immagine: la UPDATE non ha committato.
    Notifications.list.mockResolvedValueOnce({
      data: [{ id: "a", type: "mention", read: false }, { id: "b", type: "mention", read: false }],
      error: null,
    });
    await eventoAltrui();

    expect(result.current.notifications.find(n => n.id === "a").read).toBe(true);
    await act(async () => { concludi({ error: null }); });
  });

  it("una notifica appena eliminata non riappare col reload concorrente", async () => {
    const { result } = await conElenco([notifica("a"), notifica("b")]);
    let concludi;
    Notifications.remove.mockReturnValueOnce(new Promise(r => { concludi = r; }));
    await act(async () => { result.current.remove("a"); });

    Notifications.list.mockResolvedValueOnce({
      data: [{ id: "a", type: "mention", read: false }, { id: "b", type: "mention", read: false }],
      error: null,
    });
    await eventoAltrui();

    expect(result.current.notifications.map(n => n.id)).toEqual(["b"]);
    await act(async () => { concludi({ error: null }); });
  });

  it("a scrittura conclusa il reload torna a essere la fonte di verità", async () => {
    // La contropartita, e non è una formalità: se lo smarcamento non avvenisse
    // (o avvenisse solo sul percorso felice), QUELLA notifica smetterebbe di
    // aggiornarsi da realtime per il resto della sessione — un difetto peggiore
    // di quello chiuso qui. È il motivo per cui `smarca` sta in un `finally`.
    const { result } = await conElenco([notifica("a")]);
    await act(async () => { result.current.markRead("a"); });

    Notifications.list.mockResolvedValueOnce({
      data: [{ id: "a", type: "mention", read: false }], error: null,
    });
    await eventoAltrui();

    // Il server la dà non letta e ora vince lui: la riga locale non è più
    // protetta da niente, che è esattamente ciò che deve succedere.
    expect(result.current.notifications[0].read).toBe(false);
  });

  it("uno smarcamento non annulla l'altra scrittura ancora in volo sulla stessa riga", async () => {
    // Il registro è un CONTATORE e non un booleano: «segna letta» e «elimina»
    // possono sovrapporsi sulla stessa notifica, e la prima che si conclude
    // riaprirebbe la finestra a metà strada per la seconda.
    const { result } = await conElenco([notifica("a")]);
    let concludiLettura;
    Notifications.markRead.mockReturnValueOnce(new Promise(r => { concludiLettura = r; }));
    let concludiRimozione;
    Notifications.remove.mockReturnValueOnce(new Promise(r => { concludiRimozione = r; }));

    await act(async () => { result.current.markRead("a"); });
    await act(async () => { result.current.remove("a"); });
    await act(async () => { concludiLettura({ error: null }); });

    Notifications.list.mockResolvedValueOnce({
      data: [{ id: "a", type: "mention", read: false }], error: null,
    });
    await eventoAltrui();

    expect(result.current.notifications).toEqual([]);
    await act(async () => { concludiRimozione({ error: null }); });
  });
});

// Il quinto ingresso: era `markChatNotificationsRead` in VoyageDeskInner.jsx e
// scriveva questo feed dal di fuori, quindi il registro non poteva vederlo. Che
// sia rientrato non è un riordino — è ciò che rende la protezione una proprietà
// del feed invece di una cosa che ogni chiamante deve ricordarsi.
describe("useNotifications — markReadForConversation", () => {
  const diChat = (id, convId) => ({
    id, type: "chat_message", read: false, payload: { conversation_id: convId },
  });
  const CONV = "11111111-2222-4333-8444-555555555555";

  it("spegne solo le notifiche della conversazione aperta", async () => {
    Notifications.markReadForConversation = vi.fn(async () => ({ error: null }));
    const { result } = await conElenco([diChat("a", CONV), diChat("b", "altra"), notifica("c")]);

    await act(async () => { result.current.markReadForConversation(CONV); });

    expect(result.current.notifications.find(n => n.id === "a").read).toBe(true);
    expect(result.current.notifications.find(n => n.id === "b").read).toBe(false);
    expect(Notifications.markReadForConversation).toHaveBeenCalledWith(CONV);
  });

  it("le sue righe non tornano indietro col reload concorrente", async () => {
    let concludi;
    Notifications.markReadForConversation = vi.fn(() => new Promise(r => { concludi = r; }));
    const { result } = await conElenco([diChat("a", CONV)]);

    await act(async () => { result.current.markReadForConversation(CONV); });
    Notifications.list.mockResolvedValueOnce({ data: [{ id: "a", type: "chat_message", read: false, payload: { conversation_id: CONV } }], error: null });
    await eventoAltrui();

    expect(result.current.notifications[0].read).toBe(true);
    await act(async () => { concludi({ error: null }); });
  });

  it("scrive comunque sul server quando in locale non c'è niente da spegnere", async () => {
    // `state.notifications` sono le 100 più recenti (B-1): il server può avere
    // per questa conversazione righe non lette che il client non ha mai visto.
    // È la MARCATURA a dipendere dagli id noti, non la chiamata — un
    // cortocircuito qui lascerebbe quelle righe non lette sul database.
    Notifications.markReadForConversation = vi.fn(async () => ({ error: null }));
    const { result } = await conElenco([{ ...diChat("a", CONV), read: true }]);

    await act(async () => { result.current.markReadForConversation(CONV); });

    expect(Notifications.markReadForConversation).toHaveBeenCalledWith(CONV);
  });

  it("ha identità stabile: è `onConversationRead` della chat", async () => {
    // La proprietà che chatMemo.test.jsx misura dal lato del guscio. Qui si
    // verifica alla sorgente: se cambiasse identità a ogni notifica in arrivo,
    // il registro `commands` della chat non salterebbe mai un render.
    const { result } = await conElenco([notifica("a")]);
    const prima = result.current.markReadForConversation;
    await act(async () => { result.current.setNotifications(prev => [notifica("z"), ...prev]); });
    expect(result.current.markReadForConversation).toBe(prima);
  });
});
