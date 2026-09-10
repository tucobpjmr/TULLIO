-- M-1 dell'audit del 10 settembre.
--
-- `public.sonda_audit_clients_update()` — introdotta il 5 settembre, dentro
-- M-2 di quell'audit — è SECURITY DEFINER e scrive su `public.clients`
-- scavalcando la RLS, ed era eseguibile da QUALUNQUE utente autenticato:
-- nessun controllo di ruolo, nessun tetto. Lo stesso audit, con B-5, aveva
-- appena messo un rate limit a `send_test_push()` chiamandola «l'unica porta
-- privilegiata del progetto senza» — e il giorno dopo ne è nata una seconda,
-- più privilegiata: `send_test_push` scrive una notifica dell'utente su sé
-- stesso, questa un INSERT e un UPDATE sull'anagrafica di 885 persone.
--
-- ── Cosa poteva farne un driver, un pending o un account compromesso ───────
-- Non lasciare dati: il rollback interno annulla INSERT e UPDATE qualunque
-- sia l'esito, e questo resta vero. Poteva però CHIAMARLA IN CICLO, e ogni
-- chiamata sono due scritture su `clients`, un trigger, una lettura di
-- `audit_log` e un'eccezione — un amplificatore di carico gratuito su una
-- tabella che sta nel percorso caldo di chi sta lavorando. E resta una
-- primitiva di scrittura su `clients` che la RLS non vede passare: la difesa
-- in profondità che B-1 del 5 settembre ha appena rimesso in `clients`
-- esiste per non dover dipendere dal fatto che oggi quella primitiva non
-- restituisca niente di utile.
--
-- ── I due gate, nessuno dei due nuovo ─────────────────────────────────────
--   1. `private.can_clienti_scrittura()`: lo STESSO predicato delle policy
--      clients_select/insert/update. Il criterio non è «chi è abbastanza
--      fidato» ma «chi non ci guadagna nulla» — per admin, manager e agent
--      (attivi e non pending) la sonda non è un'escalation, perché fa
--      scavalcando la RLS una cosa che la RLS gli lascerebbe fare comunque.
--      Per tutti gli altri lo era.
--   2. `public.rate_limit_incrementa()`, nella forma esatta di B-5.
--
-- La CI non cambia: `scripts/verifica-audit-vivo/index.js` accede con
-- `RLS_TEST_JUNIOR_*` (.github/workflows/rls.yml), che è un `agent` — dentro
-- l'elenco di `can_clienti_scrittura()` — e fa una chiamata per run. Il tetto
-- è 20 all'ora e non 5 come in B-5 perché quel chiamante è CONDIVISO fra le
-- run: `rls.yml` parte su ogni push a `main` che tocchi i path elencati, e
-- sei merge ravvicinati sono sei chiamate dello stesso utente. Venti lascia
-- passare la concorrenza reale della CI e riduce comunque un ciclo infinito
-- a venti esecuzioni l'ora.
--
-- ⚠️ L'ORDINE DELLE RIGHE È PARTE DELLA CORREZIONE, non uno stile. Il
-- conteggio va incrementato PRIMA del blocco `begin/exception`, mai dentro:
-- quel blocco è un SAVEPOINT implicito e la sua eccezione annulla TUTTE le
-- scritture fatte al suo interno — il contatore compreso, che tornerebbe
-- indietro a ogni chiamata lasciando il tetto perennemente a zero. Un rate
-- limit che si auto-cancella è peggio di nessun rate limit: sembra esserci.
create or replace function public.sonda_audit_clients_update()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_id      uuid;
  v_trovati int;
begin
  if v_uid is null then
    raise exception 'non autenticato';
  end if;

  if not private.can_clienti_scrittura() then
    raise exception 'permesso negato: la sonda scrive su clients';
  end if;

  if not public.rate_limit_incrementa('sonda-audit-clients:' || v_uid::text, 60, 20) then
    raise exception 'Troppe esecuzioni della sonda: riprova fra un po''';
  end if;

  begin
    insert into public.clients (name) values ('__sonda_audit__') returning id into v_id;
    update public.clients set notes = '__sonda__' where id = v_id;
    select count(*) into v_trovati from public.audit_log
      where action = 'cliente.modificato' and target_id = v_id::text;
    raise exception '__sonda_rollback__';
  exception when others then
    if sqlerrm <> '__sonda_rollback__' then raise; end if;
  end;
  return v_trovati;
end $$;

revoke execute on function public.sonda_audit_clients_update() from public, anon;
grant execute on function public.sonda_audit_clients_update() to authenticated;

comment on function public.sonda_audit_clients_update() is
  'Sonda per M-2 dell''audit del 5 settembre: inserisce e aggiorna un '
  'cliente di prova, conta le righe che trg_audit_clients_update ha scritto '
  'in audit_log, poi annulla tutto con un rollback interno. Ritorna 1 se il '
  'trigger funziona, 0 se ha smesso di scrivere. Nessuna riga sopravvive '
  'alla chiamata. Usata da scripts/verifica-audit-vivo/index.js. '
  'M-1 dell''audit del 10 settembre: eseguibile solo da chi passa '
  'private.can_clienti_scrittura() (admin/manager/agent attivi e non '
  'pending, cioè chi la RLS lascerebbe scrivere su clients comunque) e con '
  'un tetto di 20 esecuzioni all''ora per chiamante.';
