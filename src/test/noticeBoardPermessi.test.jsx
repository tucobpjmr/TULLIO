// A-1 dell'audit del 14 agosto — la bacheca avvisi diverge dal database.
//
// PERCHÉ ESISTE. UPDATE_NOTICE/DELETE_NOTICE/TOGGLE_PIN_NOTICE erano le uniche
// mutazioni del registry di persistenza senza guard: la RLS nega davvero
// update/delete/pin a chi non è l'autore né un manager/admin
// (`notices_update`/`notices_delete`, canEditNotice in lib/permissions.js), ma
// NoticeBoard mostrava i tre pulsanti su OGNI avviso, a chiunque. Un
// non-autore cliccava ✕, il reducer applicava l'azione in ottimistico
// mostrando "Avviso rimosso dalla bacheca", e solo dopo la scrittura falliva
// lato server — due toast contraddittori sullo stesso gesto, e l'avviso
// restava sparito dalla UI fino al reload.
//
// Questo file verifica la metà UI della correzione: i pulsanti compaiono solo
// per chi la RLS lascerebbe davvero agire. La metà server (guard + rollback
// nel registry, il permesso applicato anche dal reducer) è in
// persistenceGuards.test.js — le due metà vanno lette insieme, non una sola.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithAppData } from "./helpers/appData.jsx";

const TEAM = [
  { id: "sofia",   name: "Sofia Conti",      role: "agent",   active: true, pending: false, color: "#2D7A4F", avatar: "SC" },
  { id: "marco",   name: "Marco Ferretti",   role: "manager", active: true, pending: false, color: "#0F2044", avatar: "MF" },
  { id: "roberto", name: "Roberto Esposito", role: "admin",   active: true, pending: false, color: "#C0392B", avatar: "RE" },
  { id: "luca",    name: "Luca Moretti",     role: "agent",   active: true, pending: false, color: "#C8832A", avatar: "LM" },
  { id: "giulia",  name: "Giulia Ricci",     role: "driver",  active: true, pending: false, color: "#7B4F9E", avatar: "GR" },
];

const { NoticeBoard } = await import("../components/dashboard/NoticeBoard.jsx");

const AVVISO = {
  id: "n1", text: "Riunione venerdì", color: "#FFF3B0",
  author: "sofia", pinned: false, createdAt: "2026-08-01T09:00:00Z", updatedAt: "2026-08-01T09:00:00Z",
};

const render = (currentUserId, dispatch = vi.fn()) => {
  const utils = renderWithAppData(
    <NoticeBoard notices={[AVVISO]} />,
    { team: TEAM, currentUserId, dispatch },
  );
  return { ...utils, dispatch };
};

// Il pannello reazioni (😀) resta a tutti — TOGGLE_NOTICE_REACTION è
// puramente locale (nessuna RPC: dichiarata in NON_PERSISTITE_OGGI di
// persistenceGuards.test.js), quindi non c'è nulla che la RLS possa negare.
describe("NoticeBoard — pulsanti pin/modifica/elimina visibili solo a chi può", () => {
  it("l'autore vede tutti e quattro i pulsanti", () => {
    render("sofia");
    expect(screen.getByTitle("Reagisci")).toBeTruthy();
    expect(screen.getByTitle("Fissa in alto")).toBeTruthy();
    expect(screen.getByTitle("Modifica")).toBeTruthy();
    expect(screen.getByTitle("Elimina")).toBeTruthy();
  });

  it("un manager li vede su un avviso altrui", () => {
    render("marco");
    expect(screen.getByTitle("Fissa in alto")).toBeTruthy();
    expect(screen.getByTitle("Modifica")).toBeTruthy();
    expect(screen.getByTitle("Elimina")).toBeTruthy();
  });

  it("un admin li vede su un avviso altrui", () => {
    render("roberto");
    expect(screen.getByTitle("Fissa in alto")).toBeTruthy();
    expect(screen.getByTitle("Modifica")).toBeTruthy();
    expect(screen.getByTitle("Elimina")).toBeTruthy();
  });

  it("un agente che non è l'autore vede SOLO la reazione", () => {
    render("luca");
    expect(screen.getByTitle("Reagisci")).toBeTruthy();
    expect(screen.queryByTitle("Fissa in alto")).toBeNull();
    expect(screen.queryByTitle("Modifica")).toBeNull();
    expect(screen.queryByTitle("Elimina")).toBeNull();
  });

  it("un driver vede SOLO la reazione", () => {
    render("giulia");
    expect(screen.getByTitle("Reagisci")).toBeTruthy();
    expect(screen.queryByTitle("Fissa in alto")).toBeNull();
    expect(screen.queryByTitle("Modifica")).toBeNull();
    expect(screen.queryByTitle("Elimina")).toBeNull();
  });

  it("l'autore che clicca 'Fissa in alto' dispatcha TOGGLE_PIN_NOTICE", () => {
    const { dispatch } = render("sofia");
    fireEvent.click(screen.getByTitle("Fissa in alto"));
    expect(dispatch).toHaveBeenCalledWith({ type: "TOGGLE_PIN_NOTICE", payload: "n1" });
  });

  it("il conteggio reazioni resta cliccabile anche per un non-autore (locale, nessuna RLS)", () => {
    const conReazioni = { ...AVVISO, reactions: { "👍": ["marco"] } };
    const dispatch = vi.fn();
    renderWithAppData(
      <NoticeBoard notices={[conReazioni]} />,
      { team: TEAM, currentUserId: "luca", dispatch },
    );
    fireEvent.click(screen.getByTitle("Marco Ferretti"));
    expect(dispatch).toHaveBeenCalledWith({
      type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: "n1", emoji: "👍" },
    });
  });
});
