// A-2, M-1, M-4 — «salva e chiudi» è UN contratto, non dieci ricordi.
//
// PERCHÉ ESISTE. Il difetto che questi test fissano è sempre lo stesso, in tre
// punti diversi: il pannello si chiude (o la casella si svuota) PRIMA che si
// sappia com'è andata la scrittura. Quando la scrittura fallisce il registry di
// persistenza fa rollback e mostra un toast — ma il contenitore che teneva i
// dati non c'è più, quindi l'unica strada è riscrivere tutto da capo.
//
// La proprietà da fissare non è «compare un messaggio»: è **cosa sopravvive a
// una scrittura fallita**. Per questo ogni caso su un call site guarda due
// cose insieme — che il pannello NON sia stato chiuso e che i valori digitati
// siano ancora nel DOM. Un test che si accontentasse del messaggio passerebbe
// anche su una modale che si chiude subito dopo averlo mostrato.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { useSalvataggio } from "../hooks/useSalvataggio.js";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// Mock di api.js per non istanziare il client Supabase reale (stessa forma di
// bulkRowAttachments.test.jsx). `upload` è anche il perno del caso «task creata
// ma allegato no», che è l'unica ragione per cui QuickAddTask ha bisogno di un
// terzo esito oltre a riuscito/fallito.
const upload = vi.fn(async () => ({ error: null }));
vi.mock("../lib/api.js", () => ({
  TaskFiles: {
    upload,
    listForTask: vi.fn(async () => ({ data: [], error: null })),
    getFileUrl: vi.fn(async () => ({ url: "", error: null })),
    remove: vi.fn(async () => ({ error: null })),
  },
  // A-3 (passo 3): lo slide-over monta TaskHistoryPanel, che si carica la
  // cronologia del task aperto e si sottoscrive a `task_history`. Qui non è
  // ciò che si misura — servono solo perché il pannello non sollevi.
  TaskThreads: { historyForTask: vi.fn(async () => ({ data: [], error: null })) },
  subscribeToTable: vi.fn(() => () => {}),
}));

const { QuickAddTask } = await import("../components/tasks/QuickAddTask.jsx");
const { ClienteModal } = await import("../components/clients/ClienteModal.jsx");
const { TaskSlideOver } = await import("../components/tasks/TaskSlideOver.jsx");

// Una promise che si risolve quando decidiamo noi: serve a osservare lo stato
// «in volo», che è per definizione la finestra fra il click e l'esito.
function differita() {
  let risolvi;
  const promessa = new Promise((r) => { risolvi = r; });
  return { promessa, risolvi };
}

// ─── Il contratto ──────────────────────────────────────────────────────────
describe("useSalvataggio — il contratto condiviso", () => {
  // Una spia minima che espone l'hook attraverso il DOM: i tre call site sono
  // testati sotto per intero, qui interessa solo la macchina a stati.
  function Sonda({ esegui, alSuccesso, messaggioErrore }) {
    const { salva, inVolo, errore, avviso, bloccato } = useSalvataggio(
      esegui, { alSuccesso, messaggioErrore });
    return (
      <div>
        <button onClick={() => salva("arg")}>salva</button>
        <span data-testid="stato">{inVolo ? "in-volo" : "fermo"}</span>
        <span data-testid="errore">{errore}</span>
        <span data-testid="avviso">{avviso}</span>
        <span data-testid="bloccato">{String(bloccato)}</span>
      </div>
    );
  }
  const premi = () => fireEvent.click(screen.getByText("salva"));

  it("su errore NON chiama alSuccesso e dice che i dati sono ancora lì", async () => {
    const alSuccesso = vi.fn();
    render(<Sonda esegui={() => Promise.resolve({ error: new Error("RLS") })} alSuccesso={alSuccesso} />);
    premi();

    await waitFor(() => expect(screen.getByTestId("errore").textContent).toMatch(/dati sono ancora qui/));
    // Il punto del rilievo: chi doveva chiudere o svuotare non è stato chiamato.
    expect(alSuccesso).not.toHaveBeenCalled();
    expect(screen.getByTestId("stato").textContent).toBe("fermo");
  });

  it("su successo chiama alSuccesso e non mostra nulla", async () => {
    const alSuccesso = vi.fn();
    render(<Sonda esegui={() => Promise.resolve({ error: null })} alSuccesso={alSuccesso} />);
    premi();

    await waitFor(() => expect(alSuccesso).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("errore").textContent).toBe("");
  });

  it("il secondo click durante il volo non fa partire una seconda scrittura", async () => {
    // Il freno è un ref e non lo stato `inVolo` proprio per questo caso: fra
    // due click ravvicinati React può non aver ancora ri-renderizzato, quindi
    // entrambi i gestori leggerebbero `inVolo === false`.
    const { promessa, risolvi } = differita();
    const esegui = vi.fn(() => promessa);
    render(<Sonda esegui={esegui} alSuccesso={vi.fn()} />);

    premi();
    premi();
    expect(esegui).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("stato").textContent).toBe("in-volo");

    await act(async () => { risolvi({ error: null }); });
    expect(screen.getByTestId("stato").textContent).toBe("fermo");
  });

  it("un throw è un fallimento, non un congelamento", async () => {
    // QuickAddTask aveva `setBusy(true)` senza try: una qualunque eccezione
    // (la rete che cade a metà upload) lasciava `busy` a true per sempre —
    // modale immobile, bottone spento, nessun messaggio.
    render(<Sonda esegui={() => { throw new Error("rete caduta"); }} alSuccesso={vi.fn()} />);
    premi();

    await waitFor(() => expect(screen.getByTestId("errore").textContent).toMatch(/non riuscito/));
    expect(screen.getByTestId("stato").textContent).toBe("fermo");
  });

  it("l'avviso di riuscita parziale blocca i tentativi successivi", async () => {
    // Riprovare è la cosa GIUSTA su un errore e quella SBAGLIATA qui: la task
    // è già stata creata, un secondo tentativo ne farebbe una seconda.
    const alSuccesso = vi.fn();
    const esegui = vi.fn(() => Promise.resolve({ avviso: "Task creata, ma l'allegato no." }));
    render(<Sonda esegui={esegui} alSuccesso={alSuccesso} />);
    premi();

    await waitFor(() => expect(screen.getByTestId("bloccato").textContent).toBe("true"));
    expect(screen.getByTestId("avviso").textContent).toMatch(/allegato/);
    expect(alSuccesso).not.toHaveBeenCalled();

    premi();
    expect(esegui).toHaveBeenCalledTimes(1);
  });

  it("smontato mentre la scrittura è in volo, non chiama alSuccesso", async () => {
    // È il guard di useIsMounted (criticità #11), assorbito qui: i modali non
    // devono più ricordarselo uno per uno.
    const { promessa, risolvi } = differita();
    const alSuccesso = vi.fn();
    const { unmount } = render(<Sonda esegui={() => promessa} alSuccesso={alSuccesso} />);
    premi();
    unmount();

    await act(async () => { risolvi({ error: null }); });
    expect(alSuccesso).not.toHaveBeenCalled();
  });

  it("`salva` ha identità stabile ma esegue sempre l'ultima funzione ricevuta", async () => {
    // Le due metà della stessa scelta: il call site non deve avvolgere `esegui`
    // in un useCallback con la lista di dipendenze giusta (che con un form
    // intero nella closure si sbaglia in silenzio, salvando i valori di due
    // render fa), e `salva` resta passabile a un componente `memo`.
    const viste = [];
    const eseguiti = [];
    function Spia({ n }) {
      const { salva } = useSalvataggio(() => { eseguiti.push(n); return Promise.resolve({ error: null }); });
      viste.push(salva);
      return <button onClick={() => salva()}>salva</button>;
    }
    const { rerender } = render(<Spia n={1} />);
    rerender(<Spia n={2} />);
    expect(viste[0]).toBe(viste[1]);

    await act(async () => { fireEvent.click(screen.getByText("salva")); });
    expect(eseguiti).toEqual([2]);
  });
});

// ─── A-2 · QuickAddTask ─────────────────────────────────────────────────────
describe("QuickAddTask — il form più usato dell'app", () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({ error: null });
  });
  const monta = (onAdd) => {
    const onClose = vi.fn();
    renderWithAppData(<QuickAddTask onAdd={onAdd} onClose={onClose} />, DEMO_APP_CTX);
    return onClose;
  };
  const crea = () => fireEvent.click(screen.getByText("✓ Crea Task"));
  const scriviTitolo = (t) =>
    fireEvent.change(screen.getByLabelText("TITOLO *"), { target: { value: t } });

  it("a titolo vuoto lo DICE, col focus sul campo, e non scrive niente", async () => {
    // Prima: `if (!form.title.trim()) return;` — si premeva «Crea Task» e non
    // succedeva nulla. L'asterisco nell'etichetta prometteva una regola che
    // non si manifestava in alcun modo.
    const onAdd = vi.fn();
    monta(onAdd);
    crea();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/titolo è obbligatorio/);
    const campo = screen.getByLabelText("TITOLO *");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(campo);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("creazione fallita: la modale resta aperta CON i dati digitati", async () => {
    const onClose = monta(() => Promise.resolve({ error: new Error("RLS") }));
    scriviTitolo("Voli Tokyo");
    fireEvent.change(screen.getByPlaceholderText("es. PR-2026-001"), { target: { value: "PR-2026-77" } });
    crea();

    await screen.findByText(/dati sono ancora qui/);
    expect(onClose).not.toHaveBeenCalled();
    // Non basta il messaggio: quello che conta è che non si debba riscrivere.
    expect(screen.getByLabelText("TITOLO *").value).toBe("Voli Tokyo");
    expect(screen.getByPlaceholderText("es. PR-2026-001").value).toBe("PR-2026-77");
  });

  it("creazione riuscita: chiude", async () => {
    const onClose = monta(() => Promise.resolve({ error: null }));
    scriviTitolo("Voli Tokyo");
    crea();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("task creata ma allegato non caricato: resta aperta, e «Crea Task» sparisce", async () => {
    // Il terzo esito. La task ESISTE: tenere il bottone premibile inviterebbe
    // l'utente a fare l'unica cosa che qui è sbagliata, cioè crearne una seconda.
    upload.mockResolvedValueOnce({ error: new Error("bucket") });
    const onClose = monta(() => Promise.resolve({ error: null }));
    scriviTitolo("Voli Tokyo");
    const file = new File(["x"], "voucher.pdf", { type: "application/pdf" });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    crea();

    await screen.findByText(/allegato "voucher\.pdf" non è stato caricato/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText("✓ Crea Task")).toBeNull();
    expect(screen.getByText("Chiudi")).toBeTruthy();
  });

  it("l'errore del titolo si spegne appena lo si scrive", async () => {
    monta(vi.fn());
    crea();
    await screen.findByRole("alert");

    scriviTitolo("V");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

// ─── M-1 · ClienteModal + ClientiView.handleSave ────────────────────────────
describe("ClienteModal — chi chiude è la modale, a esito noto", () => {
  const monta = (onSave) => {
    const onClose = vi.fn();
    render(<ClienteModal cliente={null} onSave={onSave} onClose={onClose} />);
    return onClose;
  };
  const salva = () => fireEvent.click(screen.getByText("Aggiungi"));
  const scriviNome = (v) =>
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: v } });

  it("scrittura fallita: resta aperta, la scheda è ancora compilata", async () => {
    const onClose = monta(() => Promise.resolve({ error: new Error("RLS") }));
    scriviNome("Famiglia Rossi");
    fireEvent.change(screen.getByPlaceholderText("+39 000 000 0000"), { target: { value: "3331234567" } });
    salva();

    await screen.findByText(/dati sono ancora qui/);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome *").value).toBe("Famiglia Rossi");
    expect(screen.getByPlaceholderText("+39 000 000 0000").value).toBe("3331234567");
  });

  it("«Salvataggio...» ora si può vedere davvero", async () => {
    // Il ramo esisteva già nel file, ma era irraggiungibile: `handleSave` non
    // attendeva i dispatch e terminava con `setModal(null)`, smontando questo
    // componente nello stesso turno del click.
    const { promessa, risolvi } = differita();
    const onClose = monta(() => promessa);
    scriviNome("Famiglia Rossi");
    salva();

    await screen.findByText("Salvataggio...");
    await act(async () => { risolvi({ error: null }); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ─── M-4 · Il box commenti dello slide-over ─────────────────────────────────
describe("TaskSlideOver — il commento si svuota dopo la conferma", () => {
  const TASK = {
    id: "t1", title: "Voli Tokyo", category: "booking", priority: "medium",
    status: "todo", assignees: ["marco"], comments: [], client: null,
    praticaRef: null, contact: null, description: "", dueDate: null,
  };
  const monta = (dispatch) => {
    renderWithAppData(<TaskSlideOver task={TASK} />, { ...DEMO_APP_CTX, dispatch });
    return screen.getByPlaceholderText("Aggiungi un commento...");
  };
  const invia = () => fireEvent.click(screen.getByText("↑"));

  it("scrittura fallita: il testo resta nella casella", async () => {
    const dispatch = vi.fn(() => Promise.resolve({ error: new Error("rete") }));
    const casella = monta(dispatch);
    fireEvent.change(casella, { target: { value: "Confermato col fornitore, attendo voucher" } });
    invia();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/testo è ancora qui/);
    // I commenti di un gestionale non sono monosillabi: riscriverlo è il costo
    // vero del difetto.
    expect(casella.value).toBe("Confermato col fornitore, attendo voucher");
    expect(casella.getAttribute("aria-describedby")).toBe(avviso.id);
  });

  it("scrittura riuscita: la casella si svuota", async () => {
    const dispatch = vi.fn(() => Promise.resolve({ error: null }));
    const casella = monta(dispatch);
    fireEvent.change(casella, { target: { value: "Confermato" } });
    invia();

    await waitFor(() => expect(casella.value).toBe(""));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "ADD_COMMENT" }));
  });
});
