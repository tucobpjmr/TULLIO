-- ─── M-1 dell'analisi del 16 novembre · i partecipanti di una chat diretta non si cambiano
--
-- COSA SI ROMPEVA. `conversations_update` chiede solo che chi scrive sia
-- partecipante prima e dopo. In una chat DIRETTA un partecipante poteva quindi
-- aggiungere un terzo (che legge tutta la cronologia, perché `messages_select`
-- guarda `participants`) o togliere l'altro. Bastava anche passare prima
-- `type` da 'direct' a 'group' e poi cambiare i partecipanti.
-- L'app non scrive mai `participants` né `type` in UPDATE: `ConversationsAPI.update`
-- riceve solo `pinned`, `name`, `icon` (src/components/chat/chatCommands.js).
--
-- COSA FA ORA. Un trigger BEFORE UPDATE, per i ruoli dell'API e per chi non è
-- admin, rifiuta con `insufficient_privilege`:
--   - ogni cambio di `type`;
--   - ogni cambio di `participants` su una conversazione 'direct'.
--
-- ⛔ I GRUPPI restano come oggi: un membro aggiunge e toglie chiunque. È una
-- scelta presa il 17 novembre, non una dimenticanza.
--
-- ⚠️ NON è SECURITY DEFINER: il controllo guarda `current_user`, e in una
-- funzione definer sarebbe sempre il proprietario. Come in
-- `private.tasks_campi_immutabili`, tutto ciò che non è `authenticated`/`anon`
-- (service_role, migrazioni, cascate eseguite dal proprietario) passa.
-- `private.is_admin()` è definer ed eseguibile da `authenticated`.
--
-- Il caso che lo lega al database è in src/test/integration/rlsChatAllegatiCommenti.test.js
-- («Chat diretta — i partecipanti non si cambiano»).
--
-- Idempotente: `create or replace` e `drop trigger if exists`.

create or replace function private.conversations_guard_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (select private.is_admin()) then
    return new;
  end if;
  if new.type is distinct from old.type then
    raise exception 'Il tipo di una conversazione non si cambia'
      using errcode = 'insufficient_privilege';
  end if;
  if old.type = 'direct' and new.participants is distinct from old.participants then
    raise exception 'I partecipanti di una chat diretta non si cambiano'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.conversations_guard_participants() from public, anon, authenticated;

drop trigger if exists trg_conversations_guard_participants on public.conversations;
create trigger trg_conversations_guard_participants
  before update on public.conversations
  for each row execute function private.conversations_guard_participants();
