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
import { ClienteModal } from "../components/clients/ClienteModal.jsx";

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
