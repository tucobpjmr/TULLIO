// src/state/activityLog.js
// Le voci del log attività: quali azioni finiscono nel registro e come si
// leggono in italiano.
//
// PERCHÉ NON STA PIÙ IN reducer.js. Il tetto di 550 righe che eslint.config.js
// concede al reducer non è un margine da consumare: è una deroga alla FORMA di
// quel file — uno switch che descrive per intero la macchina a stati, e che si
// legge solo se lo si vede tutto insieme. Aggiungendo la compensazione (M-1) e
// ROLLBACK_EMPTY_TRASH (M-4) il file arrivava al tetto, e la domanda che il
// commento in eslint.config.js pone in quel punto è quale fetta meriti un file
// suo — non di quanto alzare il numero.
//
// Questa è la risposta più ovvia: `buildLogEntry` non è una transizione di
// stato. Non guarda `action` per decidere cosa diventa lo state, la guarda per
// produrre una FRASE; il suo unico legame col reducer è il wrapper che la
// chiama. Toglierla non distribuisce la macchina a stati su due file — le
// toglie di mezzo il suo dizionario.
import { STATUS_LABELS } from "../lib/taskConstants.js";
import { getMember } from "../lib/permissions.js";

// Azioni che generano una voce nel log attività
export const LOGGED_ACTIONS = new Set([
  "ADD_TASK", "ADD_TASKS_BULK", "UPDATE_TASK", "MOVE_TASK", "ADD_COMMENT",
  "DELETE_TASK", "RESTORE_TASK", "PURGE_TASK", "EMPTY_TRASH",
  "ADD_TEAM_MEMBER", "UPDATE_TEAM_MEMBER", "APPROVE_TEAM_MEMBER", "TOGGLE_TEAM_MEMBER_ACTIVE", "REMOVE_TEAM_MEMBER",
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "RESTORE_BACKUP",
  "ADD_NOTICE", "UPDATE_NOTICE", "DELETE_NOTICE",
  "ADD_MESSAGE_TEMPLATE", "UPDATE_MESSAGE_TEMPLATE", "DELETE_MESSAGE_TEMPLATE",
]);

export const buildLogEntry = (action, state) => {
  const t = action.type;
  const stamp = new Date().toISOString();
  const taskOf = id => state.tasks.find(x => x.id === id)?.title || id;
  const map = {
    ADD_TASK: () => `Creato task "${action.payload.title}"`,
    ADD_TASKS_BULK: () => `Creati ${action.payload.length} task in blocco`,
    UPDATE_TASK: () => `Aggiornato task "${taskOf(action.payload.id)}"`,
    MOVE_TASK: () => `Task "${taskOf(action.payload.taskId)}" spostato in ${STATUS_LABELS[action.payload.newStatus]}`,
    ADD_COMMENT: () => `Commento su "${taskOf(action.payload.taskId)}"`,
    DELETE_TASK: () => `Task "${taskOf(action.payload)}" nel cestino`,
    RESTORE_TASK: () => `Ripristinato task "${taskOf(action.payload)}"`,
    PURGE_TASK: () => `Eliminato definitivamente "${taskOf(action.payload)}"`,
    EMPTY_TRASH: () => `Cestino svuotato`,
    ADD_TEAM_MEMBER: () => `Aggiunto agente "${action.payload.name}"`,
    UPDATE_TEAM_MEMBER: () => `Modificato agente "${action.payload.name || action.payload.id}"`,
    APPROVE_TEAM_MEMBER: () => `Approvato agente "${getMember(state.team, action.payload)?.name || action.payload}"`,
    TOGGLE_TEAM_MEMBER_ACTIVE: () => `Agente "${getMember(state.team, action.payload)?.name || action.payload}" attivato/disattivato`,
    REMOVE_TEAM_MEMBER: () => `Rimosso agente "${getMember(state.team, action.payload)?.name || action.payload}"`,
    ADD_CATEGORY: () => `Aggiunta categoria "${action.payload.label}"`,
    UPDATE_CATEGORY: () => `Modificata categoria "${action.payload.key}"`,
    REMOVE_CATEGORY: () => `Rimossa categoria "${action.payload}"`,
    RESTORE_BACKUP: () => `Backup ripristinato`,
    ADD_NOTICE: () => `Pubblicato avviso in bacheca`,
    UPDATE_NOTICE: () => `Modificato avviso in bacheca`,
    DELETE_NOTICE: () => `Rimosso avviso dalla bacheca`,
    ADD_MESSAGE_TEMPLATE: () => `Template messaggio creato: "${action.payload?.label || ""}"`,
    UPDATE_MESSAGE_TEMPLATE: () => `Template messaggio modificato`,
    DELETE_MESSAGE_TEMPLATE: () => `Template messaggio rimosso`,
  };
  return { id: `log-${stamp}-${Math.random().toString(36).slice(2,7)}`, time: stamp, type: t, text: (map[t] || (() => t))() };
};
