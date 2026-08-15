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

// ── Il verso opposto: produzione → repository ──────────────────────────────
// `confrontaMigrazioni` parte dai file locali e non può, per costruzione,
// accorgersi di una migrazione applicata al database e mai committata: è la
// direzione più insidiosa delle due, perché il sintomo non è un errore ma
// un'assenza — nulla si rompe finché qualcuno non ricostruisce lo schema dai
// file (staging, ripartenza da zero, disaster recovery), e a quel punto la
// logica manca senza che nessun controllo l'abbia mai nominata (M-4
// dell'audit del 14 agosto).
//
// Una prima verifica per solo nome aveva contato 15 voci applicate senza
// omonimo locale; un confronto più corretto — per versione O per nome, esatto
// come fa già `confrontaMigrazioni` — ne lascia solo 5 davvero senza
// corrispondenza: le altre 10 hanno versione applicata coincidente col
// prefisso del file locale (stesso caso già documentato per
// `confrontaMigrazioni`: lo strumento di applicazione genera il proprio nome,
// non la propria versione). Restano davvero senza aggancio solo le migrazioni
// applicate con nome E versione diversi da OGNI file locale.
export const ALIAS_APPLICATE = new Map([
  // Applicata come tre chiamate separate (poi consolidate in un solo file
  // locale per version control — vedi ECCEZIONI_STORICHE sopra e il commento
  // in testa a 20260614_mention_composite_names.sql).
  ['mention_find_users_function', '20260614_mention_composite_names'],
  ['mention_find_users_function_v2', '20260614_mention_composite_names'],
  ['mention_triggers_comments_and_messages', '20260614_mention_composite_names'],
  // Nome applicato con un secondo prefisso di data incorporato, diverso dallo
  // slug del file locale (che ha solo "notifications_origin_client").
  ['20260702_notifications_origin_client', '20260702084658_notifications_origin_client'],
  // Applicata in due tempi (base + fix dell'ancora sul mittente), consolidata
  // in un solo file: verificato il 14 agosto che il corpo in produzione
  // corrisponde a quello del file.
  ['messages_blocca_modifiche_altrui_fix_sender_anchor',
    '20260806150000_messages_solo_mittente_modifica_contenuto'],
]);

/**
 * Trova le migrazioni applicate al database senza corrispondenza — né per
 * versione né per nome né in alias — fra i file locali. NON fa fallire il
 * workflow: le rinominazioni legittime sono la maggioranza, e un rosso
 * permanente è il modo per cui un controllo smette di essere creduto (vedi
 * sonda.js). Serve solo a nominare ciò che oggi non compare in nessun
 * controllo.
 *
 * @param locali    Array di { file, prefix, slug } (da analizzaNomeFile).
 * @param applicate Array di { version, name } (da get_migrazioni_applicate).
 * @param alias     Map nome applicato → nome file locale corrispondente
 *                   (ALIAS_APPLICATE di default nel chiamante).
 * @returns Array delle voci applicate senza corrispondenza né in alias.
 */
export function trovaNonVersionate({ locali, applicate, alias = ALIAS_APPLICATE }) {
  const prefissiLocali = new Set(locali.filter(Boolean).map((l) => l.prefix));
  const slugLocali = new Set(locali.filter(Boolean).map((l) => l.slug));
  return applicate.filter((a) => (
    !prefissiLocali.has(a.version) && !slugLocali.has(a.name) && !alias.has(a.name)
  ));
}

// ── Riapplicazioni: un nome, più versioni ───────────────────────────────────
// M-2 dell'audit del 15 agosto. `confrontaMigrazioni` e `trovaNonVersionate`
// costruiscono entrambe un `Set` dei nomi applicati: un nome che compare due
// volte nel ledger (la stessa migrazione applicata due volte, con due
// `version` diverse) collassa nello stesso elemento del Set e diventa
// indistinguibile da un nome applicato una volta sola. Nessuno dei due
// controlli può quindi accorgersi che è successo — non è un difetto loro, è
// una domanda che non si sono mai posti.
//
// La riapplicazione in sé non è un allarme: succede quando si corregge una
// migrazione già viva (`messages_blocca_modifiche_altrui_fix_sender_anchor`,
// sopra, è lo stesso caso, solo con un file consolidato dopo). Il punto è che
// SE il corpo SQL applicato è cambiato fra le due volte, la produzione oggi
// esegue una versione del file che il repository non ha più — e nessun
// controllo esistente lo direbbe. Questa funzione nomina il fatto; verificare
// se il corpo corrisponde resta un controllo manuale (vedi il commento in
// testa a questo file per l'ultimo verificato).
//
// @param applicate Array di { version, name } (da get_migrazioni_applicate).
// @returns Array di [nome, versioni[]] per ogni nome applicato più di una
//          volta, versioni in ordine di apparizione.
export function trovaRiapplicate(applicate) {
  const versioniPerNome = new Map();
  for (const a of applicate) {
    versioniPerNome.set(a.name, [...(versioniPerNome.get(a.name) ?? []), a.version]);
  }
  return [...versioniPerNome].filter(([, versioni]) => versioni.length > 1);
}
