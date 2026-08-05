// src/hooks/useAppHydration.js
// Idratazione + realtime dei dati di dominio che vivono nel reducer: task
// (con commenti e cronologia), avvisi, categorie, team e clienti.
//
// Tutte le sottoscrizioni seguono lo stesso pattern — ricarico la lista intera
// a ogni evento postgres, debounced, con un gen-counter che scarta le risposte
// obsolete: vedi useDebouncedTableSubscription (caveat #10). È volutamente più
// semplice di un merge incrementale per-riga, ed è robusto al duplicato
// dell'eco locale.
//
// Il chiamante passa `dispatch` (quello grezzo del reducer: qui non si scrive
// nulla su DB, si legge soltanto) e riceve i due flag di caricamento che le
// viste usano per mostrare gli scheletri invece di un vuoto ingannevole.

import { useState, useEffect } from "react";
import {
  Tasks as TasksAPI, Notices as NoticesAPI, Users as UsersAPI,
  Clients as ClientsAPI, Categories as CategoriesAPI,
} from "../lib/api.js";
import {
  fromDbTask, fromDbNotice, fromDbClient, fromDbCategory,
} from "../lib/mappers.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

export function useAppHydration({ enabled, currentUserId, dispatch, onError }) {
  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  // Caveat #10: il pattern reload+debounce+gen-counter vive in
  // useDebouncedTableSubscription; le tasks ascoltano anche comments e
  // task_history (cronologia per-task, sessione 42).
  useDebouncedTableSubscription(["tasks", "comments", "task_history"], async (isCurrent) => {
    // includeDeleted: true → portiamo anche le task soft-deleted nello stato,
    // altrimenti la ri-idratazione realtime (che parte subito dopo un DELETE_TASK)
    // le filtrerebbe via, svuotando il Cestino. Le viste attive (Dashboard,
    // Calendario) filtrano comunque con getActiveTasks/isActiveTask, quindi le
    // cestinate restano confinate alla vista Cestino.
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      onError(`Caricamento task fallito: ${error.message || ""}`);
      return;
    }
    dispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
  }, { enabled, deps: [enabled] });

  useDebouncedTableSubscription(["notices"], async (isCurrent) => {
    const { data, error } = await NoticesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Notices.list", error);
      onError(`Caricamento avvisi fallito: ${error.message || ""}`);
      return;
    }
    dispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
  }, { enabled, deps: [enabled] });

  // Idratazione + realtime categorie task (Admin → Categorie). Prima di questa
  // sub, ADD_CATEGORY/UPDATE_CATEGORY/REMOVE_CATEGORY toccavano solo lo stato
  // React in memoria: una categoria creata spariva al primo reload perché non
  // veniva mai scritta su Supabase (vedi migration 20260630_categories_table).
  useDebouncedTableSubscription(["categories"], async (isCurrent) => {
    const { data, error } = await CategoriesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Categories.list", error);
      onError(`Caricamento categorie fallito: ${error.message || ""}`);
      return;
    }
    const categories = {};
    for (const row of data || []) {
      const c = fromDbCategory(row);
      categories[c.key] = { label: c.label, icon: c.icon, color: c.color, bg: c.bg };
    }
    dispatch({ type: "SET_CATEGORIES", payload: categories });
  }, { enabled, deps: [enabled] });

  // Refresh team live (sessione 29). Senza questo sub, l'admin invita o
  // approva un utente e l'elenco Team non si aggiorna fino a un reload.
  // Risub-scrive ai change su `users` e ricarica la lista completa (inclusi
  // pending=true e active=false: l'admin deve vederli). normalize() allinea
  // photo_url → photoUrl, idem AuthContext.
  //
  // filterEvent (sessione 29 cleanup): saltiamo gli UPDATE che cambiano solo
  // i campi di presence (status, last_seen_at) — la presence ha già il suo
  // proprio canale (presenceMap), il team non ne ha bisogno. Senza filtro,
  // ogni heartbeat di un altro client (ogni 30s) provocava un reload del
  // team. REPLICA IDENTITY FULL su public.users (migration 20260612) ci
  // garantisce il pre-image in payload.old per fare il confronto.
  useDebouncedTableSubscription(["users"], async (isCurrent) => {
    // listAll() legge solo public.users → NON contiene email/phone, che vivono
    // in public.user_contacts (RLS own+admin). Senza ri-merge, ad ogni refresh
    // del team (incluso quello iniziale al mount) i contatti dell'utente loggato
    // verrebbero azzerati nello stato: ProfileEditor li mostrerebbe vuoti dopo
    // il reload, facendo sembrare che le modifiche a mail/telefono non si
    // persistano (in realtà sono salvate, ma sovrascritte qui). Li recuperiamo
    // e li reinnestiamo nella sola entry dell'utente loggato, come fa
    // AuthContext.loadProfile alla prima idratazione.
    const [listRes, contactsRes] = await Promise.all([
      UsersAPI.listAll(),
      currentUserId
        ? UsersAPI.getContacts(currentUserId)
        : Promise.resolve({ data: null }),
    ]);
    const { data, error } = listRes;
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Users.listAll", error);
      return;
    }
    const myContacts = {
      email: contactsRes?.data?.email ?? null,
      phone: contactsRes?.data?.phone ?? null,
    };
    const team = (data || []).map(u => {
      const base = { ...u, photoUrl: u.photo_url ?? null };
      return u.id === currentUserId ? { ...base, ...myContacts } : base;
    });
    dispatch({ type: "SET_TEAM", payload: team });
  }, {
    enabled,
    delay: 800,
    deps: [enabled],
    filterEvent: (payload) => {
      if (payload?.eventType !== "UPDATE") return true; // INSERT/DELETE sempre
      const oldRow = payload.old;
      const newRow = payload.new;
      if (!oldRow || !newRow) return true; // pre-image mancante → safe-reload
      const PRESENCE_ONLY = new Set(["status", "last_seen_at", "origin_client"]);
      for (const key of Object.keys(newRow)) {
        if (PRESENCE_ONLY.has(key)) continue;
        if (oldRow[key] !== newRow[key]) return true; // campo "interessante" cambiato
      }
      return false; // solo presence → skip reload
    },
  });

  // Loading state CRM: true finché non completa il primo fetch da Supabase.
  // Senza login parte già false (nessuna idratazione: si usano i dati mock).
  const [crmLoading, setCrmLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ClientsAPI.list()
      .then((cRes) => {
        if (cancelled) return;
        if (!cRes.error) dispatch({ type: "SET_CLIENTS", payload: (cRes.data || []).map(fromDbClient) });
      }).catch(e => console.error("[CRM] hydration", e))
      .finally(() => { if (!cancelled) setCrmLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, dispatch]);

  return { crmLoading };
}
