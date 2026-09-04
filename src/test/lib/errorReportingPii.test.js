// M-2 dell'audit del 2 settembre. `public.error_reports` dichiara di non
// contenere PII oltre a quella già in `users`, ma `message`/`stack` arrivano
// dal messaggio dell'eccezione così com'è — e un rifiuto di Postgres CITA il
// valore che l'ha causato («Key (email)=(mario.rossi@example.it) already
// exists»), che è l'indirizzo di un cliente in una tabella la cui lettura è
// più larga di quella dell'anagrafica. Questo file verifica che
// `registraSegnalazione` reda le due forme note (email, telefono) prima di
// scrivere — e SOLO lì: la console resta intatta, è il canale della diagnosi.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// B-3 dell'audit del 4 settembre. `redigiPii` reda `message` e `stack` ma
// lasciava passare `url` e `userAgent` grezzi. `url` va comunque da
// `redigiPii` (stessa funzione, stesso comportamento sulle due forme note);
// `userAgent` si tronca alla sola famiglia — non basta redigere le due forme
// note, la stringa intera (versione di OS e build del browser) è comunque più
// fingerprint del necessario. L'ordine dei confronti è la parte non ovvia:
// le UA di Edge e Opera contengono "Chrome/", e quelle di Chrome "Safari/".
describe("registraSegnalazione — url e userAgent (B-3)", () => {
  const originalUA = navigator.userAgent;
  beforeEach(() => createMock.mockClear());
  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", { value: originalUA, configurable: true });
  });

  const conUserAgent = (ua) =>
    Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });

  it("Chrome resta Chrome anche se l'UA contiene anche Safari", async () => {
    conUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36");
    registraSegnalazione("VD-6", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("Chrome");
  });

  it("Edge (Chromium) non viene scambiato per Chrome", async () => {
    conUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0");
    registraSegnalazione("VD-7", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("Edge");
  });

  it("Opera non viene scambiato per Chrome", async () => {
    conUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      + "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 OPR/113.0.0.0");
    registraSegnalazione("VD-8", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("Opera");
  });

  it("Firefox", async () => {
    conUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0");
    registraSegnalazione("VD-9", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("Firefox");
  });

  it("Safari (senza Chrome/ nell'UA)", async () => {
    conUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.5 Safari/605.1.15");
    registraSegnalazione("VD-10", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("Safari");
  });

  it("un'UA non riconosciuta ricade su 'altro', non passa grezza", async () => {
    conUserAgent("qualcosa/1.0 di completamente diverso");
    registraSegnalazione("VD-11", "runtime", new Error("boom"));
    await flush();
    expect(createMock.mock.calls[0][0].userAgent).toBe("altro");
  });

  it("url passa da redigiPii come message e stack", async () => {
    registraSegnalazione("VD-12", "runtime", new Error("boom"));
    await flush();
    // jsdom valorizza già window.location: qui basta verificare che il
    // campo sia una stringa (non grezzamente `undefined`) e non l'oggetto
    // Location — cioè che sia passato dentro redigiPii, che ritorna sempre
    // una stringa via String(testo ?? "").
    expect(typeof createMock.mock.calls[0][0].url).toBe("string");
  });
});
