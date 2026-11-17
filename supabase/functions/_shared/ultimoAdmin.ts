// supabase/functions/_shared/ultimoAdmin.ts
//
// B-3 dell'analisi del 16 novembre. `delete-account` e `delete-user` girano
// con la service_role: senza questo controllo l'unico admin attivo può
// eliminarsi, e il progetto resta senza nessuno che approvi, inviti o
// riattivi. Rimedio solo da SQL, a mano.
//
// «Admin attivo» è lo stesso predicato di `puoAgireComeAdmin` e del database:
// role = 'admin' AND active AND NOT coalesce(pending, false).
//
// ⚠️ Due admin che si eliminano a vicenda nello stesso istante passano
// entrambi il controllo: è un conteggio, non un lock. Il caso è il rischio
// residuo accettato, scritto in docs/SICUREZZA.md.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.108.0";

export type EsitoUltimoAdmin =
  | { ok: true; ultimo: boolean }
  | { ok: false; errore: unknown };

/**
 * Dice se, tolto `escluso`, non resta nessun admin attivo.
 * Un errore di lettura non è un via libera: torna `ok: false`.
 */
export async function eUltimoAdminAttivo(
  adminClient: SupabaseClient,
  escluso: string,
): Promise<EsitoUltimoAdmin> {
  const { data: bersaglio, error: errBersaglio } = await adminClient
    .from("users").select("role, active, pending").eq("id", escluso).maybeSingle();
  if (errBersaglio) return { ok: false, errore: errBersaglio };
  const eAdminAttivo = bersaglio?.role === "admin"
    && bersaglio.active === true
    && bersaglio.pending !== true;
  if (!eAdminAttivo) return { ok: true, ultimo: false };

  const { count, error } = await adminClient
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true)
    .or("pending.is.null,pending.eq.false")
    .neq("id", escluso);
  if (error || count === null) return { ok: false, errore: error ?? "conteggio assente" };
  return { ok: true, ultimo: count === 0 };
}

export const MSG_ULTIMO_ADMIN =
  "È l'unico amministratore attivo: nomina prima un altro amministratore.";
