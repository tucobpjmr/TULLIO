// src/state/scritturaTaskConfrontata.js
// ─── M-1/M-2 dell'audit del 4 novembre · «confronta e scrivi» sui task ─────
//
// Prima una modifica a un task vinceva sempre, anche se un collega aveva
// cambiato lo stesso campo un istante prima: l'ultimo che salvava cancellava
// in silenzio il lavoro dell'altro. Il caso più concreto era «prendi in
// carico» dalla coda globale: due agenti premevano insieme, tutti e due
// vedevano «Hai preso in carico», e nel database restava solo l'ultimo.
//
// Ora UPDATE_TASK e MOVE_TASK portano con sé i valori che chi scrive VEDEVA
// (`meta.attesi`, fissati da `normalize` in state/persistence.js) e la UPDATE
// passa solo se il database li ha ancora (`Tasks.update` con `attesi`). Il
// confronto è nella WHERE della stessa UPDATE, quindi è atomico.
//
// ⚠️ QUALI CAMPI SI CONFRONTANO, e quali no. Si confrontano quelli brevi e
// senza conversioni con perdita fra database e app. Restano fuori:
//   - `description`: può essere lunga, e il valore atteso viaggia nell'URL
//     della richiesta; in più il database la tiene `null` dove l'app vede `''`;
//   - `estimatedHours`: il database ha `null` dove l'app vede `0`.
// Per quei due vince ancora l'ultimo che salva; la bozza del pannello (A-2)
// impedisce comunque di riscrivere un valore VECCHIO per sbaglio.
//
// ZERO RIGHE AGGIORNATE vuol dire una di tre cose, e si distinguono
// rileggendo la riga:
//   1. la riga ha GIÀ i valori nuovi → la scrittura era arrivata e se n'è
//      persa la risposta (è il caso della coda offline che rigioca): successo;
//   2. un campo confrontato non vale più quanto atteso → CONFLITTO: si mostra
//      all'utente la versione del collega invece di sovrascriverla;
//   3. niente è cambiato, eppure la UPDATE non è passata → la RLS l'ha
//      rifiutata, oppure la riga non c'è più.
import { Tasks as TasksAPI } from "../lib/api.js";
import { fromDbTask, toDbTaskPatch } from "../lib/mappers.js";
import { RIFIUTO_RLS } from "../lib/esitoScrittura.js";

export const CAMPI_CONFRONTATI = [
  "title", "category", "priority", "status", "assignees",
  "client", "praticaRef", "contact", "dueDate",
];

// I campi che `toDbTaskPatch` sa scrivere: gli altri del payload (commenti,
// `completedAt`) non arrivano al database e non vanno confrontati.
const CAMPI_SCRITTI = [...CAMPI_CONFRONTATI, "description", "estimatedHours", "deletedAt"];

export const CODICE_CONFLITTO = "CONFLITTO";

/**
 * I valori che `task` ha nei campi confrontati che `patch` tocca.
 * @param {Record<string, any>|null|undefined} task
 * @param {Record<string, any>} patch
 */
export function valoriAttesi(task, patch) {
  /** @type {Record<string, any>} */
  const attesi = {};
  for (const campo of CAMPI_CONFRONTATI) {
    if (campo in (patch || {})) attesi[campo] = task?.[campo] ?? null;
  }
  return attesi;
}

const stessaData = (a, b) => (a == null || b == null
  ? a == null && b == null
  : Date.parse(a) === Date.parse(b));
const vuotoANull = (v) => (v === "" || v === undefined ? null : v);

/**
 * Due valori dello stesso campo, in forma APP, sono lo stesso dato? Le date si
 * confrontano come istanti (il database le riscrive con un altro formato), gli
 * assegnatari come elenco, la stringa vuota vale quanto `null`.
 */
export function stessoValore(campo, a, b) {
  if (campo === "dueDate" || campo === "deletedAt") return stessaData(a, b);
  if (campo === "assignees") return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  if (campo === "estimatedHours") return Number(a ?? 0) === Number(b ?? 0);
  return vuotoANull(a) === vuotoANull(b);
}

function erroreConflitto(campi) {
  const message = campi.includes("assignees")
    ? "un collega ha appena preso in carico o riassegnato questo task. Ora vedi la sua versione."
    : "un collega ha appena modificato questo task. Ora vedi la sua versione.";
  return { code: CODICE_CONFLITTO, message, campi };
}

/**
 * Scrive `patch` sul task `id` solo se i campi confrontati valgono ancora
 * `attesi`. Ritorna un esito come quelli del data layer; su conflitto porta
 * anche `riga`, la versione attuale del task in forma app.
 *
 * @param {string} id
 * @param {Record<string, any>} patch   campi da scrivere, in forma app.
 * @param {Record<string, any>|undefined} attesi  valori visti da chi scrive
 *   (vedi `valoriAttesi`); assenti = scrittura senza confronto.
 */
export async function scriviTaskConfrontato(id, patch, attesi) {
  // Senza valori attesi si scrive come prima. È il caso delle voci che la coda
  // offline aveva salvato PRIMA di questa versione: in IndexedDB possono
  // esserci azioni senza `meta.attesi`, e vanno consegnate comunque.
  if (!attesi) return TasksAPI.update(id, toDbTaskPatch(patch));
  const res = await TasksAPI.update(id, toDbTaskPatch(patch), { attesi: toDbTaskPatch(attesi) });
  if (res?.error || !Array.isArray(res?.data) || res.data.length > 0) return res;

  const letta = await TasksAPI.leggi(id);
  if (letta?.error) return { error: letta.error };
  if (!letta?.data) return { error: RIFIUTO_RLS };
  const riga = /** @type {Record<string, any>} */ (fromDbTask(letta.data));

  const scritti = CAMPI_SCRITTI.filter((c) => c in patch);
  if (scritti.every((c) => stessoValore(c, riga[c], patch[c]))) {
    return { data: [letta.data], error: null };
  }
  const cambiati = Object.keys(attesi).filter((c) => !stessoValore(c, riga[c], attesi[c]));
  if (!cambiati.length) return { error: RIFIUTO_RLS };
  return { error: erroreConflitto(cambiati), riga };
}

/**
 * La compensazione per un conflitto: riallinea il task alla versione letta dal
 * server, invece di tornare alla copia locale che il collega ha già superato.
 * `null` se l'esito non è un conflitto.
 * @param {any} res
 */
export function compensazioneConflitto(res) {
  if (res?.error?.code !== CODICE_CONFLITTO || !res.riga) return null;
  // I commenti non viaggiano con la riga di `tasks`: senza toglierli, lo
  // spread di UPDATE_TASK svuoterebbe il thread a schermo.
  const { comments: _commenti, ...riga } = res.riga;
  return { type: "UPDATE_TASK", payload: riga };
}
