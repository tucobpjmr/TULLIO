// ─── TOPBAR ──────────────────────────────────────────────────────────────────
// La barra superiore: logo, ricerca, campanella, utente.
//
// Conteneva anche il pannello di ricerca avanzata, lo switcher utente, il
// toggle push e il pannello notifiche — quattro feature indipendenti in un
// file che si chiama "barra superiore". Ora sono moduli propri e questo file
// fa solo layout e composizione.
import { useState, useRef, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { MOCK_NOTIFICATIONS } from "../../state/mockData.js";
import { AdvancedSearchPanel } from "../search/AdvancedSearchPanel.jsx";
import { NotificationsPanel } from "../notifications/NotificationsPanel.jsx";
import { UserSwitcher } from "./UserSwitcher.jsx";

// ─── TOPBAR ────────────────────────────────────────────────────────────────
export const Topbar = ({ state, dispatch, notifications: notificationsProp, onMarkRead, onMarkAllRead, onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat }) => {
  const { isMobile } = useViewport();
  // Fix #11: notifiche mock gate-ate dietro env var (default off in prod)
  const SHOW_MOCK_NOTIFS = import.meta.env.DEV && import.meta.env.VITE_SHOW_MOCK_NOTIFICATIONS === 'true';
  const realNotifs = Array.isArray(notificationsProp) ? notificationsProp : [];
  const notifList = SHOW_MOCK_NOTIFS ? [...realNotifs, ...MOCK_NOTIFICATIONS] : realNotifs;
  const unread = notifList.filter(n => !n.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const searchWrapRef = useRef(null);

  // Il logo aeroplano funge da pulsante Dashboard (la voce dedicata è stata
  // rimossa da sidebar/bottom-nav).
  const dashActive = state.activeView === "dashboard";
  const goDashboard = () => dispatch({ type: "SET_VIEW", payload: "dashboard" });

  // Chiude il pannello di ricerca al click fuori dal wrapper (input + pannello)
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);
  return (
    // Safe area iPhone: la web view parte sotto la status bar (viewport-fit=cover
    // + black-translucent in index.html), quindi la topbar ha un padding-top pari
    // all'inset e un'altezza maggiorata dello stesso valore. Lo sfondo --sky
    // continua a riempire la zona della status bar/Dynamic Island, ma logo,
    // ricerca, campanella e avatar restano sotto e tappabili.
    <div style={{
      height: "calc(58px + var(--safe-top))", paddingTop: "var(--safe-top)",
      background: "var(--sky)", display: "flex", alignItems: "center",
      paddingLeft: `calc(${isMobile ? 12 : 20}px + var(--safe-left))`,
      paddingRight: `calc(${isMobile ? 12 : 20}px + var(--safe-right))`,
      gap: isMobile ? 8 : 16, position: "sticky", top: 0, zIndex: 100,
      borderBottom: "1px solid rgba(212,168,67,0.3)", flexShrink: 0,
    }}>
      {/* Logo — funge da pulsante Dashboard */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: isMobile ? 0 : 12 }}>
        <button
          onClick={goDashboard}
          title="Dashboard"
          aria-label="Dashboard"
          aria-current={dashActive ? "page" : undefined}
          style={{
            width: 32, height: 32, background: "#fff", borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, cursor: "pointer", padding: 0, position: "relative",
            border: "none", overflow: "hidden",
          }}
        >
          {/* Variante del logo per le dimensioni piccole: ritaglio pieno e tratto
              ispessito, altrimenti a queste dimensioni le linee del disegno spariscono. */}
          <img src="/logo-mark-64.png" alt="" style={{ display: "block", width: 26.6, height: 26.6 }} />
        </button>
        <button
          onClick={goDashboard}
          className="vd-hide-mobile"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          <div className="playfair" style={{ color: "var(--navy)", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>VoyageDesk</div>
          <div style={{ color: "rgba(15,32,68,0.75)", fontSize: 10, letterSpacing: 1.5 }}>TRAVEL MANAGEMENT</div>
        </button>
      </div>

      {/* Ricerca unificata (testuale + filtri avanzati) */}
      <div ref={searchWrapRef} style={{ flex: 1, maxWidth: 520, position: "relative" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(15,32,68,0.7)", fontSize: 14 }}>🔍</div>
          <input
            value={state.searchQuery}
            onChange={e => { dispatch({ type: "SET_SEARCH", payload: e.target.value }); setSearchOpen(true); }}
            onFocus={e => { setSearchOpen(true); e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.borderColor = "rgba(15,32,68,0.15)"; }}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            aria-label="Cerca"
            style={{
              width: "100%", background: "#fff", border: "1px solid rgba(15,32,68,0.15)",
              borderRadius: 8, padding: "7px 12px 7px 36px", color: "var(--navy)", fontSize: 13,
              outline: "none", transition: "all 0.2s", boxSizing: "border-box",
            }}
          />
        </div>
        {searchOpen && (
          <AdvancedSearchPanel
            tasks={state.tasks}
            dispatch={dispatch}
            keyword={state.searchQuery}
            onKeyword={v => dispatch({ type: "SET_SEARCH", payload: v })}
            onClose={() => setSearchOpen(false)}
            currentUserId={state.currentUserId}
          />
        )}
      </div>

      <div className="vd-hide-mobile" style={{ flex: 1 }} />

      {/* Notifications */}
      <div style={{ position: "relative" }}>
        <button onClick={() => dispatch({ type: "TOGGLE_NOTIF" })} style={{
          background: "#fff", border: "1px solid rgba(15,32,68,0.15)",
          borderRadius: 8, width: 36, height: 36, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "relative"
        }}>
          🔔
          {unread > 0 && <span style={{
            position: "absolute", top: -4, right: -4, background: "var(--gold)",
            borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
            color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center"
          }}>{unread}</span>}
        </button>
        {state.showNotif && <NotificationsPanel
          dispatch={dispatch}
          notifications={notifList}
          isReal={!SHOW_MOCK_NOTIFS}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
          onRemoveNotification={onRemoveNotification}
          onClearAllNotifications={onClearAllNotifications}
          onOpenTask={onOpenTask}
          onOpenChat={onOpenChat}
        />}
      </div>

      {/* User switcher (v0.8) */}
      <UserSwitcher state={state} dispatch={dispatch} />
    </div>
  );
};

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
