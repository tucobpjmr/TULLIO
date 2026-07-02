// src/lib/backupValidation.js
// Validazione del file di backup JSON prima del ripristino (RESTORE_BACKUP).
// Il backup è generato da exportBackup in AdminView.jsx con questa shape:
//   {
//     version, exportedAt, agencyName,
//     tasks: [ {id, title, category, priority, status, assignees, ...}, ... ],
//     team: [...],       // ignorato dal restore: local-only per design
//     categories: { [key]: { label, icon, color, bg } },
//     notices: [ {id, text, ...}, ... ],
//   }
// Un file corrotto, editato a mano o esportato da una versione diversa
// dell'app può avere righe con id/titolo mancanti, status/categoria non
// riconosciuti o campi con il tipo sbagliato: qui li individuiamo prima che
// arrivino al reducer/sync Supabase.
import { STATUSES } from "./taskConstants.js";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

// Valida l'array `tasks`. I task senza id/titolo validi sono irrecuperabili e
// vengono scartati; problemi minori (status non riconosciuto, assignees non
// è un array, categoria mancante) vengono corretti con un default sicuro e
// segnalati, così il ripristino non si blocca per righe "quasi buone".
export function validateTasks(tasks) {
  const validTasks = [];
  const errors = [];

  tasks.forEach((t, i) => {
    const row = i + 1;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      errors.push(`Task riga ${row}: non è un oggetto valido, escluso dal ripristino`);
      return;
    }
    if (!isNonEmptyString(t.id)) {
      errors.push(`Task riga ${row}: id mancante o non valido, escluso dal ripristino`);
      return;
    }
    if (!isNonEmptyString(t.title)) {
      errors.push(`Task riga ${row} (id ${t.id}): titolo mancante o non valido, escluso dal ripristino`);
      return;
    }

    let task = t;
    if (task.status != null && !STATUSES.includes(task.status)) {
      errors.push(`Task "${task.title}": stato "${task.status}" non riconosciuto, impostato "todo"`);
      task = { ...task, status: "todo" };
    }
    if (task.assignees != null && !Array.isArray(task.assignees)) {
      errors.push(`Task "${task.title}": campo assignees non valido, azzerato`);
      task = { ...task, assignees: [] };
    }
    if (task.category != null && !isNonEmptyString(task.category)) {
      errors.push(`Task "${task.title}": categoria non valida, rimossa`);
      task = { ...task, category: null };
    }
    validTasks.push(task);
  });

  return { validTasks, errors };
}

// Valida il dizionario `categories` ({ [key]: { label, ... } }).
export function validateCategories(categories) {
  if (categories == null) return { validCategories: undefined, errors: [] };
  const errors = [];
  if (typeof categories !== "object" || Array.isArray(categories)) {
    errors.push(`Il campo "categories" non è un oggetto valido: verrà ignorato (categorie correnti mantenute)`);
    return { validCategories: undefined, errors };
  }
  const validCategories = {};
  for (const [key, c] of Object.entries(categories)) {
    if (!isNonEmptyString(key) || !c || typeof c !== "object" || !isNonEmptyString(c.label)) {
      errors.push(`Categoria "${key}": struttura non valida (richiede almeno "label"), esclusa`);
      continue;
    }
    validCategories[key] = c;
  }
  return { validCategories, errors };
}

// Valida l'array `notices`.
export function validateNotices(notices) {
  if (notices == null) return { validNotices: undefined, errors: [] };
  const errors = [];
  if (!Array.isArray(notices)) {
    errors.push(`Il campo "notices" non è un array valido: verrà ignorato (avvisi correnti mantenuti)`);
    return { validNotices: undefined, errors };
  }
  const validNotices = [];
  notices.forEach((n, i) => {
    if (!n || typeof n !== "object" || !isNonEmptyString(n.id) || !isNonEmptyString(n.text)) {
      errors.push(`Avviso riga ${i + 1}: struttura non valida (richiede "id" e "text"), escluso`);
      return;
    }
    validNotices.push(n);
  });
  return { validNotices, errors };
}

// Validazione completa di un backup parsato dal JSON.
// Ritorna:
//  - fatalError: string|null — se non nullo, il ripristino va bloccato del tutto
//  - sanitized: payload pronto per RESTORE_BACKUP (solo se fatalError è null)
//  - warnings: string[] — problemi non bloccanti, già corretti in `sanitized`;
//    da mostrare all'utente prima di procedere col dispatch
export function validateBackup(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { fatalError: "File backup non valido: il contenuto non è un oggetto JSON", sanitized: null, warnings: [] };
  }
  if (!Array.isArray(data.tasks)) {
    return { fatalError: "File backup non valido: il campo \"tasks\" è mancante o non è un array", sanitized: null, warnings: [] };
  }

  const { validTasks, errors: taskErrors } = validateTasks(data.tasks);
  const { validCategories, errors: categoryErrors } = validateCategories(data.categories);
  const { validNotices, errors: noticeErrors } = validateNotices(data.notices);

  const warnings = [...taskErrors, ...categoryErrors, ...noticeErrors];

  // Se categories/notices erano assenti o strutturalmente non validi,
  // validCategories/validNotices restano undefined: RESTORE_BACKUP li
  // interpreta come "non presenti nel backup" e mantiene i dati correnti
  // (vedi reducer.js, case RESTORE_BACKUP: `categories ?? state.categories`).
  // Non ripieghiamo mai sul valore grezzo originale (es. una stringa invalida),
  // altrimenti finirebbe comunque nello stato applicativo.
  const sanitized = {
    ...data,
    tasks: validTasks,
    categories: validCategories,
    notices: validNotices,
  };

  return { fatalError: null, sanitized, warnings };
}
