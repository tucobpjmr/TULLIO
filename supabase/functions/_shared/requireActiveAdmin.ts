// supabase/functions/_shared/requireActiveAdmin.ts
//
// Il preambolo di autorizzazione delle Edge Function privilegiate: verifica il
// JWT del chiamante e ne rilegge il profilo con la service_role, applicando il
// predicato di adminPredicate.ts (che è dove sta il ragionamento, e dove va
// letto il perché).
//
// Era copiato in `invite-user` e `delete-user`, con lo stesso identico difetto
// in entrambi — che è il modo in cui i controlli duplicati sbagliano: non
// divergono, restano uguali e sbagliati insieme. Qui è uno solo, e la parte
// che decide è pura e testata.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  COLONNE_PROFILO_ADMIN,
  MSG_NON_AUTORIZZATO,
  puoAgireComeAdmin,
} from "./adminPredicate.ts";

export type EsitoAdmin =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

/**
 * @param adminClient client service_role — legge `public.users` scavalcando la
 *                    RLS. È necessario: la policy di SELECT su `users` non
 *                    filtra per `active`, ma leggere il profilo del chiamante
 *                    con il SUO token significherebbe far dipendere il
 *                    controllo di autorizzazione dalle policy che il chiamante
 *                    stesso attraversa.
 * @param anonClient  client anon con l'Authorization del chiamante: serve solo
 *                    a farsi dire da GoTrue CHI è, cosa che il token da solo
 *                    non prova (un access token può essere formalmente valido
 *                    mentre la sessione è già stata revocata — vedi
 *                    isExpiredSessionError in src/lib/api.js).
 */
export async function requireActiveAdmin(
  adminClient: SupabaseClient,
  anonClient: SupabaseClient,
): Promise<EsitoAdmin> {
  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: "Token non valido" };

  // `maybeSingle` e non `single`: un utente auth senza riga in public.users
  // (invito interrotto a metà, riga cancellata a mano) non è un errore da 500,
  // è un chiamante senza profilo — e senza profilo il verdetto è "no".
  const { data: caller, error: profiloErr } = await adminClient
    .from("users")
    .select(COLONNE_PROFILO_ADMIN)
    .eq("id", user.id)
    .maybeSingle();

  // Una query fallita NON è un permesso concesso. Prima il risultato veniva
  // destrutturato ignorando l'errore (`const { data: caller } = await …`):
  // con `caller` a null il vecchio controllo `caller?.role !== "admin"`
  // rispondeva 403, quindi il difetto non c'era, ma reggeva per coincidenza —
  // bastava invertire il senso di un confronto per trasformare un errore di
  // rete in un via libera. Qui è esplicito.
  if (profiloErr) {
    console.error("[requireActiveAdmin] lettura profilo", profiloErr.message);
    return { ok: false, status: 403, error: MSG_NON_AUTORIZZATO };
  }

  if (!puoAgireComeAdmin(caller)) {
    // A log il motivo vero (a chi amministra il progetto serve distinguere
    // "non è admin" da "è un admin disattivato che sta ancora provando"), al
    // chiamante il messaggio unico: vedi MSG_NON_AUTORIZZATO.
    console.warn(
      `[requireActiveAdmin] rifiutato ${user.id}: role=${caller?.role ?? "—"} ` +
      `active=${caller?.active ?? "—"} pending=${caller?.pending ?? "—"}`,
    );
    return { ok: false, status: 403, error: MSG_NON_AUTORIZZATO };
  }

  return { ok: true, userId: user.id };
}
