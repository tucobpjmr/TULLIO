-- Performance: auth_rls_initplan — sostituisce auth.uid() bare con
-- (select auth.uid()) nelle policy che lo rievalutano per ogni riga.
-- Risolve advisor WARN su notifications, clients.
-- Performance: multiple_permissive_policies — rimuove policy UPDATE duplicate:
-- "users update self presence" subsumed da users_update;
-- messages_update_own + messages_update_participant fuse in messages_update.
-- Performance: indici su FK non indicizzate (messages, task_files, users).

-- 1. notifications
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using  (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
for delete to authenticated
using (user_id = (select auth.uid()));

-- 2. clients
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
for update to authenticated
using (exists (
  select 1 from public.users
  where users.id = (select auth.uid())
    and users.role = any(array['admin','manager','agent'])
));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
for delete to authenticated
using (exists (
  select 1 from public.users
  where users.id = (select auth.uid())
    and users.role = any(array['admin','manager'])
));

-- 3. users: drop policy duplicata "users update self presence"
drop policy if exists "users update self presence" on public.users;

-- 4. messages: merge UPDATE in policy unica
drop policy if exists messages_update_own on public.messages;
drop policy if exists messages_update_participant on public.messages;
create policy messages_update on public.messages
for update to authenticated
using (
  (sender_id = (select auth.uid()) or (select is_admin()))
  or exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (select auth.uid()) = any(c.participants)
  )
)
with check (
  (sender_id = (select auth.uid()) or (select is_admin()))
  or exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (select auth.uid()) = any(c.participants)
  )
);

-- 5. Indici su FK non indicizzate
create index if not exists idx_messages_original_sender
  on public.messages(original_sender_id)
  where original_sender_id is not null;

create index if not exists idx_messages_pinned_by
  on public.messages(pinned_by)
  where pinned_by is not null;

create index if not exists idx_task_files_uploaded_by
  on public.task_files(uploaded_by)
  where uploaded_by is not null;

create index if not exists idx_users_invited_by
  on public.users(invited_by)
  where invited_by is not null;
