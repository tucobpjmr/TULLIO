// supabase/functions/set-user-active/statoAccesso.ts
//
// B-1 dell'analisi del 6 novembre. Ban in GoTrue e `public.users.active` sono
// due scritture su due sistemi: non c'è una transazione che le tenga insieme.
// Prima, se il ban riusciva e l'update del profilo falliva, la funzione
// rispondeva 500 lasciando la sessione bannata e il profilo «attivo» (o il
// contrario, alla riattivazione).
//
// Qui l'atomicità si ottiene con una COMPENSAZIONE: si legge lo stato del ban
// prima di cambiarlo, e se il profilo non si aggiorna si rimette quello. Lo
// stato precedente si legge da GoTrue e non da `active`, perché un account
// eliminato è bannato con un profilo già `active = false`: dedurlo dal
// profilo potrebbe sbloccarlo.
//
// Separato dall'handler per provarlo in Vitest, come
// `delete-account/riautenticazione.ts` (l'import è di soli tipi).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.108.0";

// «Finché un admin non lo toglie»: GoTrue non ha un valore per «per sempre»,
// solo `"none"` per togliere il ban. Stessa durata di delete-account.
export const BAN_INDEFINITO = "87600h"; // 10 anni

const ORA_MS = 3_600_000;

/** La `ban_duration` che rimette il ban letto in `banned_until`. */
export function durataDaRipristinare(bannedUntil: string | null | undefined, adesso = Date.now()): string {
  const fine = bannedUntil ? Date.parse(bannedUntil) : NaN;
  if (!Number.isFinite(fine) || fine <= adesso) return "none";
  return `${Math.max(1, Math.ceil((fine - adesso) / ORA_MS))}h`;
}

export type EsitoCambio =
  | { esito: "fatto" }
  | { esito: "non_trovato" }
  | { esito: "guasto"; fase: "lettura" | "ban" | "profilo"; errore: unknown; compensato: boolean };

export async function cambiaStatoAccesso(
  admin: SupabaseClient,
  targetId: string,
  active: boolean,
): Promise<EsitoCambio> {
  const { data: letto, error: letturaErr } = await admin.auth.admin.getUserById(targetId);
  if (letturaErr?.status === 404 || (!letturaErr && !letto?.user)) return { esito: "non_trovato" };
  if (letturaErr) return { esito: "guasto", fase: "lettura", errore: letturaErr, compensato: true };
  const banPrecedente = durataDaRipristinare(letto?.user?.banned_until);

  // Prima la sessione: se il ban fallisce non si è scritto niente.
  const { error: banErr } = await admin.auth.admin.updateUserById(targetId, {
    ban_duration: active ? "none" : BAN_INDEFINITO,
  });
  if (banErr) return { esito: "guasto", fase: "ban", errore: banErr, compensato: true };

  // `.select` per sapere se la riga c'era: un update su zero righe non è un
  // errore, ma lascerebbe il ban senza profilo da allineare.
  const { data: righe, error: profiloErr } = await admin
    .from("users").update({ active }).eq("id", targetId).select("id");
  if (!profiloErr && righe?.length) return { esito: "fatto" };

  const { error: compErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: banPrecedente });
  if (compErr) {
    // Il caso che resta disallineato: a log con entrambi gli errori, perché
    // chi amministra deve sistemarlo a mano.
    console.error(`[set-user-active] compensazione fallita per ${targetId}: ban da riportare a ${banPrecedente}`,
      compErr.message);
  }
  if (!profiloErr) return compErr
    ? { esito: "guasto", fase: "profilo", errore: new Error("profilo assente"), compensato: false }
    : { esito: "non_trovato" };
  return { esito: "guasto", fase: "profilo", errore: profiloErr, compensato: !compErr };
}
