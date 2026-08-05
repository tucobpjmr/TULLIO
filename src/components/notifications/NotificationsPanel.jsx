// src/components/notifications/NotificationsPanel.jsx
// Il pannello della campanella: elenco filtrabile delle notifiche + il toggle
// Web Push per dispositivo, che ne è il footer.
//
// Icona, titolo, sottotitolo, tempo e destinazione del tap sono funzioni pure
// in lib/notifUtils.js (testate in src/test/notifUtils.test.js): qui resta
// solo il rendering.
import { useState, useEffect, useMemo, useCallback } from "react";
import { useViewport } from "../Viewport.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { MOCK_NOTIFICATIONS } from "../../state/mockData.js";
import { getPushSupport, getPushState, enablePush, disablePush, syncPushSubscription, sendTestPush } from "../../lib/push.js";
import { NOTIF_ICONS, NOTIF_CATEGORIES, notifTitle, notifSubtitle, notifTime, notifTarget } from "../../lib/notifUtils.js";

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
// Helpers per il rendering delle notifiche reali (Step F): icona, titolo,
// sottotitolo, tempo e destinazione del tap vivono in lib/notifUtils.js
// (funzioni pure, testate in src/test/notifUtils.test.js).

// computePresence + PRESENCE_COLORS (usati solo dalla chat) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)

// ─── PUSH TOGGLE ───────────────────────────────────────────────────────────
// Opt-in Web Push per dispositivo (handoff v44): footer del NotificationsPanel.
// Stati: loading | unsupported | needs-install (iOS Safari fuori PWA) |
// denied (permesso negato a livello browser/OS) | off | on | busy.
const PUSH_HINTS = {
  "needs-install": "Su iPhone: apri da Safari → Condividi → \"Aggiungi alla schermata Home\" (richiede iOS 16.4+), poi riapri l'app installata dalla Home.",
  unsupported: "Questo browser non supporta le notifiche push.",
  denied: "Permesso negato: riattivalo dalle impostazioni del browser o del sistema (iPhone: Impostazioni → Notifiche → VoyageDesk).",
  off: "Ricevi le notifiche anche ad app chiusa.",
  on: "Attive su questo dispositivo.",
};

const PushToggle = ({ dispatch }) => {
  const { profile } = useAuth();
  const [status, setStatus] = useState("loading");
  // Sottoscrizione presente nel browser ma assente dal DB: il server non sa
  // più dove inviare (tipico su iPhone dopo un aggiornamento della PWA) e senza
  // questo avviso il toggle resterebbe verde a fronte di zero notifiche.
  const [outOfSync, setOutOfSync] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    const support = getPushSupport();
    if (!support.supported) {
      setStatus(support.needsInstall ? "needs-install" : "unsupported");
      return;
    }
    const s = await getPushState(profile?.id);
    setStatus(s.enabled ? "on" : (s.permission === "denied" ? "denied" : "off"));
    setOutOfSync(s.enabled && !s.synced);
  }, [profile?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async () => {
    if (status === "off") {
      setStatus("busy");
      const { error } = await enablePush(profile?.id);
      if (!error) { setStatus("on"); setOutOfSync(false); return; }
      if (error === "denied") { setStatus("denied"); return; }
      setStatus("off");
      if (error !== "dismissed") {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    } else if (status === "on") {
      setStatus("busy");
      const { error } = await disablePush();
      setStatus(error ? "on" : "off");
      setOutOfSync(false);
      if (error) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    }
  };

  // Ripristina la registrazione di questo dispositivo sul server senza che
  // l'utente debba spegnere e riaccendere il toggle.
  const repair = async () => {
    setStatus("busy");
    const { error } = await syncPushSubscription(profile?.id);
    await refresh();
    dispatch({
      type: "SHOW_TOAST",
      payload: error
        ? { type: "error", message: `Notifiche push: ${error}` }
        : { type: "success", message: "Dispositivo ricollegato alle notifiche push" },
    });
  };

  // Prova end-to-end: se la notifica di sistema non compare entro pochi
  // secondi il problema è nel percorso server → dispositivo, non nell'app.
  const test = async () => {
    setTesting(true);
    const { error } = await sendTestPush();
    setTesting(false);
    dispatch({
      type: "SHOW_TOAST",
      payload: error
        ? { type: "error", message: `Notifica di prova: ${error}` }
        : { type: "success", message: "Notifica di prova inviata: controlla il telefono" },
    });
  };

  if (status === "loading") return null;
  const enabled = status === "on";
  const interactive = status === "on" || status === "off";

  return (
    <div style={{
      padding: "12px 16px", borderTop: "1px solid var(--border)",
      background: "var(--surface2)", display: "flex", gap: 10, alignItems: "flex-start",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>📲</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Notifiche push</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
          {status === "busy" ? "Attendere…" : PUSH_HINTS[status]}
        </div>
        {enabled && outOfSync && (
          <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 6, lineHeight: 1.4 }}>
            ⚠️ Questo dispositivo non risulta registrato sul server: le notifiche
            non arrivano finché non lo ricolleghi.
          </div>
        )}
        {enabled && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {outOfSync && (
              <button onClick={repair} style={{
                background: "var(--navy)", color: "#fff", border: "none", borderRadius: 6,
                padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}>Ricollega dispositivo</button>
            )}
            <button onClick={test} disabled={testing} style={{
              background: "transparent", color: "var(--text-muted)",
              border: "1px solid var(--border)", borderRadius: 6,
              padding: "5px 10px", fontSize: 11, fontWeight: 600,
              cursor: testing ? "default" : "pointer", fontFamily: "inherit", opacity: testing ? 0.6 : 1,
            }}>{testing ? "Invio…" : "Invia notifica di prova"}</button>
          </div>
        )}
      </div>
      {(interactive || status === "busy") && (
        <button
          onClick={toggle}
          disabled={status === "busy"}
          role="switch"
          aria-checked={enabled}
          aria-label="Attiva notifiche push su questo dispositivo"
          style={{
            width: 40, height: 22, borderRadius: 99, border: "none", padding: 2,
            background: enabled ? "var(--success)" : "var(--border)",
            cursor: status === "busy" ? "default" : "pointer",
            display: "flex", justifyContent: enabled ? "flex-end" : "flex-start",
            alignItems: "center", transition: "background 0.2s", flexShrink: 0, marginTop: 2,
            opacity: status === "busy" ? 0.6 : 1,
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
        </button>
      )}
    </div>
  );
};

export const NotificationsPanel = ({ dispatch, notifications, isReal, onMarkRead, onMarkAllRead, onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [filter, setFilter] = useState("all"); // all | unread | task | mention | chat
  const list = Array.isArray(notifications) ? notifications : MOCK_NOTIFICATIONS;
  const hasUnread = list.some(n => !n.read);
  // Filtri (Fase 2 notifiche): conteggi e applicazione filtro.
  const counts = useMemo(() => {
    const c = { all: list.length, unread: 0, task: 0, mention: 0, chat: 0 };
    for (const n of list) {
      if (!n.read) c.unread++;
      if (NOTIF_CATEGORIES.task.includes(n.type)) c.task++;
      else if (NOTIF_CATEGORIES.mention.includes(n.type)) c.mention++;
      else if (NOTIF_CATEGORIES.chat.includes(n.type)) c.chat++;
    }
    return c;
  }, [list]);
  const filteredList = useMemo(() => {
    if (filter === "all") return list;
    if (filter === "unread") return list.filter(n => !n.read);
    const types = NOTIF_CATEGORIES[filter] || [];
    return list.filter(n => types.includes(n.type));
  }, [list, filter]);
  // Navigabile se il payload porta a un task, a una conversazione o a una vista.
  // Il digest coda globale (queue_stale) porta sempre anche task_id (il task
  // più urgente), che notifTarget() fa vincere su target "view": il tap apre
  // quindi sempre il dettaglio del task, mai più una tappa intermedia sulla
  // Dashboard (20260730_queue_stale_notif_direct_task).
  const isNavigable = (n) => isReal && !!notifTarget(n);
  const handleClick = (n) => {
    const target = isReal ? notifTarget(n) : null;
    if (target) {
      if (target.kind === "task") onOpenTask?.(target.taskId);
      else if (target.kind === "chat") onOpenChat?.(target.conversationId);
      else if (target.kind === "view") dispatch({ type: "SET_VIEW", payload: target.view, queue: target.queue });
      dispatch({ type: "TOGGLE_NOTIF" });
    }
    if (isReal && !n.read) onMarkRead?.(n.id);
  };
  const filterBtn = (key, label) => {
    const cnt = counts[key];
    const active = filter === key;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        style={{
          background: active ? "var(--navy)" : "transparent",
          color: active ? "#fff" : "var(--text-muted)",
          border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
          borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >{label}{cnt > 0 && ` (${cnt})`}</button>
    );
  };
  return (
    <div className="slide-right" style={{
      position: isMobile ? "fixed" : "absolute",
      // Come il pannello ricerca: su mobile è fixed, quindi l'offset parte dal
      // bordo fisico dello schermo e va sommato all'inset della status bar.
      top: isMobile ? "calc(56px + var(--safe-top))" : "calc(100% + 8px)",
      right: isMobile ? 12 : 0,
      left: isMobile ? 12 : "auto",
      width: isMobile ? "auto" : "min(360px, calc(100vw - 24px))",
      maxHeight: isMobile ? "calc(100dvh - 76px - var(--safe-top) - var(--safe-bottom))" : undefined,
      display: "flex", flexDirection: "column",
      background: "#fff", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
      border: "1px solid var(--border)", overflow: "hidden", zIndex: 200,
    }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div className="playfair" style={{ fontWeight: 600, fontSize: 15 }}>Notifiche</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isReal && hasUnread && (
            <button onClick={() => onMarkAllRead?.()} style={{
              background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
            }}>Segna tutte lette</button>
          )}
          {isReal && list.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`Cancellare tutte le notifiche?\n\n${list.length} ${list.length === 1 ? "notifica verrà eliminata" : "notifiche verranno eliminate"}. Azione irreversibile.`)) {
                  onClearAllNotifications?.();
                }
              }}
              title="Cancella tutte le notifiche"
              aria-label="Cancella tutte le notifiche"
              style={{
                background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "var(--text-muted)",
              }}
            >🗑️</button>
          )}
          <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
        </div>
      </div>
      {isReal && list.length > 0 && (
        <div style={{
          padding: "8px 12px", borderBottom: "1px solid var(--border)",
          display: "flex", gap: 5, flexWrap: "wrap", background: "var(--surface2)", flexShrink: 0,
        }}>
          {filterBtn("all", "Tutte")}
          {filterBtn("unread", "Non lette")}
          {counts.task > 0 && filterBtn("task", "📋 Task")}
          {counts.mention > 0 && filterBtn("mention", "@ Menzioni")}
          {counts.chat > 0 && filterBtn("chat", "✉️ Chat")}
        </div>
      )}
      {/* flex:1 + minHeight:0 — su mobile il pannello ha un'altezza massima
          legata al viewport (safe area inclusa): la lista è l'unica parte che
          scrolla, testata e toggle push restano sempre visibili. */}
      <div style={{ flex: 1, minHeight: 0, maxHeight: 420, overflowY: "auto" }}>
        {filteredList.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
            {list.length === 0 ? "Nessuna notifica" : "Nessuna notifica per questo filtro"}
          </div>
        )}
        {filteredList.map(n => (
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{notifTitle(n)}</div>
              {notifSubtitle(n) && (
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{notifSubtitle(n)}</div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{notifTime(n)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 2 }}>
              {!n.read && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" }} />}
              {isReal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveNotification?.(n.id); }}
                  title="Elimina notifica"
                  aria-label="Elimina notifica"
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 2,
                    fontSize: 13, lineHeight: 1, color: "var(--text-muted)", opacity: 0.6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = 0.6; }}
                >✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {isReal && <PushToggle dispatch={dispatch} />}
    </div>
  );
};
