-- Le default privileges di Supabase concedono EXECUTE ad anon sulle nuove
-- funzioni: revocato esplicitamente sulle RPC del modulo liste (difesa in
-- profondità; sono comunque SECURITY INVOKER e fallirebbero la RLS per anon).
REVOKE EXECUTE ON FUNCTION crea_lista(uuid, text, text)                               FROM anon;
REVOKE EXECUTE ON FUNCTION registra_movimento_lista(uuid, date, text, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION modifica_movimento_lista(uuid, date, text, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION annulla_movimento_lista(uuid)                              FROM anon;
REVOKE EXECUTE ON FUNCTION cambia_stato_lista(uuid, text)                             FROM anon;
REVOKE EXECUTE ON FUNCTION archivia_lista(uuid)                                       FROM anon;
