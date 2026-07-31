// Service Worker VoyageDesk — solo Web Push (roadmap handoff v44).
// Nessun handler fetch: niente caching, il comportamento di rete della PWA
// resta invariato. Il payload arriva dalla Edge Function send-push:
// { title, body, tag, data: { task_id, conversation_id, notification_id, type } }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
