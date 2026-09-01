// src/components/notifications/NotificationsPanel.jsx
// Il pannello della campanella: elenco filtrabile delle notifiche + il toggle
// Web Push per dispositivo, che ne è il footer.
//
// Icona, titolo, sottotitolo, tempo e destinazione del tap sono funzioni pure
// in lib/notifUtils.js (testate in src/test/notifUtils.test.js): qui resta
// solo il rendering.
import { useState, useMemo } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { NOTIF_ICONS, NOTIF_CATEGORIES, notifTitle, notifSubtitle, notifTime, notifTarget } from "../../lib/notifUtils.js";
import { Z } from "../../styles/tokens.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { PushToggle } from "./PushToggle.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { attivaConTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = { padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexShrink: 0 };
const txtF15Bold = { fontWeight: 600, fontSize: 15 };
const boxF11Muted = {
  background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
  padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "var(--text-muted)",
};
const boxF13Muted = {
  background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
  padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "var(--text-muted)",
};
const rowGap5 = {
  padding: "8px 12px", borderBottom: "1px solid var(--border)",
  display: "flex", gap: 5, flexWrap: "wrap", background: "var(--surface2)", flexShrink: 0,
};
const flex1 = { flex: 1, minHeight: 0, maxHeight: 420, overflowY: "auto" };
const txtF12Muted = { padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 };
const txtF18 = { fontSize: 18, flexShrink: 0 };
const txtF11Muted = {
  fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.35,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const txtF11Muted2 = { fontSize: 11, color: "var(--text-muted)", marginTop: 2 };
const rowCenterGap6 = { display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 2 };
const boxW7H7 = { width: 7, height: 7, borderRadius: "50%", background: "var(--gold)" };
const boxF13Muted2 = {
  background: "none", border: "none", cursor: "pointer", padding: 2,
  fontSize: 13, lineHeight: 1, color: "var(--text-muted)", opacity: 0.6,
};

// ─── NOTIFICATIONS PANEL ───────────────────────────────────────────────────
// Helpers per il rendering delle notifiche reali (Step F): icona, titolo,
// sottotitolo, tempo e destinazione del tap vivono in lib/notifUtils.js
// (funzioni pure, testate in src/test/notifUtils.test.js).

// Identità stabile per il fallback di `list` sotto: un `[]` inline nella
// ternaria sarebbe un array nuovo a ogni render in cui scatta, invalidando le
// dipendenze dei due useMemo che leggono `list`.
const EMPTY_NOTIFICATIONS = [];

// computePresence + PRESENCE_COLORS (usati solo dalla chat) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)

export const NotificationsPanel = ({ onClose, notifications, isReal, onMarkRead, onMarkAllRead, onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat }) => {
  const dispatch = useDispatch();
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const [filter, setFilter] = useState("all"); // all | unread | task | mention | chat
  // `notifications` è sempre un array a runtime (Topbar lo costruisce con
  // spread da state vuoto o idratato, mai altro): il fallback non serviva a
  // mostrare dati demo, solo a non rompersi se qualcuno passasse `undefined`.
  const list = Array.isArray(notifications) ? notifications : EMPTY_NOTIFICATIONS;
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
      onClose?.();
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
      border: "1px solid var(--border)", overflow: "hidden", zIndex: Z.panel,
    }}>
      <div style={rowCenterBetween}>
        <div className="playfair" style={txtF15Bold}>Notifiche</div>
        <div style={stiliComuni.rowCenterGap8}>
          {isReal && hasUnread && (
            <button onClick={() => onMarkAllRead?.()} style={boxF11Muted}>Segna tutte lette</button>
          )}
          {isReal && list.length > 0 && (
            <button
              onClick={async () => {
                const ok = await conferma({
                  title: "Cancellare tutte le notifiche?",
                  body: `${list.length} ${list.length === 1 ? "notifica verrà eliminata" : "notifiche verranno eliminate"}. Azione irreversibile.`,
                  cta: "Cancella tutte", danger: true,
                });
                if (ok) onClearAllNotifications?.();
              }}
              title="Cancella tutte le notifiche"
              aria-label="Cancella tutte le notifiche"
              style={boxF13Muted}
            >🗑️</button>
          )}
          <button onClick={onClose} style={stiliComuni.btnChiudi}>✕</button>
        </div>
      </div>
      {isReal && list.length > 0 && (
        <div style={rowGap5}>
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
      <div style={flex1}>
        {filteredList.length === 0 && (
          <div style={txtF12Muted}>
            {list.length === 0 ? "Nessuna notifica" : "Nessuna notifica per questo filtro"}
          </div>
        )}
        {filteredList.map(n => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => handleClick(n)}
            onKeyDown={attivaConTastiera(() => handleClick(n))}
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
            <span style={txtF18}>{NOTIF_ICONS[n.type] || "🔔"}</span>
            <div className="vd-flex-1-min0">
              <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600 }}>{notifTitle(n)}</div>
              {notifSubtitle(n) && (
                <div style={txtF11Muted}>{notifSubtitle(n)}</div>
              )}
              <div style={txtF11Muted2}>{notifTime(n)}</div>
            </div>
            <div style={rowCenterGap6}>
              {!n.read && <div style={boxW7H7} />}
              {isReal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveNotification?.(n.id); }}
                  title="Elimina notifica"
                  aria-label="Elimina notifica"
                  style={boxF13Muted2}
                  onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = 0.6; }}
                >✕</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {isReal && <PushToggle />}
    </div>
  );
};
