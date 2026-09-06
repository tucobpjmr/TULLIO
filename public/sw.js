// Service Worker VoyageDesk — Web Push (roadmap handoff v44) + guscio
// offline (M-1, audit del 5 settembre). Il payload push arriva dalla Edge
// Function send-push:
// { title, body, tag, data: { task_id, conversation_id, notification_id, type } }.
//
// ─── M-1 · IL GUSCIO SI APRE ANCHE DA OFFLINE ───────────────────────────────
// ⛔ NON è caching dei DATI, e la distinzione è tutto il rilievo. Mettere in
// cache le risposte di Supabase mostrerebbe task e saldi vecchi senza poter
// dire quanto — l'app ha due strisce persistenti (OfflineBanner, freschezza
// realtime) proprio per non farlo mai. Qui si mette in cache SOLO il guscio:
// HTML, JS, CSS, font, icone. Supabase non passa MAI da qui (vedi il
// controllo sull'origine, dentro l'handler `fetch`).
//
// Il risultato è che da offline si apre l'app CON la sua striscia rossa,
// invece della schermata d'errore del browser — lo stesso messaggio che
// l'app dà già quando la rete cade mentre è aperta, qui senza dipendere
// dall'essere già aperta.
const GUSCIO = 'vd-guscio-v1';

// Precache del solo `/`: gli asset con hash entrano in cache alla prima
// visita (stale-while-revalidate qui sotto) e cambiano nome a ogni deploy,
// quindi elencarli qui li farebbe scadere a ogni build.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(GUSCIO).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n !== GUSCIO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // ⛔ Supabase NON passa di qui, mai. È la riga che tiene separato "il guscio
  // si apre" da "i dati sono vecchi e non te lo dico".
  if (url.origin !== self.location.origin) return;

  // La navigazione: rete prima (un deploy nuovo deve arrivare subito), guscio
  // in cache come rete di sicurezza. `vercel.json` riscrive già ogni path su
  // `/`, quindi `/` è la risposta giusta per qualunque navigazione.
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Gli asset con hash nel nome (JS/CSS/font): cache prima, aggiornamento in
  // sottofondo. Il nome cambia a ogni build, quindi non c'è versione vecchia
  // da servire per sbaglio — è il contratto del filename hashing di Vite.
  e.respondWith(
    caches.match(request).then((hit) => {
      const rete = fetch(request).then((res) => {
        if (res.ok) caches.open(GUSCIO).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || rete;
    })
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* payload non-JSON: notifica generica */ }
  const title = payload.title || 'VoyageDesk';
  // showNotification va SEMPRE chiamata: la sottoscrizione è userVisibleOnly e
  // i browser (iOS compreso) revocano il permesso a chi riceve push silenziosi.
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    icon: '/apple-touch-icon-192.png',
    badge: '/apple-touch-icon-192.png',
    // tag: stesso task/notifica → il sistema sostituisce la notifica invece di accumularne
    tag: payload.tag || undefined,
    data: payload.data || {},
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const taskId = data.task_id;
  // Notifiche di chat: nel payload c'è la conversazione invece del task.
  const conversationId = data.conversation_id;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 0) {
      // App già aperta: focus + messaggio al client (VoyageDesk apre il
      // TaskSlideOver o la conversazione).
      const client = windows[0];
      await client.focus();
      if (taskId) client.postMessage({ type: 'push-open-task', taskId });
      else if (conversationId) client.postMessage({ type: 'push-open-chat', conversationId });
      return;
    }
    // App chiusa: apertura fredda con deep-link ?task= / ?chat= (gestiti in
    // VoyageDesk.jsx).
    const url = taskId
      ? `/?task=${encodeURIComponent(taskId)}`
      : conversationId
        ? `/?chat=${encodeURIComponent(conversationId)}`
        : '/';
    await self.clients.openWindow(url);
  })());
});

// Rotazione della sottoscrizione. Il browser la invalida da solo (su iOS
// succede spesso: aggiornamento della PWA, app scaricata per liberare spazio,
// riavvio del dispositivo) e da quel momento il server continua a spedire a un
// endpoint morto: nessuna notifica arriva più e nella UI non cambia nulla.
// Qui ri-sottoscriviamo con la stessa chiave VAPID e avvisiamo le finestre
// aperte, che salvano il nuovo endpoint su Supabase (il service worker non ha
// la sessione dell'utente, non può scrivere sul DB da solo). Se nessuna
// finestra è aperta ci pensa syncPushSubscription() alla prossima apertura
// dell'app: la sottoscrizione a quel punto esiste già e va solo salvata.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      let sub = event.newSubscription || await self.registration.pushManager.getSubscription();
      if (!sub) {
        const key = event.oldSubscription?.options?.applicationServerKey;
        if (!key) return; // senza chiave non possiamo ricreare: ci penserà l'app
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: 'push-subscription-changed' });
    } catch (e) {
      console.error('[VoyageDesk sw] pushsubscriptionchange:', e);
    }
  })());
});
