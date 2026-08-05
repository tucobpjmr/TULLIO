-- Step Q.4: RPC bulk markRead chat (caveat #6, finding #9).
-- Prima: aprire una conversazione con N messaggi non letti generava N UPDATE
-- sulla tabella messages (uno per ogni messaggio nel wrapper setMessagesRaw),
-- ciascuno con un round-trip rete + 1 evento realtime → costo O(N) di rete
-- e amplificazione del traffico realtime.
-- Adesso: una sola RPC fa un singolo UPDATE che aggiunge reader_id all'array
-- read_by di tutti i messaggi non letti della conversazione, dove reader_id
-- non è già presente e non è il sender. Imposta anche origin_client per
-- filtrare l'eco realtime sul client che ha originato la lettura.

create or replace function public.messages_mark_read(
  conv_id uuid,
  reader_id uuid,
  origin uuid default null
)
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  update public.messages
  set read_by = read_by || reader_id,
      origin_client = origin
  where conversation_id = conv_id
    and sender_id <> reader_id
    and not (reader_id = any(read_by));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.messages_mark_read(uuid, uuid, uuid) to authenticated;
