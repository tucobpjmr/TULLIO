// Criticità #8 — le conferme sono dell'app, non del browser.
//
// PERCHÉ ESISTE. `window.confirm` era in 17 punti e `alert` in 4. Sostituirli
// non è un cambio di stile: un `confirm()` BLOCCA il thread (React non
// renderizza, i timer non scattano, gli eventi realtime si accodano), non
// distingue un'azione distruttiva da una innocua, non è in italiano se non lo
// è il browser, e — il caso peggiore — è SOPPRIMIBILE: quando l'utente spunta
// "impedisci a questa pagina di creare altre finestre di dialogo", `confirm()`
// ritorna `false` senza chiedere niente, e da quel momento eliminare un
// allegato semplicemente non funziona più, in silenzio.
//
// Questi test coprono il contratto del provider (la promise, il doppio invito,
// lo smontaggio) e UN percorso reale end-to-end, perché è lì che si vede se la
// conversione da `if (window.confirm(…))` a `if (await conferma(…))` ha
// davvero mantenuto il comportamento.
import { describe, it, expect, vi } from "vitest";
import { renderHook, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "../state/ConfirmContext.jsx";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({
  Users: { getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }) },
}));

const { renderWithAppData } = await import("./helpers/appData.jsx");
const { Trash } = await import("../components/tasks/Trash.jsx");

const wrapper = ({ children }) => <ConfirmProvider>{children}</ConfirmProvider>;
const dialogo = () => screen.findByRole("dialog");
const premi = async (etichetta) =>
  fireEvent.click(within(await dialogo()).getByRole("button", { name: etichetta }));

describe("useConfirm — il contratto", () => {
  it("solleva fuori dal provider invece di ripiegare su window.confirm", () => {
    // Un fallback silenzioso reintrodurrebbe di nascosto proprio ciò che
    // questo modulo esiste per togliere — ed è la stessa scelta di useAppData.
    const spia = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useConfirm())).toThrow(/ConfirmProvider/);
    spia.mockRestore();
  });

  it("risolve `true` sull'azione e `false` su Annulla", async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });

    let esito = null;
    act(() => { result.current({ title: "Procedere?" }).then(v => { esito = v; }); });
    await premi("Conferma");
    await waitFor(() => expect(esito).toBe(true));

    act(() => { result.current({ title: "Procedere?" }).then(v => { esito = v; }); });
    await premi("Annulla");
    await waitFor(() => expect(esito).toBe(false));
  });

  it("una stringa sola vale come titolo", async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });
    act(() => { result.current("Eliminare questo avviso?"); });
    expect(await screen.findByText("Eliminare questo avviso?")).toBeTruthy();
  });

  it("`danger` mette il focus su Annulla, una conferma normale sull'azione", async () => {
    // Su un'operazione irreversibile un Invio premuto per abitudine non deve
    // confermarla: è il tipo di protezione che window.confirm non poteva dare,
    // perché non sapeva quali azioni fossero distruttive.
    const { result } = renderHook(() => useConfirm(), { wrapper });

    act(() => { result.current({ title: "Svuotare il cestino?", danger: true }); });
    let d = await dialogo();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(d).getByRole("button", { name: "Annulla" })));
    await premi("Annulla");

    act(() => { result.current({ title: "Ripristinare il backup?", cta: "Ripristina" }); });
    d = await dialogo();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(d).getByRole("button", { name: "Ripristina" })));
  });

  it("una seconda richiesta chiude la prima come annullata invece di lasciarla appesa", async () => {
    // Doppio click, o due handler che partono insieme: una promise mai
    // risolta è un `await` che non ritorna, cioè una funzione che si ferma a
    // metà senza dirlo a nessuno.
    const { result } = renderHook(() => useConfirm(), { wrapper });
    let prima = "in-attesa";
    act(() => { result.current({ title: "Prima" }).then(v => { prima = v; }); });
    act(() => { result.current({ title: "Seconda" }); });

    await waitFor(() => expect(prima).toBe(false));
    expect(await screen.findByText("Seconda")).toBeTruthy();
  });

  it("allo smontaggio chi era in attesa riceve `false`", async () => {
    const { result, unmount } = renderHook(() => useConfirm(), { wrapper });
    let esito = "in-attesa";
    act(() => { result.current({ title: "Procedere?" }).then(v => { esito = v; }); });
    unmount();
    await waitFor(() => expect(esito).toBe(false));
  });

  it("Esc equivale ad Annulla", async () => {
    const { result } = renderHook(() => useConfirm(), { wrapper });
    let esito = null;
    act(() => { result.current({ title: "Procedere?" }).then(v => { esito = v; }); });
    await dialogo();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(esito).toBe(false));
  });
});

describe("Cestino — l'eliminazione definitiva passa dalla conferma dell'app", () => {
  const TEAM = [{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }];
  const task = {
    id: "t1", title: "Prenotazione hotel", category: "booking", priority: "medium",
    status: "todo", assignees: ["marco"], comments: [],
    deletedAt: new Date().toISOString(),
  };
  const monta = () => {
    const dispatch = vi.fn();
    renderWithAppData(<Trash />, {
      dispatch, team: TEAM, categories: {}, currentUserId: "marco", tasks: [task],
    });
    return dispatch;
  };

  it("conferma → PURGE_TASK", async () => {
    const dispatch = monta();
    fireEvent.click(screen.getByTitle("Elimina definitivamente"));

    // Il titolo del task sta nel CORPO della domanda: un confirm() di sistema
    // non poteva distinguere titolo e spiegazione, e finivano insieme in un
    // blocco di testo non formattabile.
    expect(await screen.findByText("Eliminare definitivamente?")).toBeTruthy();
    await premi("Elimina per sempre");

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "PURGE_TASK", payload: "t1" }));
  });

  it("annulla → nessuna eliminazione", async () => {
    const dispatch = monta();
    fireEvent.click(screen.getByTitle("Elimina definitivamente"));
    await premi("Annulla");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "PURGE_TASK" }));
  });
});
