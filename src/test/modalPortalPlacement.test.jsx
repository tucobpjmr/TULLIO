import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
// Mock di api.js per non istanziare il client Supabase reale (stesso pattern di
// clientContactInheritance.test.jsx) — AddTeamMemberModal importa Users per
// l'invito via email, non esercitato da questi test di posizionamento.
vi.mock("../lib/api.js", () => ({
  Users: { invite: vi.fn(async () => ({ error: null })) },
}));

const { AddCategoryModal } = await import("../components/modals/AddCategoryModal.jsx");
const { AddTeamMemberModal } = await import("../components/modals/AddTeamMemberModal.jsx");
const { NoticeEditorModal } = await import("../components/modals/NoticeEditorModal.jsx");

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
