// src/lib/notifUtils.js
// Helper puri per il pannello notifiche (icona, titolo, sottotitolo, tempo).
// Estratti da components/shell/Topbar.jsx: sono la traduzione in italiano dei
// payload scritti dalle funzioni server-side (le notifiche nascono solo da
// trigger/cron DB, mai dal client) e vanno tenuti allineati al case new.type
// di notify_push(), che genera titolo e corpo della Web Push.

export const NOTIF_ICONS = {
  task_assigned: "📋",
  task_due: "📅",
  comment: "💬",
  mention: "@",
  queue_stale: "⏳",
  user_pending: "👤",
  chat_message: "✉️",
  push_test: "📲",
  // Compat con mock
  overdue: "⚠️", assigned: "📋", deadline: "📅",
};

// Categorie filtro: raggruppano i type per la UI filtri (Fase 2).
export const NOTIF_CATEGORIES = {
  task: ["task_assigned", "task_due", "comment", "queue_stale"],
  mention: ["mention"],
  chat: ["chat_message"],
};

// Quanti titoli di task mostrare nell'anteprima di un digest queue_stale.
const DIGEST_PREVIEW = 3;

export function notifTitle(n) {
  // Notifiche reali (DB): titolo derivato da type + payload
  if (n.payload) {
    const p = n.payload || {};
    switch (n.type) {
      case "task_assigned":
        return `Nuovo task assegnato: ${p.task_title ?? "—"}`;
      case "task_due":
        return `Scadenza task: ${p.task_title ?? "—"}`;
      case "comment":
        return `Nuovo commento su: ${p.task_title ?? "—"}`;
      case "mention":
        return p.task_title
          ? `Menzionato in: ${p.task_title}`
          : `Sei stato menzionato${p.where ? " in " + p.where : ""}`;
      // Digest della coda globale (20260725_queue_stale_relevance_digest): una
      // sola notifica per utente che riassume i task in scadenza senza
      // assegnatario. Con un solo task il payload porta task_title e il titolo
      // resta specifico. Il vecchio payload (una riga per task, senza count)
      // ricade nello stesso ramo.
      case "queue_stale": {
        const count = Number(p.count) || 0;
        if (count > 1) return `${count} task in scadenza senza assegnatario`;
        return p.task_title
          ? `Task in scadenza senza assegnatario: ${p.task_title}`
          : `Task in scadenza senza assegnatario`;
      }
      case "user_pending":
        return p.user_name
          ? `Nuova richiesta di accesso: ${p.user_name}`
          : `Nuova richiesta di accesso da approvare`;
      // Specchio del case 'chat_message' in notify_push()
      // (20260725_chat_message_notifications): nei gruppi il nome della
      // conversazione, nelle chat dirette il mittente.
      case "chat_message":
        return p.conversation_name
          ? `${p.conversation_name} — ${p.by_user_name ?? "Nuovo messaggio"}: ${p.preview ?? ""}`
          : `${p.by_user_name ?? "Nuovo messaggio"}: ${p.preview ?? ""}`;
      // Prova inviata dall'utente a se stesso dal toggle push
      // (RPC send_test_push, migration 20260731_push_test_and_ios_fixes).
      case "push_test":
        return "Notifica di prova: le push funzionano su questo dispositivo";
      default:
        return n.type || "Notifica";
    }
  }
  // Mock legacy
  return n.title || n.type;
}

// Seconda riga: solo per il digest queue_stale, elenca i primi titoli così si
// capisce cosa c'è in coda senza aprire la Dashboard. null = niente sottotitolo.
export function notifSubtitle(n) {
  const p = n?.payload;
  if (!p || n.type !== "queue_stale") return null;
  const tasks = Array.isArray(p.tasks) ? p.tasks : [];
  const count = Number(p.count) || tasks.length;
  if (count < 2 || tasks.length === 0) return null;
  const shown = tasks.slice(0, DIGEST_PREVIEW);
  const label = shown.map(t => t.title).filter(Boolean).join(" · ");
  const rest = count - shown.length;
  return rest > 0 ? `${label} · +${rest}` : label;
}

export function notifTime(n) {
  if (n.time) return n.time; // mock
  if (!n.createdAt) return "";
  const ms = Date.now() - new Date(n.createdAt).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "ora" : "ore"} fa`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "giorno" : "giorni"} fa`;
}

// Destinazione del tap. task_id vince sempre su view: anche il digest
// queue_stale (più task in coda) porta task_id del task più urgente, quindi
// il tap apre sempre il dettaglio di un task, non la Dashboard
// (20260730_queue_stale_notif_direct_task). payload.view/queue restano
// supportati come fallback per eventuali notifiche future senza task_id.
export function notifTarget(n) {
  const p = n?.payload;
  if (!p) return null;
  if (p.task_id) return { kind: "task", taskId: p.task_id };
  if (p.conversation_id) return { kind: "chat", conversationId: p.conversation_id };
  if (p.view) return { kind: "view", view: p.view, queue: p.queue ?? null };
  return null;
}
