// src/hooks/useNotifications.js
// La campanella: idratazione + realtime della tabella `notifications` e le
// quattro azioni che l'utente può compiere sull'elenco (segna letta, segna
// tutte, elimina una, svuota).
//
// Tutte le mutazioni sono OTTIMISTICHE con rollback: l'elenco si aggiorna
// subito e, se la scrittura su DB fallisce, si torna allo snapshot precedente
// e si mostra un toast. È la stessa disciplina del registry di
// state/persistence.js, applicata a uno stato che non passa dal reducer —
// le notifiche non sono dati di dominio, sono un feed.
//
//   const { notifications, setNotifications, markRead, markAllRead,
//           remove, clearAll } = useNotifications({ enabled, onError });

import { useState, useCallback } from "react";
import { Notifications as NotificationsAPI } from "../lib/api.js";
import { fromDbNotification } from "../lib/mappers.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

export function useNotifications({ enabled, onError }) {
  const [notifications, setNotifications] = useState([]);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  useDebouncedTableSubscription(["notifications"], async (isCurrent) => {
    const { data, error } = await NotificationsAPI.list({ limit: 100 });
    if (!isCurrent()) return;
    if (error) {
      console.error("[notifications] list", error);
      onError(`Notifiche: caricamento fallito: ${error.message || ""}`);
      return;
    }
    setNotifications((data || []).map(fromDbNotification));
  }, { enabled, deps: [enabled] });

  const markRead = useCallback((id) => {
    if (!enabled) return;
    // Ottimistico
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    NotificationsAPI.markRead(id).then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        onError("Notifica: aggiornamento fallito");
      }
    });
  }, [enabled, onError]);

  const markAllRead = useCallback(() => {
    if (!enabled) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    NotificationsAPI.markAllRead().then(r => {
      if (r?.error) {
        console.error("[notifications] markAllRead", r.error);
        onError("Notifiche: aggiornamento fallito");
      }
    });
  }, [enabled, onError]);

  // Pulizia elenco notifiche: rimozione singola e in blocco. Tutte ottimistiche
  // con rollback allo snapshot precedente se la delete su DB fallisce.
  const remove = useCallback((id) => {
    if (!enabled) return;
    let snapshot = [];
    setNotifications(prev => { snapshot = prev; return prev.filter(n => n.id !== id); });
    NotificationsAPI.remove(id).then(r => {
      if (r?.error) {
        console.error("[notifications] remove", r.error);
        setNotifications(snapshot);
        onError("Notifica: eliminazione fallita");
      }
    });
  }, [enabled, onError]);

  const clearAll = useCallback(() => {
    if (!enabled) return;
    let snapshot = [];
    setNotifications(prev => { snapshot = prev; return []; });
    NotificationsAPI.removeAll().then(r => {
      if (r?.error) {
        console.error("[notifications] removeAll", r.error);
        setNotifications(snapshot);
        onError("Notifiche: pulizia fallita");
      }
    });
  }, [enabled, onError]);

  return { notifications, setNotifications, markRead, markAllRead, remove, clearAll };
}
