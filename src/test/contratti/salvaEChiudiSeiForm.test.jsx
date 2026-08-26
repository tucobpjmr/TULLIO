// src/test/salvaEChiudiSeiForm.test.jsx
// A-4 dell'audit performance/UX del 19 agosto — i sei form che restavano fuori
// dal contratto «salva e chiudi».
//
// PERCHÉ UN SECONDO FILE. `salvaEChiudi.test.jsx` fissa il CONTRATTO
// (`useSalvataggio`: doppio invio, esito, riuscita parziale) e i tre call site
// che lo adottarono per primi. Questo fissa i sei che l'audit del 19 agosto ha
// trovato ancora fuori — con lo stesso metodo, perché è il metodo che dice
// qualcosa: ogni caso guarda DUE cose insieme, che il pannello non si sia
// chiuso E che i valori digitati siano ancora nel DOM. Un test che si
// accontentasse del messaggio d'errore passerebbe anche su una modale che si
// chiude subito dopo averlo mostrato, che è esattamente il difetto.
//
// Il rilievo non era che questi form fossero scritti male: validano tutti
// correttamente, con `validaCampi` + `FieldError` + focus sul primo campo
// invalido. Era che la validazione si era propagata a tutti e l'attesa
// dell'esito no — due metà della stessa promessa, la prima dice cosa manca, la
// seconda che i dati sono ancora lì.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { renderWithAppData, withDispatch, DEMO_APP_CTX } from "../helpers/appData.jsx";

vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../../lib/api.js", () => ({
  Users: {
    listContacts: vi.fn(async () => ({ data: [], error: null })),
    getContacts: vi.fn(async () => ({ data: null, error: null })),
    invite: vi.fn(async () => ({ data: null, error: null })),
  },
  TaskFiles: {
    upload: vi.fn(async () => ({ error: null })),
    listForTask: vi.fn(async () => ({ data: [], error: null })),
    getFileUrl: vi.fn(async () => ({ url: "", error: null })),
    remove: vi.fn(async () => ({ error: null })),
  },
  TaskThreads: { historyForTask: vi.fn(async () => ({ data: [], error: null })) },
  subscribeToTable: vi.fn(() => () => {}),
}));

const { NoticeEditorModal } = await import("../../components/dashboard/NoticeEditorModal.jsx");
const { AddCategoryModal } = await import("../../components/admin/AddCategoryModal.jsx");
const { AdminCategoriesTab } = await import("../../components/admin/tabs/AdminCategoriesTab.jsx");
const { AdminTeamTab } = await import("../../components/admin/tabs/AdminTeamTab.jsx");
const { MessageTemplatesSection } = await import("../../components/admin/tabs/MessageTemplatesSection.jsx");
const { Trash } = await import("../../components/tasks/Trash.jsx");

// Il rifiuto tipico: la RLS filtra le righe invece di sollevare, quindi
// `useSyncedDispatch` traduce in `{ error }` e la promise si risolve — non
// rigetta. È la forma che i sei call site devono saper attendere.
const RIFIUTA = () => Promise.resolve({ error: new Error("RLS") });
const ACCETTA = () => Promise.resolve({ error: null });

// Una promise che si risolve quando decidiamo noi: serve a osservare lo stato
// «in volo», che è per definizione la finestra fra il click e l'esito.
function differita() {
  let risolvi;
  const promessa = new Promise((r) => { risolvi = r; });
  return { promessa, risolvi };
}

beforeEach(() => { vi.clearAllMocks(); });

// ─── 1. NoticeEditorModal (era: NoticeBoard chiudeva nello stesso turno) ────
describe("A-4 · NoticeEditorModal — l'avviso digitato sopravvive al rifiuto", () => {
  // L'anteprima live monta `MentionText`, che risolve le @menzioni sul team:
  // serve il provider, non un render nudo.
  const monta = (onSave) => {
    const onClose = vi.fn();
    renderWithAppData(
      <NoticeEditorModal notice={null} onClose={onClose} onSave={onSave} />, DEMO_APP_CTX);
    return onClose;
  };
  const scrivi = (v) =>
    fireEvent.change(screen.getByPlaceholderText(/Scrivi qui il tuo avviso/i), { target: { value: v } });
  const pubblica = () => fireEvent.click(screen.getByText("📌 Pubblica avviso"));

  it("scrittura rifiutata: resta aperta e il testo è ancora nel campo", async () => {
    const onClose = monta(RIFIUTA);
    scrivi("Riunione lunedì alle 9, presenti tutti");
    pubblica();

    await screen.findByText(/testo è ancora qui/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/Scrivi qui il tuo avviso/i).value)
      .toBe("Riunione lunedì alle 9, presenti tutti");
  });

  it("scrittura riuscita: chiude (controllo positivo)", async () => {
    const onClose = monta(ACCETTA);
    scrivi("Chiusura ufficio venerdì");
    pubblica();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("mentre la scrittura è in volo il comando è spento e lo dice", async () => {
    // ⚠️ `disabled` qui NON è la variante vietata da docs/CLAUDE.md («niente
    // bottone spento al posto del messaggio»): quello parla della
    // VALIDAZIONE, e infatti a testo vuoto il bottone resta premibile — è
    // premendolo che si ottiene il messaggio sotto il campo. Questo è il
    // freno al doppio invio, e la sua ragione è a schermo nell'etichetta.
    //
    // Il freno vero è comunque il ref dentro `useSalvataggio` (fra due click
    // ravvicinati React può non aver ancora ri-renderizzato, quindi `disabled`
    // da solo non basterebbe): quel meccanismo è fissato in
    // `salvaEChiudi.test.jsx`, qui si verifica che questo call site lo esponga.
    const { promessa, risolvi } = differita();
    const onSave = vi.fn(() => promessa);
    monta(onSave);
    scrivi("Avviso");
    pubblica();

    const bottone = await screen.findByText("Salvataggio…");
    expect(bottone.closest("button").disabled).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => { risolvi({ error: null }); });
  });
});

// ─── 2. AddCategoryModal ────────────────────────────────────────────────────
describe("A-4 · AddCategoryModal — la categoria digitata sopravvive al rifiuto", () => {
  const monta = (dispatch) => {
    const onClose = vi.fn();
    render(withDispatch(<AddCategoryModal onClose={onClose} existingKeys={[]} />, dispatch));
    return onClose;
  };

  it("scrittura rifiutata: resta aperta e il nome è ancora nel campo", async () => {
    const onClose = monta(RIFIUTA);
    fireEvent.change(screen.getByPlaceholderText("Es. Trasferimenti"), {
      target: { value: "Assicurazioni" },
    });
    fireEvent.click(screen.getByText("Crea categoria"));

    await screen.findByText(/dati sono ancora qui/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Es. Trasferimenti").value).toBe("Assicurazioni");
  });
});

// ─── 3. AdminCategoriesTab (editor in linea) ────────────────────────────────
describe("A-4 · AdminCategoriesTab — l'editor in linea non si svuota sul rifiuto", () => {
  const monta = (dispatch) =>
    renderWithAppData(<AdminCategoriesTab />, { dispatch, ...DEMO_APP_CTX, tasks: [] });

  it("scrittura rifiutata: l'editor resta aperto con l'etichetta modificata", async () => {
    monta(RIFIUTA);
    fireEvent.click(screen.getAllByText("✏️ Modifica")[0]);
    const campo = screen.getByPlaceholderText("Etichetta");
    fireEvent.change(campo, { target: { value: "Prenotazioni voli" } });
    fireEvent.click(screen.getByText("💾 Salva"));

    await screen.findByText(/modifiche sono ancora qui/);
    // `cancelEdit()` avrebbe azzerato `draft` e chiuso l'editor: il campo non
    // esisterebbe più. Che ci sia ancora, col valore digitato, è la proprietà.
    expect(screen.getByPlaceholderText("Etichetta").value).toBe("Prenotazioni voli");
  });

  it("scrittura riuscita: l'editor si chiude (controllo positivo)", async () => {
    monta(ACCETTA);
    fireEvent.click(screen.getAllByText("✏️ Modifica")[0]);
    fireEvent.change(screen.getByPlaceholderText("Etichetta"), { target: { value: "Voli" } });
    fireEvent.click(screen.getByText("💾 Salva"));

    await waitFor(() => expect(screen.queryByPlaceholderText("Etichetta")).toBeNull());
  });
});

// ─── 4. AdminTeamTab — il caso peggiore del rilievo ─────────────────────────
describe("A-4 · AdminTeamTab — la revoca dei privilegi non si chiude alla cieca", () => {
  const monta = (dispatch) =>
    renderWithAppData(<AdminTeamTab />, { dispatch, ...DEMO_APP_CTX, tasks: [] });

  it("cambio di ruolo rifiutato: l'editor resta aperto e lo DICE", async () => {
    // `state/persistence.js` dice a cosa serve questa azione: «il modo con cui
    // un admin REVOCA i privilegi di un account compromesso». Se l'editor si
    // chiude sul dispatch, «il toast è passato» e «il declassamento non c'è
    // stato» sono lo stesso fotogramma.
    monta(RIFIUTA);
    fireEvent.click(screen.getAllByTitle("Modifica")[0]);
    const ruolo = screen.getByLabelText("Ruolo");
    fireEvent.change(ruolo, { target: { value: "agent" } });
    fireEvent.click(screen.getByText("💾 Salva"));

    // Il messaggio nomina la cosa che NON è cambiata, che è il punto.
    await screen.findByText(/ruolo sul database è ancora quello di prima/);
    expect(screen.getByLabelText("Ruolo").value).toBe("agent");
  });

  it("cambio di ruolo riuscito: l'editor si chiude (controllo positivo)", async () => {
    monta(ACCETTA);
    fireEvent.click(screen.getAllByTitle("Modifica")[0]);
    fireEvent.change(screen.getByLabelText("Ruolo"), { target: { value: "agent" } });
    fireEvent.click(screen.getByText("💾 Salva"));

    await waitFor(() => expect(screen.queryByLabelText("Ruolo")).toBeNull());
  });
});

// ─── 5. MessageTemplatesSection ─────────────────────────────────────────────
describe("A-4 · MessageTemplatesSection — il testo del template non si perde", () => {
  const monta = (dispatch) =>
    renderWithAppData(
      <MessageTemplatesSection templates={[]} />, { ...DEMO_APP_CTX, dispatch });

  it("scrittura rifiutata: etichetta e testo restano nei campi", async () => {
    monta(RIFIUTA);
    fireEvent.click(screen.getByText("+ Nuovo"));
    fireEvent.change(screen.getByPlaceholderText(/Etichetta \(es\./i), {
      target: { value: "Sollecito saldo" },
    });
    const testo = screen.getByPlaceholderText(/Testo completo del messaggio/i);
    fireEvent.change(testo, { target: { value: "Gentile cliente, ricordiamo il saldo…" } });
    fireEvent.click(screen.getByText("Crea"));

    await screen.findByText(/testo è ancora qui/);
    // `cancel()` avrebbe azzerato ENTRAMBI i draft.
    expect(screen.getByPlaceholderText(/Etichetta \(es\./i).value).toBe("Sollecito saldo");
    expect(screen.getByPlaceholderText(/Testo completo del messaggio/i).value)
      .toBe("Gentile cliente, ricordiamo il saldo…");
  });
});

// ─── 6. Trash — due scritture DIPENDENTI (chiude anche M-3) ─────────────────
describe("A-4 / M-3 · Cestino — il ripristino con modifica è una sequenza", () => {
  const TASK_CESTINATA = {
    id: "t-del", title: "Voli Tokyo", category: "booking", priority: "medium",
    status: "todo", assignees: ["marco"], comments: [], client: null,
    praticaRef: null, description: "", dueDate: null,
    deletedAt: "2026-08-01T10:00:00Z",
  };
  const monta = (dispatch) =>
    renderWithAppData(<Trash />, { dispatch,
      ...DEMO_APP_CTX, tasks: [TASK_CESTINATA],
    });

  it("se l'UPDATE è rifiutata il RESTORE non parte, e la modale resta aperta", async () => {
    // È la proprietà che il rilievo M-3 descrive: partendo entrambe alla cieca
    // la task tornava dal cestino con i valori VECCHI e le modifiche appena
    // digitate non erano da nessuna parte — con l'aspetto della riuscita.
    const dispatch = vi.fn((a) =>
      (a.type === "UPDATE_TASK" ? RIFIUTA() : ACCETTA()));
    monta(dispatch);
    fireEvent.click(screen.getByText("↻ Ripristina"));
    const titolo = screen.getByDisplayValue("Voli Tokyo");
    fireEvent.change(titolo, { target: { value: "Voli Tokyo — riaperto" } });
    fireEvent.click(screen.getByText("↻ Conferma ripristino"));

    await screen.findByText(/modifiche sono ancora qui/);
    const tipi = dispatch.mock.calls.map(([a]) => a.type);
    expect(tipi).toContain("UPDATE_TASK");
    expect(tipi).not.toContain("RESTORE_TASK");
    expect(screen.getByDisplayValue("Voli Tokyo — riaperto")).toBeInTheDocument();
  });

  it("se l'UPDATE passa, il RESTORE parte e la modale si chiude", async () => {
    const dispatch = vi.fn(ACCETTA);
    monta(dispatch);
    fireEvent.click(screen.getByText("↻ Ripristina"));
    fireEvent.change(screen.getByDisplayValue("Voli Tokyo"), {
      target: { value: "Voli Tokyo — riaperto" },
    });
    fireEvent.click(screen.getByText("↻ Conferma ripristino"));

    await waitFor(() => {
      const tipi = dispatch.mock.calls.map(([a]) => a.type);
      expect(tipi).toContain("RESTORE_TASK");
    });
    // …e nell'ORDINE giusto: la modifica prima del ripristino.
    const tipi = dispatch.mock.calls.map(([a]) => a.type);
    expect(tipi.indexOf("UPDATE_TASK")).toBeLessThan(tipi.indexOf("RESTORE_TASK"));
    await waitFor(() =>
      expect(screen.queryByText("↻ Conferma ripristino")).toBeNull());
  });
});
