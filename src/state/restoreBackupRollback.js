// src/state/restoreBackupRollback.js
// Calcolo della compensazione di RESTORE_BACKUP (M-1 dell'audit del 14 agosto,
// secondo passaggio): funzione pura, non una transizione di stato in sé — è
// il "come si applica" un payload di rollback già costruito da
// state/persistence.js (RESTORE_BACKUP.rollback). Estratta dal case del
// reducer per la stessa ragione di state/activityLog.js
// (LOGGED_ACTIONS/buildLogEntry): tenerla inline avrebbe portato
// state/reducer.js sopra il tetto dichiarato in eslint.config.js (550 righe
// effettive, una deroga che non si alza).
//
// `daRipristinare` riporta al valore pre-dispatch le righe che ESISTEVANO già
// e la cui scrittura è fallita; `daRimuovere` toglie quelle che il restore
// aveva CREATO in ottimistico e che sul server non sono mai arrivate (record
// fantasma). Le righe non elencate in nessuno dei due — la stragrande
// maggioranza di un fallimento parziale — restano quelle che RESTORE_BACKUP
// ha già fuso nello state, perché sul server ci sono arrivate davvero.
export function applyRestoreBackupRollback(state, payload) {
  const { daRipristinare = {}, daRimuovere = {} } = payload || {};
  const idsRimTask = new Set(daRimuovere.tasks || []);
  const idsRimNotice = new Set(daRimuovere.notices || []);
  const chiaviRimCat = new Set(daRimuovere.categories || []);

  const ripristTaskById = new Map((daRipristinare.tasks || []).map(t => [t.id, t]));
  const tasks = (state.tasks || [])
    .filter(t => !idsRimTask.has(t.id))
    .map(t => ripristTaskById.get(t.id) ?? t);

  const ripristNoticeById = new Map((daRipristinare.notices || []).map(n => [n.id, n]));
  const notices = (state.notices || [])
    .filter(n => !idsRimNotice.has(n.id))
    .map(n => ripristNoticeById.get(n.id) ?? n);

  const categories = { ...state.categories, ...(daRipristinare.categories || {}) };
  for (const key of chiaviRimCat) delete categories[key];

  return { ...state, tasks, notices, categories };
}
