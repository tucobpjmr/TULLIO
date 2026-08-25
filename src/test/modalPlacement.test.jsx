import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { Trash } from "../components/tasks/Trash.jsx";
import { withAppData } from "./helpers/appData.jsx";

// ─── Contesto app per il render ─────────────────────────────────────────────
// Sostituisce setTeam()/setCurrentUser() sui globali eliminati: il team e
// l'utente corrente non sono più variabili di modulo lette dai componenti al
// render, ma props del provider. Restano impostabili con le stesse due
// chiamate — `ctxTeam` / `ctxUser` — così ogni test dichiara da quale team
// dipende, e `render` le applica montando l'albero dentro <AppDataProvider>.
let appCtx = { team: [], categories: {}, currentUserId: null, tasks: [], clients: [] };
const ctxTeam = (t) => { appCtx = { ...appCtx, team: t }; };
const ctxUser = (id) => { appCtx = { ...appCtx, currentUserId: id }; };
const ctxTasks = (t) => { appCtx = { ...appCtx, tasks: t }; };
// M-2 (25 agosto): `dispatch` arriva per contesto, quindi il render lo prende
// fra le opzioni invece che come prop del componente sotto esame.
const render = (ui, { dispatch, ...options } = {}) => {
  const utils = rtlRender(withAppData(ui, { ...appCtx, dispatch }), options);
  // `appCtx` è letto al momento del rerender, non a quello del primo render:
  // un test può cambiare utente con ctxUser() e ri-renderizzare.
  return { ...utils, rerender: (next) => utils.rerender(withAppData(next, { ...appCtx, dispatch })) };
};

// Mock di api.js per non istanziare il client Supabase reale (stesso pattern di
// clientContactInheritance.test.jsx) — AddTeamMemberModal importa Users per
// l'invito via email, non esercitato da questi test di posizionamento.
vi.mock("../lib/api.js", () => ({
  Users: { invite: vi.fn(async () => ({ error: null })) },
}));

// ProfileEditor legge la sessione da useAuth, che senza <AuthProvider> lancia.
vi.mock("../auth/AuthContext.jsx", () => ({
  useAuth: () => ({ session: null, updatePassword: vi.fn(), deleteAccount: vi.fn() }),
}));

const { AddCategoryModal } = await import("../components/admin/AddCategoryModal.jsx");
const { AddTeamMemberModal } = await import("../components/admin/AddTeamMemberModal.jsx");
const { NoticeEditorModal } = await import("../components/dashboard/NoticeEditorModal.jsx");
const { ProfileEditor } = await import("../components/shell/ProfileEditor.jsx");

// I modali di Amministrazione e della bacheca sono dichiarati dentro viste che
// entrano con le classi d'animazione .fade-in/.slide-up: i loro keyframe
// contengono un translate e — per spec CSS — un antenato con transform != none
// diventa containing block per i discendenti position:fixed. L'overlay del
// modale si centrava così sull'altezza della vista (scrollabile, spesso molto
// più alta del viewport) invece che sullo schermo, comparendo troppo in basso e
// fuori campo su mobile (segnalato su "+ Aggiungi categoria").
//
// jsdom non fa layout, quindi non si può asserire la posizione calcolata: si
// asserisce la proprietà strutturale che la garantisce, cioè che l'overlay sia
// montato via portale come figlio diretto di document.body e non dentro il
// wrapper animato della vista. Il wrapper .fade-in qui sotto riproduce
// esattamente quella gerarchia.
const renderInAnimatedView = (ui) =>
  render(<div className="fade-in">{ui}</div>);

// L'overlay è l'elemento position:fixed che fa da backdrop.
const overlayOf = (el) => el.closest('[style*="position: fixed"]');

describe("Modali dentro viste animate — montati via portale su document.body", () => {
  it("AddCategoryModal non resta dentro il wrapper .fade-in", () => {
    const { container } = renderInAnimatedView(
      <AddCategoryModal onClose={vi.fn()} existingKeys={[]} />
    );

    const overlay = overlayOf(screen.getByText("Aggiungi nuova categoria"));
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(container.querySelector(".fade-in").contains(overlay)).toBe(false);
  });

  it("AddTeamMemberModal non resta dentro il wrapper .fade-in", () => {
    const { container } = renderInAnimatedView(
      <AddTeamMemberModal onClose={vi.fn()} existingIds={[]} />
    );

    const overlay = overlayOf(screen.getByText("Aggiungi nuovo agente"));
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(container.querySelector(".fade-in").contains(overlay)).toBe(false);
  });

  it("NoticeEditorModal non resta dentro il wrapper .fade-in della Dashboard", () => {
    const { container } = renderInAnimatedView(
      <NoticeEditorModal notice={null} onSave={vi.fn()} onClose={vi.fn()} team={[]} />
    );

    const overlay = overlayOf(screen.getByText("📌 Nuovo avviso"));
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(container.querySelector(".fade-in").contains(overlay)).toBe(false);
  });
});

// Seconda faccia dello stesso difetto: alcune card modali si centravano con
// `transform: translate(-50%,-50%)`. È un transform permanente (non dipende da
// animation-fill-mode), quindi rende la card containing block per i propri
// discendenti position:fixed — nel Cestino ci finiva dentro il backdrop mobile
// del DateTimePicker, confinato e scrollabile dentro la card invece che sullo
// schermo.
//
// M-2: le due card non ricostruiscono più il guscio a mano (overlay flex +
// card senza transform, portale, Esc, blocco dello scroll, role="dialog"
// arrivano da ui/Modal.jsx). L'invariante da difendere non è più COME sono
// centrate — è che il guscio le renda finestre di dialogo vere e che nessuno
// dei due nodi reintroduca un transform.
const dialogoDi = (el) => el.closest('[role="dialog"]');

describe("Card modali — semantica di dialogo e nessun transform", () => {
  it("ProfileEditor è un dialogo montato su document.body, senza transform", () => {
    render(
      <ProfileEditor
        member={{ id: "marco", name: "Marco", color: "#0F2044" }}
        onClose={vi.fn()}
      />
    );

    const card = dialogoDi(screen.getByDisplayValue("Marco"));
    expect(card).not.toBeNull();
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(card.getAttribute("aria-labelledby")).toBe("vd-profile-title");
    // Né la card né l'overlay che la centra introducono un containing block per
    // i position:fixed discendenti.
    expect(card.style.transform).toBe("");
    expect(card.parentElement.style.transform).toBe("");
    expect(card.parentElement.parentElement).toBe(document.body);
  });

  it("Trash: la card di ripristino è un dialogo senza transform (ci vive dentro il DateTimePicker)", () => {
    ctxTeam([{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }]);
    ctxUser("marco");
    const task = {
      id: "t1", title: "Prenotazione hotel", category: "booking", priority: "medium",
      status: "todo", assignees: ["marco"], comments: [],
      deletedAt: new Date().toISOString(),
    };
    ctxTasks([task]);
    render(<Trash />, { dispatch: vi.fn() });

    fireEvent.click(screen.getByTitle("Ripristina con modifica"));

    const card = dialogoDi(screen.getByText("↻ Ripristina task"));
    expect(card).not.toBeNull();
    expect(card.getAttribute("aria-modal")).toBe("true");
    expect(card.style.transform).toBe("");
    expect(card.parentElement.style.transform).toBe("");
    expect(card.parentElement.parentElement).toBe(document.body);
  });
});
