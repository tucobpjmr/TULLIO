-- Fix race last-write-wins sulle reazioni dei messaggi.
--
-- Problema: Messages.setReactions(id, reactions) scriveva l'INTERO oggetto
-- reactions calcolato lato client (read-modify-write non atomico). Due utenti
-- che reagiscono allo stesso messaggio quasi in contemporanea leggono lo stesso
-- stato di partenza e si sovrascrivono a vicenda: l'ultima scrittura vince e la
-- reazione dell'altro sparisce. In più l'utente veniva preso da CURRENT_USER
-- lato client (spoofabile con lo switcher dev), non da auth.uid().
--
-- Fix: una RPC che fa il toggle atomico di auth.uid() per una singola emoji su
-- un singolo messaggio. Il SELECT ... FOR UPDATE prende il lock di riga: i
-- toggle concorrenti si serializzano invece di clobberarsi. security invoker →
-- la RLS su messages limita comunque l'UPDATE ai soli partecipanti della
-- conversazione. Il reactor è SEMPRE (select auth.uid()), mai un valore dal
-- client. Stesso pattern (auth.uid server-side + is_active_user) di
-- messages_mark_read (20260702).

create or replace function public.messages_toggle_reaction(
  msg_id uuid,
  emoji text,
  origin uuid default null
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  uid text := (select auth.uid())::text;
  current_reactions jsonb;
  arr jsonb;
  next_reactions jsonb;
begin
  if not public.is_active_user() then
    raise exception 'User is not active';
  end if;

  -- Lock di riga: read-modify-write atomico sotto concorrenza.
  select reactions into current_reactions
  from public.messages
  where id = msg_id
  for update;

  if not found then
    return null;
  end if;

  current_reactions := coalesce(current_reactions, '{}'::jsonb);
  arr := coalesce(current_reactions -> emoji, '[]'::jsonb);

  if arr @> to_jsonb(uid) then
    -- Rimuovi l'utente da questa emoji; se resta vuota, elimina la chiave.
    arr := arr - uid;
    if jsonb_array_length(arr) = 0 then
      next_reactions := current_reactions - emoji;
    else
      next_reactions := jsonb_set(current_reactions, array[emoji], arr);
    end if;
  else
    -- Aggiungi l'utente a questa emoji (crea la chiave se assente).
    next_reactions := jsonb_set(current_reactions, array[emoji], arr || to_jsonb(uid), true);
  end if;

  update public.messages
  set reactions = next_reactions,
      origin_client = origin
  where id = msg_id;

  return next_reactions;
end;
$$;

-- Solo utenti autenticati (mai anon/public).
revoke execute on function public.messages_toggle_reaction(uuid, text, uuid) from public, anon;
grant execute on function public.messages_toggle_reaction(uuid, text, uuid) to authenticated;
