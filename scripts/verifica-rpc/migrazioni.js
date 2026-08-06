// scripts/verifica-rpc/migrazioni.js
//
// Controlla che ogni migrazione presente in supabase/migrations/ risulti
// applicata al database (S-05: le migrazioni qui si applicano a mano, quindi
// lo scarto tra repository e produzione è una possibilità permanente, non un
// caso limite — vedi il commento in cima a index.js sullo stesso problema
// per le RPC).
//
// Questo controllo è più diretto di quello in index.js/sonda.js: invece di
// dedurre lo scarto da un sintomo (una RPC chiamata dal frontend che risulta
// assente — non si accorge di una migrazione che tocca solo RLS, grant o
// colonne), confronta direttamente i file locali con
// supabase_migrations.schema_migrations, letta tramite la funzione ponte
// public.get_migrazioni_applicate() (vedi la migrazione che la introduce per
// il perché è sicuro esporla ad anon).
//
// ── Perché il confronto è per versione O per nome, non solo per versione ──
// Il timestamp nel nome del file locale e la `version` registrata in
// supabase_migrations NON sono garantiti uguali: la migrazione viene
// applicata con lo strumento che genera la propria versione al momento
// dell'applicazione (tipicamente lo stesso giorno, ma non necessariamente
// alla stessa ora del timestamp scelto per il nome del file). Confrontare
// solo per versione produrrebbe falsi allarmi su migrazioni realmente
// applicate. Il nome (la parte dopo il primo underscore) è il secondo
// aggancio: quando i due non coincidono nemmeno lì, o il file non è mai
// stato applicato con questo strumento, o non è stato applicato affatto.
//
// ── Le tre eccezioni storiche ──────────────────────────────────────────────
// Un'analisi di questo controllo (2026-08-06) ha confrontato tutte le
// migrazioni locali con quelle applicate e trovato 5 file senza
// corrispondenza per versione né per nome. Due si sono rivelate scarto vero
// — 20260804230000_set_updated_at_search_path e 20260806090000_liste_realtime
// erano nel repository ma non erano mai state applicate — e sono state
// applicate in produzione contestualmente all'aggiunta di questo controllo.
// Le restanti tre sono applicate per davvero ma non tracciabili per
// costruzione, e ciascun file lo documenta già in testa:
//   - 20260610_notifications_extra e 20260610_step_j_fix: applicate a mano
//     via execute_sql prima che questo progetto avesse un flusso di
//     migrazioni tracciate — supabase_migrations.schema_migrations non le ha
//     mai viste.
//   - 20260614_mention_composite_names: applicata come tre chiamate separate
//     (poi consolidate in un solo file per version control, come dice il
//     commento in testa al file) — i tre nomi applicati non coincidono con
//     questo unico slug locale.
// Un allarme su questi tre file a ogni esecuzione sarebbe un falso positivo
// permanente: esattamente il modo per cui un controllo smette di essere
// creduto (vedi la stessa preoccupazione in sonda.js). Restano quindi elencati
// qui, uno per uno e col motivo, invece che silenziati con un confronto più
// permissivo (es. sottostringa) che rischierebbe di non accorgersi di un vero
// scarto futuro dal nome simile.
export const ECCEZIONI_STORICHE = new Set([
  '20260610_notifications_extra',
  '20260610_step_j_fix',
  '20260614_mention_composite_names',
]);

// Nome file (senza estensione) → { file, prefix, slug }. `null` se il nome
// non segue la convenzione "<qualcosa>_<slug>" (non dovrebbe capitare, ma un
// file così non è confrontabile: viene comunque riportato dal chiamante).
export function analizzaNomeFile(nomeFile) {
  const m = /^([^_]+)_(.+)$/.exec(nomeFile);
  return m ? { file: nomeFile, prefix: m[1], slug: m[2] } : null;
}

/**
 * Confronta le migrazioni locali con quelle applicate.
 *
 * @param locali    Array di { file, prefix, slug } (da analizzaNomeFile).
 * @param applicate Array di { version, name } (da get_migrazioni_applicate).
 * @param eccezioni Set di nomi file esentati dal confronto (ECCEZIONI_STORICHE
 *                  di default nel chiamante; parametrizzato qui per i test).
 * @returns { mancanti, applicate: n } — `mancanti` è l'array delle voci
 *          locali senza corrispondenza né in eccezione.
 */
export function confrontaMigrazioni({ locali, applicate, eccezioni = ECCEZIONI_STORICHE }) {
  const versioniApplicate = new Set(applicate.map((a) => a.version));
  const nomiApplicati = new Set(applicate.map((a) => a.name));
  const mancanti = locali.filter((l) => (
    l && !versioniApplicate.has(l.prefix) && !nomiApplicati.has(l.slug) && !eccezioni.has(l.file)
  ));
  return { mancanti, applicate: applicate.length };
}
