// A-3 dell'analisi del 6 novembre — i rifiuti di GoTrue al cambio password,
// detti in italiano. La funzione TRADUCE e non decide: un codice che non
// conosce lascia passare il messaggio del server.
import { describe, it, expect } from "vitest";
import { messaggioCambioPassword } from "../../lib/erroriCambioPassword.js";
import { REQUISITI_PASSWORD_TESTO } from "../../lib/validators.js";

describe("messaggioCambioPassword", () => {
  it.each([
    ["current_password_mismatch", "La password attuale non è corretta."],
    ["current_password_required", "Inserisci la password attuale."],
    ["same_password", "La nuova password deve essere diversa da quella attuale."],
    ["reauthentication_needed", "Per sicurezza esci, rientra e riprova."],
    ["over_request_rate_limit", "Troppi tentativi. Riprova tra qualche minuto."],
  ])("%s → messaggio italiano", (code, atteso) => {
    expect(messaggioCambioPassword({ code, message: "in inglese" })).toBe(atteso);
  });

  it("weak_password elenca gli stessi requisiti del validatore", () => {
    expect(messaggioCambioPassword({ code: "weak_password" })).toContain(REQUISITI_PASSWORD_TESTO);
  });

  it("un guasto di rete si riconosce dal testo", () => {
    expect(messaggioCambioPassword({ message: "Failed to fetch" })).toBe("Errore di rete. Verifica la connessione.");
  });

  it("un codice sconosciuto lascia il messaggio del server", () => {
    expect(messaggioCambioPassword({ code: "nuovo_codice", message: "Something new" })).toBe("Something new");
  });

  it("senza niente, il ripiego", () => {
    expect(messaggioCambioPassword(null)).toBe("Cambio password non riuscito.");
  });
});
