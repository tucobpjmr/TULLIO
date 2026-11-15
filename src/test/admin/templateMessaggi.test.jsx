// B-3 dell'analisi del 14 novembre · I template di messaggio partono vuoti.
//
// makeInitialState scriveva quattro template d'esempio (id «mt1»…«mt4») anche
// in produzione. Fino al primo fetch, e per sempre se il fetch falliva,
// l'admin vedeva template che nel database non esistono: modificarli o
// cancellarli mandava al server id inesistenti. Ora gli esempi stanno nel
// demo, e la sezione Admin mostra uno scheletro finché il fetch non torna.
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

vi.mock("../../lib/supabase", () => ({ supabase: {}, default: {} }));

const { makeInitialState } = await import("../../state/reducer.js");
const { MessageTemplatesSection } = await import("../../components/admin/tabs/MessageTemplatesSection.jsx");

const TEAM = [{ id: "u1", name: "Anna", role: "admin", active: true, pending: false }];

describe("lo stato iniziale dei template", () => {
  it("con un utente vero è vuoto: i template arrivano dal database", () => {
    expect(makeInitialState({ team: TEAM, currentUserId: "u1" }).messageTemplates).toEqual([]);
  });

  it("in demo ha ancora gli esempi", () => {
    const demo = makeInitialState();
    expect(demo.messageTemplates.length).toBeGreaterThan(0);
    expect(demo.messageTemplates.every(t => t.id && t.label && t.text)).toBe(true);
  });
});

describe("MessageTemplatesSection mentre carica", () => {
  it("mostra lo scheletro, non «Nessun template»", () => {
    renderWithAppData(<MessageTemplatesSection templates={[]} loading />, DEMO_APP_CTX);
    expect(screen.getByLabelText("Caricamento dei template di messaggio")).toBeTruthy();
    expect(screen.queryByText(/Nessun template/)).toBeNull();
  });

  it("a caricamento finito e senza template, lo dice", () => {
    renderWithAppData(<MessageTemplatesSection templates={[]} />, DEMO_APP_CTX);
    expect(screen.getByText(/Nessun template/)).toBeTruthy();
  });
});
