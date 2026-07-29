-- reset_completo non ha alcun punto di ingresso nella UI React (nessun bottone
-- la chiama): è raggiungibile solo da chi sa chiamare
-- /rest/v1/rpc/reset_completo direttamente. Il controllo di ruolo
-- (private.is_admin(), in 20260728190100) resta comunque nel corpo della
-- funzione come seconda barriera, ma qui si toglie la funzione dalla
-- superficie API pubblica: gli admin possono ancora eseguirla dal SQL Editor
-- o via service_role, dove serve davvero (pulizia dati di test, reset
-- ambiente) — solo non più da un client autenticato qualunque.
--
-- Idempotente: REVOKE su un privilegio già assente non è un errore.

REVOKE EXECUTE ON FUNCTION reset_completo(text) FROM authenticated;
