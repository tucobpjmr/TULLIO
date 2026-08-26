// src/test/salvaEChiudiListe.test.jsx
// A-2 dell'audit del 26 agosto — le dodici form del modulo Liste, l'ultimo
// blocco rimasto fuori dal contratto «salva e chiudi».
//
// PERCHÉ UN TERZO FILE. `salvaEChiudi.test.jsx` fissa il CONTRATTO
// (`useSalvataggio`: doppio invio, esito, riuscita parziale) e i tre call site
// che lo adottarono per primi; `salvaEChiudiSeiForm.test.jsx` i sei trovati
// ancora fuori il 19 agosto. Restava un blocco intero, e non per distrazione:
// il modulo Liste è arrivato da un porting con un registry di scrittura suo, e
// nessuno dei due file di prima lo guardava — così come non lo guardava il
// controllo di `verifica:convenzioni`, che è A-1.
//
// STESSO METODO degli altri due, perché è il metodo che dice qualcosa: ogni
// caso guarda DUE cose insieme, che il pannello non si sia chiuso E che i
// valori digitati siano ancora nel DOM. Un test che si accontentasse del
// messaggio d'errore passerebbe anche su una modale che si chiude subito dopo
// averlo mostrato, che è esattamente il difetto.
//
// ⚠️ E una cosa in più che qui serve e altrove no: il freno al DOPPIO INVIO
// osservato sul comportamento, non sul `disabled`. Nel modulo il freno era
// `if (saving) return`, cioè una lettura dello STATO: fra due click ravvicinati
// React può non aver ancora ri-renderizzato, entrambi i gestori leggono `false`
// e partono due scritture. Su `registraMovimento` sono due movimenti su un
// saldo, ed è il modulo in cui il dato è denaro (M-1 del 25 agosto).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { DispatchProvider } from "../state/DispatchContext.jsx";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// I quattro editor in linea chiamano l'esecutore del registry direttamente
// (`esegui("modificaTitolo", …)`), a differenza delle otto modali che ricevono
// l'operazione già confezionata dal genitore. `importOriginal` tiene il resto
// del modulo — serve `CONFERMA_RESET`, che ResetTotaleModal importa da qui.
const esegui = vi.fn();
vi.mock("../components/liste/listePersistence.js", async (importOriginal) => ({
  ...(await importOriginal()),
  useListeWrite: () => esegui,
}));

const { NuovaListaModal } = await import("../components/liste/modals/NuovaListaModal.jsx");
const { AggiungiBeneficiarioModal } = await import("../components/liste/modals/AggiungiBeneficiarioModal.jsx");
const { SpostaTitolareModal } = await import("../components/liste/modals/SpostaTitolareModal.jsx");
const { EditListaModal } = await import("../components/liste/modals/EditListaModal.jsx");
const { EditMovimentoModal } = await import("../components/liste/modals/EditMovimentoModal.jsx");
const { BulkMovimentiModal } = await import("../components/liste/modals/BulkMovimentiModal.jsx");
const { ImportaBackupConfirmModal } = await import("../components/liste/modals/ImportaBackupConfirmModal.jsx");
const { ResetTotaleModal } = await import("../components/liste/modals/ResetTotaleModal.jsx");

// Il rifiuto nel dialetto del modulo: `run()` risponde `false` — la promise si
// RISOLVE, non rigetta, esattamente come il `{ error }` del core. È la forma
// che le dodici form devono saper attendere.
const RIFIUTA = () => Promise.resolve(false);
const ACCETTA = () => Promise.resolve(true);

// Una promise che si risolve quando decidiamo noi: serve a osservare lo stato
// «in volo», che è per definizione la finestra fra il click e l'esito.
function differita() {
  let risolvi;
  const promessa = new Promise((r) => { risolvi = r; });
  return { promessa, risolvi };
}

const CLIENTI = [
  { id: "c1", name: "ROSSI MARIO" },
  { id: "c2", name: "BIANCHI MARIA" },
];
const LISTA = { id: "l1", titolo: "Buono viaggio 2026", clients: { name: "ROSSI MARIO" }, stato: "attiva" };
const MOVIMENTO = { id: "m1", data_movimento: "2026-07-28", descrizione: "BONIFICO", importo: "150.00", metodo: "bonifico" };

beforeEach(() => { vi.clearAllMocks(); });

// ─── Le otto modali, che hanno tutte la stessa forma ───────────────────────
// Tabellare e non otto blocchi copiati: la forma È una sola (`{ run, onError }`
// dal genitore, un bottone primario, un campo digitato), e scriverla otto volte
// avrebbe riprodotto nel test la duplicazione che il rilievo toglie dal codice.
const MODALI = [
  {
    nome: "NuovaListaModal",
    monta: (run, onClose) => render(
      <NuovaListaModal clients={CLIENTI} onClose={onClose}
        onCreate={{ run, onError: vi.fn() }} presetClientId="c1" />),
    compila: () => fireEvent.change(screen.getByLabelText(/Titolo \(facoltativo\)/i),
      { target: { value: "Viaggio di nozze" } }),
    invia: "Crea lista",
    inVolo: "Creo…",
    campo: () => screen.getByLabelText(/Titolo \(facoltativo\)/i),
    atteso: "Viaggio di nozze",
  },
  {
    nome: "AggiungiBeneficiarioModal",
    monta: (run, onClose) => render(
      <AggiungiBeneficiarioModal clients={CLIENTI} onClose={onClose}
        onCreate={{ run, onError: vi.fn() }} />),
    compila: () => {
      fireEvent.change(screen.getByLabelText(/^Cliente$/i), { target: { value: "__new__" } });
      fireEvent.change(screen.getByLabelText(/Nome nuovo cliente/i), { target: { value: "VERDI ANNA" } });
    },
    invia: "Aggiungi",
    inVolo: "Aggiungo…",
    campo: () => screen.getByLabelText(/Nome nuovo cliente/i),
    atteso: "VERDI ANNA",
  },
  {
    nome: "SpostaTitolareModal",
    monta: (run, onClose) => render(
      <SpostaTitolareModal clients={CLIENTI} cointestatariIds={new Set()}
        titolareAttuale="ROSSI MARIO" onClose={onClose} onMove={{ run, onError: vi.fn() }} />),
    compila: () => fireEvent.change(screen.getByLabelText(/Nuovo titolare/i), { target: { value: "c2" } }),
    invia: "Sposta",
    inVolo: "Sposto…",
    campo: () => screen.getByLabelText(/Nuovo titolare/i),
    atteso: "c2",
  },
  {
    nome: "EditListaModal",
    monta: (run, onClose) => render(
      <EditListaModal lista={LISTA} onClose={onClose} onSave={{ run, onError: vi.fn() }} />),
    compila: () => fireEvent.change(screen.getByLabelText(/^Titolo/i), { target: { value: "Titolo corretto" } }),
    invia: "Salva modifiche",
    inVolo: "Salvo…",
    campo: () => screen.getByLabelText(/^Titolo/i),
    atteso: "Titolo corretto",
  },
  {
    nome: "EditMovimentoModal",
    monta: (run, onClose) => render(
      <EditMovimentoModal movimento={MOVIMENTO} onClose={onClose} onSave={{ run, onError: vi.fn() }} />),
    compila: () => fireEvent.change(screen.getByLabelText(/Descrizione/i),
      { target: { value: "BONIFICO CORRETTO" } }),
    invia: "Salva modifiche",
    inVolo: "Salvo…",
    campo: () => screen.getByLabelText(/Descrizione/i),
    atteso: "BONIFICO CORRETTO",
  },
  {
    nome: "BulkMovimentiModal",
    monta: (run, onClose) => render(
      <BulkMovimentiModal onClose={onClose} onSave={{ run, onError: vi.fn() }} />),
    compila: () => {
      fireEvent.change(screen.getAllByPlaceholderText(/Descrizione \(es/i)[0],
        { target: { value: "ACCONTO ROSSI" } });
      fireEvent.change(screen.getAllByPlaceholderText("0,00")[0], { target: { value: "250,00" } });
    },
    invia: "Registra tutti",
    inVolo: "Registro…",
    campo: () => screen.getAllByPlaceholderText(/Descrizione \(es/i)[0],
    atteso: "ACCONTO ROSSI",
  },
  {
    nome: "ImportaBackupConfirmModal",
    monta: (run, onClose) => render(
      <ImportaBackupConfirmModal nL={3} nB={1} nM={12} onClose={onClose}
        onSave={{ run, onError: vi.fn() }} />),
    compila: () => {},
    invia: "Carica backup",
    inVolo: "Carico…",
    // Nessun campo digitato: qui il contratto serve per il freno al doppio
    // invio e per il guard di smontaggio, non per i dati da salvare.
    campo: null,
  },
  {
    nome: "ResetTotaleModal",
    monta: (run, onClose) => render(
      <ResetTotaleModal onClose={onClose} onSave={{ run, onError: vi.fn() }} />),
    compila: () => fireEvent.change(screen.getByLabelText(/Per confermare digita/i),
      { target: { value: "RESET TOTALE" } }),
    invia: "Elimina tutto",
    inVolo: "Elimino…",
    campo: () => screen.getByLabelText(/Per confermare digita/i),
    atteso: "RESET TOTALE",
  },
];

describe.each(MODALI)("A-2 · $nome", (m) => {
  it("scrittura rifiutata: resta aperta e ciò che si è digitato è ancora lì", async () => {
    const onClose = vi.fn();
    const run = vi.fn(RIFIUTA);
    m.monta(run, onClose);
    m.compila();
    fireEvent.click(screen.getByText(m.invia));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    // Il bottone torna premibile: senza il `finally` del contratto, un rifiuto
    // che passasse per un'eccezione lo lascerebbe spento per sempre.
    await waitFor(() => expect(screen.getByText(m.invia)).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    if (m.campo) expect(m.campo().value).toBe(m.atteso);
  });

  it("scrittura riuscita: `run` è chiamata una volta sola (controllo positivo)", async () => {
    const run = vi.fn(ACCETTA);
    m.monta(run, vi.fn());
    m.compila();
    fireEvent.click(screen.getByText(m.invia));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  });

  it("mentre la scrittura è in volo il comando è spento e lo dice", async () => {
    const { promessa, risolvi } = differita();
    m.monta(vi.fn(() => promessa), vi.fn());
    m.compila();
    fireEvent.click(screen.getByText(m.invia));

    const spento = await screen.findByText(m.inVolo);
    expect(spento).toBeDisabled();
    await act(async () => { risolvi(true); await promessa; });
  });

  // ⚠️ IL CASO CHE IL MODULO NON AVEVA, e il motivo per cui NON si usa
  // `fireEvent` qui. `fireEvent` avvolge ogni click in un `act()` proprio,
  // quindi React ri-renderizza FRA i due click: al secondo il bottone è già
  // `disabled` e il gestore non parte nemmeno. Un test scritto così passa
  // anche sul codice vecchio — verificato — e non dimostra niente.
  //
  // Due `dispatchEvent` nativi dentro UN SOLO `act()` riproducono la corsa
  // vera: React batcha, il commit arriva alla fine dello scope, e i due
  // gestori girano entrambi con la closure del render precedente. È lì che
  // `if (saving) return` legge `false` due volte e ne partono DUE — su
  // `registraMovimento`, due movimenti su un saldo. A fermare il secondo è
  // solo il `ref` dentro `useSalvataggio`.
  it("due click nello stesso turno, prima del re-render: una scrittura sola", async () => {
    const { promessa, risolvi } = differita();
    const run = vi.fn(() => promessa);
    m.monta(run, vi.fn());
    m.compila();

    const bottone = screen.getByText(m.invia);
    const clicca = () => bottone.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    act(() => { clicca(); clicca(); });

    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => { risolvi(true); await promessa; });
  });
});

// ─── I quattro editor in linea ─────────────────────────────────────────────
// Non ricevono `run` dal genitore: chiamano `esegui` e leggono `{ ok }`. La
// promessa da mantenere è la stessa — un rifiuto non chiude l'editor e non
// perde ciò che si è digitato — ma qui «non chiudere» si osserva sul fatto che
// il campo di modifica sia ancora a schermo, non su un `onClose` non chiamato.
const { TitoloTestata } = await import("../components/liste/TitoloTestata.jsx");
const { NoteInterne } = await import("../components/liste/NoteInterne.jsx");
const { CellEditor } = await import("../components/liste/CellEditor.jsx");
const { AddMovBox } = await import("../components/liste/AddMovBox.jsx");

const KO = { ok: false, data: null };
const OK = { ok: true, data: null };

describe("A-2 · gli editor in linea del modulo", () => {
  beforeEach(() => { esegui.mockReset(); });

  it("TitoloTestata — rifiuto: l'editor resta aperto col testo digitato", async () => {
    esegui.mockResolvedValue(KO);
    const onSaved = vi.fn();
    render(<TitoloTestata lista={LISTA} onSaved={onSaved} />);
    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    const campo = screen.getByLabelText(/Titolo della lista/i);
    fireEvent.change(campo, { target: { value: "Nuovo titolo" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(esegui).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText(/Titolo della lista/i).value).toBe("Nuovo titolo");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("TitoloTestata — riuscita: chiude e ricarica", async () => {
    esegui.mockResolvedValue(OK);
    const onSaved = vi.fn();
    render(<TitoloTestata lista={LISTA} onSaved={onSaved} />);
    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    fireEvent.change(screen.getByLabelText(/Titolo della lista/i), { target: { value: "Nuovo titolo" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(/Titolo della lista/i)).toBeNull();
  });

  // Il valore invariato non deve nemmeno toccare la rete: era già così, e resta
  // vero dopo il passaggio al contratto (la scorciatoia sta PRIMA di `salva`).
  it("TitoloTestata — titolo invariato: chiude senza scrivere", async () => {
    render(<TitoloTestata lista={LISTA} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    fireEvent.click(screen.getByText("Salva"));
    expect(esegui).not.toHaveBeenCalled();
  });

  // ─── B-2 · ciò che i due editor condividono ─────────────────────────────
  // (audit del 26 agosto)
  //
  // Il ciclo apri/tasti/chiudi era scritto due volte alla lettera, con un solo
  // token di differenza. Ora è `useModificaInLinea`, e queste sono le sue
  // proprietà: quella su Invio è la sola che DIVERGE fra i due, ed è l'unica
  // ragione per cui l'hook guarda il tag dell'elemento.

  it("TitoloTestata — Invio conferma, Escape chiude senza scrivere", async () => {
    esegui.mockResolvedValue(OK);
    render(<TitoloTestata lista={LISTA} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    fireEvent.keyDown(screen.getByLabelText(/Titolo della lista/i), { key: "Escape" });
    expect(screen.queryByLabelText(/Titolo della lista/i)).toBeNull();
    expect(esegui).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    fireEvent.change(screen.getByLabelText(/Titolo della lista/i), { target: { value: "Da tastiera" } });
    fireEvent.keyDown(screen.getByLabelText(/Titolo della lista/i), { key: "Enter" });
    await waitFor(() => expect(esegui).toHaveBeenCalledTimes(1));
  });

  it("NoteInterne — Invio NON conferma: in una nota è un a capo", async () => {
    // È la differenza che l'hook codifica guardando `e.target.tagName`. Se
    // confermasse, non si potrebbe scrivere una nota su due righe.
    render(<NoteInterne lista={{ ...LISTA, note: "vecchia nota" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("vecchia nota"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "prima riga" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    expect(esegui).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox").value).toBe("prima riga");
  });

  it("NoteInterne — Escape chiude e scarta ciò che si è digitato", async () => {
    render(<NoteInterne lista={{ ...LISTA, note: "vecchia nota" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("vecchia nota"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "ripensamento" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });

    expect(esegui).not.toHaveBeenCalled();
    expect(screen.getByText("vecchia nota")).toBeInTheDocument();
  });

  it("all'apertura il campo prende il fuoco, e SOLO l'input si seleziona", async () => {
    // `select()` su una `<textarea>` significherebbe che il primo carattere
    // digitato cancella una nota che si voleva solo ritoccare.
    render(<TitoloTestata lista={LISTA} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Modifica il titolo"));
    const input = screen.getByLabelText(/Titolo della lista/i);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(LISTA.titolo.length);
  });

  it("NoteInterne — la nota prende il fuoco ma NON si seleziona", async () => {
    render(<NoteInterne lista={{ ...LISTA, note: "vecchia nota" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("vecchia nota"));
    const area = screen.getByRole("textbox");
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(area.selectionEnd);
  });

  it("NoteInterne — rifiuto: l'editor resta aperto col testo digitato", async () => {
    esegui.mockResolvedValue(KO);
    render(<NoteInterne lista={{ ...LISTA, note: "vecchia nota" }} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByText("vecchia nota"));
    const campo = screen.getByRole("textbox");
    fireEvent.change(campo, { target: { value: "nota aggiornata" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(esegui).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox").value).toBe("nota aggiornata");
  });

  it("CellEditor — rifiuto: la cella resta in modifica col valore digitato", async () => {
    esegui.mockResolvedValue(KO);
    const onSaved = vi.fn();
    render(
      <DispatchProvider dispatch={vi.fn()}>
        <table><tbody>
          <CellEditor movimento={MOVIMENTO} campo="descrizione" onSaved={onSaved} onCancel={vi.fn()} />
        </tbody></table>
      </DispatchProvider>);
    const campo = screen.getByLabelText("Descrizione");
    fireEvent.change(campo, { target: { value: "DESCRIZIONE NUOVA" } });
    fireEvent.click(screen.getByText("Salva"));

    await waitFor(() => expect(esegui).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Descrizione").value).toBe("DESCRIZIONE NUOVA");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("AddMovBox — rifiuto: il riquadro NON si svuota", async () => {
    esegui.mockResolvedValue(KO);
    render(<AddMovBox listaId="l1" onSaved={vi.fn()} onClose={vi.fn()} onBulk={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "ACCONTO" } });
    fireEvent.change(screen.getByLabelText(/Importo/i), { target: { value: "250,00" } });
    fireEvent.click(screen.getByText("Registra"));

    await waitFor(() => expect(esegui).toHaveBeenCalledTimes(1));
    // È la differenza che il contratto porta qui: prima lo svuotamento stava
    // dopo un `if (!ok) return`, quindi era già corretto — ora è in
    // `alSuccesso`, cioè non può più essere raggiunto per un'altra strada.
    expect(screen.getByLabelText("Descrizione").value).toBe("ACCONTO");
    expect(screen.getByLabelText(/Importo/i).value).toBe("250,00");
  });

  it("AddMovBox — riuscita: svuota descrizione e importo, tiene data e metodo", async () => {
    esegui.mockResolvedValue(OK);
    const onSaved = vi.fn();
    render(<AddMovBox listaId="l1" onSaved={onSaved} onClose={vi.fn()} onBulk={vi.fn()} />);
    const data = screen.getByLabelText("Data").value;
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "ACCONTO" } });
    fireEvent.change(screen.getByLabelText(/Importo/i), { target: { value: "250,00" } });
    fireEvent.click(screen.getByText("Registra"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Descrizione").value).toBe("");
    expect(screen.getByLabelText(/Importo/i).value).toBe("");
    expect(screen.getByLabelText("Data").value).toBe(data);
  });

  // Stessa tecnica delle otto modali, e qui è il caso che conta di più:
  // `registraMovimento` due volte sono due movimenti su un saldo.
  it("AddMovBox — due click prima del re-render: un movimento solo", async () => {
    const { promessa, risolvi } = differita();
    esegui.mockReturnValue(promessa);
    render(<AddMovBox listaId="l1" onSaved={vi.fn()} onClose={vi.fn()} onBulk={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "ACCONTO" } });
    fireEvent.change(screen.getByLabelText(/Importo/i), { target: { value: "250,00" } });

    const bottone = screen.getByText("Registra");
    const clicca = () => bottone.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    act(() => { clicca(); clicca(); });

    expect(esegui).toHaveBeenCalledTimes(1);
    await act(async () => { risolvi(OK); await promessa; });
  });
});
