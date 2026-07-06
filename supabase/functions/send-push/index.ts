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

  // tag: stesso task/notifica → il sistema operativo sostituisce la notifica
  // precedente invece di accumularne (es. re-promemoria queue_stale).
  const message = JSON.stringify({
    title: payload.title ?? "VoyageDesk",
    body: payload.body ?? "",
    tag: `${payload.type ?? "notif"}:${payload.task_id ?? payload.notification_id ?? ""}`,
    data: {
      task_id: payload.task_id ?? null,
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
      await subscriber.pushTextMessage(message, {});
      sent++;
    } catch (e) {
      const status = e instanceof webpush.PushMessageError
        ? e.response.status
        : undefined;
      if (status === 404 || status === 410) {
        // Sottoscrizione scaduta/revocata: pulizia dalla tabella.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        failed++;
        console.error(`[send-push] push a ${sub.endpoint.slice(0, 60)}…:`, e);
      }
    }
  }));

  return json({ sent, removed, failed });
});
