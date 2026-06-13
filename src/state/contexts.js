import { createContext, useContext } from "react";

// AppContext espone i dati condivisi { team, categories, currentUserId } letti
// dallo state del reducer. I componenti li consumano via gli hook qui sotto,
// senza dover leggere globali mutabili (eliminati in Step P / Fase 1).
export const AppContext = createContext({ team: [], categories: {}, currentUserId: null });

export const useTeam = () => useContext(AppContext).team;
export const useCategories = () => useContext(AppContext).categories;
export const useCurrentUserId = () => useContext(AppContext).currentUserId;
