// Web Push (VAPID) — helper lato client (roadmap handoff v44).
// Il service worker è registrato in main.jsx; qui vivono rilevamento supporto,
// attivazione (permesso + PushManager.subscribe + salvataggio su DB) e
// disattivazione. UI: toggle nel NotificationsPanel (Topbar.jsx).
import { Push } from './api.js';

// Chrome/Firefox accettano anche la stringa base64url, Safari richiede
// Uint8Array: convertiamo sempre.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

// Supporto push su questo browser. Su iOS Safari fuori dalla PWA installata
// PushManager non esiste: needsInstall guida il messaggio "Aggiungi a
// schermata Home" (richiede iOS 16.4+).
export function getPushSupport() {
  const supported =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone === true;
  return { supported, needsInstall: !supported && isIOS && !standalone };
}

// Stato corrente: { supported, permission: 'default'|'granted'|'denied'|'unsupported', enabled }
export async function getPushState() {
  if (!getPushSupport().supported) {
    return { supported: false, permission: 'unsupported', enabled: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return { supported: true, permission: Notification.permission, enabled: !!sub };
  } catch {
    return { supported: true, permission: Notification.permission, enabled: false };
  }
}

// Attiva le push su questo dispositivo per l'utente corrente.
// Ritorna { error: null | 'denied' | 'dismissed' | string }.
// Da chiamare dentro un gesto utente (click sul toggle): su iOS
// requestPermission fuori da un gesto fallisce sempre.
export async function enablePush(userId) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { error: permission === 'denied' ? 'denied' : 'dismissed' };
    }
    const reg = await navigator.serviceWorker.ready;
    const { data: vapidKey, error: keyError } = await Push.getVapidPublicKey();
    if (keyError || !vapidKey) return { error: 'Chiave VAPID non disponibile' };

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const { keys } = sub.toJSON();
    const { error } = await Push.save({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
    });
    if (error) {
      // DB non aggiornato: meglio revocare la sottoscrizione locale orfana.
      await sub.unsubscribe().catch(() => {});
      return { error: error.message || 'Salvataggio sottoscrizione fallito' };
    }
    return { error: null };
  } catch (e) {
    return { error: e?.message || 'Attivazione push fallita' };
  }
}

// Disattiva le push su questo dispositivo (revoca browser + riga DB).
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await Push.removeByEndpoint(sub.endpoint);
      await sub.unsubscribe();
    }
    return { error: null };
  } catch (e) {
    return { error: e?.message || 'Disattivazione push fallita' };
  }
}
