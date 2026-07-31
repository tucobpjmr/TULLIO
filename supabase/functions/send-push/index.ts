// Edge Function: send-push — mittente Web Push (VAPID), roadmap handoff v44.
//
// Chiamata dal trigger DB notify_push() (migration 20260705_web_push_notifications)
// via pg_net a ogni notifica non letta. Riceve { user_id, title, body, type,
// task_id, notification_id }, legge le sottoscrizioni dell'utente da
// push_subscriptions (service role, bypassa la RLS) e invia il push a ogni
// dispositivo. Endpoint scaduti (404/410) vengono rimossi dalla tabella.
//
// Autorizzazione: verify_jwt è attivo (il trigger manda l'anon key come
// Bearer), ma l'autorizzazione vera è l'header x-push-secret confrontato con
// il secret condiviso nel Vault. I segreti VAPID arrivano dalla RPC
// get_push_secrets() (eseguibile solo da service_role) — nessun secret da
// configurare a mano nella dashboard.
//
// Libreria: jsr:@negrel/webpush — Web Push puro WebCrypto, pensato per Deno
// (npm:web-push dipende da node:crypto e sul runtime edge è meno affidabile).
import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// TTL del messaggio push, in secondi. Senza un TTL esplicito il push service
// può trattarlo come 0 = "consegna solo se il dispositivo è connesso ADESSO,
// altrimenti scarta": su iPhone (schermo spento, rete assente, modalità
// risparmio energetico) è la differenza fra una notifica che arriva qualche
// minuto dopo e una che non arriva mai. 24h è il tetto oltre il quale una
// notifica di lavoro non è più utile.
const PUSH_TTL_SECONDS = 24 * 60 * 60;

interface PushContext {
  appServer: webpush.ApplicationServer;
  triggerSecret: string;
}

// Cache di modulo: i segreti e l'ApplicationServer sopravvivono tra le
// richieste finché l'isolate è caldo; su errore si riparte da zero.
let ctxPromise: Promise<PushContext> | null = null;

async function initContext(): Promise<PushContext> {
  const { data, error } = await supabase.rpc("get_push_secrets");
  if (error || !data?.vapid_jwk || !data?.push_trigger_secret) {
    throw new Error(`get_push_secrets: ${error?.message ?? "segreti mancanti nel Vault"}`);
  }
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(data.vapid_jwk), {
    extractable: false,
  });
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: data.vapid_subject ?? "mailto:admin@voyagedesk.app",
    vapidKeys,
  });
  return { appServer, triggerSecret: data.push_trigger_secret };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let ctx: PushContext;
  try {
    ctxPromise ??= initContext();
    ctx = await ctxPromise;
  } catch (e) {
    ctxPromise = null; // retry al prossimo invoke
    console.error("[send-push] init:", e);
    return json({ error: "init failed" }, 500);
  }

  if (req.headers.get("x-push-secret") !== ctx.triggerSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: {
    user_id?: string;
    notification_id?: string;
    type?: string;
    title?: string;
    body?: string;
    task_id?: string | null;
    conversation_id?: string | null;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!payload.user_id) return json({ error: "user_id mancante" }, 400);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", payload.user_id);
  if (error) {
    console.error("[send-push] select subscriptions:", error);
    return json({ error: "db error" }, 500);
  }
  if (!subs?.length) return json({ sent: 0, removed: 0, failed: 0 });

  // tag: stesso task/conversazione/notifica → il sistema operativo sostituisce
  // la notifica precedente invece di accumularne (es. re-promemoria
  // queue_stale, o i messaggi successivi della stessa chat).
  const message = JSON.stringify({
    title: payload.title ?? "VoyageDesk",
    body: payload.body ?? "",
    tag: `${payload.type ?? "notif"}:${payload.task_id ?? payload.conversation_id ?? payload.notification_id ?? ""}`,
    data: {
      task_id: payload.task_id ?? null,
      conversation_id: payload.conversation_id ?? null,
      notification_id: payload.notification_id ?? null,
      type: payload.type ?? null,
    },
  });

  let sent = 0, removed = 0, failed = 0;
  await Promise.all(subs.map(async (sub) => {
    const subscriber = ctx.appServer.subscribe({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    });
    try {
      await subscriber.pushTextMessage(message, { ttl: PUSH_TTL_SECONDS });
      sent++;
    } catch (e) {
      const status = e instanceof webpush.PushMessageError
        ? e.response.status
        : undefined;
      if (status === 404 || status === 410) {
        // Sottoscrizione scaduta/revocata: pulizia dalla tabella.
        // Su iOS capita spesso (aggiornamento della PWA, app scaricata da
        // iOS): il client se ne accorge e si ri-registra al riavvio dell'app
        // (syncPushSubscription in src/lib/push.js).
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        failed++;
        // Host + status nel log: distingue a colpo d'occhio un rifiuto di
        // Apple (web.push.apple.com, tipicamente 400/403 su VAPID) da uno di
        // FCM, altrimenti indistinguibili nei log della funzione.
        const host = (() => { try { return new URL(sub.endpoint).host; } catch { return "?"; } })();
        console.error(`[send-push] ${host} status=${status ?? "n/a"}:`, e);
      }
    }
  }));

  return json({ sent, removed, failed });
});
