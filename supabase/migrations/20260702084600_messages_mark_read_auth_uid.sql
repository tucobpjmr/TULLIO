-- Fix sicurezza (severità media): spoofing delle read receipt via messages_mark_read.
--
-- Problema: la firma messages_mark_read(conv_id, reader_id, origin) accetta
-- reader_id come parametro arbitrario dal client (src/lib/api.js →
-- Messages.markReadBulk passava currentUserId letto lato client). Essendo la
-- funzione security invoker, la RLS su messages limita l'UPDATE alle sole
-- conversazioni di cui il chiamante è partecipante, quindi NON è possibile
-- toccare messaggi di conversazioni altrui. Resta però che un partecipante
-- legittimo A può chiamare la RPC passando reader_id = UUID di un altro utente
-- B, facendo risultare i messaggi come "letti da B" senza che B abbia mai
-- aperto la chat → spoofing della spunta blu / falso stato "letto da tutti"
-- mostrato agli altri partecipanti.
--
-- Fix: elimina il parametro reader_id dalla firma. Il lettore registrato in
-- read_by è SEMPRE e SOLO (select auth.uid()), mai un valore fornito dal
-- client. origin resta per il filtro dell'eco realtime; il guard
-- is_active_user() (introdotto in 20260628) è mantenuto. La vecchia nota che
-- giustificava reader_id libero (switcher utente in dev) decade: in dev
-- l'aggiornamento ottimistico lato client può mostrare l'utente impersonato,
-- ma la verità lato DB è la sessione auth reale — comportamento corretto.

-- Rimuove la vecchia firma a 3 argomenti.
drop function if exists public.messages_mark_read(uuid, uuid, uuid);

create or replace function public.messages_mark_read(
  conv_id uuid,
  origin uuid default null
)
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
  reader uuid := (select auth.uid());
begin
  if not public.is_active_user() then
    raise exception 'User is not active';
  end if;

  update public.messages
  set read_by = read_by || reader,
      origin_client = origin
  where conversation_id = conv_id
    and sender_id <> reader
    and not (reader = any(read_by));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.messages_mark_read(uuid, uuid) from public, anon;
grant execute on function public.messages_mark_read(uuid, uuid) to authenticated;
