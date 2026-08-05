// src/state/appGlobals.js
// SHIM LEGACY DI TRANSIZIONE — non aggiungere nuovi consumatori.
//
// Fino alla sessione precedente questo modulo era la FONTE DI VERITÀ per team,
// categorie e utente corrente: tre `let` mutabili scritti da dentro il reducer
// tramite setter. Due problemi seri:
//
//   1. Il reducer non era puro. React 18 invoca i reducer due volte in
//      StrictMode e può scartare render in Concurrent Mode: scrivere stato
//      esterno da lì è una trappola latente.
//   2. Le decisioni di AUTORIZZAZIONE (canEditTask & co.) venivano prese
//      leggendo queste globali invece dello state React — due fonti di verità
//      per lo stesso dato, disallineabili in silenzio.
//
// Oggi la fonte di verità è `state.team` / `state.categories` /
// `state.currentUserId`, e la logica di permesso vive in funzioni pure
// (src/lib/permissions.js) che ricevono il team come argomento esplicito.
//
// Questo file resta solo come ponte per i ~18 componenti che leggono ancora i
// globali per fini di PRESENTAZIONE (Avatar, CategoryChip, MentionText, elenchi
// assegnatari...). Le globali non sono più scritte dal reducer: le sincronizza
// un unico punto in VoyageDesk.jsx (syncLegacyGlobals) a partire dallo state.
//
// MIGRAZIONE: sostituire `import { getMember } from 'state/appGlobals.js'` con
// `usePermissions()` (src/hooks/usePermissions.js) o con le funzioni pure di
// lib/permissions.js, un componente alla volta. Quando l'ultimo consumatore
// sarà migrato, questo file va eliminato.

import { INITIAL_TEAM, INITIAL_CATEGORIES } from './mockData.js';
import * as P from '../lib/permissions.js';

// ─── SPECCHIO DELLO STATE (sola lettura per i consumatori) ───────────────────
// Valori iniziali = dati demo: senza login l'app gira sui mock, e i componenti
// devono avere qualcosa da mostrare anche prima che VoyageDesk monti.
export let TEAM = [...INITIAL_TEAM];
export let CATEGORIES = { ...INITIAL_CATEGORIES };
export let CURRENT_USER = 'marco';

// Chiamati SOLO da syncLegacyGlobals (VoyageDesk.jsx) e dal setup dei test.
// Non chiamarli dal reducer: il reducer deve restare puro.
export const setTeam = (t) => { TEAM = t; };
export const setCategories = (c) => { CATEGORIES = c; };
export const setCurrentUser = (id) => { CURRENT_USER = id; };

// ─── DELEGHE ALLE FUNZIONI PURE ──────────────────────────────────────────────
// Stessa firma di prima (team implicito) per non rompere i call site esistenti;
// l'implementazione è quella pura, così esiste una sola definizione di ogni
// regola di permesso in tutta la codebase.

export const getMember = (id) => P.getMember(TEAM, id);
export const getAssignableTeam = () => P.getAssignableTeam(TEAM);

export const getRoleType = (userId) => P.getRoleType(TEAM, userId);
export const isJuniorAgent = (userId) => P.isJuniorAgent(TEAM, userId);
export const isSeniorAgent = (userId) => P.isSeniorAgent(TEAM, userId);
export const isAdmin = (userId) => P.isAdmin(TEAM, userId);
export const isDriver = (userId) => P.isDriver(TEAM, userId);

export const canViewTask = (task, userId) => P.canViewTask(TEAM, task, userId);
export const canEditTask = (task, userId) => P.canEditTask(TEAM, task, userId);
export const canCreateTaskCategory = (category, userId) => P.canCreateTaskCategory(TEAM, category, userId);
export const canAccessAdmin = (userId) => P.canAccessAdmin(TEAM, userId);

export const getAvailableCategories = (userId) => P.getAvailableCategories(CATEGORIES, TEAM, userId);
export const getVisibleTasks = (tasks, userId) => P.getVisibleTasks(TEAM, tasks, userId);

// Allinea lo specchio legacy allo state React. Unico punto di scrittura in
// tutta l'app (vedi VoyageDesk.jsx). Idempotente: riassegnare lo stesso
// riferimento non ha effetti, quindi è sicuro anche sotto StrictMode.
export function syncLegacyGlobals({ team, categories, currentUserId }) {
  if (team) TEAM = team;
  if (categories) CATEGORIES = categories;
  if (currentUserId) CURRENT_USER = currentUserId;
}
