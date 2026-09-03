// C-1 dell'audit del 2 settembre · i tetti di `ErrorReports.create`.
//
// PERCHÉ ESISTE, dato che il tetto che conta sta nel database. Perché il tetto
// del database non è verificabile da qui e questo sì, e i due si guastano in
// modi diversi: là un `left()` tolto si vedrebbe solo misurando la tabella,
// qui una `slice` tolta si vede subito. Ma soprattutto perché questo è
// l'ULTIMO punto in cui il payload è ancora un oggetto JavaScript prima di
// partire, e ciò che questo test difende non è la dimensione della riga — è
// che un dispositivo in mobilità, mentre qualcosa non funziona, non spedisca
// mezzo megabyte di stack per farselo troncare all'arrivo.
//
// ⚠️ Non è il presidio dell'invariante di sicurezza. Quello è nella
// migrazione 20260903094500, e vale anche per chi chiama la RPC senza passare
// da questo modulo — cosa che chiunque può fare, con la chiave anon che sta
// nel bundle.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock("../../lib/supabase", () => {
  const supabase = { rpc: rpcMock };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { ErrorReports } = await import("../../lib/api/configurazione.js");

const argomenti = () => rpcMock.mock.calls.at(-1)[1];

describe("ErrorReports.create — tetti di lunghezza", () => {
  beforeEach(() => rpcMock.mockClear());

  it("chiama la RPC con il nome e gli argomenti attesi dal database", async () => {
    // I NOMI degli argomenti, non solo quello della funzione: PostgREST
    // risolve una RPC per nome E nomi dei parametri, quindi un argomento
    // rinominato qui è indistinguibile, a schermo, da una migrazione mai
    // applicata (vedi docs/MIGRAZIONI_SUPABASE.md).
    await ErrorReports.create({
      code: "VD-ABC-1234", origin: "promise", message: "qualcosa non va",
      stack: "at foo", url: "https://esempio/x", userAgent: "UA",
    });
    expect(rpcMock).toHaveBeenCalledWith("segnala_errore_client", {
      p_code: "VD-ABC-1234",
      p_origin: "promise",
      p_message: "qualcosa non va",
      p_stack: "at foo",
      p_url: "https://esempio/x",
      p_user_agent: "UA",
    });
  });

  it("tronca ogni campo al proprio tetto", async () => {
    await ErrorReports.create({
      code: "V".repeat(500),
      origin: "o".repeat(500),
      message: "m".repeat(50_000),
      stack: "s".repeat(500_000),
      url: "u".repeat(5_000),
      userAgent: "a".repeat(5_000),
    });
    const a = argomenti();
    expect(a.p_code).toHaveLength(64);
    expect(a.p_origin).toHaveLength(64);
    expect(a.p_message).toHaveLength(500);
    expect(a.p_stack).toHaveLength(4000);
    expect(a.p_url).toHaveLength(500);
    expect(a.p_user_agent).toHaveLength(300);
  });

  it("tronca dall'INIZIO: è la parte con cui la segnalazione si riconosce", async () => {
    // Non è un dettaglio di implementazione. Lo stack porta in cima il punto
    // in cui l'errore è nato; il messaggio porta in cima ciò che l'utente ha
    // letto a schermo. Troncare dalla coda perderebbe esattamente la parte
    // che serve a chi cerca il codice dettato al telefono.
    await ErrorReports.create({
      code: "VD-1", origin: "runtime",
      message: "PRINCIPIO" + "x".repeat(10_000),
      stack: "PRIMA RIGA\n" + "y".repeat(10_000),
    });
    const a = argomenti();
    expect(a.p_message.startsWith("PRINCIPIO")).toBe(true);
    expect(a.p_stack.startsWith("PRIMA RIGA")).toBe(true);
  });

  it("manda null per i campi assenti o vuoti, non una stringa vuota", async () => {
    // La colonna è nullable e «questo errore non aveva uno stack» è un fatto,
    // non una stringa di lunghezza zero da distinguere a valle.
    await ErrorReports.create({ code: "VD-2", origin: "promise", message: "x" });
    const a = argomenti();
    expect(a.p_stack).toBeNull();
    expect(a.p_url).toBeNull();
    expect(a.p_user_agent).toBeNull();
  });

  it("non rompe su valori non-stringa", async () => {
    // `registraSegnalazione` compone `stack` da `motivo?.stack || dettaglio`,
    // e un `motivo` che non è un Error può portarci dentro qualunque cosa.
    await ErrorReports.create({
      code: "VD-3", origin: "runtime", message: "x",
      stack: { non: "una stringa" }, url: 42, userAgent: undefined,
    });
    const a = argomenti();
    expect(a.p_stack).toBeNull();
    expect(a.p_url).toBeNull();
    expect(a.p_user_agent).toBeNull();
  });

  it("lascia intatto ciò che sta sotto il tetto", async () => {
    // Il caso normale, che è la stragrande maggioranza: nessun troncamento e
    // nessuna trasformazione del testo.
    const message = "Cannot read properties of undefined (reading 'assignees')";
    await ErrorReports.create({ code: "VD-4", origin: "runtime", message });
    expect(argomenti().p_message).toBe(message);
  });
});
