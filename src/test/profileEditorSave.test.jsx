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

  it("non tenta il salvataggio con un'email non valida", async () => {
    const dispatch = vi.fn(async () => ({ error: null }));
    const { onClose } = montaConDispatch(dispatch);

    fireEvent.change(screen.getByPlaceholderText("nome@agenzia.it"), { target: { value: "non-una-email" } });
    salva();

    await waitFor(() => expect(dispatch).toHaveBeenCalled());
    // L'unica azione è il toast di validazione: nessun UPDATE_OWN_PROFILE.
    expect(dispatch.mock.calls.every(([a]) => a.type !== "UPDATE_OWN_PROFILE")).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
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
