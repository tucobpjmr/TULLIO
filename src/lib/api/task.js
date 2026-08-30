// src/lib/api/task.js
// Task, i loro thread (commenti e cronologia) e la creazione commenti.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { getSupabase } from '../supabase';
import { fetchAllRows, WITH_COUNT } from '../pagination.js';
import { withOrigin } from '../realtime.js';
import { CONTA_RIGHE } from './comuni.js';

// ----------------- TASKS -----------------
// Select riusabile che porta dietro i commenti, col nome dell'autore via join.
//
// ─── LA CRONOLOGIA NON C'È PIÙ (A-3, passo 3) ──────────────────────────────
// Fino al 17 agosto questa select portava anche `task_history(...)`: la
// cronologia INTERA di OGNI task, a ogni idratazione. È la tabella che cresce e
// non si pota mai — una riga per ogni cambio di stato, priorità, scadenza,
// assegnatario o cestinamento — e nessuna vista d'elenco la guardava: l'unico
// lettore è il pannello CRONOLOGIA dello slide-over, cioè UN task per volta,
// quello che si sta guardando.
//
// I commenti restano, e la differenza fra i due non è la dimensione ma il
// numero di lettori: `AdvancedSearchPanel` cerca DENTRO il testo dei commenti
// (`matchTermini(… (t.comments || []).map(c => c.text))`), quindi il corpus dei
// commenti serve davvero per intero a una funzione che l'utente usa. Nessuno
// cerca dentro la cronologia. Il nome della costante, che diceva già
// «WITH_COMMENTS», torna a essere esatto.
const TASK_SELECT_WITH_COMMENTS =
  '*, comments(id, user_id, text, created_at, users(name))';

// Purge definitiva di uno o più task, con la pulizia dello storage che la FK
// non fa. Un'unica implementazione per il caso singolo e per quello in blocco:
// le due varianti differivano solo nel filtro (`eq` vs `in`), e tenerne due
// significava che la seconda poteva dimenticarsi i file orfani.
const purgeTasks = async (ids) => {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return { error: null };
  const supabase = await getSupabase();
  const filesRes = await supabase.from('task_files').select('file_url').in('task_id', lista);
  if (filesRes.error) {
    console.warn('TasksAPI.purge: lettura allegati task_files fallita, procedo comunque', filesRes.error);
  } else {
    const paths = (filesRes.data || []).map((f) => f.file_url).filter(Boolean);
    if (paths.length) {
      const { error: removeError } = await supabase.storage.from('task-files').remove(paths);
      if (removeError) {
        console.warn('TasksAPI.purge: rimozione allegati da storage fallita, procedo comunque', removeError);
      }
    }
  }
  return supabase.from('tasks').delete().in('id', lista);
};

export const Tasks = {
  // Paginata (C-1). Era la terza lettura "che deve arrivare intera" rimasta su
  // una select nuda, dopo `clients` (ST-3) e le due tabelle figlie qui sotto.
  // 276 righe oggi, cestino incluso: sotto il cap `db-max-rows`, ma è la
  // tabella che alimenta OGNI vista dell'app — quando lo supererà, le task in
  // fondo all'ordinamento smetteranno semplicemente di esistere per il client,
  // senza che `error` dica nulla.
  //
  // `count: 'exact'` era il motivo per cui questa correzione era rimasta
  // indietro: il commento in fondo a questo file la dichiarava «il prossimo
  // candidato» ma con «un costo per richiesta che va misurato prima», perché a
  // differenza di `clients` la select porta con sé commenti e cronologia
  // annidati. Misurato il 12 agosto 2026 sul database di produzione: il count
  // esatto è un aggregato sulla sola tabella di PRIMO livello (le risorse
  // annidate non entrano nel conteggio), quindi `select count(*) from tasks` —
  // 11 ms comprensivi di pianificazione, contro un `statement_timeout` di 8 s.
  //
  // `.order('id')` come seconda chiave: `due_date` è nullable e non è unica,
  // e senza un ordinamento deterministico due pagine consecutive possono
  // ripetere o saltare una riga (stessa ragione del `.order('name').order('id')`
  // su Clients.list).
  //
  // ─── `completeDal`: LA FINESTRA DELL'IDRATAZIONE (A-3) ────────────────────
  // Paginare bene una lettura significa scaricarla INTERA senza troncamenti
  // silenziosi, ed è ciò che C-1 ha reso vero. Ma «intera, per sempre» è a sua
  // volta una scelta di scalabilità: la quota di `tasks` che serve alle viste
  // d'ingresso (Dashboard e Calendario filtrano con `getActiveTasks`) cala di
  // giorno in giorno, mentre il payload cresce con l'anzianità
  // dell'installazione. `completeDal` è la data oltre la quale una task
  // COMPLETATA non serve più all'avvio.
  //
  // È un PREDICATO e non un limite di righe, e la differenza è il punto: un
  // `.limit(n)` lascia fuori «quello che è avanzato dopo le prime n» — cioè un
  // insieme che nessuno sa nominare — mentre qui ciò che resta fuori è
  // definito ed è ricostruibile da chi lo vuole (vedi
  // `state/StoricoTaskContext.jsx`: Archivio, Cestino, statistiche, export e
  // ricerca avanzata chiedono il corpus intero al mount).
  //
  // `completed_at.is.null` nella `or` è deliberatamente FAIL-OPEN: per
  // l'invariante della migration `20260630144254_tasks_completed_at` (trigger
  // + backfill) una riga `status = 'done'` ha sempre una data, quindi quel
  // ramo oggi non seleziona nulla; se un giorno la violasse, la riga resta
  // NELLA finestra invece di sparire da ogni percorso senza che nulla lo dica.
  // Una task non databile che si vede è un difetto visibile; una che non si
  // vede è la stessa classe di guasto del troncamento silenzioso.
  //
  // La `or` NON tocca il cestino: quello è `includeDeleted`, che resta la sola
  // chiave per portarsi dietro le righe soft-deleted.
  //
  // ⚠️ `completeDal` deve essere una stringa ISO SENZA millisecondi. Dentro
  // `or=(…)` il punto separa colonna, operatore e valore, quindi un
  // `…T08:00:00.000Z` mette il separatore dentro il valore e la query dipende
  // da come il parser risolve l'ambiguità. Il chiamante la produce già così
  // (`inizioFinestra` in hooks/useAppHydration.js, dove sta la spiegazione
  // lunga); qui resta scritto perché è un vincolo di QUESTA firma, e il
  // prossimo chiamante non avrà letto quel file.
  list: async ({ includeDeleted = false, withComments = false, completeDal = null } = {}) => {
    const supabase = await getSupabase();
    const select = withComments ? TASK_SELECT_WITH_COMMENTS : '*';
    return fetchAllRows(() => {
      let q = supabase.from('tasks').select(select, WITH_COUNT)
        .order('due_date', { ascending: true }).order('id');
      if (!includeDeleted) q = q.is('deleted_at', null);
      if (completeDal) q = q.or(`status.neq.done,completed_at.is.null,completed_at.gte.${completeDal}`);
      return q;
    });
  },
  create: async (task) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').insert(withOrigin(task)).select().single();
  },
  // Creazione in blocco (BulkTaskCreator): UNA insert multi-riga invece di N
  // chiamate in parallelo. È atomica — o entrano tutte o nessuna — mentre con
  // Promise.all una riga rifiutata (vincolo, RLS, rete) lasciava passare le
  // altre e l'utente si ritrovava metà batch sul server ma tutte le task in
  // lista, scoprendo la differenza solo al reload successivo.
  createMany: async (tasks) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').insert(tasks.map(withOrigin)).select();
  },
  update: async (id, patch) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').update(withOrigin(patch)).eq('id', id).select().single();
  },
  softDelete: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').update(withOrigin({ deleted_at: new Date().toISOString() }), CONTA_RIGHE).eq('id', id);
  },
  restore: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').update(withOrigin({ deleted_at: null }), CONTA_RIGHE).eq('id', id);
  },
  // Purge definitiva: la FK task_files.task_id ON DELETE CASCADE ripulisce le
  // righe metadati ma NON tocca i file fisici nel bucket privato 'task-files'
  // (path <task_id>/<uuid>-<nomefile>, vedi TaskFiles.upload). Senza questo step
  // ogni purge di un task con allegati lascia file orfani nello storage per
  // sempre — vedi purgeTasks qui sopra.
  hardDelete: (id) => purgeTasks([id]),
  // Purge in BLOCCO (M-4 dell'audit del 12 agosto). EMPTY_TRASH chiamava
  // `Promise.all(ids.map(hardDelete))`: tre round-trip PER TASK (select
  // allegati, remove storage, delete riga) tutti in volo insieme — su un
  // cestino da 60 task sono 180 richieste concorrenti. E la cancellazione non
  // era atomica: un fallimento a metà lasciava il database con una parte dei
  // task già eliminata e la UI con il cestino svuotato per intero, senza alcun
  // rollback che rimettesse a posto la differenza. Qui i round-trip sono tre in
  // TOTALE e la cancellazione è una sola istruzione `delete … in (…)`: o cadono
  // tutte o nessuna, che è la premessa perché il rollback dichiarato in
  // state/persistence.js sia corretto.
  hardDeleteMany: (ids) => purgeTasks(ids),
};

// Le letture dei thread appesi ai task. Sono DUE, e da A-3 (passo 3) hanno
// forme diverse perché hanno lettori diversi.
//
// ─── `comments()`: PER CORPUS, e paginata (C-1) ────────────────────────────
// Serve al reload selettivo di useAppHydration — un commento aggiunto non
// richiede di riscaricare i task con tutti i loro campi, solo il thread
// cambiato — e la select rispecchia il ramo annidato di
// TASK_SELECT_WITH_COMMENTS, così `fromDbComment` riceve la stessa forma di
// riga in entrambi i percorsi. Resta per corpus perché il corpus lo usa
// qualcuno: `AdvancedSearchPanel` cerca dentro il testo dei commenti.
//
// La paginazione con `fetchAllRows` è C-1 e non si tocca: PostgREST tronca a
// `db-max-rows` rispondendo 200 senza errore, e il difetto che ne seguirebbe
// non è «mancano dei dati» — è che il reload completo passa dalle risorse
// ANNIDATE, che il cap del primo livello non tocca, mentre è il reload
// SELETTIVO (`soloThread` in useAppHydration, quello che scatta quando un
// collega commenta) a rileggere questa tabella PIATTA, dove il cap morde. Con
// l'ordine ascendente a cadere sarebbero le righe più RECENTI, che
// `SET_TASK_THREADS` traduce in `[]`: il thread sparisce quando qualcun altro
// commenta e torna premendo F5.
//
// `.order('id')` come seconda chiave: `created_at` NON è unico, e senza una
// chiave di spareggio due pagine consecutive possono ripetere o saltare una
// riga — il caso che si manifesta solo oltre il cap, cioè dove nessuno guarda.
//
// ─── `historyForTask()`: PER TASK APERTO (A-3, passo 3) ────────────────────
// La cronologia era l'altra metà di questa coppia, letta per corpus con la
// stessa forma. Era anche l'unica tabella dell'app che CRESCE E NON SI POTA
// MAI — una riga per ogni cambio di stato, priorità, scadenza, assegnatario o
// cestinamento — misurata a 660 righe il 17 agosto 2026, ~14,8 al giorno, e
// con la proiezione a dodici mesi (~5.500 righe) il percorso `soloThread`
// sarebbe arrivato a SEI round-trip in fila, seriali per costruzione dentro
// `fetchAllRows`, su un percorso che scatta a ogni commento scritto da
// chiunque.
//
// Il lettore però è UNO SOLO e guarda UN task per volta: il pannello
// CRONOLOGIA dello slide-over (components/tasks/TaskHistoryPanel.jsx). Da qui
// il filtro `.eq('task_id', …)`: la lettura passa da «tutta la cronologia di
// tutti i task, a ogni evento» a «la cronologia di questo task, quando lo si
// apre», ed è una quantità che non cresce con l'anzianità
// dell'installazione ma con la vita del singolo task.
//
// ⛔ NON ha un `.limit(50)` come `ListeAPI.history`, ed è una divergenza
// deliberata dal precedente. Un tetto dichiarato è la risposta giusta quando
// si vuole davvero mostrare «gli ultimi n» (là è un pannello di attività
// recenti); qui il pannello mostra la cronologia COMPLETA di un task, e un
// `limit` taglierebbe in silenzio le righe più vecchie — a partire da «task
// creata», che è quella che si va a cercare. `fetchAllRows` su una singola
// riga padre costa lo stesso round-trip e non ha un limite da sbagliare.
export const TaskThreads = {
  comments: async () => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .order('created_at').order('id'));
  },
  // A-1 dell'audit del 22 agosto. I commenti dei SOLI task toccati da un
  // evento realtime.
  //
  // `comments()` qui sopra resta, ed è ancora la lettura giusta per il CORPUS
  // (AdvancedSearchPanel cerca dentro il testo dei commenti, che è il lettore
  // per cui quel metodo esiste). Ma era anche la lettura del percorso
  // `soloThread` di useAppHydration, cioè quello che scatta a ogni commento
  // scritto da CHIUNQUE, su OGNI client connesso: la tabella intera, paginata a
  // blocchi di 1000, per applicare UNA riga che l'evento realtime già portava
  // con sé.
  //
  // È la stessa forma di difetto che A-3 (passo 3) ha chiuso per
  // `task_history` — e `comments` ha la stessa proprietà che lo rendeva grave:
  // cresce e non si pota mai, perché nessuna UI cancella un commento (vedi la
  // nota su `Comments.remove` più sotto). La differenza con la cronologia è il
  // numero di LETTORI, non la dimensione: la cronologia ne aveva uno solo e ha
  // potuto scendere per-task del tutto, i commenti ne hanno due — il thread
  // dello slide-over e la ricerca avanzata — quindi qui il corpus resta
  // disponibile e a scendere è il solo percorso frequente.
  //
  // ⛔ Nessun `.limit()`: il tetto è già l'insieme dei task nominati dal
  // chiamante. `fetchAllRows` continua a proteggere dal cap di PostgREST nel
  // caso — improbabile ma non impossibile — di un task con più di 1000
  // commenti, e dove il cap morde è proprio qui: sul reload SELETTIVO, dove le
  // righe che cadono sono le più RECENTI (vedi il preambolo di `comments()`).
  commentsForTasks: async (taskIds) => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .in('task_id', taskIds)
      .order('created_at').order('id'));
  },
  historyForTask: async (taskId) => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase.from('task_history')
      .select('id, task_id, actor_id, action, old_value, new_value, created_at, users(name)', WITH_COUNT)
      .eq('task_id', taskId)
      .order('created_at').order('id'));
  },
};

// ----------------- COMMENTS -----------------
// B-2 dell'audit del 14 agosto (terzo passaggio): `Comments.remove` è stato
// tolto perché non aveva chiamanti — nessuna UI cancella un commento, nessuna
// entry del registry la dichiara, nessun documento la cita come preparazione
// dichiarata (la verifica che mancò al primo tentativo di B-2 nel secondo
// passaggio, quando `Messages.listForConversation` fu rimossa per errore
// leggendo i soli usi nel repository). Un metodo di scrittura senza chiamanti
// nel data layer non è inerte: è una scorciatoia già pronta per chi domani
// vorrà cancellare un commento senza passare dal registry, cioè senza guard,
// senza rollback e senza tag origin.
export const Comments = {
  create: async ({ task_id, user_id, text }) => {
    const supabase = await getSupabase();
    return supabase.from('comments').insert(withOrigin({ task_id, user_id, text })).select().single();
  },
};
