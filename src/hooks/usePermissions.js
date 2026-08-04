// src/hooks/usePermissions.js
// Accesso ai permessi dai componenti, legati allo state React invece che allo
// specchio mutabile di state/appGlobals.js.
//
// È il percorso di migrazione per i componenti che oggi importano ancora
// getMember/canEditTask/CATEGORIES da appGlobals: quelle funzioni leggono una
// variabile di modulo, quindi non partecipano al ciclo di render di React (un
// cambio di team non invalida nulla, e un componente memoizzato mostrerebbe
// permessi vecchi). Qui l'input è `state.team`, quindi il risultato si
// ricalcola quando e solo quando il team cambia davvero.
//
//   const perm = usePermissions(state.team, state.currentUserId);
//   if (perm.canEdit(task)) { … }
//   perm.assignable().map(m => …)

import { useMemo } from "react";
import * as P from "../lib/permissions.js";

export function usePermissions(team, currentUserId) {
  return useMemo(() => ({
    // Ruoli
    roleType:      () => P.getRoleType(team, currentUserId),
    isAdmin:       () => P.isAdmin(team, currentUserId),
    isDriver:      () => P.isDriver(team, currentUserId),
    isJuniorAgent: () => P.isJuniorAgent(team, currentUserId),
    isSeniorAgent: () => P.isSeniorAgent(team, currentUserId),

    // Task
    canView:   (task) => P.canViewTask(team, task, currentUserId),
    canEdit:   (task) => P.canEditTask(team, task, currentUserId),
    canCreate: (category) => P.canCreateTaskCategory(team, category, currentUserId),
    visibleTasks: (tasks) => P.getVisibleTasks(team, tasks, currentUserId),

    // Vista Admin
    canAccessAdmin: () => P.canAccessAdmin(team, currentUserId),

    // Team
    member:     (id) => P.getMember(team, id),
    assignable: () => P.getAssignableTeam(team),

    // Categorie disponibili al ruolo corrente
    availableCategories: (categories) => P.getAvailableCategories(categories, team, currentUserId),
  }), [team, currentUserId]);
}
