-- aggiungi_beneficiario_lista: toglie il permesso di esecuzione ad `anon`.
--
-- Postgres concede EXECUTE a PUBLIC su ogni funzione nuova, e `anon` eredita
-- da PUBLIC. Tutte le RPC delle liste chiudono quindi con una REVOKE esplicita
-- (il pattern della migrazione 20260716114544, poi ripetuto ovunque), ma la
-- migrazione della cointestazione (20260802214946) l'ha scritta per
-- rimuovi_beneficiario_lista e non per aggiungi_beneficiario_lista: quella
-- funzione è rimasta invocabile con la sola chiave anon, cioè da chiunque —
-- la chiave anon è pubblica per definizione, sta nel bundle del frontend.
--
-- Portata reale: limitata. La funzione NON è SECURITY DEFINER, quindi gira con
-- i diritti di chi la chiama, e la sua prima istruzione è una SELECT su
-- liste_viaggio, dove la RLS è attiva e nessuna policy include `anon`: la
-- lista non viene trovata e la funzione esce in eccezione prima di scrivere
-- alcunché. La difesa in profondità ha retto. Resta comunque uno scarto dalla
-- convenzione del progetto, ed è l'unico strato che separa `anon` da una
-- INSERT su clients: si chiude.
--
-- Nota per la sonda scripts/verifica-rpc: interrogare in GET non esegue mai
-- una funzione VOLATILE (PostgREST risponde 405 prima di eseguirla), quindi il
-- controllo era innocuo anche prima di questa REVOKE. Il motivo per cui la
-- sonda usa GET e non POST è esattamente questo caso: con una POST avrebbe
-- eseguito per davvero l'unica RPC che anon poteva invocare.
--
-- Idempotente: REVOKE su un permesso già assente non è un errore.

BEGIN;

REVOKE ALL ON FUNCTION aggiungi_beneficiario_lista(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aggiungi_beneficiario_lista(uuid, uuid, text) TO authenticated;

COMMIT;
