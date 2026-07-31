// Web Push (VAPID) — helper lato client (roadmap handoff v44).
// Il service worker è registrato in main.jsx; qui vivono rilevamento supporto,
// attivazione (permesso + PushManager.subscribe + salvataggio su DB),
// disattivazione e la RIPARAZIONE della sottoscrizione (syncPushSubscription).
// UI: toggle nel NotificationsPanel (Topbar.jsx).
import { Push } from './api.js';

// Memoria dell'intenzione dell'utente ("voglio le push su questo dispositivo").
// Serve a syncPushSubscription: senza, dopo una revoca di iOS non sapremmo
// distinguere "l'utente le ha spente" da "il sistema le ha buttate via", e
// ri-sottoscrivere in silenzio sarebbe sbagliato nel primo caso.
const INTENT_KEY = 'vd:push-intent';

function readIntent() {
  try { return localStorage.getItem(INTENT_KEY) === 'on'; } catch { return false; }
}
function writeIntent(on) {
  try {
    if (on) localStorage.setItem(INTENT_KEY, 'on');
    else localStorage.removeItem(INTENT_KEY);
  } catch { /* Safari privato: senza storage si perde solo la riparazione automatica */ }
}

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
  return { supported, isIOS, standalone, needsInstall: !supported && isIOS && !standalone };
}

// Salva su DB la sottoscrizione del browser. Upsert su (user_id, endpoint):
// ripetere l'operazione è innocuo ed è proprio ciò che ripara una riga che la
// Edge Function aveva cancellato dopo un 404/410.
async function saveSubscription(userId, sub) {
  const { keys } = sub.toJSON();
  return Push.save({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: navigator.userAgent,
  });
}

// Stato corrente: { supported, permission, enabled, synced }
//   enabled = esiste una sottoscrizione in questo browser
//   synced  = ...ed esiste anche la riga corrispondente su push_subscriptions
// La distinzione è il cuore del bug "il toggle è verde ma non arriva niente":
// gli endpoint Apple scadono spesso (aggiornamento della PWA, app scaricata da
// iOS, riavvio) e la Edge Function cancella la riga al primo 410. Il browser
// però continua a esporre la vecchia subscription, quindi guardando solo lui il
// toggle resterebbe acceso per sempre senza che nessun push venga più inviato.
export async function getPushState(userId) {
  if (!getPushSupport().supported) {
    return { supported: false, permission: 'unsupported', enabled: false, synced: false };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    let synced = !!sub;
    if (sub && userId) {
      const { data, error } = await Push.findByEndpoint(userId, sub.endpoint);
      // In caso di errore di rete non dichiariamo "non sincronizzata": meglio
      // lasciare lo stato locale che mostrare un falso allarme offline.
      if (!error) synced = !!data;
    }
    return { supported: true, permission: Notification.permission, enabled: !!sub, synced };
  } catch {
    return { supported: true, permission: Notification.permission, enabled: false, synced: false };
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
    const { error } = await saveSubscription(userId, sub);
    if (error) {
      // DB non aggiornato: meglio revocare la sottoscrizione locale orfana.
      await sub.unsubscribe().catch(() => {});
      return { error: error.message || 'Salvataggio sottoscrizione fallito' };
    }
    writeIntent(true);
    return { error: null };
  } catch (e) {
    return { error: e?.message || 'Attivazione push fallita' };
  }
}

// Disattiva le push su questo dispositivo (revoca browser + riga DB).
export async function disablePush() {
  try {
    writeIntent(false);
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

// Riparazione silenziosa, da chiamare all'avvio dell'app (e quando il service
// worker segnala un pushsubscriptionchange). Tre scenari, tutti visti su
// iPhone e tutti indistinguibili per l'utente ("le notifiche non arrivano
// più", senza che nulla nella UI cambi):
//
//   1. iOS ha buttato la sottoscrizione (aggiornamento PWA, app scaricata):
//      il permesso resta 'granted' ma getSubscription() torna null → qui la
//      ricreiamo. Non serve un gesto utente: il permesso c'è già.
//   2. L'endpoint è cambiato: la nuova sottoscrizione non è su push_subscriptions
//      → l'upsert la inserisce (la vecchia riga la ripulisce la Edge Function
//      al primo 410).
//   3. La riga era stata cancellata da un 410 transitorio mentre la
//      sottoscrizione locale è ancora valida → l'upsert la ripristina.
//
// Ritorna { error, repaired } — repaired=true se abbiamo (ri)scritto la riga.
export async function syncPushSubscription(userId) {
  if (!userId) return { error: 'utente non disponibile', repaired: false };
  if (!getPushSupport().supported) return { error: 'unsupported', repaired: false };
  // Mai chiedere il permesso da qui: se non è già concesso non c'è nulla da
  // riparare, l'utente deve passare dal toggle.
  if (Notification.permission !== 'granted') return { error: 'permission', repaired: false };
  if (!readIntent()) return { error: 'opt-out', repaired: false };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data: vapidKey, error: keyError } = await Push.getVapidPublicKey();
      if (keyError || !vapidKey) return { error: 'Chiave VAPID non disponibile', repaired: false };
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }
    const { error } = await saveSubscription(userId, sub);
    if (error) return { error: error.message || 'Salvataggio sottoscrizione fallito', repaired: false };
    return { error: null, repaired: true };
  } catch (e) {
    return { error: e?.message || 'Sincronizzazione push fallita', repaired: false };
  }
}

// Notifica di prova: inserisce una notifica per se stessi (RPC send_test_push,
// migration 20260731_push_test_and_ios_fixes) e lascia che sia la solita
// catena trigger → Edge Function → Web Push a consegnarla. È l'unico modo per
// verificare sul dispositivo che TUTTO il percorso funzioni: senza, un utente
// iPhone non ha modo di distinguere "nessuno mi ha scritto" da "le push sono
// rotte".
export async function sendTestPush() {
  const { error } = await Push.sendTest();
  return { error: error ? (error.message || 'Invio notifica di prova fallito') : null };
}
