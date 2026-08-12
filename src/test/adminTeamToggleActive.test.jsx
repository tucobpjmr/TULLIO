// Suggerimento strategico n. 3 dell'audit dell'11 agosto — "disattivare" nel
// pannello Team ora revoca davvero la sessione (ban lato auth, via la Edge
// Function set-user-active), non è più solo un flag applicativo. Da qui la
// scelta di UI che questo file copre: disattivare un membro chiede conferma
// (toglie qualcosa nell'istante in cui si preme, sessione già aperta
// compresa), riattivarlo no (espande l'accesso, non lo toglie — nessun invio
// premuto per abitudine può fare danno).
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => ({
  Users: {
    getAvatarUrl: vi.fn().mockResolvedValue({ url: null, error: null }),
    listContacts: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

const { renderWithAppData } = await import("./helpers/appData.jsx");
const { AdminTeamTab } = await import("../components/admin/tabs/AdminTeamTab.jsx");

const TEAM = [
  { id: "marco", name: "Marco Bianchi", role: "admin", avatar: "MB", color: "#0F2044", active: true, pending: false },
  { id: "sara", name: "Sara Verdi", role: "agent", seniority: "senior", avatar: "SV", color: "#C8832A", active: true, pending: false },
  { id: "luca", name: "Luca Neri", role: "agent", seniority: "junior", avatar: "LN", color: "#777", active: false, pending: false },
];
const CTX = { team: TEAM, currentUserId: "marco", tasks: [], clients: [] };

const dialogo = () => screen.findByRole("dialog");

// Marco (admin, attivo) è anche lui nell'elenco e mostra il proprio bottone
// "Disattiva": scopiamo sempre al bottone dentro la RIGA del membro giusto,
// non al primo che matcha per titolo. Risale dal nome fino al primo antenato
// che contiene un bottone con `title` — la card della riga, indipendentemente
// da quanti `div` di layout ci siano in mezzo.
const rigaDi = (nome) => {
  let el = screen.getByText(nome);
  while (el && !el.querySelector('button[title]')) el = el.parentElement;
  return el;
};
const bottoneDi = (nome, titolo) => within(rigaDi(nome)).getByTitle(titolo);

describe("AdminTeamTab — disattivare chiede conferma, riattivare no", () => {
  it("disattivare un membro attivo apre la conferma e NON dispatcha finché non si conferma", async () => {
    const dispatch = vi.fn();
    renderWithAppData(<AdminTeamTab dispatch={dispatch} />, CTX);

    fireEvent.click(bottoneDi("Sara Verdi", "Disattiva"));

    const d = await dialogo();
    expect(within(d).getByText(/Sara Verdi/)).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "TOGGLE_TEAM_MEMBER_ACTIVE" }),
    );

    fireEvent.click(within(d).getByRole("button", { name: "Disattiva" }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "sara" }),
    );
  });

  it("Annulla sulla conferma non dispatcha nulla", async () => {
    const dispatch = vi.fn();
    renderWithAppData(<AdminTeamTab dispatch={dispatch} />, CTX);

    fireEvent.click(bottoneDi("Sara Verdi", "Disattiva"));
    const d = await dialogo();
    fireEvent.click(within(d).getByRole("button", { name: "Annulla" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("riattivare un membro disattivato dispatcha SUBITO, senza conferma", () => {
    const dispatch = vi.fn();
    renderWithAppData(<AdminTeamTab dispatch={dispatch} />, CTX);

    fireEvent.click(bottoneDi("Luca Neri", "Riattiva"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: "luca" });
  });
});
