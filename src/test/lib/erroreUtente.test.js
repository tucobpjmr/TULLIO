import { afterEach, describe, expect, it, vi } from "vitest";
import { erroreUtente, guastoDiRete, TESTO_RETE, TESTO_SESSIONE, TESTO_PERMESSI } from "../../lib/errori.js";
import { erroreDiPermesso, RIFIUTO_RLS } from "../../lib/esitoScrittura.js";

// Il testo di un errore per chi usa l'app (A-2 dell'analisi UX del 15 novembre).
describe("erroreUtente", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("un guasto di rete diventa un invito a riprovare, non «Failed to fetch»", () => {
    expect(erroreUtente(new TypeError("Failed to fetch"))).toBe(TESTO_RETE);
    expect(erroreUtente({ code: "", message: "TypeError: Load failed" })).toBe(TESTO_RETE);
    expect(erroreUtente("NetworkError when attempting to fetch resource")).toBe(TESTO_RETE);
  });

  it("i codici di Postgres e PostgREST diventano frasi", () => {
    expect(erroreUtente({ code: "23505", message: "duplicate key value violates unique constraint" }))
      .toBe("esiste già un elemento con questi dati");
    expect(erroreUtente({ code: "42501", message: "permission denied for table tasks" })).toBe(TESTO_PERMESSI);
    expect(erroreUtente({ code: "PGRST301", message: "JWT expired" })).toBe(TESTO_SESSIONE);
    expect(erroreUtente({ code: "08006", message: "connection failure" })).toBe(TESTO_RETE);
  });

  it("il codice vince sul testo: «statement timeout» non è un guasto di rete", () => {
    expect(erroreUtente({ code: "57014", message: "canceling statement due to statement timeout" }))
      .toMatch(/troppo a rispondere/);
  });

  it("le eccezioni delle nostre RPC (P0001) passano, senza uuid", () => {
    expect(erroreUtente({ code: "P0001", message: "La lista è già di questo cliente." }))
      .toBe("La lista è già di questo cliente.");
    expect(erroreUtente({ code: "P0001", message: "Lista 0b6c2f0e-1d2a-4c3b-9e8f-1234567890ab non trovata." }))
      .toBe("Lista non trovata.");
    expect(erroreUtente({ code: "P0001", message: "User is not active" })).toMatch(/non è attivo/);
  });

  it("un codice di sistema sconosciuto mostra il ripiego, mai il testo tecnico", () => {
    expect(erroreUtente({ code: "XX000", message: "internal error" }, "task non salvato")).toBe("task non salvato");
    expect(erroreUtente({ code: "PGRST204", message: "Could not find the column" }, "x")).toBe("x");
    expect(erroreUtente({ code: "unexpected_failure", message: "boh" }, "x")).toBe("x");
  });

  it("i testi scritti dall'app passano: Edge Function, permessi, RLS, codici applicativi", () => {
    expect(erroreUtente({ message: "Password non corretta." })).toBe("Password non corretta.");
    expect(erroreUtente(erroreDiPermesso())).toBe("non hai i permessi per questa azione");
    expect(erroreUtente(RIFIUTO_RLS)).toBe(RIFIUTO_RLS.message);
    expect(erroreUtente({ code: "CONFLITTO", message: "un collega ha appena modificato questo task." }))
      .toBe("un collega ha appena modificato questo task.");
  });

  it("errori di programmazione e di libreria: il ripiego", () => {
    expect(erroreUtente(new TypeError("x is not a function"), "r")).toBe("r");
    expect(erroreUtente({ name: "StorageUnknownError", message: "Bucket not found" }, "r")).toBe("r");
  });

  it("Storage per stato HTTP e testo RLS", () => {
    expect(erroreUtente({ name: "StorageApiError", status: 413, message: "Payload too large" })).toMatch(/troppo grande/);
    expect(erroreUtente({ name: "StorageApiError", status: 400, message: "mime type image/x not supported" }))
      .toMatch(/tipo di file/);
    expect(erroreUtente(new Error("new row violates row-level security policy"))).toBe(TESTO_PERMESSI);
  });

  it("niente da dire: il ripiego, mai una stringa vuota", () => {
    expect(erroreUtente(null, "r")).toBe("r");
    expect(erroreUtente(undefined)).toBe("operazione non riuscita");
    expect(erroreUtente(true, "r")).toBe("r");
    expect(erroreUtente({ message: "   " }, "r")).toBe("r");
  });

  it("guastoDiRete: offline vince su qualunque testo", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(guastoDiRete({ message: "qualunque cosa" })).toBe(true);
  });
});
