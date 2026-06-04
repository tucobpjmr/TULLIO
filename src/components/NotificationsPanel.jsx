import { useViewport } from "../hooks/useViewport.js";
import { NOTIFICATIONS } from "../data/mockData.js";

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
const NotificationsPanel = ({ dispatch }) => {
  const { isMobile } = useViewport();
  const icons = { overdue: "⚠️", assigned: "📋", comment: "💬", deadline: "📅" };
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
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
      </div>
      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {NOTIFICATIONS.map(n => (
          <div key={n.id} style={{
            padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start",
            background: n.read ? "transparent" : "rgba(212,168,67,0.07)",
            borderBottom: "1px solid var(--border)",
            transition: "background 0.2s", cursor: "default",
          }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{icons[n.type]}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{n.time}</div>
            </div>
            {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)", flexShrink: 0, marginTop: 4 }} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NotificationsPanel;
