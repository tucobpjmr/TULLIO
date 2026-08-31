// Il lettore di token del client pieno — la correzione del
// «permission denied for table tasks/notices/message_templates» del 31 agosto.
//
// COSA MISURA. Non la costruzione del client (quella porta con sé
// @supabase/supabase-js e non aggiungerebbe nulla), ma l'unica funzione che
// decide con QUALE identità parte ogni richiesta del data layer. I tre casi
// sotto sono i tre esiti possibili di quella decisione, e il secondo e il
// terzo sono esattamente ciò che il 31 agosto è andato storto: davanti a una
// sessione momentaneamente nulla supabase-js ricadeva sulla anon key, che non
// ha GRANT su nessuna tabella, e otto query dell'idratazione tornavano in
// errore a un utente regolarmente autenticato.
import { describe, it, expect, vi } from "vitest";
import { creaLettoreToken } from "../../lib/supabase.js";

const conSessione = (access_token) => ({ data: { session: { access_token } }, error: null });
const senzaSessione = (error = null) => ({ data: { session: null }, error });

describe("creaLettoreToken — l'identità con cui parte ogni richiesta", () => {
  it("consegna il token della sessione corrente, chiedendolo una volta sola", async () => {
    const getSession = vi.fn().mockResolvedValue(conSessione("jwt-valido"));
    const leggi = creaLettoreToken({ getSession });

    await expect(leggi()).resolves.toBe("jwt-valido");
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("rilegge la sessione quando un refresh concorrente ha fatto scattare il commit guard", async () => {
    // Lo scenario è quello di due schede: l'altra ha vinto la corsa al
    // refresh e ha già scritto la sessione nuova nello storage, la nostra
    // chiamata si è vista scartare i token ruotati e torna con session null.
    // Il dato buono c'è già: basta rileggerlo.
    const getSession = vi.fn()
      .mockResolvedValueOnce(senzaSessione({ name: "AuthRefreshDiscardedError" }))
      .mockResolvedValueOnce(conSessione("jwt-ruotato"));
    const leggi = creaLettoreToken({ getSession });

    await expect(leggi()).resolves.toBe("jwt-ruotato");
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("fallisce dicendo che manca la sessione, invece di degradare alla anon key", async () => {
    // La regressione da cui nasce questo file: qui supabase-js restituiva
    // `this.supabaseKey`, la richiesta partiva come ruolo `anon` e l'utente
    // leggeva «permission denied for table tasks» — un messaggio che parla di
    // privilegi mentre il guasto è la sessione.
    const getSession = vi.fn().mockResolvedValue(senzaSessione());
    const leggi = creaLettoreToken({ getSession });

    await expect(leggi()).rejects.toMatchObject({
      name: "Sessione assente",
      message: expect.stringContaining("ricarica la pagina"),
    });
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("non restituisce mai la anon key né una stringa vuota al posto di un token", async () => {
    for (const sessione of [{ access_token: "" }, { access_token: undefined }, null]) {
      const getSession = vi.fn().mockResolvedValue({ data: { session: sessione }, error: null });
      await expect(creaLettoreToken({ getSession })()).rejects.toThrow();
    }
  });
});
