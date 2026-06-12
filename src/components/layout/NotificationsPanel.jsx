import { useViewport } from "../../hooks/useViewport.jsx";
import { NOTIFICATIONS } from "../../state/seed.js";

const NOTIF_ICONS = {
  task_assigned: "📋",
  task_due: "📅",
  comment: "💬",
  mention: "@",
  queue_stale: "⏳",
  // Compat con mock
  overdue: "⚠️", assigned: "📋", deadline: "📅",
};

function notifTitle(n) {
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
      case "queue_stale":
        return p.task_title
          ? `Task in coda da > 4h: ${p.task_title}`
          : `Task in coda da troppo tempo`;
      default:
        return n.type || "Notifica";
    }
  }
  // Mock legacy
  return n.title || n.type;
}

function notifTime(n) {
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

export const NotificationsPanel = ({ dispatch, notifications, isReal, onMarkRead, onMarkAllRead, onOpenTask }) => {
  const { isMobile } = useViewport();
  const list = Array.isArray(notifications) ? notifications : NOTIFICATIONS;
  const hasUnread = list.some(n => !n.read);
  // Step J: la notifica è "navigabile" se ha un task_id nel payload
  const isNavigable = (n) => isReal && n.payload && n.payload.task_id;
  const handleClick = (n) => {
    if (isNavigable(n)) {
      onOpenTask?.(n.payload.task_id);
      dispatch({ type: "TOGGLE_NOTIF" });
    }
    if (isReal && !n.read) onMarkRead?.(n.id);
  };
  return (
    <div className="slide-right" style={{
      position: isMobile ? "fixed" : "absolute",
      top: isMobile ? 56 : "calc(100% + 8px)",
      right: isMobile ? 12 : 0,
      left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : "min(360px, calc(100vw - 24px))",
      background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
      border: "1px solid var(--border)", overflow: "hidden", zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isReal && hasUnread && (
            <button onClick={() => onMarkAllRead?.()} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
            }}>Segna tutte lette</button>
          )}
          <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {list.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            Nessuna notifica
          </div>
        )}
        {list.map(n => (
          <div
            key={n.id}
            onClick={() => handleClick(n)}
            style={{
              padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
              background: n.read ? "transparent" : "rgba(212,168,67,0.07)",
              borderBottom: "1px solid var(--border)",
              transition: "background 0.2s",
              cursor: isNavigable(n) || (isReal && !n.read) ? "pointer" : "default",
            }}
            onMouseEnter={e => { if (isNavigable(n)) e.currentTarget.style.background = "rgba(212,168,67,0.12)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = n.read ? "transparent" : "rgba(212,168,67,0.07)"; }}
          >
            <span style={{ fontSize: 18, flexShrink: 0 }}>{NOTIF_ICONS[n.type] || "🔔"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{notifTitle(n)}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{notifTime(n)}</div>
            </div>
            {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0, marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  );
};
