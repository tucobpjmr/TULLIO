-- A-2, secondo passaggio — anche il TENTATIVO di escalation finisce a registro.
--
-- ─── COME È VENUTO FUORI ──────────────────────────────────────────────────
--
-- Verificando la migrazione 20260826214000 sullo staging: una UPDATE su una
-- colonna privilegiata non produceva alcuna voce. Non era un difetto del
-- trigger nuovo — era l'ordine dei trigger che funzionava esattamente come
-- deve:
--
--   trg_users_block_privileged_self_update  (BEFORE)  ← riporta i campi a OLD
--   trg_audit_users_privilegi               (AFTER)   ← non vede più differenze
--
-- Per un chiamante non admin il BEFORE riscrive `new.role := old.role` e gli
-- altri cinque campi, quindi quando l'AFTER guarda NEW e OLD sono identici e
-- non registra nulla. È il verdetto giusto — non è cambiato niente, non c'è
-- niente da registrare.
--
-- ─── PERCHÉ È COMUNQUE UN BUCO ────────────────────────────────────────────
--
-- Un utente non admin che manda una PATCH con `role: "admin"` a
-- /rest/v1/users è l'evento più significativo per la sicurezza che questo
-- sistema possa produrre. Oggi viene neutralizzato **in silenzio assoluto**:
-- la richiesta risponde 200, la riga resta corretta, e non ne resta traccia da
-- nessuna parte. Il test di integrazione che copre questo caso lo dice senza
-- accorgersene — `expect(error).toBeNull()`.
--
-- Un registro di controllo che non registra i tentativi di escalation registra
-- solo le operazioni legittime, cioè quelle che si potevano già ricostruire.
-- Era la lacuna vera del rilievo A-2, ed è emersa solo perché la verifica è
-- stata fatta ESEGUENDO la migrazione invece di rileggerla.
--
-- ─── LA CORREZIONE ────────────────────────────────────────────────────────
--
-- Il tentativo si può vedere solo da DENTRO il trigger di guardia, prima che
-- sovrascriva: dopo, l'informazione non esiste più in nessun punto del
-- sistema. La funzione viene quindi estesa, non affiancata.
--
-- ⚠️ Il COMPORTAMENTO DI GUARDIA È INVARIATO: gli stessi sei campi, riportati
-- agli stessi valori, nello stesso ordine, con lo stesso `return new`. L'unica
-- aggiunta è la lettura del delta prima di annullarlo. Chi rivede questa
-- migrazione confronti quelle sei righe con la versione precedente: se
-- cambiassero, sarebbe un difetto di sicurezza travestito da miglioramento del
-- logging.
--
-- `capacity` resta nell'elenco pur non essendo un'escalation (è un numero di
-- carico): il criterio è «campo che solo un admin può scrivere», che è
-- esattamente l'elenco che la guardia protegge. Tenerne due diversi
-- significherebbe doverli ricordare allineati.

create or replace function public.users_block_privileged_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tentato jsonb := '{}'::jsonb;
begin
  if private.is_admin() then
    return new;
  end if;

  -- Il delta si legge PRIMA di annullarlo: dopo le sei righe qui sotto
  -- l'informazione su cosa il chiamante avesse chiesto non esiste più.
  if new.role      is distinct from old.role      then v_tentato := v_tentato || jsonb_build_object('role',      jsonb_build_array(old.role, new.role)); end if;
  if new.active    is distinct from old.active    then v_tentato := v_tentato || jsonb_build_object('active',    jsonb_build_array(old.active, new.active)); end if;
  if new.pending   is distinct from old.pending   then v_tentato := v_tentato || jsonb_build_object('pending',   jsonb_build_array(old.pending, new.pending)); end if;
  if new.capacity  is distinct from old.capacity  then v_tentato := v_tentato || jsonb_build_object('capacity',  jsonb_build_array(old.capacity, new.capacity)); end if;
  if new.seniority is distinct from old.seniority then v_tentato := v_tentato || jsonb_build_object('seniority', jsonb_build_array(old.seniority, new.seniority)); end if;
  if new.id        is distinct from old.id        then v_tentato := v_tentato || jsonb_build_object('id',        jsonb_build_array(old.id, new.id)); end if;

  -- ─── guardia, invariata rispetto alla 20260613080033 ────────────────────
  new.role      := old.role;
  new.active    := old.active;
  new.pending   := old.pending;
  new.capacity  := old.capacity;
  new.seniority := old.seniority;
  new.id        := old.id;
  -- ────────────────────────────────────────────────────────────────────────

  if v_tentato <> '{}'::jsonb then
    -- L'attore è `auth.uid()` dentro private.audit, non `old.id`: chi tenta di
    -- scrivere una riga altrui e chi tenta di promuovere se stesso sono due
    -- fatti diversi, e il target li distingue.
    perform private.audit('user.modifica_privilegi_negata', 'user', old.id::text, v_tentato);
  end if;

  return new;
end $$;

comment on function public.users_block_privileged_self_update() is
  'Neutralizza la scrittura non-admin sui sei campi privilegiati di users '
  '(20260613080033) e ne registra il TENTATIVO in audit_log (A-2, secondo '
  'passaggio del 26 agosto). Il delta va letto prima di annullarlo: dopo, '
  'l''informazione non esiste più.';
