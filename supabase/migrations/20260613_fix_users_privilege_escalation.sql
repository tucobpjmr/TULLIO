-- 2026-06-13 — FIX SICUREZZA CRITICO: privilege escalation su public.users
--
-- Problema:
--   La policy RLS `users_update` consente l'update della propria riga
--   (id = auth.uid()) SENZA restrizione di colonna, e il ruolo DB
--   `authenticated` ha grant UPDATE su tutte le colonne (incluso `role`).
--   Poiché `is_admin()` decide i privilegi leggendo `users.role`, qualunque
--   utente (anche `driver`) poteva auto-promuoversi ad admin con:
--       update public.users set role='admin' where id = auth.uid();
--   ottenendo accesso completo (delete task, CRUD utenti, lettura di tutte
--   le conversazioni/messaggi aziendali, ecc.).
--
-- Soluzione:
--   Trigger BEFORE UPDATE che, per gli utenti NON admin, ripristina i campi
--   privilegiati al loro valore precedente (OLD). L'aggiornamento del profilo
--   (name/avatar/color/phone/photo_url/status/last_seen_at) continua a
--   funzionare; gli admin (is_admin() = true) mantengono il controllo completo
--   su role/active/pending/capacity, così la gestione team resta intatta.
--
--   Si usa un trigger e non i column-grant perché admin e utenti normali
--   condividono lo stesso ruolo Postgres `authenticated`: i grant a livello di
--   colonna non possono distinguerli, un trigger con is_admin() sì.

-- ── 1. Funzione guardia ──────────────────────────────────────────────────────
create or replace function public.users_block_privileged_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Gli admin possono modificare qualsiasi campo (gestione team).
  if public.is_admin() then
    return new;
  end if;

  -- Utenti non-admin: i campi privilegiati non possono essere modificati.
  -- Si ripristinano silenziosamente ai valori precedenti, così l'update dei
  -- campi profilo legittimi va comunque a buon fine.
  new.role     := old.role;
  new.active   := old.active;
  new.pending  := old.pending;
  new.capacity := old.capacity;
  new.id       := old.id;

  return new;
end;
$$;

-- ── 2. Trigger ───────────────────────────────────────────────────────────────
-- Deve eseguire DOPO trg_users_updated_at non è rilevante (campi disgiunti);
-- l'ordine alfabetico del nome lo fa partire prima, va bene comunque.
drop trigger if exists trg_users_block_privileged_self_update on public.users;
create trigger trg_users_block_privileged_self_update
  before update on public.users
  for each row execute function public.users_block_privileged_self_update();

-- ── 3. Defense-in-depth: anon non deve mai aggiornare public.users ──────────
-- (Già bloccato dalla RLS perché auth.uid() è NULL, ma riduciamo la superficie.)
revoke update on public.users from anon;
