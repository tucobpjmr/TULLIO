// src/lib/useSupabaseData.js
// Data layer: carica dati da Supabase all'avvio, imposta Realtime, wrappa dispatch con sync asincrono.
import { useEffect, useRef, useCallback } from 'react';
import { Tasks, Notices, Users, Comments, subscribeToTable } from './api.js';

// ─── DB → App mappings ───────────────────────────────────────────────────────

export function dbToTask(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category || 'admin',
    priority: row.priority || 'medium',
    status: row.status || 'todo',
    assignees: row.assignees || [],
    client: row.client_id || null,
    dueDate: row.due_date || null,
    estimatedHours: Number(row.estimated_hours) || 0,
    description: row.description || '',
    comments: [],
    deletedAt: row.deleted_at || null,
    dossierId: row.dossier_id || null,
  };
}

export function taskToDB(task) {
  const row = {
    title: task.title,
    category: task.category || null,
    priority: task.priority || 'medium',
    status: task.status || 'todo',
    assignees: task.assignees || [],
    client_id: task.client || null,
    due_date: task.dueDate || null,
    estimated_hours: task.estimatedHours ? Number(task.estimatedHours) : null,
    description: task.description || null,
    deleted_at: task.deletedAt || null,
  };
  if (task.id) row.id = task.id;
  if (task.dossierId) row.dossier_id = task.dossierId;
  return row;
}

export function dbToUser(row) {
  const initials = (row.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    avatar: row.avatar || initials,
    color: row.color || '#6B7280',
    capacity: Number(row.capacity) || 8,
    active: row.active !== false,
    pending: row.pending === true,
    email: row.email || undefined,
    phone: row.phone || undefined,
    photoUrl: row.photo_url || undefined,
  };
}

export function dbToNotice(row) {
  return {
    id: row.id,
    text: row.text,
    color: row.color || '#FEF3C7',
    author: row.author_id || null,
    pinned: row.pinned || false,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

export function dbToComment(row) {
  return {
    id: row.id,
    user: row.users?.name || 'Utente',
    text: row.text,
    time: row.created_at,
  };
}

// ─── Hook caricamento dati + Realtime ────────────────────────────────────────

export function useSupabaseData(dispatch, authUserId) {
  const mounted = useRef(true);
  const authUserIdRef = useRef(authUserId);
  authUserIdRef.current = authUserId;

  useEffect(() => {
    mounted.current = true;

    async function loadAll() {
      dispatch({ type: '_LOADING_START' });
      try {
        const [{ data: tasks, error: te }, { data: notices, error: ne }, { data: team, error: ue }] = await Promise.all([
          Tasks.list({ includeDeleted: true }),
          Notices.list(),
          Users.listAll(),
        ]);

        if (!mounted.current) return;
        if (te || ne || ue) console.error('[VD] Load errors:', te, ne, ue);

        dispatch({
          type: '_INIT_ALL',
          payload: {
            tasks: (tasks || []).map(dbToTask),
            notices: (notices || []).map(dbToNotice),
            team: (team || []).map(dbToUser),
            currentUserId: authUserIdRef.current,
          },
        });
      } catch (err) {
        console.error('[VD] Load failed:', err);
        dispatch({ type: '_LOADING_DONE' });
      }
    }

    loadAll();
    return () => { mounted.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: tasks
  useEffect(() => {
    const unsub = subscribeToTable('tasks', ({ eventType, new: row, old }) => {
      if (!mounted.current) return;
      if (eventType === 'INSERT' || eventType === 'UPDATE') {
        dispatch({ type: '_RT_TASK_UPSERT', payload: dbToTask(row) });
      } else if (eventType === 'DELETE') {
        dispatch({ type: '_RT_TASK_DELETE', payload: old.id });
      }
    });
    return unsub;
  }, [dispatch]);

  // Realtime: notices (reload completo più semplice che merge granulare)
  useEffect(() => {
    const unsub = subscribeToTable('notices', async () => {
      const { data } = await Notices.list();
      if (data && mounted.current) {
        dispatch({ type: '_INIT_NOTICES', payload: data.map(dbToNotice) });
      }
    });
    return unsub;
  }, [dispatch]);
}

// ─── Async dispatch wrapper ───────────────────────────────────────────────────
// Aggiorna lo stato UI in modo ottimistico (dispatch immediato), poi sincronizza su Supabase.

export function useAsyncDispatch(dispatch, stateRef) {
  return useCallback(async (action) => {
    // Pre-leggi stato per azioni che richiedono il valore corrente prima dell'update
    const preState = stateRef.current;
    const currentUserId = preState.currentUserId;

    // Genera UUID per nuovi task/avvisi se non già UUID
    const isUUID = id => typeof id === 'string' && id.includes('-') && id.length > 20;

    let patchedAction = action;
    if (action.type === 'ADD_TASK' && !isUUID(action.payload?.id)) {
      patchedAction = { ...action, payload: { ...action.payload, id: crypto.randomUUID() } };
    }
    if (action.type === 'ADD_TASKS_BULK') {
      patchedAction = {
        ...action,
        payload: action.payload.map(t => isUUID(t.id) ? t : { ...t, id: crypto.randomUUID() }),
      };
    }
    if (action.type === 'ADD_NOTICE' && !isUUID(action.payload?.id)) {
      patchedAction = { ...action, payload: { ...action.payload, id: crypto.randomUUID() } };
    }

    // Update ottimistico UI
    dispatch(patchedAction);

    // Sync su Supabase
    try {
      switch (patchedAction.type) {
        case 'ADD_TASK':
          await Tasks.create({ ...taskToDB(patchedAction.payload), created_by: currentUserId });
          break;

        case 'ADD_TASKS_BULK':
          await Promise.all(
            patchedAction.payload.map(t => Tasks.create({ ...taskToDB(t), created_by: currentUserId }))
          );
          break;

        case 'UPDATE_TASK':
          await Tasks.update(patchedAction.payload.id, taskToDB(patchedAction.payload));
          break;

        case 'MOVE_TASK':
          await Tasks.update(patchedAction.payload.taskId, { status: patchedAction.payload.newStatus });
          break;

        case 'DELETE_TASK':
          await Tasks.softDelete(patchedAction.payload);
          break;

        case 'RESTORE_TASK':
          await Tasks.restore(patchedAction.payload);
          break;

        case 'PURGE_TASK':
          await Tasks.hardDelete(patchedAction.payload);
          break;

        case 'EMPTY_TRASH': {
          const trashedIds = preState.tasks.filter(t => t.deletedAt).map(t => t.id);
          await Promise.all(trashedIds.map(id => Tasks.hardDelete(id)));
          break;
        }

        case 'ADD_COMMENT':
          await Comments.create({
            task_id: patchedAction.payload.taskId,
            user_id: currentUserId,
            text: patchedAction.payload.comment.text,
          });
          break;

        case 'ADD_NOTICE':
          await Notices.create({
            id: patchedAction.payload.id,
            text: patchedAction.payload.text,
            color: patchedAction.payload.color,
            author_id: currentUserId,
            pinned: patchedAction.payload.pinned || false,
          });
          break;

        case 'UPDATE_NOTICE':
          await supabaseUpdateNotice(patchedAction.payload.id, {
            text: patchedAction.payload.text,
            color: patchedAction.payload.color,
          });
          break;

        case 'DELETE_NOTICE':
          await Notices.remove(patchedAction.payload);
          break;

        case 'TOGGLE_PIN_NOTICE': {
          const notice = preState.notices.find(n => n.id === patchedAction.payload);
          if (notice) await Notices.togglePin(patchedAction.payload, !notice.pinned);
          break;
        }

        case 'UPDATE_OWN_PROFILE':
          if (currentUserId) {
            await Users.updateProfile(currentUserId, {
              name: patchedAction.payload.name,
              avatar: patchedAction.payload.avatar,
              color: patchedAction.payload.color,
              email: patchedAction.payload.email,
              phone: patchedAction.payload.phone,
              photo_url: patchedAction.payload.photoUrl,
            });
          }
          break;

        case 'APPROVE_TEAM_MEMBER':
          await Users.setActive(patchedAction.payload, true);
          break;

        case 'TOGGLE_TEAM_MEMBER_ACTIVE': {
          const member = preState.team.find(m => m.id === patchedAction.payload);
          if (member) await Users.setActive(patchedAction.payload, !member.active);
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('[VD] Sync error:', patchedAction.type, err);
      dispatch({
        type: '_SHOW_TOAST',
        payload: { message: `Errore di sincronizzazione: ${err.message}`, type: 'error' },
      });
    }
  }, [dispatch]); // stateRef è stabile
}

// Helper interno per UPDATE_NOTICE (non esposto da api.js)
async function supabaseUpdateNotice(id, patch) {
  const { supabase } = await import('./supabase.js');
  return supabase.from('notices').update(patch).eq('id', id);
}
