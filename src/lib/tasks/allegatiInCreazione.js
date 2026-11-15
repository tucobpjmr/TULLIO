// src/lib/tasks/allegatiInCreazione.js
// Gli allegati scelti MENTRE si crea una task: il filtro per dimensione prima
// del salvataggio e l'upload dopo che la riga esiste.
//
// M-2 dell'analisi del 14 novembre. Le due regole erano scritte due volte,
// dentro QuickAddTask e dentro la tab «Manuale» del BulkTaskCreator: una
// modifica (il limite, l'ordine, cosa fare se un upload fallisce) andava fatta
// in due punti, e i due avevano già testi diversi per lo stesso scarto.
import { TaskFiles } from "../api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, isWithinSizeLimit } from "../fileUtils.js";

/**
 * Separa i file entro il limite del bucket da quelli oltre. Gli scartati si
 * dicono subito: caricarli fallirebbe comunque, ma solo a task già creata.
 * @param {FileList|File[]|null|undefined} fileList
 * @returns {{ validi: File[], scartati: File[] }}
 */
export function separaPerDimensione(fileList) {
  const tutti = Array.from(fileList || []);
  return {
    validi: tutti.filter((f) => isWithinSizeLimit(f.size)),
    scartati: tutti.filter((f) => !isWithinSizeLimit(f.size)),
  };
}

/**
 * Il testo per i file scartati, o "" se non ce ne sono.
 * @param {File[]} scartati
 */
export function testoScartati(scartati) {
  if (!scartati.length) return "";
  const nomi = scartati.map((f) => `"${f.name}"`).join(", ");
  return `${nomi} super${scartati.length === 1 ? "a" : "ano"} il limite di ${formatFileSize(MAX_TASK_FILE_SIZE)} per file`;
}

/**
 * Carica gli allegati di task GIÀ create, in sequenza: l'upload passa dalla
 * RLS del bucket, che parte dal task_id, quindi la riga deve esistere.
 *
 * Al primo upload fallito si ferma e ritorna `{ avviso }`, non `{ error }`: le
 * task esistono, e per useSalvataggio un errore vorrebbe dire «riprova», cioè
 * creare un secondo batch identico. Con `avviso` il pannello resta aperto a
 * dire quale allegato manca, ma «Crea» non riparte.
 *
 * @param {Array<{ task: { id: string, title?: string }, files: File[] }>} preparati
 * @param {string|null} uploadedBy
 * @param {(file: File, task: { id: string, title?: string }) => string} testoFallito
 * @returns {Promise<{ avviso: string } | { error: null }>}
 */
export async function caricaAllegati(preparati, uploadedBy, testoFallito) {
  for (const { task, files } of preparati) {
    for (const f of files) {
      const { error } = await TaskFiles.upload(f, task.id, { uploadedBy });
      if (error) return { avviso: testoFallito(f, task) };
    }
  }
  return { error: null };
}
