-- A-1 dell'audit dell'8 settembre. L'autorizzazione dei canali Realtime.
--
-- ─── LA SITUAZIONE, DETTA BENE ─────────────────────────────────────────────
--
-- Il progetto autorizza su tre livelli — `src/lib/permissions.js`, i `guard`
-- dei registry, le policy RLS — e `src/test/integration/rls.test.js` misura
-- che i tre non divergano. Su Realtime quella disciplina copre METÀ del
-- protocollo:
--
--   • `postgres_changes` (subscribeToTable)  → Realtime valuta le policy
--     della TABELLA per conto dell'utente prima di consegnare l'evento. È a
--     posto, e lo è sempre stato.
--   • broadcast e presence (`typing:<id>`, `presenza:agenzia`) → NON passano
--     di lì. Sono un protocollo diverso, con una tabella di autorizzazione
--     propria: `realtime.messages`.
--
-- ⚠️ E LA CAUSA NON È CHE `realtime.messages` SIA APERTA — è già fail-closed:
-- ha `relrowsecurity = true` e ZERO policy, cioè nega tutto, su staging come
-- in produzione (verificato). La causa è che quella tabella NON VIENE MAI
-- CONSULTATA: Realtime la interroga solo per i canali dichiarati
-- `private: true` dal client, e `src/lib/realtime.js` non lo dichiarava per
-- nessuno dei due. Un canale pubblico non attraversa alcuna autorizzazione —
-- non la fallisce, la salta.
--
-- La distinzione conta perché decide l'ORDINE di applicazione (vedi sotto) e
-- perché una prima stesura di questo rilievo aveva letto `relrowsecurity`
-- sulle PARTIZIONI giornaliere (`messages_2026_09_08`, `relkind = 'r'`, dove
-- il flag è false) invece che sulla tabella padre partizionata
-- (`relkind = 'p'`, dove è true), e ne aveva concluso «la RLS è spenta». La
-- conclusione sul rischio non cambiava — i canali erano pubblici comunque —
-- ma la diagnosi sì, e con essa il rimedio: qui non c'è una RLS da accendere,
-- ci sono le policy che mancano.
--
-- ─── COSA POTEVA FARE CHI NON DOVEVA ───────────────────────────────────────
--
-- Con 7 utenti di cui 2 `driver` — il ruolo che ogni policy del progetto
-- esclude da chat, anagrafica e liste — un driver poteva:
--   • sottoscrivere `typing:<conversationId>` di una conversazione che la RLS
--     non gli lascia leggere, riceverne gli eventi e PUBBLICARNE di propri;
--   • fare `track()` su `presenza:agenzia` sotto una chiave ARBITRARIA: la
--     chiave di presence la sceglie il client, `key: myId` in
--     `hooks/usePresence.js` è una convenzione del nostro codice e non un
--     vincolo del protocollo.
-- Un ex-partecipante rimosso da una conversazione conserva l'UUID e con esso
-- l'accesso: caso già riconosciuto reale su un'altra superficie dalla
-- 20260827075157 (`chat_files_orfani_ex_partecipanti`).
--
-- ─── ⚠️ L'ORDINE DI APPLICAZIONE È PARTE DELLA CORREZIONE ──────────────────
--
-- QUESTA MIGRAZIONE VA APPLICATA PRIMA del deploy di `src/lib/realtime.js`.
-- Non è prudenza generica, ed è il contrario di come si legge di solito:
--
--   • migrazione prima, client dopo → fra i due momenti non cambia NULLA (i
--     canali restano pubblici finché il client non chiede `private: true`, e
--     queste policy non vengono consultate). Nessuna finestra scoperta,
--     nessun disservizio.
--   • client prima, migrazione dopo → il client chiede canali privati, la
--     tabella nega tutto perché senza policy, e «sta scrivendo» e i pallini
--     di presenza SMETTONO DI FUNZIONARE per tutti fino all'applicazione.
--
-- Cioè: sbagliare ordine non riapre il buco, rompe la funzione. Vale la pena
-- scriverlo perché l'intuizione porta all'errore opposto.

-- ─── 1. L'asserzione, ridondante di proposito ──────────────────────────────
-- `realtime.messages` ha GIÀ la RLS attiva su entrambi i progetti: questa
-- riga non cambia nulla oggi. Sta qui come le altre ridondanze dichiarate del
-- progetto (`can_clienti_*` che ripetono `active AND NOT pending` sotto una
-- RESTRICTIVE che già le AND-a): se un reset del progetto, un ripristino da
-- backup o un cambio di piattaforma la lasciasse spenta, le policy qui sotto
-- diventerebbero decorative — permissive su una tabella senza RLS non negano
-- niente — e nessuno se ne accorgerebbe, perché il sintomo sarebbe che tutto
-- funziona.
alter table realtime.messages enable row level security;

-- ─── 2. Il gate di `typing:<conversation_id>` ──────────────────────────────
-- Rispecchia `conversations_select` (`auth.uid() = any(participants) or
-- is_admin()`), e deve continuare a rispecchiarla: se cambia chi vede una
-- conversazione, questa deve seguirla — altrimenti torna esattamente lo
-- scarto fra due livelli che l'audit ha trovato.
--
-- Perché una funzione e non il predicato in linea nella policy: il topic va
-- validato PRIMA del cast a uuid. Un topic malformato (`typing:pippo`, o un
-- `typing:` seguito da 36 trattini) farebbe fallire `::uuid` con un errore,
-- e un errore dentro una policy è un 500 al posto di un rifiuto. Il regex è
-- quello completo dello UUID e non `[0-9a-fA-F-]{36}`: il secondo accetta
-- stringhe di soli trattini, che passano il controllo e rompono il cast.
--
-- `security definer` perché deve leggere `public.conversations` senza
-- attraversarne la RLS: se la attraversasse, un non-partecipante otterrebbe
-- zero righe e quindi `false` — il verdetto giusto per caso, che è il modo in
-- cui un controllo regge finché qualcuno non cambia la policy sotto.
create or replace function private.puo_typing(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_topic ~* '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then exists (
      select 1 from public.conversations c
      where c.id = substring(p_topic from 8)::uuid
        and ((select auth.uid()) = any (c.participants) or (select private.is_admin()))
    )
    else false
  end;
$$;

-- EXECUTE ad `authenticated`, come `is_admin`/`is_active_user`/`can_liste`:
-- una policy che chiama una funzione la esegue con i privilegi di CHI
-- interroga, quindi senza questo grant la policy fallirebbe per permesso
-- negato invece di valutare. (Una prima stesura la revocava anche ad
-- `authenticated`, copiando la disciplina delle funzioni trigger, dove il
-- chiamante è il proprietario della tabella e il grant non serve: qui serve.)
revoke execute on function private.puo_typing(text) from public, anon;
grant   execute on function private.puo_typing(text) to authenticated;

comment on function private.puo_typing(text) is
  'Gate del canale realtime typing:<conversation_id>. Rispecchia la policy '
  'conversations_select. A-1 dell''audit dell''8 settembre.';

-- ─── 3. Le policy ──────────────────────────────────────────────────────────
--
-- Due per canale — SELECT per RICEVERE, INSERT per PUBBLICARE — perché sono
-- due permessi distinti: leggere chi sta scrivendo e dire di star scrivendo
-- non sono la stessa azione, e il buco chiuso qui li comprendeva entrambi.
--
-- Scoped anche per `extension`, che è la colonna con cui Realtime registra il
-- TIPO di messaggio: 'broadcast' per il broadcast, 'presence' per la presenza
-- (documentazione Supabase, «Realtime Authorization» → Broadcast/Presence, che
-- riporta i due esempi separati con `extension in ('broadcast')` e
-- `extension in ('presence')`). Ogni canale del progetto usa un protocollo
-- solo — `typing:<id>` solo broadcast, `presenza:agenzia` solo presence — e la
-- policy dice esattamente quello: un `send()` di broadcast sul topic della
-- presenza non passa, e viceversa.
--
-- ⚠️ È l'unico punto di questa migrazione che poggia sulla DOCUMENTAZIONE e
-- non su una misura: da questo ambiente la rete verso *.supabase.co è bloccata
-- (nessuna sottoscrizione reale possibile, solo verifica SQL). Se l'extension
-- fosse quella sbagliata la policy non lascerebbe passare MENO, lascerebbe
-- passare NIENTE — cioè «sta scrivendo» e i pallini smetterebbero di
-- funzionare. È esattamente ciò che il passaggio da staging serve a
-- intercettare: vedi la nota operativa in fondo.

drop policy if exists "presenza_agenzia_ricevi" on realtime.messages;
drop policy if exists "presenza_agenzia_pubblica" on realtime.messages;
drop policy if exists "typing_conversazione_ricevi" on realtime.messages;
drop policy if exists "typing_conversazione_pubblica" on realtime.messages;

-- `presenza:agenzia` è di TUTTO il team, driver compresi: chi è collegato
-- adesso è un fatto operativo, non un dato di dominio. Il gate è quindi il
-- minimo comune del progetto — utente attivo e approvato — e non `can_liste()`.
--
-- ⚠️ LIMITE DICHIARATO: questa policy chiude il PERIMETRO, non l'IDENTITÀ
-- della singola voce. La chiave di presence viaggia nel payload e nessuna
-- policy la vede, quindi un membro legittimo del team può ancora pubblicare
-- sotto la chiave di un altro. È un rischio di categoria diversa — un collega
-- che mente sul proprio stato, dentro un perimetro di sette persone — da
-- quello chiuso qui, che era chiunque abbia un token, compresi i ruoli
-- esclusi da tutto il resto.
create policy "presenza_agenzia_ricevi"
  on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) = 'presenza:agenzia'
    and realtime.messages.extension in ('presence')
    and (select private.is_active_user())
  );

create policy "presenza_agenzia_pubblica"
  on realtime.messages for insert to authenticated
  with check (
    (select realtime.topic()) = 'presenza:agenzia'
    and realtime.messages.extension in ('presence')
    and (select private.is_active_user())
  );

create policy "typing_conversazione_ricevi"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension in ('broadcast')
    and (select private.puo_typing((select realtime.topic())))
  );

create policy "typing_conversazione_pubblica"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast')
    and (select private.puo_typing((select realtime.topic())))
  );

-- ─── ⚠️ NOTA OPERATIVA · QUESTA MIGRAZIONE NON PASSA DAL CANALE ABITUALE ────
--
-- `docs/MIGRAZIONI_SUPABASE.md` prescrive di applicare via dashboard SQL
-- Editor **o** via MCP `apply_migration`. Per questa la seconda strada NON
-- funziona, ed è un limite della piattaforma e non della sessione:
-- `realtime.messages` è di proprietà di `supabase_realtime_admin`, mentre la
-- connessione di `apply_migration` è `postgres`, che su quella tabella ha i
-- privilegi DML (SELECT/INSERT/UPDATE/DELETE...) ma NON la proprietà — e
-- `CREATE POLICY` la richiede. Misurato l'8 settembre su tullio-staging:
--
--   apply_migration               → ERROR 42501: must be owner of table messages
--   grant supabase_realtime_admin to postgres → 42501
--   set role supabase_admin / supabase_realtime_admin → 42501
--   alter table realtime.messages owner to postgres  → 42501
--
-- Va quindi applicata dalla **dashboard Supabase → SQL Editor**, e la
-- registrazione in `schema_migrations` va fatta a mano come dice il passo 3
-- della procedura:
--
--   insert into supabase_migrations.schema_migrations (version, name)
--   values ('20260908120000', 'realtime_canali_privati')
--   on conflict (version) do nothing;
--
-- ⚠️ Se anche dalla dashboard rispondesse 42501, la strada resta il supporto
-- Supabase: non esiste un percorso in-repo per ottenere quella proprietà, e
-- forzarla non va tentato.
--
-- ─── COSA VERIFICARE SU STAGING, PRIMA DELLA PRODUZIONE ────────────────────
-- La verifica SQL (dry-run con impersonazione, sezione «Dry-run» della
-- procedura) prova il PREDICATO; non prova che Realtime scriva le righe con
-- l'`extension` che le policy si aspettano. Quello si vede solo usando l'app:
--
--   1. su staging, aprire l'app con due utenti in due browser;
--   2. i pallini di presenza devono accendersi (canale `presenza:agenzia`);
--   3. scrivendo in una conversazione condivisa, l'altro deve vedere
--      «sta scrivendo…» (canale `typing:<id>`);
--   4. con l'utente `driver` — che non è partecipante — «sta scrivendo…»
--      NON deve arrivare, ed è il punto che chiude il rilievo.
--
-- Se 2 o 3 falliscono, l'errore è quasi certamente l'`extension` di cui sopra:
-- allargare le policy togliendo il filtro `extension` e riprovare, prima di
-- toccare qualunque altra cosa.
