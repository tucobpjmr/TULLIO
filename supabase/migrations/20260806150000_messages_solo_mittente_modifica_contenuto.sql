-- S-08 — Un partecipante non può più riscrivere il testo dei messaggi altrui.
--
-- IL PROBLEMA. La policy messages_update consente l'UPDATE a chiunque
-- partecipi alla conversazione:
--
--   using/with check (sender_id = auth.uid() or private.is_admin()
--                     or exists (select 1 from conversations c
--                                where c.id = messages.conversation_id
--                                  and auth.uid() = any(c.participants)))
--
-- Il terzo ramo non è un errore: read receipt, reazioni e pin condiviso sono
-- scritture legittime di chi RICEVE il messaggio, non di chi lo ha scritto.
-- Ma una policy RLS decide per riga, non per colonna: lo stesso ramo che
-- autorizza `update messages set read_by = …` autorizza anche
-- `update messages set text = 'altro'` su un messaggio scritto da un collega.
-- La chat non ha cronologia di edit, quindi la modifica non lascia traccia.
-- In una chat interna dove si concordano importi e scadenze è un problema di
-- integrità e di non ripudio.
--
-- PERCHÉ NON SI RESTRINGE LA POLICY. La correzione "ovvia" — togliere il terzo
-- ramo e lasciare solo mittente + admin — romperebbe tre funzionalità vive:
--   • il pin condiviso (chatCommands.js:164 → MessagesAPI.setPinned): si
--     fissa il messaggio ALTRUI, è il caso normale, non l'eccezione;
--   • le read receipt (RPC messages_mark_read): si marca letto ciò che hanno
--     scritto gli altri, mai il proprio;
--   • le reazioni (RPC messages_toggle_reaction): idem.
-- Le due RPC sono SECURITY DEFINER ma i trigger scattano comunque e auth.uid()
-- resta quello del chiamante, quindi non aggirerebbero una policy ristretta.
--
-- LA CORREZIONE. La policy resta com'è (autorizza la riga) e un trigger
-- BEFORE UPDATE decide le colonne: chi non è né il mittente né admin può
-- toccare solo le colonne collaborative.
--
-- PERCHÉ UN ALLOWLIST SU to_jsonb E NON UN ELENCO DI `is distinct from`.
-- Elencare le colonne vietate significa che una colonna aggiunta domani nasce
-- NON protetta, e nessuno se ne accorge finché non è un incidente. Confrontare
-- le due righe intere private delle sole colonne consentite ribalta il default:
-- ogni colonna futura è protetta appena esiste, e per renderla collaborativa
-- bisogna toglierla qui esplicitamente — cioè prendere la decisione invece di
-- ereditarla per dimenticanza.
create or replace function public.messages_blocca_modifiche_altrui()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- sender_id è immutabile per chiunque non sia admin, e va controllato PRIMA
  -- di ogni altra cosa perché è l'ancora su cui poggia il controllo qui sotto.
  --
  -- La prima stesura di questo trigger chiedeva `new.sender_id = auth.uid()`:
  -- un test di verifica su dati reali ha mostrato che era aggirabile in una
  -- sola istruzione — `update messages set sender_id = <me>, text = '…'`
  -- rendeva vera la condizione e faceva uscire il trigger dal ramo "sei il
  -- mittente, nessun vincolo", riaprendo esattamente il buco che chiude. La
  -- domanda giusta è "chi ha scritto questa riga", che è old.sender_id: un
  -- valore che l'aggiornamento in corso non può influenzare.
  if new.sender_id is distinct from old.sender_id and not (select private.is_admin()) then
    raise exception 'Il mittente di un messaggio non può essere cambiato.'
      using errcode = '42501';
  end if;

  -- Il mittente originale e l'admin non hanno vincoli di colonna.
  if old.sender_id = (select auth.uid()) or (select private.is_admin()) then
    return new;
  end if;

  -- Colonne che chi riceve può legittimamente cambiare:
  --   reactions, read_by  → RPC messages_toggle_reaction / messages_mark_read
  --   pinned, pinned_at, pinned_by → pin condiviso (setPinned)
  --   origin_client → tag anti-eco realtime, scritto da withOrigin() su ogni
  --                   update del client
  if (to_jsonb(new) - 'reactions' - 'read_by' - 'pinned' - 'pinned_at' - 'pinned_by' - 'origin_client')
     is distinct from
     (to_jsonb(old) - 'reactions' - 'read_by' - 'pinned' - 'pinned_at' - 'pinned_by' - 'origin_client')
  then
    raise exception 'Solo chi ha scritto il messaggio può modificarne il contenuto.'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.messages_blocca_modifiche_altrui() from public, anon, authenticated;

drop trigger if exists trg_messages_blocca_modifiche_altrui on public.messages;
create trigger trg_messages_blocca_modifiche_altrui
  before update on public.messages
  for each row execute function public.messages_blocca_modifiche_altrui();
