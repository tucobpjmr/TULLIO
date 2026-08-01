import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Trash } from "../components/views/Trash.jsx";
import { setTeam, setCurrentUser } from "../state/appGlobals.js";
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

const { AddCategoryModal } = await import("../components/modals/AddCategoryModal.jsx");
const { AddTeamMemberModal } = await import("../components/modals/AddTeamMemberModal.jsx");
const { NoticeEditorModal } = await import("../components/modals/NoticeEditorModal.jsx");
const { ProfileEditor } = await import("../components/modals/ProfileEditor.jsx");

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
      <AddCategoryModal onClose={vi.fn()} dispatch={vi.fn()} existingKeys={[]} />
    );

    const overlay = overlayOf(screen.getByText("Aggiungi nuova categoria"));
    expect(overlay).not.toBeNull();
    expect(overlay.parentElement).toBe(document.body);
    expect(container.querySelector(".fade-in").contains(overlay)).toBe(false);
  });

  it("AddTeamMemberModal non resta dentro il wrapper .fade-in", () => {
    const { container } = renderInAnimatedView(
      <AddTeamMemberModal onClose={vi.fn()} dispatch={vi.fn()} existingIds={[]} />
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
// schermo. La centratura equivalente `inset:0 + margin:auto + height:fit-content`
// non introduce alcun transform.
const cardOf = (el) => el.closest('[style*="position: fixed"][style*="margin"]');

describe("Card modali — centratura senza transform", () => {
  it("ProfileEditor centra la card senza transform", () => {
    render(
      <ProfileEditor
        member={{ id: "marco", name: "Marco", color: "#0F2044" }}
        dispatch={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const card = cardOf(screen.getByDisplayValue("Marco"));
    expect(card).not.toBeNull();
    expect(card.style.transform).toBe("");
    // La centratura passa da inset + margin auto.
    expect(card.style.margin).toBe("auto");
    expect(card.style.inset).toBe("0px");
  });

  it("Trash centra la card di ripristino senza transform (ci vive dentro il DateTimePicker)", () => {
    setTeam([{ id: "marco", name: "Marco", role: "admin", active: true, pending: false }]);
    setCurrentUser("marco");
    const task = {
      id: "t1", title: "Prenotazione hotel", category: "booking", priority: "medium",
      status: "todo", assignees: ["marco"], comments: [],
      deletedAt: new Date().toISOString(),
    };
    render(<Trash state={{ currentUserId: "marco", tasks: [task] }} dispatch={vi.fn()} />);

    fireEvent.click(screen.getByTitle("Ripristina con modifica"));

    const card = cardOf(screen.getByText("↻ Ripristina task"));
    expect(card).not.toBeNull();
    expect(card.style.transform).toBe("");
    expect(card.style.margin).toBe("auto");
    expect(card.style.inset).toBe("0px");
  });
});
