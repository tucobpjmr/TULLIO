-- Step Q.1: estende origin-tagging a comments e users.
-- Step L aveva applicato origin_client a tasks/notices/conversations/messages;
-- mancavano comments (creati via ADD_COMMENT) e users (updateProfile/setPresence/setActive).
-- Senza il tag, ogni commento o cambio presence del client che l'ha originato
-- rimbalzava come evento realtime → refetch inutile e flash di re-render.

alter table public.comments add column if not exists origin_client uuid;
alter table public.users    add column if not exists origin_client uuid;

-- REPLICA IDENTITY FULL: gli eventi DELETE realtime portano solo payload.old,
-- che di default contiene solo la PK. Con FULL contiene l'intera riga
-- (incluso origin_client) → il filtro echo funziona anche su DELETE.
-- Side effect: payload realtime un po' più grandi (irrilevante alle dimensioni attuali).
alter table public.comments replica identity full;
alter table public.users    replica identity full;
