// A-3 dell'analisi del 6 novembre — le operazioni irreversibili sull'account
// chiedono la password attuale.
//
// PERCHÉ QUESTO TEST ESISTE. In agenzia i PC sono condivisi, e una sessione
// lasciata aperta bastava a cambiare la password (cioè a prendersi
// l'account) o a eliminarlo digitando «ELIMINA». Questi casi fissano la metà
// VISIBILE del rimedio: il campo c'è, è obbligatorio, e la password arriva a
// chi la verifica davvero (GoTrue per il cambio, la Edge Function
// `delete-account` per l'eliminazione), che qui è sostituito da un doppio.
// La verifica lato server è provata altrove: `edge/deleteAccountRiautenticazione`
// e `integration/account.test.js`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  cambiaPassword: vi.fn(),
  deleteAccount: vi.fn(),
  signOutOvunque: vi.fn(),
}));
vi.mock("../../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ session: { user: { id: "marco" } }, ...auth }),
}));

const { AccountSicurezza } = await import("../../components/shell/AccountSicurezza.jsx");
const { renderWithAppData, DEMO_APP_CTX } = await import("../helpers/appData.jsx");

const NUOVA = "NuovaPassword2026";
// Il bottone che apre e chiude la sezione, non quello che elimina: il nome
// accessibile finisce con la freccia della fisarmonica.
const FISARMONICA_ELIMINA = /Elimina account\s*[▲▼]$/;
const scrivi = (etichetta, valore) =>
  fireEvent.change(screen.getByLabelText(etichetta), { target: { value: valore } });

function apriCambioPassword() {
  renderWithAppData(<AccountSicurezza />, DEMO_APP_CTX);
  fireEvent.click(screen.getByRole("button", { name: /Cambia password/ }));
}

function apriEliminazione() {
  renderWithAppData(<AccountSicurezza />, DEMO_APP_CTX);
  fireEvent.click(screen.getByRole("button", { name: FISARMONICA_ELIMINA }));
}

beforeEach(() => {
  auth.cambiaPassword.mockReset().mockResolvedValue({ error: null });
  auth.deleteAccount.mockReset().mockResolvedValue({ error: null });
});

describe("Cambia password — serve la password attuale", () => {
  it("il campo c'è, viene prima della nuova e si presenta come password attuale", () => {
    apriCambioPassword();
    const attuale = screen.getByLabelText("PASSWORD ATTUALE");
    expect(attuale).toHaveAttribute("type", "password");
    // È ciò che fa proporre al gestore di password la password SALVATA,
    // invece di generarne una nuova.
    expect(attuale).toHaveAttribute("autocomplete", "current-password");
    const campi = screen.getAllByLabelText(/PASSWORD/);
    expect(campi[0]).toBe(attuale);
  });

  it("senza password attuale non parte niente, e lo dice", async () => {
    apriCambioPassword();
    scrivi("NUOVA PASSWORD", NUOVA);
    scrivi("CONFERMA PASSWORD", NUOVA);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));
    expect(await screen.findByText("Inserisci la password attuale.")).toBeInTheDocument();
    expect(auth.cambiaPassword).not.toHaveBeenCalled();
  });

  it("con i tre campi giusti consegna attuale e nuova, nell'ordine", async () => {
    apriCambioPassword();
    scrivi("PASSWORD ATTUALE", "VecchiaPassword1");
    scrivi("NUOVA PASSWORD", NUOVA);
    scrivi("CONFERMA PASSWORD", NUOVA);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));
    expect(await screen.findByText("Password aggiornata.")).toBeInTheDocument();
    expect(auth.cambiaPassword).toHaveBeenCalledWith("VecchiaPassword1", NUOVA);
    // A esito positivo la bozza si svuota, password attuale compresa.
    expect(screen.getByLabelText("PASSWORD ATTUALE")).toHaveValue("");
  });

  it("un rifiuto del server resta a schermo, con i campi ancora pieni", async () => {
    auth.cambiaPassword.mockResolvedValueOnce({ error: { message: "La password attuale non è corretta." } });
    apriCambioPassword();
    scrivi("PASSWORD ATTUALE", "sbagliata");
    scrivi("NUOVA PASSWORD", NUOVA);
    scrivi("CONFERMA PASSWORD", NUOVA);
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));
    expect(await screen.findByText("La password attuale non è corretta.")).toBeInTheDocument();
    expect(screen.getByLabelText("NUOVA PASSWORD")).toHaveValue(NUOVA);
  });

  it("i campi password hanno lo stile del modulo (la prop giusta è inputStyle)", () => {
    // Dal commit 093e42d passavano `inputWFull={…}`, che PasswordField non
    // conosce: finiva sull'<input> come attributo sconosciuto e il campo
    // restava senza bordo, senza padding e largo quanto il testo.
    apriCambioPassword();
    for (const etichetta of ["PASSWORD ATTUALE", "NUOVA PASSWORD", "CONFERMA PASSWORD"]) {
      const campo = screen.getByLabelText(etichetta);
      expect(campo.style.width, etichetta).toBe("100%");
      expect(campo).not.toHaveAttribute("inputwfull");
    }
  });
});

describe("Elimina account — serve la password, oltre a «ELIMINA»", () => {
  it("con «ELIMINA» ma senza password non elimina, e lo dice", async () => {
    apriEliminazione();
    scrivi('DIGITA "ELIMINA" PER CONFERMARE', "ELIMINA");
    fireEvent.click(screen.getByRole("button", { name: "Elimina account definitivamente" }));
    expect(await screen.findByText("Inserisci la tua password per confermare.")).toBeInTheDocument();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
  });

  it("con «ELIMINA» e la password consegna la password a deleteAccount", async () => {
    apriEliminazione();
    scrivi('DIGITA "ELIMINA" PER CONFERMARE', "ELIMINA");
    scrivi("LA TUA PASSWORD", "LaMiaPassword1");
    fireEvent.click(screen.getByRole("button", { name: "Elimina account definitivamente" }));
    await waitFor(() => expect(auth.deleteAccount).toHaveBeenCalledWith("LaMiaPassword1"));
  });

  it("la password sbagliata è detta a schermo e l'account resta", async () => {
    auth.deleteAccount.mockResolvedValueOnce({ error: { message: "Password non corretta." } });
    apriEliminazione();
    scrivi('DIGITA "ELIMINA" PER CONFERMARE', "ELIMINA");
    scrivi("LA TUA PASSWORD", "sbagliata");
    fireEvent.click(screen.getByRole("button", { name: "Elimina account definitivamente" }));
    expect(await screen.findByText("Password non corretta.")).toBeInTheDocument();
  });

  it("chiudere la sezione dimentica la password scritta", () => {
    apriEliminazione();
    scrivi("LA TUA PASSWORD", "LaMiaPassword1");
    fireEvent.click(screen.getByRole("button", { name: FISARMONICA_ELIMINA }));
    fireEvent.click(screen.getByRole("button", { name: FISARMONICA_ELIMINA }));
    expect(screen.getByLabelText("LA TUA PASSWORD")).toHaveValue("");
  });
});
