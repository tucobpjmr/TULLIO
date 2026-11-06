// supabase/functions/delete-account/riautenticazione.ts
//
// A-3 e M-3 dell'analisi del 6 novembre (riprendono M-5 del 31 agosto): le
// due metà di «Elimina account» che stanno PRIMA e DOPO il ban, separate
// dall'handler perché si possano provare in Vitest, come `_shared/rateLimit.ts`
// (l'import qui sotto è di soli tipi: esbuild lo toglie, Node non deve
// risolvere `jsr:`).
//
// PRIMA DEL BAN · la password. Una sessione lasciata aperta su un PC condiviso
// bastava a eliminare l'account. La verifica sta QUI, sul server: un controllo
// nel client lo salta chiunque chiami la funzione con il token. Si verifica
// con `signInWithPassword` su un client anonimo che non salva niente, cioè con
// lo stesso controllo del login. Non c'è un endpoint di GoTrue che «verifichi
// e basta», e confrontare l'hash di `auth.users` a mano vorrebbe dire dipendere
// dal formato interno di quella colonna. La sessione aperta per verificare si
// chiude subito.
//
// DOPO IL BAN · cosa resta in `auth.users`. Prima restavano email e
// `user_metadata` (nome, ruolo, colore, capacità, chi ha invitato): la persona
// era ancora identificabile, e l'indirizzo restava occupato, quindi rientrare
// in agenzia richiedeva un intervento a mano sul database.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.108.0";

export type EsitoPassword = "corretta" | "sbagliata" | "troppi_tentativi" | "guasto";

/**
 * @param client  client con la chiave ANON e `persistSession: false`: la
 *                sessione che apre serve solo a sapere se la password è giusta.
 * @param idAtteso l'id del chiamante, letto dal suo token. Un login riuscito
 *                 su un ALTRO utente non conferma niente.
 */
export async function verificaPassword(
  client: SupabaseClient,
  idAtteso: string,
  email: string,
  password: string,
): Promise<{ esito: EsitoPassword; errore?: unknown }> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    const { code, status } = error as { code?: string; status?: number };
    if (code === "invalid_credentials") return { esito: "sbagliata" };
    if (code === "over_request_rate_limit" || status === 429) return { esito: "troppi_tentativi" };
    // Qualunque altro rifiuto (GoTrue irraggiungibile, utente già bannato da
    // una prima richiesta) NON è «password sbagliata»: dirlo manderebbe
    // l'utente a riscrivere una password giusta.
    return { esito: "guasto", errore: error };
  }
  // Best-effort: il ban che segue blocca comunque il rinnovo di questa
  // sessione, ma non c'è motivo di lasciarla aperta fino ad allora.
  const { error: esciErr } = await client.auth.signOut({ scope: "local" });
  if (esciErr) console.error("[delete-account] chiusura della sessione di verifica", esciErr.message);
  if (data.user?.id !== idAtteso) return { esito: "sbagliata" };
  return { esito: "corretta" };
}

/**
 * L'indirizzo che prende il posto di quello vero. Unico per costruzione (c'è
 * l'id), e `.invalid` è un dominio riservato (RFC 2606): nessuna email potrà
 * mai partire verso di esso.
 */
export function emailAnonima(id: string): string {
  return `eliminato+${id}@invalid.invalid`;
}

/**
 * Ogni chiave dei metadati, messa a `null`: GoTrue CANCELLA le chiavi a
 * `null` invece di salvarle. Si parte dalle chiavi PRESENTI e non da un
 * elenco scritto qui: una chiave aggiunta domani all'invito viene tolta
 * senza che nessuno debba ricordarsi di questo file.
 */
export function metadatiAzzerati(metadati: Record<string, unknown> | null | undefined): Record<string, null> {
  return Object.fromEntries(Object.keys(metadati ?? {}).map((chiave) => [chiave, null]));
}
