// M-2 dell'audit del 2 settembre. `public.error_reports` dichiara di non
// contenere PII oltre a quella già in `users`, ma `message`/`stack` arrivano
// dal messaggio dell'eccezione così com'è — e un rifiuto di Postgres CITA il
// valore che l'ha causato («Key (email)=(mario.rossi@example.it) already
// exists»), che è l'indirizzo di un cliente in una tabella la cui lettura è
// più larga di quella dell'anagrafica. Questo file verifica che
// `registraSegnalazione` reda le due forme note (email, telefono) prima di
// scrivere — e SOLO lì: la console resta intatta, è il canale della diagnosi.
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("../../lib/api.js", () => ({
  ErrorReports: { create: createMock },
}));

const { registraSegnalazione } = await import("../../lib/errorReporting.js");

// `registraSegnalazione` fa `import('./api.js').then(...)`: un microtask.
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("registraSegnalazione — redazione PII (M-2)", () => {
  beforeEach(() => createMock.mockClear());

  it("sostituisce un'email nel messaggio", async () => {
    const err = new Error('duplicate key value violates unique constraint "clients_email_key"\nDETAIL:  Key (email)=(mario.rossi@example.it) already exists.');
    registraSegnalazione("VD-1", "data-layer", err);
    await flush();
    const [{ message }] = createMock.mock.calls[0];
    expect(message).not.toContain("mario.rossi@example.it");
    expect(message).toContain("«email»");
  });

  it("sostituisce un numero di telefono nel messaggio", async () => {
    const err = new Error("Key (phone)=(+39 333 1234567) already exists.");
    registraSegnalazione("VD-2", "data-layer", err);
    await flush();
    const [{ message }] = createMock.mock.calls[0];
    expect(message).not.toContain("333 1234567");
    expect(message).toContain("«telefono»");
  });

  it("reda anche lo stack, non solo il messaggio", async () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n  at Foo (mario.rossi@example.it)";
    registraSegnalazione("VD-3", "runtime", err);
    await flush();
    const [{ stack }] = createMock.mock.calls[0];
    expect(stack).not.toContain("mario.rossi@example.it");
  });

  it("non tocca un messaggio senza PII", async () => {
    const message = "Cannot read properties of undefined (reading 'assignees')";
    registraSegnalazione("VD-4", "runtime", new Error(message));
    await flush();
    expect(createMock.mock.calls[0][0].message).toBe(message);
  });

  it("uno stack assente resta null, non una stringa vuota", async () => {
    registraSegnalazione("VD-5", "runtime", "solo una stringa");
    await flush();
    expect(createMock.mock.calls[0][0].stack).toBeNull();
  });
});
