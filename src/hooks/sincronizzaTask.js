// src/hooks/sincronizzaTask.js
// La ripresa dei task per DIFFERENZA, non per rilettura intera.
//
// Al ritorno in primo piano (oltre SOGLIA_RIPRESA_MS) e dopo un buco di
// connessione, useAppHydration rileggeva tutti i task con i loro commenti.
// Qui si leggono invece:
//   · i task con `updated_at` dal cursore in poi (righe intere, con i thread);
//   · gli id dell'insieme intero, senza colonne: dicono chi è sparito;
//   · id e task di ogni commento: dicono quali thread rileggere.
// Lo stato nuovo lo compone il reducer (`SINCRONIZZA_TASK`), sullo stato del
// momento in cui l'azione arriva e con le stesse protezioni di `SET_TASKS`.
//
// ⚠️ Ogni dubbio ricade sulla lettura intera (`esito: "completo"`): una
// lettura fallita, un id che lo stato non conosce. Più lento, mai sbagliato.

import { Tasks as TasksAPI, TaskThreads as TaskThreadsAPI } from "../lib/api.js";
import { fromDbTask, fromDbComment } from "../lib/mappers.js";

// `updated_at` è il `now()` della transazione, non del commit: una scrittura
// che si chiude dopo un'altra può avere un istante più vecchio del cursore.
// Il margine rilegge qualche riga già nota, che è innocuo.
export const MARGINE_CURSORE_MS = 2 * 60_000;

/**
 * Il più recente `updated_at` fra le righe lette, o `precedente` se nessuna
 * è più recente. Il cursore viene dal SERVER: l'orologio del client non conta.
 * @param {Array<{ updated_at?: string }>|null|undefined} righe
 * @param {string|null} [precedente]
 * @returns {string|null}
 */
export const cursoreDa = (righe, precedente = null) => {
  let max = precedente ? Date.parse(precedente) : -Infinity;
  for (const r of righe || []) {
    const t = Date.parse(r?.updated_at ?? "");
    if (t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : precedente;
};

const dalCursore = (cursore) =>
  new Date(Date.parse(cursore) - MARGINE_CURSORE_MS).toISOString().replace(/\.\d{3}Z$/, "Z");

/** @param {Array<{ id: string }>|undefined} locali @param {Set<string>|undefined} remoti */
const stessiCommenti = (locali, remoti) => {
  const lista = locali || [];
  if (lista.length !== (remoti?.size ?? 0)) return false;
  return lista.every((c) => remoti?.has(c.id));
};

const COMPLETO = Object.freeze({ esito: "completo" });
const SUPERATO = Object.freeze({ esito: "superato" });

/**
 * @param {{
 *   cursore: string,
 *   filtro: { includeDeleted: boolean, completeDal: string|null },
 *   taskInStato: () => Array<{ id: string, comments?: Array<{ id: string }> }>,
 *   isCurrent: () => boolean,
 * }} opts
 * @returns {Promise<{ esito: "completo" } | { esito: "superato" } | {
 *   esito: "ok", cursore: string|null,
 *   payload: { ids: string[], righe: object[], commenti: Record<string, object[]> },
 * }>}
 */
export async function sincronizzaTask({ cursore, filtro, taskInStato, isCurrent }) {
  const [rIds, rCambiati, rCommenti] = await Promise.all([
    TasksAPI.ids(filtro),
    TasksAPI.modificatiDal(dalCursore(cursore), filtro),
    TaskThreadsAPI.idsCommenti(),
  ]);
  if (!isCurrent()) return SUPERATO;
  if (rIds?.error || rCambiati?.error || rCommenti?.error) return COMPLETO;

  const ids = (rIds.data || []).map((r) => r.id);
  const cambiati = new Map((rCambiati.data || []).map((r) => [r.id, r]));
  const attuali = new Map(taskInStato().map((t) => [t.id, t]));
  // Un task che lo stato non ha e che la differenza non porta (entrato nella
  // finestra senza essere modificato, o un cursore sbagliato): non si
  // ricostruisce a pezzi.
  if (ids.some((id) => !cambiati.has(id) && !attuali.has(id))) return COMPLETO;

  const sulServer = new Map();
  for (const c of rCommenti.data || []) {
    if (!sulServer.has(c.task_id)) sulServer.set(c.task_id, new Set());
    sulServer.get(c.task_id).add(c.id);
  }
  // I task cambiati portano già il thread intero: si confrontano gli altri.
  const daRileggere = ids.filter((id) =>
    !cambiati.has(id) && !stessiCommenti(attuali.get(id)?.comments, sulServer.get(id)));

  /** @type {Record<string, object[]>} */
  const commenti = {};
  if (daRileggere.length) {
    const r = await TaskThreadsAPI.commentsForTasks(daRileggere);
    if (!isCurrent()) return SUPERATO;
    if (r?.error) return COMPLETO;
    const perTask = /** @type {Record<string, object[]>} */ ({});
    for (const row of r.data || []) (perTask[row.task_id] ||= []).push(fromDbComment(row));
    // Un thread svuotato non torna dalla query: va scritto vuoto, non saltato.
    for (const id of daRileggere) commenti[id] = perTask[id] || [];
  }

  return {
    esito: "ok",
    cursore: cursoreDa(rCambiati.data, cursore),
    payload: { ids, righe: [...cambiati.values()].map(fromDbTask), commenti },
  };
}
