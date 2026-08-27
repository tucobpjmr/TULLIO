-- M-2 (audit sicurezza del 26 agosto) — la clausola "orfani" di
-- `chat_files_delete` non aveva soggetto: valeva per chiunque.
--
-- LA SITUAZIONE. 20260814220000 ha aggiunto alla policy di DELETE un quarto
-- ramo per la bonifica degli allegati rimasti senza conversazione:
--
--     or not exists (select 1 from public.conversations c
--                    where c.id::text = (storage.foldername(objects.name))[1])
--
-- Letto com'è scritto: QUALUNQUE utente attivo può cancellare QUALUNQUE
-- oggetto di 'chat-files' la cui prima cartella non corrisponda a una
-- conversazione esistente. L'intento era legittimo; il permesso concesso non
-- è «pulisci i tuoi orfani», è «cancella qualsiasi orfano di chiunque».
--
-- E C'ERA UN SECONDO DIFETTO, che si vede solo mettendo la policy accanto al
-- codice che la usa. `ConversationsAPI.remove` cancella la riga, poi
-- `MessagesAPI.removeConversationFiles` fa `storage.list(conversationId)` e
-- solo dopo `remove(paths)`. Ma la LIST passa da `chat_files_select`, che
-- richiede una conversazione ESISTENTE di cui si è partecipanti: sparita la
-- riga, la list torna vuota per tutti — admin compresi, perché anche lì
-- `is_admin()` stava DENTRO l'`exists`. Il ramo "orfani" del DELETE era quindi
-- insieme troppo largo in teoria e irraggiungibile in pratica: la bonifica che
-- 20260814220000 voleva abilitare non è mai avvenuta, e gli allegati degli
-- altri partecipanti sono rimasti nel bucket. Restringere il ramo a
-- `owner_id or is_admin()` — la correzione che l'audit propone — avrebbe
-- chiuso il buco lasciando il difetto: i primi due rami già coprono owner e
-- admin, quindi il quarto sarebbe diventato un no-op e la pulizia
-- cross-partecipante sarebbe rimasta impossibile per sempre.
--
-- COSA FA QUESTA MIGRAZIONE. Dà un soggetto agli orfani, e glielo dà con
-- l'unico dato che dopo la cancellazione non c'è più: chi ne era
-- partecipante. Un trigger AFTER DELETE su `conversations` lascia una lapide
-- in `private.conversazioni_eliminate` (id + participants), e le due policy di
-- 'chat-files' consultano quella:
--
--   * DELETE  — orfani cancellabili da chi ERA partecipante (o dall'admin,
--               che il secondo ramo già copre). Non più da chiunque.
--   * SELECT  — orfani ELENCABILI dagli stessi, altrimenti il ramo di DELETE
--               resta irraggiungibile per il motivo detto sopra.
--
-- PERCHÉ NON ALLARGA NULLA. Un ex partecipante poteva leggere quei file un
-- istante prima che la conversazione sparisse: la lapide non gli concede un
-- accesso nuovo, gli conserva quello che aveva per il tempo di portarsi via i
-- byte. Per l'admin `is_admin()` esce dall'`exists` e diventa un ramo suo, che
-- è la forma che `chat_files_delete` usa già dal 20260814220000: gli consente
-- la bonifica degli orfani, compresi quelli NATI PRIMA di questa migrazione,
-- per i quali nessuna lapide esiste e nessun ex partecipante potrà mai
-- ripulire.
--
-- LA LAPIDE NON È UN DATO IN PIÙ. Contiene l'id della conversazione e gli uuid
-- di chi vi partecipava — entrambi già in `audit_log` e nei log di Postgres —
-- e nessun contenuto. Vive in `private`, schema non esposto da PostgREST e
-- senza GRANT per `authenticated`: si legge solo attraverso
-- `private.era_partecipante()`, che risponde sì/no su chi sta chiamando.

-- ─── La lapide ──────────────────────────────────────────────────────────────
create table if not exists private.conversazioni_eliminate (
  id           uuid primary key,
  participants uuid[] not null,
  eliminata_il timestamptz not null default now()
);

revoke all on private.conversazioni_eliminate from public, anon, authenticated;
alter table private.conversazioni_eliminate enable row level security;
-- Nessuna policy, di proposito: con RLS attiva l'assenza di policy È il
-- divieto. La tabella si legge solo dalle funzioni SECURITY DEFINER qui sotto,
-- che girano come proprietario e non ne sono soggette.

create or replace function private.conversazione_lascia_lapide()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into private.conversazioni_eliminate (id, participants)
  values (old.id, old.participants)
  -- Un id riusato non deve far fallire la DELETE che lo ha generato: la
  -- lapide più recente è quella che conta.
  on conflict (id) do update
    set participants = excluded.participants, eliminata_il = now();
  return old;
end $$;

drop trigger if exists trg_conversations_lapide on public.conversations;
create trigger trg_conversations_lapide
  after delete on public.conversations
  for each row execute function private.conversazione_lascia_lapide();

-- `p_cartella` è il primo segmento del path dell'oggetto, cioè testo grezzo che
-- arriva dal nome del file: il confronto casta l'id della lapide a testo e non
-- il contrario, così un segmento che non è un uuid non solleva — semplicemente
-- non trova nulla.
create or replace function private.era_partecipante(p_cartella text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from private.conversazioni_eliminate d
    where d.id::text = p_cartella
      and (select auth.uid()) = any (d.participants)
  );
$$;

revoke all on function private.era_partecipante(text) from public;
grant execute on function private.era_partecipante(text) to authenticated;

-- ─── Le due policy di 'chat-files' ──────────────────────────────────────────
drop policy if exists "chat_files_select" on storage.objects;
create policy "chat_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      (select private.is_admin())
      or exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
          and (select auth.uid()) = any (c.participants)
      )
      -- Orfani: chi ERA partecipante li elenca ancora, il tempo di cancellarli.
      or (select private.era_partecipante((storage.foldername(objects.name))[1]))
    )
  );

drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      owner_id = (select auth.uid())::text
      or (select private.is_admin())
      or exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
          and (select auth.uid()) = any (c.participants)
      )
      -- Bonifica degli orfani: non più «chiunque», ma chi era partecipante
      -- della conversazione cancellata. I primi due rami coprono già owner e
      -- admin; questo esiste per il terzo caso — il partecipante che ripulisce
      -- gli allegati altrui di una conversazione che non c'è più.
      or (select private.era_partecipante((storage.foldername(objects.name))[1]))
    )
  );
