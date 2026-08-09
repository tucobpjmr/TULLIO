// src/state/demoState.js
// Unico punto d'ingresso a mockData.js. Ogni chiamante lo referenzia solo
// dentro un ramo `if (import.meta.env.DEV && …)`: in produzione quella
// costante è `false` a build time, il ramo è provabilmente irraggiungibile, e
// il bundler elimina insieme a demoState() anche mockData.js (17.9 kB) dal
// bundle — stessa tecnica già in uso per SET_CURRENT_USER (reducer.js).
//
// Non chiamare demoState() fuori da un simile guard: da solo non protegge
// nulla, è la condizione statica al momento della chiamata che fa la
// differenza fra "irraggiungibile" e "fuori dal bundle".
import {
  INITIAL_TEAM, INITIAL_TASKS, INITIAL_NOTICES, MOCK_NOTIFICATIONS,
  INITIAL_CONVERSATIONS, INITIAL_MESSAGES,
} from "./mockData.js";

export function demoState() {
  return {
    team: INITIAL_TEAM,
    tasks: INITIAL_TASKS,
    notices: INITIAL_NOTICES,
    notifications: MOCK_NOTIFICATIONS,
    conversations: INITIAL_CONVERSATIONS,
    messages: INITIAL_MESSAGES,
  };
}
