// ─── TOPBAR ──────────────────────────────────────────────────────────────────
// La barra superiore: logo, ricerca, campanella, utente.
//
// Conteneva anche il pannello di ricerca avanzata, lo switcher utente, il
// toggle push e il pannello notifiche — quattro feature indipendenti in un
// file che si chiama "barra superiore". Ora sono moduli propri e questo file
// fa solo layout e composizione.
import { useState, useRef, useEffect, memo, lazy } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { demoState } from "../../state/demoState.js";
import { useTasks } from "../../state/TasksContext.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { LazyPanel } from "../ui/LazyPanel.jsx";
import { UserSwitcher } from "./UserSwitcher.jsx";
import { Z } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterMiddle = {
  width: 32, height: 32, background: "#fff", borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center",
  flexShrink: 0, cursor: "pointer", padding: 0, position: "stiliComuni.relative",
  border: "none", overflow: "hidden",
};
const w266H266 = { display: "block", width: 26.6, height: 26.6 };
const boxP0 = { background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" };
const txtF15Bold = { color: "var(--navy)", fontSize: 15, fontWeight: 700, lineHeight: 1 };
const txtF10 = { color: "rgba(15,32,68,0.75)", fontSize: 10, letterSpacing: 1.5 };
const relativeFlex1MaxW520 = { flex: 1, maxWidth: 520, position: "stiliComuni.relative" };
const txtAbsoluteF14 = { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(15,32,68,0.7)", fontSize: 14 };
const boxF13Navy = {
  width: "100%", background: "#fff", border: "1px solid rgba(15,32,68,0.15)",
  borderRadius: 8, padding: "7px 12px 7px 36px", color: "var(--navy)", fontSize: 13,
  outline: "none", transition: "all 0.2s", boxSizing: "border-box",
};
const rowCenterMiddle2 = {
  background: "#fff", border: "1px solid rgba(15,32,68,0.15)",
  borderRadius: 8, width: 36, height: 36, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, position: "stiliComuni.relative"
};
const rowCenterMiddle3 = {
  position: "absolute", top: -4, right: -4, background: "var(--gold)",
  borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700,
  color: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "center"
};

// Chunk async: entrambi sono pannelli a scomparsa (ricerca avanzata dietro il
// focus dell'input, notifiche dietro la campanella), mai visibili al primo
// render. AdvancedSearchPanel porta con sé lib/listeApi.js via
// listeModuleApi.js: renderla lazy toglie anche quello dal bundle eager.
const AdvancedSearchPanel = lazy(() =>
  import("../search/AdvancedSearchPanel.jsx").then(m => ({ default: m.AdvancedSearchPanel }))
);
const NotificationsPanel = lazy(() =>
  import("../notifications/NotificationsPanel.jsx").then(m => ({ default: m.NotificationsPanel }))
);

// ─── TOPBAR ────────────────────────────────────────────────────────────────
// ST-2: riceve le tre fette che consuma e non `state`, ed è `memo` — la stessa
// regola già applicata alle sei viste e ad AdminView. `state` cambia identità
// dopo QUALUNQUE azione (un toast che compare, lo stesso toast che sparisce
// dopo tre secondi, un evento realtime su una tabella che la barra non
// mostra), e finché era una prop ognuna di quelle azioni ri-renderizzava
// l'intero guscio.
//
// `tasks` e `currentUserId` non sono prop: arrivano dai context di dominio e
// servono solo a alimentare AdvancedSearchPanel. Consumare TasksContext
// significa ri-renderizzare quando i task cambiano — che è raro rispetto a
// "qualunque azione", ed è comunque necessario perché il pannello di ricerca
// cerchi sui dati aggiornati.
//
// Questa barra contiene l'input di ricerca, quindi DEVE ri-renderizzarsi a
// ogni carattere: `ricerca` è una prop che cambia per costruzione. Ciò che
// il memo evita è tutto il resto. Sidebar e BottomNav, che non hanno campi di
// input, non si ri-renderizzano più affatto quando si digita.
//
// `ricerca` resta nel guscio (VoyageDeskInner la tiene in `useState` e la
// passa qui insieme a `onSearchChange`) invece di diventare stato locale della
// Topbar: è candidata a diventare un filtro cross-view, e in quel caso deve
// restare leggibile da fuori questo componente. `showNotif`, che nessuno
// legge fuori da qui, è invece `useState` locale — vedi audit ST-2 parte 2.
export const Topbar = memo(function Topbar({
  activeView, ricerca, onSearchChange,
  notifications: notificationsProp, onMarkRead, onMarkAllRead,
  onRemoveNotification, onClearAllNotifications, onOpenTask, onOpenChat,
}) {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const tasks = useTasks();
  const { currentUserId } = useAppData();
  // Fix #11: notifiche mock gate-ate dietro env var (default off in prod).
  // demoState() è dentro lo stesso `&&` di import.meta.env.DEV: in produzione
  // quella costante è `false` a build time, quindi né la chiamata né
  // mockData.js sopravvivono nel bundle (vedi state/demoState.js).
  const SHOW_MOCK_NOTIFS = import.meta.env.DEV && import.meta.env.VITE_SHOW_MOCK_NOTIFICATIONS === 'true';
  const realNotifs = Array.isArray(notificationsProp) ? notificationsProp : [];
  const notifList = SHOW_MOCK_NOTIFS ? [...realNotifs, ...demoState().notifications] : realNotifs;
  const unread = notifList.filter(n => !n.read).length;
  const [searchOpen, setSearchOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const searchWrapRef = useRef(null);

  // Il logo aeroplano funge da pulsante Dashboard (la voce dedicata è stata
  // rimossa da sidebar/bottom-nav).
  const dashActive = activeView === "dashboard";
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
      gap: isMobile ? 8 : 16, position: "sticky", top: 0, zIndex: Z.dropdown,
      borderBottom: "1px solid rgba(212,168,67,0.3)", flexShrink: 0,
    }}>
      {/* Logo — funge da pulsante Dashboard */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: isMobile ? 0 : 12 }}>
        <button
          onClick={goDashboard}
          title="Dashboard"
          aria-label="Dashboard"
          aria-current={dashActive ? "page" : undefined}
          style={rowCenterMiddle}
        >
          {/* Variante del logo per le dimensioni piccole: ritaglio pieno e tratto
              ispessito, altrimenti a queste dimensioni le linee del disegno spariscono. */}
          <img src="/logo-mark-64.png" alt="" style={w266H266} />
        </button>
        <button
          onClick={goDashboard}
          className="vd-hide-mobile"
          style={boxP0}
        >
          <div className="playfair" style={txtF15Bold}>VoyageDesk</div>
          <div style={txtF10}>TRAVEL MANAGEMENT</div>
        </button>
      </div>

      {/* Ricerca unificata (testuale + filtri avanzati) */}
      <div ref={searchWrapRef} style={relativeFlex1MaxW520}>
        <div style={stiliComuni.relative}>
          <div style={txtAbsoluteF14}>🔍</div>
          <input
            value={ricerca}
            onChange={e => { onSearchChange(e.target.value); setSearchOpen(true); }}
            onFocus={e => { setSearchOpen(true); e.target.style.borderColor = "var(--gold)"; }}
            onBlur={e => { e.target.style.borderColor = "rgba(15,32,68,0.15)"; }}
            placeholder={isMobile ? "Cerca..." : "Cerca task, clienti, categorie... (Ctrl+K)"}
            aria-label="Cerca"
            style={boxF13Navy}
          />
        </div>
        {searchOpen && (
          <LazyPanel resetKey="ricerca" onReset={() => setSearchOpen(false)}>
            <AdvancedSearchPanel
              tasks={tasks}
              keyword={ricerca}
              onKeyword={onSearchChange}
              onClose={() => setSearchOpen(false)}
              currentUserId={currentUserId}
            />
          </LazyPanel>
        )}
      </div>

      <div className="vd-hide-mobile" style={stiliComuni.flex1} />

      {/* Notifications */}
      <div style={stiliComuni.relative}>
        <button onClick={() => setShowNotif(v => !v)} style={rowCenterMiddle2}>
          🔔
          {unread > 0 && <span style={rowCenterMiddle3}>{unread}</span>}
        </button>
        {showNotif && (
          <LazyPanel resetKey="notifiche" onReset={() => setShowNotif(false)}>
            <NotificationsPanel
              onClose={() => setShowNotif(false)}
              notifications={notifList}
              isReal={!SHOW_MOCK_NOTIFS}
              onMarkRead={onMarkRead}
              onMarkAllRead={onMarkAllRead}
              onRemoveNotification={onRemoveNotification}
              onClearAllNotifications={onClearAllNotifications}
              onOpenTask={onOpenTask}
              onOpenChat={onOpenChat}
            />
          </LazyPanel>
        )}
      </div>

      {/* User switcher (v0.8) — non riceve `state`: l'unico campo che leggeva
          (currentUserId) è già in AppDataContext. */}
      <UserSwitcher />
    </div>
  );
});

// ─── SIDEBAR ───────────────────────────────────────────────────────────────
