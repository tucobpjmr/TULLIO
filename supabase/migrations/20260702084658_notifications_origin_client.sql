-- Origin-tagging per la tabella notifications (estende Step L).
-- Le altre tabelle live (tasks/notices/conversations/messages/comments/users)
-- portano già origin_client: i client la valorizzano ad ogni mutation e i
-- subscriber realtime (subscribeToTable) scartano gli eventi il cui
-- origin_client coincide col proprio → nessun refetch/flash sull'update
-- ottimistico. notifications era rimasta indietro: markRead/markAllRead non
-- taggavano, quindi ogni "segna letta" locale rimbalzava come evento realtime
-- non filtrato → refetch (limit 100) che poteva sovrascrivere l'update
-- ottimistico con lo stato pre-commit (breve flicker "torna non letta"),
-- amplificato da "segna tutte lette" con molte notifiche.
--
-- La colonna è nullable: le righe esistenti (e quelle inserite dai trigger DB
-- server-side, che non passano dal client) restano NULL e NON vengono
-- filtrate; i vecchi client che non mandano il tag continuano a funzionare.
alter table public.notifications add column if not exists origin_client uuid;

-- REPLICA IDENTITY FULL: coerente con 20260611_replica_identity_full.sql. Gli
-- eventi DELETE realtime portano solo payload.old, che di default contiene la
-- sola primary key; con FULL include l'intera riga (origin_client compreso),
-- così il filtro echo può agire anche sulle DELETE come sulle INSERT/UPDATE.
alter table public.notifications replica identity full;

-- La tabella è già in publication supabase_realtime (vedi
-- 20260609_notifications.sql): NON va ri-aggiunta.
