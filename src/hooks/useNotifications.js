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

import { useState, useCallback, useRef } from "react";
import { Notifications as NotificationsAPI } from "../lib/api.js";
import { fromDbNotification } from "../lib/mappers.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

export function useNotifications({ enabled, onError }) {
  const [notifications, setNotifications] = useState([]);

  // B-1 · lo stato da cui si costruisce la compensazione si legge DA QUI, non
  // da dentro l'updater di setState. Un updater deve essere PURO: React 18 può
  // invocarlo più di una volta per lo stesso aggiornamento (StrictMode lo fa di
  // proposito per scovare gli effetti collaterali; il Concurrent rendering può
  // scartare un render già calcolato e rigiocare la coda su una base più
  // recente). Un `snapshot = prev` scritto lì dentro è proprio l'effetto
  // collaterale che quel meccanismo esiste per rendere visibile: a decidere
  // cosa il rollback rimetterà è l'ULTIMA invocazione, non la prima, e quale
  // sia dipende da quante volte React ha scelto di girare.
  //
  // Il ref è assegnato in RENDER e letto solo dentro i callback, come lo
  // `stateRef` di useSyncedDispatch: non rende impuro questo hook e tiene
  // `remove`/`clearAll` a identità stabile — con `notifications` fra le deps si
  // ricreerebbero a ogni notifica in arrivo, invalidando chi le memoizza.
  const vive = useRef(notifications);
  vive.current = notifications;

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

  // Pulizia elenco notifiche: rimozione singola e in blocco. Entrambe
  // ottimistiche, entrambe con una compensazione MIRATA se la delete su DB
  // fallisce — non un `setNotifications(snapshot)` che riscrive l'elenco
  // intero. Questo è un feed vivo: fra il click e la risposta del server passa
  // il tempo di un round-trip, e in quella finestra il realtime può aver già
  // consegnato notifiche nuove. Reinstallare lo snapshot le cancellerebbe dalla
  // campanella senza che nulla le riporti, perché la loro eco è già passata.
  const remove = useCallback((id) => {
    if (!enabled) return;
    const prima = vive.current;
    const posizione = prima.findIndex(n => n.id === id);
    if (posizione < 0) return;
    const rimossa = prima[posizione];
    setNotifications(prev => prev.filter(n => n.id !== id));
    NotificationsAPI.remove(id).then(r => {
      if (r?.error) {
        console.error("[notifications] remove", r.error);
        // Torna al suo posto solo LEI, e solo se nel frattempo non è già
        // rientrata da un refetch.
        setNotifications(prev => (prev.some(n => n.id === id)
          ? prev
          : [...prev.slice(0, posizione), rimossa, ...prev.slice(posizione)]));
        onError("Notifica: eliminazione fallita");
      }
    });
  }, [enabled, onError]);

  const clearAll = useCallback(() => {
    if (!enabled) return;
    const prima = vive.current;
    setNotifications([]);
    NotificationsAPI.removeAll().then(r => {
      if (r?.error) {
        console.error("[notifications] removeAll", r.error);
        // Unione e non sostituzione: quello che è arrivato dopo lo svuotamento
        // resta in testa, e sotto tornano le notifiche che il server non ha
        // eliminato. Nel caso normale — nessun arrivo nel frattempo — `prev` è
        // vuoto e il risultato è esattamente l'elenco di prima.
        setNotifications(prev => {
          const presenti = new Set(prev.map(n => n.id));
          return [...prev, ...prima.filter(n => !presenti.has(n.id))];
        });
        onError("Notifiche: pulizia fallita");
      }
    });
  }, [enabled, onError]);

  return { notifications, setNotifications, markRead, markAllRead, remove, clearAll };
}
