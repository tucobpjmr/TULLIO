// Criticità #10 — la validazione dice COSA c'è che non va e DOVE.
//
// PERCHÉ ESISTE. `lib/validators.js` conteneva un solo controllo (l'email) e
// il resto della validazione viveva dentro i form, con l'esito comunicato da
// un toast — un messaggio in un angolo dello schermo, che sparisce da solo,
// mentre il campo sbagliato resta identico a quelli giusti. Nei casi peggiori
// non c'era nemmeno quello: `if (!form.name.trim()) return;` usciva in
// silenzio, e l'unico indizio era un bottone spento, che a form appena aperto
// si legge come un'app rotta.
//
// Le tre proprietà che questi test fissano, e che il toast non poteva dare:
//   1. il messaggio è LEGATO all'input (`aria-describedby` + `aria-invalid`),
//      quindi esiste anche per chi non vede il layout;
//   2. il FOCUS va sul primo campo sbagliato in ordine visivo;
//   3. l'errore si spegne appena si corregge quel campo, non al submit dopo.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  validaCampi, primoCampoInvalido, obbligatorio, emailValida, interpretabile,
  isValidEmail,
} from "../lib/validators.js";
// NewConversationView monta Avatar → lib/api.js → lib/supabase.js, che senza
// URL e chiave non si costruisce: stessa mock di dashboardQueues.test.jsx.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

import { ClienteModal } from "../components/clients/ClienteModal.jsx";
import { NoticeEditorModal } from "../components/modals/NoticeEditorModal.jsx";
import { AddCategoryModal } from "../components/modals/AddCategoryModal.jsx";
import { NewConversationView } from "../components/chat/NewConversationView.jsx";
import { EditListaModal } from "../components/liste/modals/EditListaModal.jsx";
import { Trash } from "../components/views/Trash.jsx";
import { TemplateTab } from "../components/modals/bulk/TemplateTab.jsx";
import { renderWithAppData, DEMO_APP_CTX } from "./helpers/appData.jsx";

// ─── La metà pura ───────────────────────────────────────────────────────────
describe("validators — validatori componibili", () => {
  it("obbligatorio riconosce vuoto, spazi, null e undefined", () => {
    const regola = obbligatorio("Serve un nome.");
    expect(regola("")).toBe("Serve un nome.");
    expect(regola("   ")).toBe("Serve un nome.");
    expect(regola(null)).toBe("Serve un nome.");
    expect(regola(undefined)).toBe("Serve un nome.");
    expect(regola("Rossi")).toBeNull();
  });

  it("emailValida accetta il vuoto (è opzionale) ma non una stringa sbagliata", () => {
    // È il contratto di ogni punto in cui l'app chiede un'email: lasciarla
    // vuota è legittimo, sbagliarla no.
    expect(emailValida()("")).toBeNull();
    expect(emailValida()("mario@agenzia.it")).toBeNull();
    expect(emailValida()("mario@")).toMatch(/Email/);
    expect(isValidEmail("mario@agenzia.it")).toBe(true);
  });

  it("interpretabile delega al parser del dominio e vede gli altri campi", () => {
    // L'importo di un movimento si interpreta col SEGNO scelto nel form: è il
    // motivo per cui un validatore riceve anche gli altri valori.
    const parse = (v, f) => (v === "1000" ? Number(v) * f.segno : null);
    const regola = interpretabile(parse, "Importo non valido.");
    expect(regola("1000", { segno: -1 })).toBeNull();
    expect(regola("mille", { segno: 1 })).toBe("Importo non valido.");
  });

  it("validaCampi si ferma al primo messaggio per campo", () => {
    const errori = validaCampi(
      { name: "", email: "storto" },
      { name: [obbligatorio("A"), obbligatorio("B")], email: emailValida("C") },
    );
    // Due messaggi sullo stesso input chiederebbero di correggere due cose in
    // una casella sola.
    expect(errori).toEqual({ name: "A", email: "C" });
  });

  it("validaCampi ritorna un oggetto vuoto su un form valido", () => {
    expect(validaCampi({ name: "Rossi" }, { name: obbligatorio("A") })).toEqual({});
  });

  it("primoCampoInvalido segue l'ordine VISIVO, non quello delle regole", () => {
    // Object.keys seguirebbe l'ordine di dichiarazione, che non è detto sia
    // quello dei campi a schermo: mandare il focus a un campo più in alto di
    // un altro già sbagliato fa scorrere la pagina avanti e indietro.
    const errori = { email: "no", name: "no" };
    expect(primoCampoInvalido(errori, ["name", "email"])).toBe("name");
    expect(primoCampoInvalido({}, ["name", "email"])).toBeNull();
  });
});

// ─── La metà visiva, su un form vero ────────────────────────────────────────
describe("ClienteModal — il nome mancante lo dice, non lo tace", () => {
  const monta = () => {
    const onSave = vi.fn();
    render(<ClienteModal cliente={null} onSave={onSave} onClose={vi.fn()} />);
    return onSave;
  };
  const salva = () => fireEvent.click(screen.getByText("Aggiungi"));

  it("il messaggio è sotto il campo, legato all'input e col focus dentro", async () => {
    const onSave = monta();
    salva();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/nome è obbligatorio/);
    const campo = screen.getByLabelText("Nome *");
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("il bottone di salvataggio resta ATTIVO a form incompleto", () => {
    // Un bottone spento non dice cosa manca. Premuto, ora il form lo dice.
    monta();
    expect(screen.getByText("Aggiungi").disabled).toBe(false);
  });

  it("l'errore si spegne appena si scrive nel campo", async () => {
    monta();
    salva();
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Rossi" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un'email sbagliata ferma il salvataggio e marca il SUO campo, non il nome", async () => {
    const onSave = monta();
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Rossi" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rossi@" } });
    salva();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/Email non valida/);
    expect(screen.getByLabelText("Nome *").getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("con i campi a posto il salvataggio parte", async () => {
    const onSave = monta();
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "  Rossi  " } });
    salva();

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    // Il nome arriva già ripulito: la validazione non deve essere l'unico
    // punto in cui gli spazi contano.
    expect(onSave.mock.calls[0][0].name).toBe("Rossi");
  });
});

// ─── M-3 dell'audit del 16 agosto — gli ultimi cinque call site ─────────────
// La regola («inline, non via toast; ⛔ niente `if (!campo) return;` muto e
// niente bottone disabilitato al posto del messaggio») valeva per tre form su
// otto. Gli altri cinque erano rimasti alla forma di prima, due con il bottone
// spento e tre senza nemmeno quello: si premeva "Salva" e non succedeva nulla.
// Qui ne sono coperti i due percorsi più frequenti — pubblicare un avviso in
// bacheca e creare una categoria — con le stesse tre proprietà di sopra.
describe("NoticeEditorModal — un avviso vuoto lo dice", () => {
  const monta = () => {
    const onSave = vi.fn();
    // L'anteprima dell'avviso passa da MentionText, che legge il team da
    // useAppData(): serve il provider, come per ogni componente che lo consuma.
    renderWithAppData(
      <NoticeEditorModal notice={null} onSave={onSave} onClose={vi.fn()} />,
      DEMO_APP_CTX,
    );
    return onSave;
  };
  const pubblica = () => fireEvent.click(screen.getByText("📌 Pubblica avviso"));

  it("il bottone è premibile e spiega cosa manca", async () => {
    const onSave = monta();
    // Prima era `disabled`: nessun messaggio, e un modale che nasce con il
    // proprio comando spento si legge come rotto.
    expect(screen.getByText("📌 Pubblica avviso").disabled).toBe(false);

    pubblica();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/non può essere vuoto/);
    const campo = screen.getByPlaceholderText(/Scrivi qui il tuo avviso/);
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("l'errore si spegne appena si scrive, e poi il salvataggio parte", async () => {
    const onSave = monta();
    pubblica();
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/Scrivi qui il tuo avviso/), {
      target: { value: "Riunione lunedì" },
    });
    expect(screen.queryByRole("alert")).toBeNull();

    pubblica();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].text).toBe("Riunione lunedì");
  });
});

describe("AddCategoryModal — il nome della categoria è obbligatorio e lo dice", () => {
  it("il messaggio è legato al campo e la creazione non parte", async () => {
    const dispatch = vi.fn();
    render(<AddCategoryModal dispatch={dispatch} onClose={vi.fn()} existingKeys={[]} />);

    fireEvent.click(screen.getByText("Crea categoria"));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/obbligatorio/);
    const campo = screen.getByPlaceholderText("Es. Trasferimenti");
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(dispatch).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: "Trasferimenti" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("Crea categoria"));
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch.mock.calls[0][0].type).toBe("ADD_CATEGORY");
  });
});

// ─── B-3 · gli ultimi quattro call site della variante «bottone spento» ────
// Tutti e quattro spegnevano il comando invece di dire cosa mancasse, e due
// avevano PIÙ condizioni: il comando era disabilitato e non diceva quale delle
// due o tre non fosse soddisfatta. Le tre proprietà verificate sono le stesse
// di sopra — messaggio legato al campo, focus sul primo campo sbagliato in
// ordine visivo, errore che si spegne appena si corregge — più una quarta che
// riguarda questa famiglia: il comando NON è più `disabled`, perché un bottone
// spento a form appena aperto si legge come un'app rotta.
describe("NewConversationView — le due condizioni del gruppo, dette una per una", () => {
  const monta = () => {
    const onCreate = vi.fn();
    renderWithAppData(
      <NewConversationView onCreate={onCreate} onCancel={vi.fn()} existing={[]} />,
      DEMO_APP_CTX,
    );
    fireEvent.click(screen.getByText(/Crea nuovo gruppo/));
    return onCreate;
  };
  const crea = () => fireEvent.click(screen.getByText("Crea gruppo"));

  it("il comando è premibile e dice ENTRAMBE le condizioni, col focus sulla prima", async () => {
    const onCreate = monta();
    expect(screen.getByText("Crea gruppo").disabled).toBe(false);

    crea();

    // Due messaggi, non uno riassuntivo: erano due condizioni spente insieme
    // in un `disabled`, e l'utente non sapeva quale delle due gli mancasse.
    const avvisi = await screen.findAllByRole("alert");
    expect(avvisi.map(a => a.textContent).join(" ")).toMatch(/nome al gruppo/i);
    expect(avvisi.map(a => a.textContent).join(" ")).toMatch(/almeno due membri/i);

    const campo = screen.getByPlaceholderText(/Nome del gruppo/);
    const suo = document.getElementById(campo.getAttribute("aria-describedby"));
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(suo.textContent).toMatch(/nome al gruppo/i);
    // Il focus va sul PRIMO campo sbagliato in ordine visivo: il nome sta
    // sopra l'elenco dei membri.
    expect(document.activeElement).toBe(campo);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("col nome compilato dice l'ALTRA condizione: servono due membri", async () => {
    // È il punto del rilievo: due condizioni riassunte in un comando spento
    // lasciavano indovinare quale delle due mancasse.
    const onCreate = monta();
    fireEvent.change(screen.getByPlaceholderText(/Nome del gruppo/), { target: { value: "Operativo" } });
    crea();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/almeno due membri/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("con nome e due membri il gruppo si crea", async () => {
    const onCreate = monta();
    fireEvent.change(screen.getByPlaceholderText(/Nome del gruppo/), { target: { value: "Operativo" } });
    const altri = DEMO_APP_CTX.team.filter(m => m.id !== "marco").slice(0, 2);
    for (const m of altri) fireEvent.click(screen.getByText(m.name));
    expect(screen.queryByRole("alert")).toBeNull();

    crea();
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ type: "group", name: "Operativo" });
  });
});

describe("EditListaModal — il nome del titolare lo dice sotto il campo, non in un toast", () => {
  const lista = { id: "l1", titolo: "Buono 2026", clients: { name: "MARIO ROSSI" } };

  it("il messaggio è legato all'input e la scrittura non parte", async () => {
    const run = vi.fn(async () => true);
    const onError = vi.fn();
    render(<EditListaModal lista={lista} onClose={vi.fn()} onSave={{ run, onError }} />);

    fireEvent.click(screen.getByLabelText("Rinomina il titolare in anagrafica"));
    const campo = screen.getByLabelText(/Nome del titolare/);
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/obbligatorio/);
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    // Il toast era il difetto: un messaggio in un angolo, lontano dal campo.
    expect(onError).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("l'errore si spegne appena si scrive, e poi il salvataggio parte", async () => {
    const run = vi.fn(async () => true);
    render(<EditListaModal lista={lista} onClose={vi.fn()} onSave={{ run, onError: vi.fn() }} />);

    fireEvent.click(screen.getByLabelText("Rinomina il titolare in anagrafica"));
    fireEvent.change(screen.getByLabelText(/Nome del titolare/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Nome del titolare/), { target: { value: "ROSSI MARIO" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith({
      id: "l1", titolo: "Buono 2026", clientName: "ROSSI MARIO",
    }));
  });
});

describe("Trash — il ripristino dice che manca il titolo, invece di spegnere il comando", () => {
  const TASK = {
    id: "t1", title: "Prenotazione hotel", category: "booking", priority: "medium",
    status: "todo", assignees: [], comments: [], deletedAt: new Date().toISOString(),
  };
  const apri = () => {
    const dispatch = vi.fn();
    renderWithAppData(<Trash dispatch={dispatch} loading={false} />, { ...DEMO_APP_CTX, tasks: [TASK] });
    fireEvent.click(screen.getByTitle("Ripristina con modifica"));
    return dispatch;
  };

  it("il messaggio è legato al campo, il focus ci torna e il ripristino non parte", async () => {
    const dispatch = apri();
    const conferma = screen.getByText("↻ Conferma ripristino");
    expect(conferma.disabled).toBe(false);

    const campo = screen.getByLabelText("TITOLO");
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.click(conferma);

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/titolo è obbligatorio/i);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    // Né UPDATE_TASK né RESTORE_TASK: una task senza titolo non torna indietro.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("corretto il titolo, il ripristino parte", async () => {
    const dispatch = apri();
    fireEvent.change(screen.getByLabelText("TITOLO"), { target: { value: "" } });
    fireEvent.click(screen.getByText("↻ Conferma ripristino"));
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("TITOLO"), { target: { value: "Prenotazione hotel" } });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("↻ Conferma ripristino"));
    await waitFor(() => expect(dispatch.mock.calls.map(c => c[0].type))
      .toEqual(["UPDATE_TASK", "RESTORE_TASK"]));
  });
});

describe("TemplateTab — le tre condizioni spente insieme, ora dette una per una", () => {
  const monta = () => {
    const onCreate = vi.fn(async () => ({ error: null }));
    renderWithAppData(
      <TemplateTab onCreate={onCreate} onClose={vi.fn()} onCancel={vi.fn()} clients={[]} />,
      DEMO_APP_CTX,
    );
    return onCreate;
  };
  const crea = () => fireEvent.click(screen.getByText(/^✓ Crea/));

  it("senza template scelto lo dice, invece di offrire un comando spento che crea zero task", async () => {
    // Il footer con «✓ Crea 0 task» è a schermo anche nella schermata di
    // scelta: prima era `disabled`, cioè un comando spento senza spiegazione.
    const onCreate = monta();
    expect(screen.getByText(/^✓ Crea/).disabled).toBe(false);

    crea();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/scegli prima un template/i);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("scelto il template, dice che manca la DATA — l'altra condizione", async () => {
    const onCreate = monta();
    fireEvent.click(screen.getByText("Viaggio di nozze"));
    expect(screen.queryByRole("alert")).toBeNull();

    crea();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/data dell'evento/i);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
