// supabase/functions/_shared/audit.ts
//
// La scrittura sul registro di controllo dalle Edge Function privilegiate
// (A-2 dell'audit sicurezza del 26 agosto).
//
// PERCHÉ QUESTE TRE NON PASSANO DA `registra_audit()`. La RPC ricava l'attore
// da `auth.uid()`, che è il modo giusto quando a chiamare è un utente con la
// sua sessione. Qui il client è costruito con la SERVICE_ROLE_KEY e `auth.uid()`
// è null: l'attore è quello che `requireActiveAdmin` ha appena verificato, e
// va passato per parametro. È lo stesso motivo per cui la RPC quel parametro
// non ce l'ha — chi arriva con un token non deve poter scegliere il nome da
// scrivere nel registro; qui il nome non lo sceglie il chiamante ma il gate
// di autorizzazione, due righe più sopra nel call site.
//
// PERCHÉ SONO PROPRIO QUESTE TRE LE OPERAZIONI DA REGISTRARE. Girano con la
// service_role, quindi non attraversano la RLS e nessun trigger di riga le
// vede fuori da public.users: `delete-user` cancella da `auth.users` (in
// public.users arriva il CASCADE, che il trigger di delete cattura, ma non il
// fatto che sia stata una decisione amministrativa), e `set-user-active`
// tocca la sessione in GoTrue, dove il database non arriva affatto.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Best-effort e MAI bloccante. Un'operazione distruttiva già andata a buon fine
 * non deve fallire perché il registro non ha risposto: annullarla non si può
 * (l'utente è già eliminato, la sessione già bannata) e restituire un errore
 * spingerebbe l'admin a riprovare un'azione che è già avvenuta.
 *
 * Il fallimento va però detto A LOG, e non ingoiato: un registro di controllo
 * che smette di registrare in silenzio è peggio di uno che non c'è, perché chi
 * lo consulta continua a fidarsene.
 */
export async function registraAudit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  target: { type?: string; id?: string } = {},
  details: Record<string, unknown> = {},
): Promise<void> {
  // Il nome dell'attore è denormalizzato nella riga (vedi il commento sulla
  // colonna `actor_name`): un registro che dopo l'eliminazione dell'account
  // dice «qualcuno» non serve. Se la lettura fallisce si scrive comunque la
  // voce: l'id vale più del nome.
  const { data: attore } = await admin
    .from("users").select("name").eq("id", actorId).maybeSingle();

  const { error } = await admin.from("audit_log").insert({
    actor_id: actorId,
    actor_name: attore?.name ?? null,
    action,
    target_type: target.type ?? null,
    target_id: target.id ?? null,
    details,
  });
  if (error) console.error(`[audit] "${action}" NON registrata:`, error.message);
}
