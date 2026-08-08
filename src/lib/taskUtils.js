// src/lib/taskUtils.js
// Utility pure (niente TEAM/CATEGORIES/CURRENT_USER) per task e date.

// Formatta un TIMESTAMP ISO per la UI dei task ("08 ago 2026"), con "—" per il
// valore assente perché nei task la scadenza è opzionale e va detta.
//
// NON è un doppione di `fmtDate` in lib/listeApi.js, che formatta "28/07/2026":
// quello riceve una colonna `date` ("YYYY-MM-DD", non un timestamp) e la
// spezza a mano proprio per NON passare da `new Date`, che la
// interpreterebbe come UTC-mezzanotte e in Italia renderebbe il giorno
// precedente. Input diversi e formati di uscita diversi — il modulo Liste ha
// di proposito una sua identità visiva. Chi ne tocca uno non sta divergendo
// dall'altro.
export const formatDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatTime = iso => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export const getDayKey = iso => iso ? new Date(iso).toDateString() : null;

// Costruiscono inizio/fine giornata in ora LOCALE a partire da una stringa
// "YYYY-MM-DD" (es. il valore di un <input type="date">, usato dal filtro
// "Scadenza" della ricerca avanzata). new Date("YYYY-MM-DD") interpreta la
// stringa come UTC-mezzanotte (01:00/02:00 locale in Italia): senza
// normalizzare con setHours in locale, l'inizio giornata restava ancorato a
// quell'orario e scartava erroneamente i task con dueDate di primo mattino
// nello stesso giorno locale.
export const startOfLocalDay = dateStr => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
};
export const endOfLocalDay = dateStr => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const isOverdue = task =>
  task.status !== "done" && task.dueDate && new Date(task.dueDate) < new Date();

const HOURS_24 = 24 * 60 * 60 * 1000;

export const isUrgent = task => {
  if (!task.dueDate || task.status === "done") return false;
  const diff = new Date(task.dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= HOURS_24;
};

export const isActiveTask = t => !t.deletedAt;
export const getActiveTasks = tasks => tasks.filter(isActiveTask);
export const getTrashedTasks = tasks => tasks.filter(t => t.deletedAt);
// Archivio: task completate ("done") e non cestinate. Il sistema convoglia qui
// le task chiuse, che non compaiono più nelle code attive della Dashboard.
export const isArchivedTask = t => !t.deletedAt && t.status === "done";
export const getArchivedTasks = tasks => tasks.filter(isArchivedTask);

// Task appartiene all'utente userId?
export const isMyTask = (task, userId) => task.assignees?.includes(userId);

// Task non ha assegnatari → è nella coda globale
export const isInGlobalQueue = task => !task.assignees || task.assignees.length === 0;

// Stringa "Contatti" derivata da un'anagrafica cliente (telefono + email),
// usata per pre-compilare il campo omonimo del task quando si sceglie un
// cliente dall'autocomplete: prima la selezione riempiva solo il nome,
// lasciando i contatti già presenti in anagrafica da ricopiare a mano.
export const clientContact = (client) =>
  [client?.phone, client?.email].filter(Boolean).join(" · ");
