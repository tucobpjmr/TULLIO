-- B-1 dell'audit di architettura del 15 agosto
-- `notify_user_pending()` confronta il ruolo diversamente da ogni altro gate.
--
-- IL RILIEVO. Ogni altro punto del sistema che decide "chi è admin" usa il
-- confronto ESATTO: `private.is_admin()` (`role = 'admin'`), `permissions.js`
-- lato client, `adminPredicate.ts` nelle Edge Function. Qui, e solo qui, c'era
-- `lower(role) = 'admin'` — un residuo dell'epoca dei ruoli scritti a mano,
-- superata quando i due vocabolari sono stati unificati.
--
-- NON ERA SFRUTTABILE, e questa migrazione non chiude un buco: il vincolo
-- `users_role_check` ammette esattamente i quattro valori minuscoli
-- ('admin', 'manager', 'agent', 'driver'), quindi i due predicati selezionano
-- le stesse righe — verificato in produzione prima di applicare: 1 e 1.
--
-- ⚠️ PRECISAZIONE AL RILIEVO. Il documento dice «l'enum non ammette 'Admin'».
-- Non è un enum: è un CHECK constraint su una colonna `text`. L'effetto è lo
-- stesso, ma la differenza conta per chi legge — un CHECK si può sostituire
-- con una migrazione che allarga i valori ammessi, e nel giorno in cui
-- succedesse questo predicato divergerebbe dagli altri tre in silenzio.
--
-- PERCHÉ VALE LA PENA COMUNQUE. È l'ultimo punto in cui "chi è admin" ha una
-- SECONDA definizione, e il progetto ha già pagato quella divergenza almeno
-- due volte (vedi il commento in testa a src/lib/permissions.js). C'è anche
-- un'ironia utile: questa è proprio la funzione che avvisa gli admin
-- dell'arrivo di un utente in attesa di approvazione, cioè l'unico avviso che
-- mette un umano davanti al percorso di escalation chiuso da C-1.
--
-- Il resto del corpo è invariato: stesso filtro su active/pending, stessa
-- esclusione di sé stessi e di chi ha invitato, stesso payload.

create or replace function public.notify_user_pending()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid;
begin
  if NEW.pending is not true then
    return NEW;
  end if;

  for uid in
    select id from public.users
    where active = true
      and pending = false
      -- Confronto esatto, come private.is_admin(): era `lower(role) = 'admin'`.
      and role = 'admin'
      and id <> NEW.id
      and id is distinct from NEW.invited_by
  loop
    insert into public.notifications (user_id, type, payload)
    values (uid, 'user_pending', jsonb_build_object(
      'user_id',   NEW.id,
      'user_name', NEW.name,
      'user_role', NEW.role
    ));
  end loop;

  return NEW;
end $function$;
