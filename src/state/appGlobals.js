// src/state/appGlobals.js
// Stato mutabile condiviso tra reducer e componenti (non-hook code).
//
// TEAM/CATEGORIES/CURRENT_USER sono `let` module-level aggiornati via
// setter (setTeam ecc.) dopo ogni mutazione. I moduli importatori leggono
// la live binding ES-module e vedono sempre il valore corrente.
// Helpers come getMember chiudono su TEAM e si aggiornano di conseguenza.

import { INITIAL_TEAM, INITIAL_CATEGORIES } from './mockData.js';
import { isMyTask, isInGlobalQueue, isUrgent } from '../lib/taskUtils.js';

// ─── GLOBALS MUTABILI ─────────────────────────────────────────────────────────
export let TEAM = [...INITIAL_TEAM];
export let CATEGORIES = { ...INITIAL_CATEGORIES };
export let CURRENT_USER = "marco";

export const setTeam = (t) => { TEAM = t; };
export const setCategories = (c) => { CATEGORIES = c; };
export const setCurrentUser = (id) => { CURRENT_USER = id; };

// ─── HELPERS TEAM ─────────────────────────────────────────────────────────────
export const getMember = (id) => TEAM.find(m => m.id === id);
export const getAssignableTeam = () => TEAM.filter(m => m.active !== false && !m.pending);

// ─── PERMESSI (v0.8) ──────────────────────────────────────────────────────────
// - Admin       → tutto
// - Manager     → gestione propria coda + globale + visualizza urgenti altrui
// - Senior/Junior Agent → idem Manager
// - Driver      → solo task categoria "transfer", solo coda personale
export const getRoleType = (userId) => {
  const m = getMember(userId);
  if (!m) return "agent";
  const r = (m.role || "").toLowerCase();
  if (r.includes("admin")) return "admin";
  if (r.includes("driver")) return "driver";
  if (r.includes("manager")) return "manager";
  return "agent";
};

export const isAdmin = (userId) => getRoleType(userId) === "admin";
export const isDriver = (userId) => getRoleType(userId) === "driver";

export const canViewTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") return isMyTask(task, userId);
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  if (isUrgent(task)) return true;
  return false;
};

export const canEditTask = (task, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") {
    return task.category === "transfer" && (isMyTask(task, userId) || isInGlobalQueue(task));
  }
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  return false;
};

export const canCreateTaskCategory = (category, userId) => {
  const role = getRoleType(userId);
  if (role === "admin") return true;
  if (role === "driver") return category === "transfer";
  return true;
};

export const canAccessAdmin = (userId) => isAdmin(userId);

export const getAvailableCategories = (userId) => {
  if (isDriver(userId)) return { transfer: CATEGORIES.transfer };
  return CATEGORIES;
};

export const getVisibleTasks = (tasks, userId) =>
  tasks.filter(t => canViewTask(t, userId));
