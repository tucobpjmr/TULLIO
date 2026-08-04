-- Chiude l'esposizione RPC pubblica di log_task_history(): è una funzione
-- trigger (richiede NEW/OLD/TG_OP), mai pensata per essere chiamata
-- direttamente via /rest/v1/rpc/log_task_history. Il trigger continua a
-- funzionare: la revoca di EXECUTE non blocca l'invocazione automatica via
-- trigger (stesso pattern di notify_queue_stale, 20260615).
revoke all on function public.log_task_history() from public, anon, authenticated;
