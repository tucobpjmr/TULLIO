// src/lib/api/task.js
// Task, i loro thread (commenti e cronologia) e la creazione commenti.
// Modulo privato del data layer: si importa da `src/lib/api.js`
// (VIETATI_MODULI_API_INTERNI).

import { getSupabase } from '../supabase';
import { fetchAllRows, WITH_COUNT } from '../pagination.js';
import { withOrigin } from '../realtime.js';
import { CONTA_RIGHE } from './comuni.js';

// ----------------- TASKS -----------------
// Select riusabile con i commenti e il nome dell'autore. La cronologia NON
// c'è (A-3): ha un solo lettore, il pannello del task aperto. I commenti sì:
// la ricerca avanzata cerca nel loro testo.
const TASK_SELECT_WITH_COMMENTS =
  '*, comments(id, user_id, text, created_at, users(name))';

// Letterale di array Postgres per un filtro `eq` (`{"a","b"}`, `{}` se vuoto).
// Ogni elemento fra virgolette, con `"` e `\` protetti: gli assegnatari sono
// uuid, ma un letterale costruito male confronterebbe con un altro valore.
export const letteraleArray = (valori) =>
  `{${valori.map((v) => `"${String(v).replace(/["\\]/g, '\\$&')}"`).join(',')}}`;

// Purge definitiva di uno o più task, con la pulizia dello storage che la FK
// non fa. Un'implementazione sola per il caso singolo e per il blocco.
// ⚠️ PRIMA I FILE, POI LA RIGA: `task_files_storage_delete` lascia cancellare
// un oggetto a chi l'ha caricato OPPURE se la riga di `tasks` esiste ancora.
// Senza la riga, i file dei colleghi restano nel bucket per sempre. Se la
// DELETE fallisce dopo, il task resta nel cestino senza allegati.
const purgeBlocco = async (supabase, lista) => {
  const filesRes = await supabase.from('task_files').select('file_url').in('task_id', lista);
  if (filesRes.error) {
    console.warn('TasksAPI.purge: lettura allegati task_files fallita, procedo comunque', filesRes.error);
  } else {
    const paths = (filesRes.data || []).map((f) => f.file_url).filter(Boolean);
    if (paths.length) {
      const { error: erroreStorage } = await supabase.storage.from('task-files').remove(paths);
      if (erroreStorage) {
        console.warn('TasksAPI.purge: rimozione allegati da storage fallita, procedo comunque', erroreStorage);
      }
    }
  }
  return supabase.from('tasks').delete().in('id', lista);
};

// B-2 del 6 novembre: gli id vanno nell'URL (`id=in.(…)`), e un cestino di
// qualche centinaio di task superava il limite. 100 uuid ≈ 4 KB. Ogni blocco
// è atomico, l'insieme no: `eliminati` dice al rollback di EMPTY_TRASH quali
// task sono già spariti.
export const PURGE_BLOCCO = 100;

const purgeTasks = async (ids, { blocco = PURGE_BLOCCO } = {}) => {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return { error: null, eliminati: [] };
  const supabase = await getSupabase();
  const eliminati = [];
  for (let i = 0; i < lista.length; i += blocco) {
    const parte = lista.slice(i, i + blocco);
    const { error } = await purgeBlocco(supabase, parte);
    if (error) return { error, eliminati };
    eliminati.push(...parte);
  }
  return { error: null, eliminati };
};

export const Tasks = {
  // Paginata (C-1): oltre `db-max-rows` PostgREST tronca senza errore.
  // `.order('id')` come seconda chiave: `due_date` non è unica.
  //
  // `completeDal` (A-3): la finestra dell'idratazione. È un PREDICATO, non un
  // limite di righe: ciò che resta fuori è definito e ricostruibile (vedi
  // state/StoricoTaskContext.jsx). `completed_at.is.null` è FAIL-OPEN: una
  // task non databile resta nella finestra invece di sparire.
  // La `or` non tocca il cestino: quello è `includeDeleted`.
  // ⚠️ `completeDal` è una stringa ISO SENZA millisecondi: dentro `or=(…)` il
  // punto è un separatore (vedi `inizioFinestra` in hooks/useAppHydration.js).
  list: async ({ includeDeleted = false, withComments = false, completeDal = /** @type {string|null} */ (null) } = {}) => {
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
  // Creazione in blocco: UNA insert multi-riga, atomica.
  createMany: async (tasks) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').insert(tasks.map(withOrigin)).select();
  },
  // ─── M-1/M-2 · «confronta e scrivi» ────────────────────────────────────────
  // Con `attesi` (colonna DB → valore visto da chi scrive) la UPDATE tocca la
  // riga solo se quelle colonne valgono ancora così: il confronto è nella WHERE
  // della stessa UPDATE, quindi atomico. Ritorna l'ARRAY delle righe aggiornate
  // (vuoto = nessuna); il perché lo decide state/scritturaTaskConfrontata.js.
  // Senza `attesi`, la scrittura di sempre.
  update: async (id, patch, { attesi } = /** @type {{ attesi?: object }} */ ({})) => {
    const supabase = await getSupabase();
    let q = supabase.from('tasks').update(withOrigin(patch)).eq('id', id);
    if (!attesi) return q.select().single();
    for (const [colonna, valore] of Object.entries(attesi)) {
      if (valore == null) q = q.is(colonna, null);
      else if (Array.isArray(valore)) q = q.eq(colonna, letteraleArray(valore));
      else q = q.eq(colonna, valore);
    }
    return q.select();
  },
  leggi: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').select('*').eq('id', id).maybeSingle();
  },
  softDelete: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').update(withOrigin({ deleted_at: new Date().toISOString() }), CONTA_RIGHE).eq('id', id);
  },
  restore: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('tasks').update(withOrigin({ deleted_at: null }), CONTA_RIGHE).eq('id', id);
  },
  // Purge definitiva: la FK ON DELETE CASCADE ripulisce task_files ma NON i
  // file nel bucket 'task-files'. Vedi purgeBlocco.
  hardDelete: async (id) => (id ? purgeBlocco(await getSupabase(), [id]) : { error: null }),
  // Purge in blocco per EMPTY_TRASH: tre round-trip per blocco, non per task.
  hardDeleteMany: (ids) => purgeTasks(ids),
};

// I thread appesi ai task: due letture, per due lettori.
//
// `comments()`: per CORPUS, paginata (C-1). La usa la ricerca avanzata.
// ⚠️ Il cap di PostgREST morde proprio qui (tabella piatta): con l'ordine
// ascendente cadrebbero le righe più RECENTI. `.order('id')` come spareggio:
// `created_at` non è unico.
//
// `historyForTask()`: la cronologia del SOLO task aperto (A-3), che non cresce
// con l'anzianità dell'installazione.
// ⛔ Niente `.limit()`: il pannello mostra la cronologia COMPLETA, e un tetto
// taglierebbe in silenzio «task creata», la riga che si cerca.
export const TaskThreads = {
  comments: async () => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .order('created_at').order('id'));
  },
  // A-1 · I commenti dei SOLI task toccati da un evento realtime (ramo
  // `soloThread`): prima ogni commento di chiunque faceva rileggere la tabella
  // intera su ogni client. `comments()` resta per il corpus.
  // ⛔ Niente `.limit()`: il tetto è l'insieme dei task. `fetchAllRows` protegge
  // dal cap.
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
// B-2 · Niente `Comments.remove`: nessuna UI cancella un commento, e un metodo
// di scrittura senza chiamanti è una scorciatoia fuori dal registry.
export const Comments = {
  create: async ({ task_id, user_id, text }) => {
    const supabase = await getSupabase();
    return supabase.from('comments').insert(withOrigin({ task_id, user_id, text })).select().single();
  },
};
