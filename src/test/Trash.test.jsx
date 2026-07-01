import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash } from "../components/views/Trash.jsx";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";

// Team di prova: un admin (marco) e un driver (dario). Le funzioni di permesso
// (canViewTask/canEditTask) leggono i globali TEAM/CURRENT_USER via appGlobals,
// quindi li impostiamo prima di ogni render.
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
    setTeam(TEAM_FIXTURE.map(m => ({ ...m })));
  });

  it("un driver vede in lista un proprio task cestinato anche se non di categoria transfer (canView=true anche se canEdit=false)", () => {
    setCurrentUser("dario");
    const task = trashedTask();
    render(<Trash state={{ currentUserId: "dario", tasks: [task] }} dispatch={vi.fn()} />);
    expect(screen.getByText("Prenotazione hotel")).toBeInTheDocument();
  });

  it("il driver non può ripristinare né eliminare quel task (non è transfer): l'azione mostra un toast di errore e non tocca il reducer", () => {
    setCurrentUser("dario");
    const task = trashedTask();
    const dispatch = vi.fn();
    render(<Trash state={{ currentUserId: "dario", tasks: [task] }} dispatch={dispatch} />);

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
    setCurrentUser("dario");
    const task = trashedTask({ id: "t2", title: "Volo Milano", assignees: ["marco"] });
    render(<Trash state={{ currentUserId: "dario", tasks: [task] }} dispatch={vi.fn()} />);
    expect(screen.queryByText("Volo Milano")).not.toBeInTheDocument();
    expect(screen.getByText("Cestino vuoto")).toBeInTheDocument();
  });

  it("un admin vede il task e può ripristinarlo (canEdit=true → nessun toast di errore, si apre la modale)", () => {
    setCurrentUser("marco");
    const task = trashedTask();
    const dispatch = vi.fn();
    render(<Trash state={{ currentUserId: "marco", tasks: [task] }} dispatch={dispatch} />);

    fireEvent.click(screen.getByTitle("Ripristina con modifica"));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SHOW_TOAST" }));
    expect(screen.getByText("↻ Ripristina task")).toBeInTheDocument();
  });
});
