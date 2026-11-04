// M-4 dell'audit del 4 novembre · al logout la coda offline di chi esce si
// svuota, e chi ha modifiche non ancora consegnate lo sa PRIMA di perderle.
//
// La coda porta le azioni intere (nomi di clienti, contatti, testi) e restava
// su IndexedDB fino a sette giorni dopo l'uscita, su un dispositivo che in
// agenzia è spesso condiviso.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, fireEvent, render } from "@testing-library/react";
import { depositoMemoria } from "../../lib/depositoIdb.js";
import { creaCodaScritture } from "../../state/codaScritture.js";
import { withAppData, DEMO_APP_CTX } from "../helpers/appData.jsx";

const { scrittureInAttesa } = vi.hoisted(() => ({ scrittureInAttesa: vi.fn(async () => 0) }));
vi.mock("../../state/codaDispositivo.js", () => ({ scrittureInAttesa, svuotaScrittureDi: vi.fn() }));

const { useConfermaUscita } = await import("../../components/shell/useConfermaUscita.js");

describe("coda — rimuoviPerUtente", () => {
  it("toglie le voci di chi esce e lascia quelle degli altri account", async () => {
    const coda = creaCodaScritture(depositoMemoria());
    await coda.accoda({ uid: "u1", tipo: "MOVE_TASK", azione: {} });
    await coda.accoda({ uid: "u1", tipo: "UPDATE_TASK", azione: {} });
    await coda.accoda({ uid: "u2", tipo: "MOVE_TASK", azione: {} });

    await coda.rimuoviPerUtente("u1");

    expect(await coda.conta("u1")).toBe(0);
    expect(await coda.conta("u2")).toBe(1);
  });
});

describe("useConfermaUscita — una perdita di lavoro si chiede, non si decide", () => {
  beforeEach(() => { scrittureInAttesa.mockReset(); });

  const monta = () => {
    let chiedi;
    function Sonda() { chiedi = useConfermaUscita(); return null; }
    render(withAppData(<Sonda />, DEMO_APP_CTX));
    return () => chiedi();
  };

  it("senza modifiche in attesa esce senza chiedere niente", async () => {
    scrittureInAttesa.mockResolvedValue(0);
    const chiedi = monta();
    let ok;
    await act(async () => { ok = await chiedi(); });
    expect(ok).toBe(true);
    expect(screen.queryByText("Modifiche non ancora inviate")).toBeNull();
    expect(scrittureInAttesa).toHaveBeenCalledWith(DEMO_APP_CTX.currentUserId);
  });

  it("con modifiche in attesa chiede; «Esci comunque» conferma", async () => {
    scrittureInAttesa.mockResolvedValue(2);
    const chiedi = monta();
    let esito;
    act(() => { esito = chiedi(); });
    expect(await screen.findByText("Modifiche non ancora inviate")).toBeTruthy();
    expect(screen.getByText(/2 modifiche fatte senza rete/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByText("Esci comunque")); });
    await expect(esito).resolves.toBe(true);
  });

  it("annullando si resta dentro, e la coda resta com'era", async () => {
    scrittureInAttesa.mockResolvedValue(1);
    const chiedi = monta();
    let esito;
    act(() => { esito = chiedi(); });
    await screen.findByText("Modifiche non ancora inviate");
    await act(async () => { fireEvent.click(screen.getByText("Annulla")); });
    await expect(esito).resolves.toBe(false);
  });
});
