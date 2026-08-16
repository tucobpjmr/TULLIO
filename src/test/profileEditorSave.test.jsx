// ProfileEditor — il salvataggio del profilo personale.
//
// PERCHÉ QUESTO TEST ESISTE. La modale persisteva da sé: dispatch ottimistico
// di UPDATE_OWN_PROFILE, poi due await a UsersAPI scritti nel corpo del
// componente, un toast per ciascuno e nessun rollback — infine `onClose()`
// incondizionato. Il risultato, quando la scrittura falliva (RLS, rete,
// trigger anti-escalation), era il peggiore possibile: state React aggiornato,
// modale chiusa, database invariato. L'utente scopriva che il proprio nome non
// era stato salvato al reload successivo, quando tornava indietro da solo.
//
// Oggi la scrittura è una entry del registry (state/persistence.js) e la
// modale fa una cosa sola: decidere se chiudersi, in base all'esito che il
// dispatch sincronizzato le restituisce. Questi test fissano quel contratto —
// sono la parte che nessun test sul registry può coprire, perché riguarda il
// comportamento della UI davanti a un errore.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Il client Supabase reale non va istanziato: ProfileEditor importa Users per
// il solo upload dell'avatar sul bucket (storage, non state — resta una
// chiamata diretta legittima).
vi.mock("../lib/api.js", () => ({
  Users: { uploadAvatar: vi.fn(async () => ({ url: null, error: null })) },
}));

// useAuth lancia senza <AuthProvider>. session:null tiene fuori dallo scenario
// l'upload della foto, che qui non è in prova.
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ session: null, updatePassword: vi.fn(), deleteAccount: vi.fn() }),
}));

const { ProfileEditor } = await import("../components/modals/ProfileEditor.jsx");

const MEMBER = { id: "marco", name: "Marco", role: "manager", color: "#0F2044", avatar: "M" };

const montaConDispatch = (dispatch) => {
  const onClose = vi.fn();
  render(<ProfileEditor member={MEMBER} dispatch={dispatch} onClose={onClose} />);
  return { onClose };
};

const salva = () => fireEvent.click(screen.getByText("✓ Salva profilo"));

describe("ProfileEditor — salvataggio", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("dispatcha UPDATE_OWN_PROFILE una sola volta, con tutti i campi del profilo", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    montaConDispatch(dispatch);

    fireEvent.change(screen.getByDisplayValue("Marco"), { target: { value: "Marco Ferretti" } });
    salva();

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    // Una sola azione: la persistenza non è più una seconda chiamata scritta a
    // mano accanto al dispatch.
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [action] = dispatch.mock.calls[0];
    expect(action.type).toBe("UPDATE_OWN_PROFILE");
    expect(action.payload).toMatchObject({ name: "Marco Ferretti", avatar: "MF", color: "#0F2044" });
    expect(Object.keys(action.payload).sort())
      .toEqual(["avatar", "color", "email", "name", "phone", "photoUrl"]);
  });

  it("chiude la modale quando la scrittura riesce", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { onClose } = montaConDispatch(dispatch);

    salva();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("NON chiude la modale quando la scrittura fallisce", async () => {
    // Il caso che prima passava inosservato: la modale si chiudeva comunque e
    // il profilo restava a video come se fosse stato salvato.
    const dispatch = vi.fn(async () => ({ error: { message: "permission denied" } }));
    const { onClose } = montaConDispatch(dispatch);

    fireEvent.change(screen.getByDisplayValue("Marco"), { target: { value: "Marco Ferretti" } });
    salva();

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    // Quanto digitato resta nel form: l'utente può ritentare senza riscrivere.
    expect(screen.getByDisplayValue("Marco Ferretti")).toBeTruthy();
  });

  it("non tenta il salvataggio con un'email non valida, e lo dice SUL campo", async () => {
    // Criticità #10: prima l'unico segnale era un toast in un angolo dello
    // schermo, mentre il campo sbagliato restava identico agli altri. Ora il
    // messaggio è sotto l'input, l'input è marcato `aria-invalid` e il focus
    // ci torna sopra — e non parte alcun dispatch, nemmeno per il toast.
    const dispatch = vi.fn(async () => ({ error: null }));
    const { onClose } = montaConDispatch(dispatch);

    const campo = screen.getByPlaceholderText("nome@agenzia.it");
    fireEvent.change(campo, { target: { value: "non-una-email" } });
    salva();

    const avviso = await screen.findByRole("alert");
    expect(avviso.textContent).toMatch(/Email non valida/);
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    expect(campo.getAttribute("aria-describedby")).toBe(avviso.id);
    expect(document.activeElement).toBe(campo);
    expect(dispatch).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("l'errore sul campo si spegne appena lo si corregge", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    montaConDispatch(dispatch);

    const campo = screen.getByPlaceholderText("nome@agenzia.it");
    fireEvent.change(campo, { target: { value: "non-una-email" } });
    salva();
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(campo, { target: { value: "marco@agenzia.it" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(campo.getAttribute("aria-invalid")).toBeNull();
  });

  it("regge un dispatch che non ritorna nulla (modalità mock, senza Supabase)", async () => {
    // useSyncedDispatch ritorna sempre una Promise<{error}>, ma il componente
    // riceve `dispatch` come prop e nei test/mock può essere una spia nuda:
    // l'accesso all'esito non deve esplodere.
    const dispatch = vi.fn();
    const { onClose } = montaConDispatch(dispatch);

    salva();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

// ST-7 · La bozza unica dei campi del profilo.
//
// PERCHÉ QUESTI TEST ESISTONO. I diciassette `useState` di questa modale sono
// diventati un `draft` con un riduttore di campo (più i valori che restano
// separati di proposito). Un refactor di stato non può rompere un test
// funzionale se sbaglia solo a PROPAGARE: `setDraft({ name })` al posto di
// `setDraft(p => ({ ...p, name }))` fa passare ogni test che tocca un campo
// solo, e cancella gli altri quattro. Qui si asserisce esattamente quello.
describe("ProfileEditor — la bozza è unica e i campi non si sovrascrivono", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("scrivere in un campo non azzera gli altri", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    montaConDispatch(dispatch);

    fireEvent.change(screen.getByDisplayValue("Marco"), { target: { value: "Marco Ferretti" } });
    fireEvent.change(screen.getByPlaceholderText("nome@agenzia.it"), { target: { value: "marco@agenzia.it" } });
    fireEvent.change(screen.getByPlaceholderText("+39 333 123 4567"), { target: { value: "+39 333 0000000" } });
    // Il nome scritto per primo deve essere ancora lì dopo altre due scritture.
    expect(screen.getByDisplayValue("Marco Ferretti")).toBeTruthy();
    salva();

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch.mock.calls[0][0].payload).toMatchObject({
      name: "Marco Ferretti", email: "marco@agenzia.it", phone: "+39 333 0000000",
    });
  });

  it("il colore del profilo viaggia nel payload anche se la modale non lo modifica", async () => {
    // Non è un campo dell'interfaccia ma è un campo del profilo: sta in `draft`
    // e si legge da lì, invece di essere ricalcolato al salvataggio.
    const dispatch = vi.fn(async () => ({ error: null }));
    render(<ProfileEditor member={{ ...MEMBER, color: "#D4A843" }} dispatch={dispatch} onClose={vi.fn()} />);
    salva();
    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch.mock.calls[0][0].payload.color).toBe("#D4A843");
  });

  it("annullare non persiste la bozza sporca", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { onClose } = montaConDispatch(dispatch);

    fireEvent.change(screen.getByDisplayValue("Marco"), { target: { value: "Nome buttato via" } });
    fireEvent.click(screen.getByText("Annulla"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// M-2 dell'audit del 16 agosto — il salvataggio in volo si vede e non si
// ripete. Era l'unica delle tre operazioni asincrone della modale senza uno
// stato in volo: nessun feedback per tutta la durata dell'upload dell'avatar
// (che precede la scrittura del profilo) e nessun freno al secondo click.
describe("ProfileEditor — salvataggio in volo", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Dispatch che resta appeso finché il test non lo risolve: è la finestra in
  // cui l'utente guarda lo schermo e non sa se il click è arrivato.
  const dispatchSospeso = () => {
    let risolvi;
    const promessa = new Promise((r) => { risolvi = r; });
    const dispatch = vi.fn(() => promessa);
    return { dispatch, concludi: () => risolvi({ error: null }) };
  };

  it("mentre scrive, il bottone lo dice ed è spento", async () => {
    const { dispatch, concludi } = dispatchSospeso();
    montaConDispatch(dispatch);

    salva();

    const bottone = await screen.findByText("Salvataggio…");
    expect(bottone.disabled).toBe(true);
    expect(bottone.getAttribute("aria-busy")).toBe("true");

    concludi();
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  });

  it("due click ravvicinati restano UNA sola scrittura", async () => {
    const { dispatch, concludi } = dispatchSospeso();
    montaConDispatch(dispatch);

    salva();
    await screen.findByText("Salvataggio…");
    // Il secondo click: prima ripartiva da capo, upload dell'avatar compreso.
    fireEvent.click(screen.getByText("Salvataggio…"));

    expect(dispatch).toHaveBeenCalledTimes(1);
    concludi();
  });

  it("dopo un errore il bottone torna premibile", async () => {
    const dispatch = vi.fn(async () => ({ error: { message: "permission denied" } }));
    montaConDispatch(dispatch);

    salva();

    // La modale resta aperta (vedi sopra): se il bottone restasse spento,
    // l'utente avrebbe davanti un form che non può più inviare.
    await waitFor(() => expect(screen.getByText("✓ Salva profilo").disabled).toBe(false));
    salva();
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
  });
});
