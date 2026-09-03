// supabase/functions/_shared/rateLimit.ts
//
// B-2 dell'audit del 2 settembre (prosegue M-3 del 31 agosto): il tetto di
// frequenza per le Edge Function privilegiate. Il conteggio vive nel database
// (RPC `rate_limit_incrementa`, migrazione 20260904000000) e non nella
// memoria dell'isolate, che su Deno Deploy non sopravvive fra due
// invocazioni — un contatore locale si azzererebbe a ogni cold start.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * @param adminClient client service_role: la RPC gira `security definer` ma
 *                    resta comunque revocata a `public` (solo `service_role`
 *                    ha l'EXECUTE), quindi qui non basterebbe il client anon.
 * @param chiave      identifica CHI va limitato, non l'operazione da sola:
 *                    `"<funzione>:<id chiamante>"`, così un secchio pieno per
 *                    un admin non tocca gli altri.
 * @returns true se la chiamata è entro il limite. Un errore della RPC stessa
 *          (rete, colonna mancante su un DB non ancora migrato) NON blocca la
 *          richiesta: un rate limit che si guasta e blocca tutto è un
 *          rilievo peggiore di uno che, guasto, lascia passare — a log
 *          comunque, per non farlo un fallimento silenzioso.
 */
export async function entroLimite(
  adminClient: SupabaseClient,
  chiave: string,
  finestraMinuti: number,
  soglia: number,
): Promise<boolean> {
  const { data, error } = await adminClient.rpc("rate_limit_incrementa", {
    p_chiave: chiave,
    p_finestra_minuti: finestraMinuti,
    p_soglia: soglia,
  });
  if (error) {
    console.error("[rateLimit] rate_limit_incrementa", error.message);
    return true;
  }
  return data === true;
}
