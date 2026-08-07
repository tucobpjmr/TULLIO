import { describe, it, expect, beforeEach, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { Trash } from "../components/views/Trash.jsx";
import { withAppData } from "./helpers/appData.jsx";

// Avatar (montato in profondità da questo albero di componenti) importa
// lib/api.js per risolvere le signed URL degli avatar dal bucket privato
// (S-10), e api.js importa il client Supabase condiviso, che senza
// VITE_SUPABASE_URL non si costruisce. Stessa strategia degli altri test:
// il client è mockato e mai usato.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));

// Contesto app per il render: sostituisce ctxTeam()/ctxUser() sui
// globali eliminati. Le funzioni di permesso (canViewTask/canEditTask) arrivano
// da useAppData(), quindi il team e l'utente vanno passati al provider — è il
// render stesso a montarli, non uno stato di modulo impostato prima.
let appCtx = { team: [], categories: {}, currentUserId: null, tasks: [], clients: [] };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
const ctxTasks = (t) => { appCtx = { ...appCtx, tasks: t }; };
const render = (ui, options) => {
  const utils = rtlRender(withAppData(ui, appCtx), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, appCtx)) };
};

// Team di prova: un admin (marco) e un driver (dario).
const TEAM_FIXTURE = [
  { id: "marco", name: "Marco", role: "admin", active: true, pending: false },
  { id: "dario", name: "Dario", role: "driver", active: true, pending: false },
];

const trashedTask = (over = {}) => ({
  id: "t1", title: "Prenotazione hotel", category: "booking", priority: "medium",
  status: "todo", assignees: ["dario"], comments: [],
  deletedAt: new Date().toISOString(), ...over,
});

describe("Trash — la lista usa canViewTask, le azioni usano canEditTask", () => {
  beforeEach(() => {
    ctxTeam(TEAM_FIXTURE.map(m => ({ ...m })));
  });

  it("un driver vede in lista un proprio task cestinato anche se non di categoria transfer (canView=true anche se canEdit=false)", () => {
    ctxUser("dario");
    const task = trashedTask();
    ctxTasks([task]);
    render(<Trash dispatch={vi.fn()} />);
    expect(screen.getByText("Prenotazione hotel")).toBeInTheDocument();
  });

  it("il driver non può ripristinare né eliminare quel task (non è transfer): l'azione mostra un toast di errore e non tocca il reducer", () => {
    ctxUser("dario");
    const task = trashedTask();
    const dispatch = vi.fn();
    ctxTasks([task]);
    render(<Trash dispatch={dispatch} />);

    fireEvent.click(screen.getByTitle("Ripristina con modifica"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "error", message: "Non puoi ripristinare questo task" },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "RESTORE_TASK" }));
    // Nessuna modale di ripristino deve aprirsi
    expect(screen.queryByText("↻ Ripristina task")).not.toBeInTheDocument();

    dispatch.mockClear();
    fireEvent.click(screen.getByTitle("Elimina definitivamente"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "SHOW_TOAST",
      payload: { type: "error", message: "Non puoi eliminare definitivamente questo task" },
    });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "PURGE_TASK" }));
  });

  it("un task cestinato non assegnato al driver e non visibile (canView=false) non compare affatto in lista", () => {
    ctxUser("dario");
    const task = trashedTask({ id: "t2", title: "Volo Milano", assignees: ["marco"] });
    ctxTasks([task]);
    render(<Trash dispatch={vi.fn()} />);
    expect(screen.queryByText("Volo Milano")).not.toBeInTheDocument();
    expect(screen.getByText("Cestino vuoto")).toBeInTheDocument();
  });

  it("un admin vede il task e può ripristinarlo (canEdit=true → nessun toast di errore, si apre la modale)", () => {
    ctxUser("marco");
    const task = trashedTask();
    const dispatch = vi.fn();
    ctxTasks([task]);
    render(<Trash dispatch={dispatch} />);

    fireEvent.click(screen.getByTitle("Ripristina con modifica"));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SHOW_TOAST" }));
    expect(screen.getByText("↻ Ripristina task")).toBeInTheDocument();
  });
});
