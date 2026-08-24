// src/lib/tasks/nuovoTask.js
// L'UNICA forma di un task appena creato.
//
// PERCHÉ ESISTE (A-2). I percorsi di creazione sono cinque — il FAB
// (`modals/QuickAddTask.jsx`) e le quattro tab del Bulk Task Creator (manuale,
// duplica, template pratica, import CSV/Excel) — e ognuno costruiva l'oggetto
// a mano. Le differenze fra i cinque non erano scelte: erano il residuo di
// cinque copie scritte in momenti diversi, e si leggevano così.
//
//   campo             QuickAdd   Manual   Template   Import   Duplicate
//   ────────────────────────────────────────────────────────────────────
//   recurrence        "none"     —        —          —        da src
//   praticaRef        ✓          ✓        ✓          MANCA    da src
//   estimatedHours    1          1        da tpl     parse    da src
//   description       da form    .trim()  ""         String() da src
//
// Le due colonne che contano. `praticaRef` non era mai stato aggiunto al
// percorso di import: un task importato da CSV non poteva portarsi dietro il
// numero di pratica, mentre tutti gli altri quattro sì — un buco funzionale
// invisibile, prodotto dalla duplicazione e non da una decisione. E
// `recurrence` sopravviveva in UN call site su cinque perché era l'unico a non
// essere mai stato riscritto: il campo non esiste sul database e non c'è UI che
// lo imposti (vedi A-3), quindi quel `"none"` era l'ultimo residuo di una
// feature mai completata.
//
// COSA NON FA, ed è deliberato. Non valida: `title` vuoto è un problema del
// form, che ha `validaCampi` e i suoi messaggi sotto il campo. Questa funzione
// NORMALIZZA — trim, stringa vuota → null, data → ISO — cioè applica le regole
// che il database si aspetta e che ogni call site riscriveva a modo suo
// (`form.client.trim() || null` in quattro varianti). Un task che esce da qui è
// nella forma che `toDbTask` (lib/mappers.js) sa tradurre, non necessariamente
// un task che ha senso creare.

/**
 * I default di un task nuovo. `Object.freeze` perché è una costante condivisa
 * e `nuovoTask` la spreada: una mutazione accidentale si propagherebbe a tutte
 * le creazioni successive della sessione.
 */
export const DEFAULT_TASK = Object.freeze({
  // `category` non ha un default sensato a questo livello — ogni percorso ne
  // sceglie uno suo (la prima disponibile al ruolo nel FAB, "admin" nell'import,
  // quella del template) — ma sta qui lo stesso, a `null`, perché la FORMA sia
  // chiusa: un task senza categoria deve avere la chiave con un valore nullo,
  // non la chiave assente. `toDbTask` traduce entrambi a NULL, ma solo il primo
  // è distinguibile da una dimenticanza.
  category: null,
  status: "todo",
  priority: "medium",
  assignees: [],
  client: null,
  praticaRef: null,
  contact: null,
  dueDate: null,
  estimatedHours: 1,
  description: "",
  comments: [],
});

// Un campo di testo opzionale: stringa vuota, spazi e `undefined` valgono tutti
// "non compilato", che sul database è NULL. Prima ogni call site scriveva
// `x.trim() || null` per conto suo — e ImportTab lo scriveva come
// `String(r[c] || "").trim() || null`, che è la stessa regola detta due volte.
const testoOpzionale = (v) => (String(v ?? "").trim() || null);

/**
 * Costruisce un task nuovo nella forma canonica.
 *
 * @param {object} [campi] i valori noti al chiamante; tutto il resto viene da
 *   DEFAULT_TASK. `id` si passa solo per riusare un uuid già generato (di norma
 *   non serve: lo genera questa funzione).
 * @returns {object} il task, normalizzato e pronto per `ADD_TASK` /
 *   `ADD_TASKS_BULK`.
 */
export function nuovoTask(campi = {}) {
  const t = { ...DEFAULT_TASK, ...campi };
  // ⛔ La forma è CHIUSA: il risultato si costruisce nominando i campi, non
  // spreadando `t`. Le chiavi che il chiamante passa e che non compaiono qui
  // sotto vengono SCARTATE, e le due volte in cui è servito lo dicono meglio di
  // qualsiasi principio:
  //
  //   • `recurrence` — QuickAddTask lo scriveva su ogni task creato dal FAB per
  //     un campo che il database non ha (A-3). Con uno spread aperto
  //     continuerebbe a passare di qui, e la factory legittimerebbe il residuo
  //     invece di eliminarlo.
  //   • `completedAt` / `deletedAt` — DuplicateTab partiva da `{ ...src }`,
  //     cioè da un task ESISTENTE, e si portava dietro i timestamp che
  //     descrivono la vita della riga sorgente e non il suo contenuto.
  //
  // In entrambi i casi lo spread aperto non avrebbe segnalato nulla. Chiudere
  // la forma rende la domanda "quali campi ha un task nuovo" verificabile in un
  // punto solo — ed è ciò che `src/test/nuovoTask.test.js` blinda.
  return {
    // L'uuid nasce QUI e non nel chiamante. Il registry di persistenza lo
    // conserva perché è già valido (vedi `toDbTask`: `isUuid(task.id) ? task.id
    // : newId()`), quindi l'id mostrato in UI è quello salvato sul database fin
    // dal primo render — ed è ciò che permette di caricare gli allegati subito
    // dopo la creazione, dato che il path nel bucket parte dal task_id.
    id: campi.id ?? crypto.randomUUID(),
    title: String(t.title ?? "").trim(),
    category: t.category ?? null,
    status: t.status,
    priority: t.priority,
    client: testoOpzionale(t.client),
    praticaRef: testoOpzionale(t.praticaRef),
    contact: testoOpzionale(t.contact),
    description: String(t.description ?? "").trim(),
    // `filter(Boolean)` perché tre dei cinque call site costruivano l'array come
    // `[valore]` con `valore` possibilmente null (`assignees: assignee ?
    // [assignee] : []`), e uno lo scriveva già così. Una regola sola: un
    // assegnatario assente non occupa un posto nell'array.
    assignees: (Array.isArray(t.assignees) ? t.assignees : []).filter(Boolean),
    // Idempotente per costruzione: accetta sia il valore di un
    // <input type="datetime-local"> sia un ISO già normalizzato — che è il caso
    // di DuplicateTab, il quale parte da un task esistente e non da un form.
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    // Un valore non numerico o non positivo vale 1, come facevano già tutti e
    // cinque: `parseFloat(r[c]) || 1` in ImportTab, la costante `1` altrove.
    estimatedHours: Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1,
    // I commenti non sono una colonna di `tasks` (arrivano da TaskThreads) e su
    // un task appena creato non ce ne sono: l'array vuoto è qui perché le viste
    // lo leggono senza guard.
    comments: [],
  };
}
