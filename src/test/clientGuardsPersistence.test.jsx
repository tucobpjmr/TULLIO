// ADD_CLIENT/UPDATE_CLIENT/DELETE_CLIENT — A-1 dell'audit del 14 agosto
// (secondo passaggio).
//
// PERCHÉ ESISTE. Erano le uniche tre mutazioni del registry di persistenza
// senza `guard` (stessa lacuna già chiusa sugli avvisi lo stesso giorno), e
// `ADD_CLIENT`/`UPDATE_CLIENT` non avevano nemmeno un `rollback`. Il database
// invece discrimina per davvero — tre policy RLS diverse, verificate lette
// dal database di produzione: select/insert/update ad admin+manager+agent,
// delete ai soli admin+manager (`canEditClient`/`canDeleteClient` in
// lib/permissions.js). Senza guard, un agent che preme «Rimuovi» — pulsante
// mostrato a chiunque prima di questa correzione — vedeva il reducer
// applicare in ottimistico ("Cliente rimosso"), la RLS rifiutare la DELETE
// senza sollevare `error`, e nessun rollback riportare la scheda: il cliente
// restava sparito dalla UI e presente sul database fino al reload.
//
// Estratto in un file suo (non una sezione di persistenceGuards.test.js), per
// lo stesso motivo di noticeGuardsPersistence.test.js: "un file, una
// responsabilità" vale anche per i test.
//
// La metà UI (i pulsanti «Modifica»/«Rimuovi» compaiono solo per chi la RLS
// lascerebbe agire) è verificata dalla stessa suite in ClienteCard: vedi il
// test dedicato più sotto.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Clients: { create: vi.fn(ok), update: vi.fn(ok), remove: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { reducer, makeInitialState } = await import("../state/reducer.js");
const { ClienteCard } = await import("../components/clients/ClienteCard.jsx");

const reducerHaApplicato = (state, action) => {
  const next = reducer(state, action);
  return next !== state && next.toasts?.at(-1)?.type !== "error";
};

const TEAM_CLIENTI = [
  { id: "admin1",   name: "Admin",   role: "admin",   active: true, pending: false },
  { id: "manager1", name: "Manager", role: "manager", active: true, pending: false },
  { id: "agent1",   name: "Agent",   role: "agent",   active: true, pending: false },
  { id: "driver1",  name: "Driver",  role: "driver",  active: true, pending: false },
];

const CLIENTE = { id: "cliente1", name: "Mario Rossi", createdAt: "2026-01-01T00:00:00.000Z" };

const statoConCliente = (uid, cliente = CLIENTE) => {
  const base = makeInitialState({ team: TEAM_CLIENTI, currentUserId: uid });
  return { ...base, clients: [cliente], toasts: [] };
};

describe("persistence — anagrafica clienti: guard e rollback (A-1)", () => {
  describe.each([
    ["ADD_CLIENT",    () => ({ type: "ADD_CLIENT", payload: { id: "cliente2", name: "Nuovo" } })],
    ["UPDATE_CLIENT", () => ({ type: "UPDATE_CLIENT", payload: { id: "cliente1", name: "Modificato" } })],
  ])("%s — admin/manager/agent sì, driver no", (tipo, azione) => {
    it.each([
      ["admin", "admin1", true],
      ["manager", "manager1", true],
      ["agent", "agent1", true],
      ["driver", "driver1", false],
    ])("%s → guard concorda col reducer", (_, uid, atteso) => {
      const state = statoConCliente(uid);
      const action = azione();
      expect(PERSISTENCE[tipo].guard(state, action, uid)).toBe(atteso);
      expect(reducerHaApplicato(state, action)).toBe(atteso);
    });
  });

  describe("DELETE_CLIENT — solo admin/manager", () => {
    it.each([
      ["admin", "admin1", true],
      ["manager", "manager1", true],
      ["agent", "agent1", false],
      ["driver", "driver1", false],
    ])("%s → guard concorda col reducer", (_, uid, atteso) => {
      const state = statoConCliente(uid);
      const action = { type: "DELETE_CLIENT", payload: "cliente1" };
      expect(PERSISTENCE.DELETE_CLIENT.guard(state, action, uid)).toBe(atteso);
      expect(reducerHaApplicato(state, action)).toBe(atteso);
    });
  });

  it("ADD_CLIENT.rollback toglie il cliente non arrivato sul server", () => {
    const state = statoConCliente("admin1");
    const action = { type: "ADD_CLIENT", payload: { id: "cliente2", name: "Nuovo" } };
    expect(PERSISTENCE.ADD_CLIENT.rollback(state, action))
      .toEqual({ type: "ROLLBACK_CLIENTS_BULK", payload: ["cliente2"] });
  });

  it("UPDATE_CLIENT.rollback rimanda la scheda INTERA pre-dispatch, non solo il patch", () => {
    const state = statoConCliente("admin1");
    const action = { type: "UPDATE_CLIENT", payload: { id: "cliente1", name: "Modificato" } };
    expect(PERSISTENCE.UPDATE_CLIENT.rollback(state, action))
      .toEqual({ type: "UPDATE_CLIENT", payload: CLIENTE });
  });

  it("UPDATE_CLIENT.rollback applicato dal reducer ripristina davvero il nome", () => {
    const prima = statoConCliente("admin1");
    const modifica = { type: "UPDATE_CLIENT", payload: { id: "cliente1", name: "Modificato" } };
    const dopo = reducer(prima, modifica);
    expect(dopo.clients[0].name).toBe("Modificato");

    const undo = PERSISTENCE.UPDATE_CLIENT.rollback(prima, modifica);
    const ripristinato = reducer(dopo, undo);
    expect(ripristinato.clients[0].name).toBe("Mario Rossi");
  });

  it("DELETE_CLIENT.rollback ripristina il cliente rimosso in ottimistico", () => {
    const state = statoConCliente("admin1");
    const action = { type: "DELETE_CLIENT", payload: "cliente1" };
    expect(PERSISTENCE.DELETE_CLIENT.rollback(state, action))
      .toEqual({ type: "RESTORE_CLIENT", payload: CLIENTE });

    const dopoDelete = reducer(state, action);
    expect(dopoDelete.clients).toEqual([]);
    const undo = PERSISTENCE.DELETE_CLIENT.rollback(state, action);
    const ripristinato = reducer(dopoDelete, undo);
    expect(ripristinato.clients).toEqual([CLIENTE]);
  });

  it("mapError dà un messaggio actionable per ciascuna delle tre azioni", () => {
    expect(PERSISTENCE.ADD_CLIENT.mapError()).toBe("cliente non salvato");
    expect(PERSISTENCE.UPDATE_CLIENT.mapError()).toBe("cliente non aggiornato");
    expect(PERSISTENCE.DELETE_CLIENT.mapError({ code: "23503" }))
      .toMatch(/liste viaggio collegate/);
  });
});

describe("ClienteCard — i pulsanti Modifica/Rimuovi compaiono solo se il chiamante li passa", () => {
  it("senza onEdit/onDelete non renderizza alcun bottone azione", () => {
    render(<ClienteCard cliente={CLIENTE} onSelect={() => {}} />);
    expect(screen.queryByText("✏️")).not.toBeInTheDocument();
    expect(screen.queryByText("🗑️")).not.toBeInTheDocument();
  });

  it("con onEdit/onDelete renderizza entrambi", () => {
    render(<ClienteCard cliente={CLIENTE} onSelect={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText("✏️")).toBeInTheDocument();
    expect(screen.getByText("🗑️")).toBeInTheDocument();
  });
});
