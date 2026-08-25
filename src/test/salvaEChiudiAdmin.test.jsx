// Il contratto «salva e chiudi» su `admin/AddTeamMemberModal.jsx`
// (M-6, audit del 26 agosto).
//
// PERCHÉ QUESTO FILE ESISTE, e perché è separato dagli altri tre della
// famiglia. Questo form scrive con `Users.invite` — una Edge Function chiamata
// direttamente, senza passare né dal registry del core (`dispatch({type})`) né
// da quello del modulo Liste (`esegui("…")`). Nessuno dei due predicati di
// `verifica:convenzioni` poteva vederlo: era fuori dal perimetro DICHIARATO di
// entrambi i controlli, e ci è rimasto per due audit. L'ha trovato il
// controllo corretto di A-1, guardando quali form validano e scrivono.
//
// Aveva quindi le tre debolezze in versione integrale: freno al doppio invio
// sul valore di `busy`, `setBusy(false)` fuori da un `finally`, nessun guard
// di smontaggio. Verificati contro il file PRIMA della correzione.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const inviteMock = vi.fn();
vi.mock("../lib/api.js", () => ({
  Users: { invite: (...args) => inviteMock(...args) },
}));

const { AddTeamMemberModal } = await import("../components/admin/AddTeamMemberModal.jsx");
const { BulkInviteModal } = await import("../components/admin/BulkInviteModal.jsx");
const { withDispatch } = await import("./helpers/appData.jsx");

/** Una promessa che si risolve quando lo decide il test. */
const differita = () => {
  let risolvi;
  const promessa = new Promise((res) => { risolvi = res; });
  return { promessa, risolvi };
};

const monta = (props = {}) => {
  const dispatch = vi.fn();
  const onClose = vi.fn();
  render(withDispatch(
    <AddTeamMemberModal onClose={onClose} existingIds={[]} {...props} />, dispatch));
  return { dispatch, onClose };
};

const compila = ({ email = "anna@agenzia.it" } = {}) => {
  fireEvent.change(screen.getByPlaceholderText("Es. Anna Bianchi"),
    { target: { value: "Anna Bianchi" } });
  if (email) {
    fireEvent.change(screen.getByPlaceholderText("anna@agenzia.it"),
      { target: { value: email } });
  }
};

/** Due click NELLO STESSO TURNO, prima che React possa ri-renderizzare. */
const doppioClick = (nome) => {
  const bottone = screen.getByRole("button", { name: nome });
  const clicca = () => bottone.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  act(() => { clicca(); clicca(); });
};

beforeEach(() => { inviteMock.mockReset(); });

describe("AddTeamMemberModal — il freno al doppio invio", () => {
  it("due click nello stesso turno mandano UN invito solo", async () => {
    // `fireEvent` non basterebbe a riprodurre la corsa: avvolge ogni evento in
    // un `act()` proprio, quindi React ri-renderizza fra i due click e il
    // secondo trova il bottone già `disabled`. Il difetto vive nel turno in
    // cui quel re-render non è ancora avvenuto.
    const { promessa, risolvi } = differita();
    inviteMock.mockReturnValue(promessa);
    monta();
    compila();
    doppioClick("Invia invito");

    expect(inviteMock).toHaveBeenCalledTimes(1);
    await act(async () => { risolvi({ data: {}, error: null }); await promessa; });
  });

  it("due click nello stesso turno creano UN agente locale solo", async () => {
    // Il ramo senza email non ha `await`, quindi sembrava al riparo. Non lo
    // era: `existingIds` non si aggiorna fra i due click, e il secondo
    // calcolava lo STESSO id del primo — due membri, un id.
    const { dispatch } = monta();
    compila({ email: "" });
    doppioClick("Crea agente");

    const creazioni = dispatch.mock.calls.filter(([a]) => a.type === "ADD_TEAM_MEMBER");
    expect(creazioni).toHaveLength(1);
    expect(inviteMock).not.toHaveBeenCalled();
  });
});

describe("AddTeamMemberModal — l'attesa e l'esito", () => {
  it("non chiude finché l'esito non è noto", async () => {
    const { promessa, risolvi } = differita();
    inviteMock.mockReturnValue(promessa);
    const { onClose } = monta();
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Invio…" })).toBeDisabled();

    await act(async () => { risolvi({ data: {}, error: null }); await promessa; });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("su errore resta aperto, mostra il messaggio del server e si può riprovare", async () => {
    inviteMock.mockResolvedValue({ data: null, error: { message: "Email già registrata." } });
    const { onClose } = monta();
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email già registrata."));
    expect(onClose).not.toHaveBeenCalled();
    // I dati sono ancora qui: è la promessa che il contratto fa all'utente.
    expect(screen.getByPlaceholderText("Es. Anna Bianchi")).toHaveValue("Anna Bianchi");

    // E il bottone è tornato attivo: `inVolo` si spegne anche sul fallimento.
    inviteMock.mockResolvedValue({ data: {}, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("un'ECCEZIONE non lascia la modale congelata", async () => {
    // `setBusy(true)` senza `try` lasciava `busy` a `true` per sempre: modale
    // aperta, bottone spento, nessun messaggio.
    inviteMock.mockRejectedValue(new Error("rete caduta"));
    monta();
    compila();
    fireEvent.click(screen.getByRole("button", { name: "Invia invito" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Invia invito" })).not.toBeDisabled();
  });

  it("una validazione fallita non tenta alcuna scrittura", async () => {
    const { dispatch } = monta();
    fireEvent.click(screen.getByRole("button", { name: "Crea agente" }));
    expect(inviteMock).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.filter(([a]) => a.type === "ADD_TEAM_MEMBER")).toHaveLength(0);
  });
});

// ─── BulkInviteModal · le stesse garanzie, senza il contratto ──────────────
// Questo form NON adotta `useSalvataggio` (è un batch sequenziale con esito
// per riga e progresso live: vedi il commento in testa al suo `submit`), ma le
// tre garanzie non dipendono da quel contratto — e qui mancavano tutte e tre.
describe("BulkInviteModal — batch: freno, finally, smontaggio", () => {
  const compilaLista = (righe) => {
    const area = document.querySelector("textarea");
    fireEvent.change(area, { target: { value: righe.join("\n") } });
  };

  it("due click nello stesso turno mandano UN batch solo", async () => {
    // Senza il freno partivano DUE cicli sequenziali sulla stessa lista: ogni
    // indirizzo invitato due volte, e `results` dipinto da due cicli che si
    // sovrascrivono.
    const { promessa, risolvi } = differita();
    inviteMock.mockReturnValue(promessa);
    render(withDispatch(<BulkInviteModal onClose={vi.fn()} onInvited={vi.fn()} />, vi.fn()));
    compilaLista(["anna@agenzia.it", "bruno@agenzia.it"]);
    doppioClick("Invia inviti");

    expect(inviteMock).toHaveBeenCalledTimes(1);
    await act(async () => { risolvi({ data: {}, error: null }); await promessa; });
  });

  it("un'eccezione a metà batch NON lascia la modale impossibile da chiudere", async () => {
    // Qui il `finally` costa più che altrove: l'overlay è
    // `onClick={busy ? undefined : onClose}`, quindi con `busy` bloccato a
    // `true` la modale non si chiudeva più, con gli esiti già ottenuti sotto
    // gli occhi e nessun modo di leggerli altrove.
    inviteMock
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockRejectedValueOnce(new Error("rete caduta"));
    const onClose = vi.fn();
    render(withDispatch(<BulkInviteModal onClose={onClose} onInvited={vi.fn()} />, vi.fn()));
    compilaLista(["anna@agenzia.it", "bruno@agenzia.it"]);

    await act(async () => {
      screen.getByRole("button", { name: "Invia inviti" })
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Invia inviti|Chiudi/ })).not.toBeDisabled());
  });
});
