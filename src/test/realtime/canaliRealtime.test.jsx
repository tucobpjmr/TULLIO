// src/test/canaliRealtime.test.jsx
// B-1 dell'audit performance/UX del 19 agosto — quanti canali realtime tiene
// aperti una sessione.
//
// PERCHÉ SI CONTANO I CANALI E NON GLI EFFETTI. Il rilievo non era che
// qualcosa non funzionasse: undici canali sempre aperti per sessione facevano
// esattamente il loro mestiere. Era che due di essi stavano su tabelle da ~10
// e 4 righe che cambiano quando un admin apre il pannello, cioè poche volte
// l'anno — e che `users` era sottoscritta DUE volte dalla stessa sessione (il
// fattore ×2 di A-3). Un costo così non si vede da nessuna schermata e nessun
// test funzionale diventa rosso quando torna: l'unica cosa da fissare è il
// NUMERO, e a quali tabelle corrisponde.
//
// ⚠️ Il caso che conta di più è quello in POSITIVO: che le tabelle su cui il
// realtime È la funzionalità restino sottoscritte. Senza, «pochi canali»
// sarebbe soddisfatto anche da zero, cioè da un'app che non si aggiorna più.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const sottoscritte = [];
vi.mock("../../lib/api.js", () => {
  const vuota = async () => ({ data: [], error: null });
  return {
    Tasks: { list: vuota },
    Notices: { list: vuota },
    Categories: { list: vuota },
    Users: { listAll: vuota, getContacts: async () => ({ data: null }) },
    Clients: { list: vuota },
    MessageTemplates: { list: vuota },
    TaskThreads: { comments: vuota },
    subscribeToTable: (tabella) => { sottoscritte.push(tabella); return () => {}; },
  };
});

const { useAppHydration } = await import("../../hooks/useAppHydration.js");

beforeEach(() => { sottoscritte.length = 0; });

const monta = () => renderHook(() => useAppHydration({
  enabled: true,
  currentUserId: "u1",
  dispatch: vi.fn(),
  onError: vi.fn(),
  teamIniziale: null,
}));

describe("B-1 · i canali che l'idratazione tiene aperti", () => {
  it("le tabelle su cui il realtime È la funzionalità restano sottoscritte", async () => {
    // Il controllo POSITIVO, e va per primo: senza, i due casi sotto
    // passerebbero anche con tutto il realtime spento.
    monta();
    await waitFor(() => expect(sottoscritte.length).toBeGreaterThan(0));
    for (const t of ["tasks", "comments", "notices", "users", "clients"]) {
      expect(sottoscritte).toContain(t);
    }
  });

  it("`categories` e `message_templates` NON aprono più un canale", async () => {
    // ~10 righe e 4, cambiate da un admin poche volte l'anno: l'idratazione e
    // il reload alla ripresa bastano (`senzaCanale`). Il prezzo dichiarato è
    // che una categoria nuova compaia sugli altri client al ritorno in primo
    // piano invece che nell'istante.
    monta();
    await waitFor(() => expect(sottoscritte.length).toBeGreaterThan(0));
    expect(sottoscritte).not.toContain("categories");
    expect(sottoscritte).not.toContain("message_templates");
  });

  it("nessuna tabella è sottoscritta due volte dalla stessa idratazione", async () => {
    monta();
    await waitFor(() => expect(sottoscritte.length).toBeGreaterThan(0));
    expect(new Set(sottoscritte).size).toBe(sottoscritte.length);
  });

  it("sono cinque canali, non sette", async () => {
    // Il numero è la cosa che il rilievo misurava, quindi è la cosa che va
    // fatta scadere in modo rumoroso: aggiungere una sesta tabella qui è una
    // decisione, e questo test la rende esplicita invece di lasciarla passare
    // dentro una riga di `useAppHydration`.
    monta();
    await waitFor(() => expect(sottoscritte.length).toBeGreaterThan(0));
    expect(sottoscritte.sort()).toEqual(
      ["clients", "comments", "notices", "tasks", "users"]);
  });
});
