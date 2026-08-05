// src/hooks/usePushNavigation.js
// Il ponte fra le notifiche di sistema (Web Push) e la navigazione dell'app.
//
// Tre canali, tutti dal service worker in public/sw.js:
//   - avvio a freddo → deep-link ?task=<id> / ?chat=<id> nell'URL, letto una
//     volta e rimosso dalla history;
//   - app già aperta → postMessage { type: 'push-open-task' | 'push-open-chat' };
//   - il browser ha invalidato la sottoscrizione → 'push-subscription-changed',
//     e solo il client ha la sessione Supabase per riscriverla.
//
// Il task può non essere ancora idratato quando l'utente tocca la notifica:
// l'id resta in sospeso finché non compare in `tasks`. È la differenza con
// openTaskById, che mostra subito un toast "non più disponibile" — qui sarebbe
// un falso negativo dovuto solo al timing dell'idratazione.

import { useState, useRef, useEffect } from "react";
import { syncPushSubscription } from "../lib/push.js";

export function usePushNavigation({ enabled, currentUserId, tasks, dispatch, onOpenChat }) {
  // Web Push (handoff v44): apertura del task dalla notifica di sistema.
  // Due canali dal service worker (public/sw.js):
  //   - avvio a freddo → deep-link ?task=<id> nell'URL (letto una volta e rimosso)
  //   - app già aperta → postMessage { type: 'push-open-task', taskId }
  // Il task può non essere ancora idratato al momento del click: l'id resta
  // in pendingPushTask finché non compare in state.tasks (niente toast d'errore
  // prematuro, a differenza di openTaskById).
  const pendingPushTask = useRef(null);
  const [pushNavTick, setPushNavTick] = useState(0);
  const [pushSyncTick, setPushSyncTick] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("task");
    // Notifiche di chat: deep-link ?chat=<conversation_id>. La conversazione
    // può non essere ancora idratata: l'intent resta finché ChatPanel non la
    // trova nella lista.
    const convFromUrl = params.get("chat");
    if (fromUrl || convFromUrl) {
      if (fromUrl) pendingPushTask.current = fromUrl;
      if (convFromUrl) onOpenChat(convFromUrl);
      params.delete("task");
      params.delete("chat");
      const qs = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
      setPushNavTick(t => t + 1);
    }
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === "push-open-task" && e.data.taskId) {
        pendingPushTask.current = e.data.taskId;
        setPushNavTick(t => t + 1);
      }
      if (e.data?.type === "push-open-chat" && e.data.conversationId) {
        onOpenChat(e.data.conversationId);
      }
      // Il service worker ha ricreato la sottoscrizione dopo che il browser
      // l'ha invalidata: solo il client ha la sessione Supabase per salvarla.
      if (e.data?.type === "push-subscription-changed") setPushSyncTick(t => t + 1);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [onOpenChat]);

  // Riparazione della sottoscrizione push a ogni avvio dell'app.
  // Su iPhone la sottoscrizione muore da sola (aggiornamento della PWA, app
  // scaricata da iOS, riavvio) e la Edge Function cancella la riga al primo
  // 410: da lì in poi nessun push arriva più, con il toggle ancora acceso.
  // syncPushSubscription ricrea la sottoscrizione (il permesso è già concesso,
  // nessun gesto utente necessario) e riscrive la riga; è un no-op per chi non
  // ha mai attivato le push o le ha spente.
  useEffect(() => {
    if (!enabled || !currentUserId) return;
    let alive = true;
    syncPushSubscription(currentUserId).then(({ error }) => {
      // 'opt-out' / 'permission' / 'unsupported' sono gli esiti normali di chi
      // non usa le push: non sono errori e non vanno loggati.
      if (!alive || !error || ["opt-out", "permission", "unsupported"].includes(error)) return;
      console.warn("[push] sincronizzazione sottoscrizione fallita:", error);
    });
    return () => { alive = false; };
  }, [enabled, currentUserId, pushSyncTick]);
  useEffect(() => {
    if (!pendingPushTask.current) return;
    const t = (tasks || []).find(x => x.id === pendingPushTask.current && !x.deletedAt);
    if (t) {
      pendingPushTask.current = null;
      dispatch({ type: "SET_SELECTED_TASK", payload: t });
    }
  }, [tasks, pushNavTick, dispatch]);
}
