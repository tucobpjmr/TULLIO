
import { useState, useReducer, createContext, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
// xlsx (SheetJS, ~430KB) è caricato on-demand via import() dinamico solo
// quando l'utente importa o esporta un file (vedi loadXLSX). Tenerlo fuori
// dal bundle iniziale è il singolo guadagno più grande sul chunk principale.
import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Conversations as ConversationsAPI, Messages as MessagesAPI,
  Notifications as NotificationsAPI, Users as UsersAPI,
  Clients as ClientsAPI,
  Categories as CategoriesAPI,
  subscribeToTable,
} from "./lib/api.js";
import {
  toDbTask, toDbTaskPatch, fromDbTask,
  toDbNotice, toDbNoticePatch, fromDbNotice,
  toDbConversation, fromDbConversation,
  toDbMessage, fromDbMessage,
  fromDbNotification,
  fromDbClient, toDbClient,
  fromDbCategory, toDbCategory,
  newId, isUuid,
} from "./lib/mappers.js";
// Step O: logout UI — signOut vive in AuthContext, qui viene solo cablato.
import { useAuth } from "./auth/AuthContext.jsx";
// Step P Phase 2a: utility pure estratte dal monolite.
import { getActiveTasks } from "./lib/taskUtils.js";
import { scopeConversationsForUser } from "./lib/chatUtils.js";
// Step P Phase 2b: dati mock (solo le notifiche, le altre seed vivono nel reducer).
// Step P Phase 2c: globals mutabili e helper permessi estratti.
import { getMember, canEditTask, canViewTask, canCreateTaskCategory, isAdmin } from "./state/appGlobals.js";
// Step P Phase 2d: reducer e factory dell'initial state estratti.
import { reducer, makeInitialState, ADMIN_ONLY_ACTIONS } from "./state/reducer.js";
// Caveat #10: hook che astrae idratazione + subscribe realtime debounced.
import { useDebouncedTableSubscription } from "./hooks/useDebouncedTableSubscription.js";
// Step P Phase 2e: foundation + UI primitives estratti in src/components/.
import { ViewportProvider } from "./components/Viewport.jsx";
import { Toast } from "./components/ui/Toast.jsx";
// Step P Phase 2f: modali estratti in src/components/modals/.
// Step P Phase 2g: BulkTaskCreator è pesante (~600 righe, 5 tab) e si apre solo
// on-demand → lazy-loaded come chunk async per alleggerire il bundle iniziale.
const BulkTaskCreator = lazy(() =>
  import("./components/modals/BulkTaskCreator.jsx").then(m => ({ default: m.BulkTaskCreator }))
);
// AIDayPlanner e NoticeEditorModal sono ora consumati direttamente dai
// componenti dashboard (Dashboard.jsx / NoticeBoard.jsx), non più da qui.
import { QuickAddTask } from "./components/modals/QuickAddTask.jsx";

// Step P Phase 2f: dashboard estratto in src/components/dashboard/.
import { Dashboard } from "./components/dashboard/Dashboard.jsx";

// Step P Phase 2f: calendar estratto in src/components/calendar/.
import { CalendarPlanner } from "./components/calendar/CalendarPlanner.jsx";

// Step P Phase 2f: chat estratto in src/components/chat/.
import { ChatPanel, getUnreadCount } from "./components/chat/ChatPanel.jsx";

// Step P Phase 2f: tasks estratto in src/components/tasks/.
// Step P Phase 2g: TaskSlideOver appare solo quando si seleziona un task →
// lazy-loaded come chunk async.
const TaskSlideOver = lazy(() =>
  import("./components/tasks/TaskSlideOver.jsx").then(m => ({ default: m.TaskSlideOver }))
);

// Step P Phase 2f: views estratte in src/components/views/.
import { Team } from "./components/views/Team.jsx";
import { Trash } from "./components/views/Trash.jsx";
import { Archive } from "./components/views/Archive.jsx";
import { ClientiView } from "./components/clients/ClientiView.jsx";

// Step P Phase 2f: shell estratto in src/components/shell/.
import { Topbar } from "./components/shell/Topbar.jsx";
import { Sidebar } from "./components/shell/Sidebar.jsx";
import { BottomNav } from "./components/shell/Sidebar.jsx";
import { FAB } from "./components/shell/FAB.jsx";

// Step P Phase 2f: admin estratto in src/components/admin/.
// Step P Phase 2g: AdminView è la vista più pesante (~900 righe, 5 tab, import
// xlsx) e visibile solo agli admin → lazy-loaded come chunk async.
const AdminView = lazy(() =>
  import("./components/admin/AdminView.jsx").then(m => ({ default: m.AdminView }))
);

// ─── XLSX LAZY LOADER ──────────────────────────────────────────────────────
// loadXLSX → src/lib/xlsx.js (Step P Phase 2f)

// ─── GOOGLE FONTS ──────────────────────────────────────────────────────────
const FontLoader = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --navy: #0F2044;
      --navy-light: #1a3060;
      --navy-dark: #08152d;
      --sky: #D0EEF9;
      --gold: #D4A843;
      --gold-light: #e8c46a;
      --gold-dark: #b8902e;
      --surface: #FAFAF7;
      --surface2: #F0EEE8;
      --surface3: #E8E5DC;
      --success: #2D7A4F;
      --warning: #C8832A;
      --danger: #C0392B;
      --text: #1A1A2E;
      --text-muted: #6B6B80;
      --text-light: #9999AA;
      --border: #E0DDD5;
      /* Token semantici per le superfici contenuti:
         --card  = superficie card (sostituisce gli "#fff" inline dei contenuti)
         --heading = titoli su card (sostituisce "color: var(--navy)" nei contenuti). */
      --card: #ffffff;
      --card2: #F7F6F2;
      --heading: var(--navy);
      color-scheme: light;
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--text); transition: background 0.2s ease, color 0.2s ease; }
    .playfair { font-family: 'Playfair Display', serif; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--gold-dark); }
    .drag-over { outline: 2px dashed var(--gold); background: rgba(212,168,67,0.07) !important; }
    .dragging { opacity: 0.4; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    @keyframes slideRight { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
    @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
    @keyframes toastIn { from { transform:translateY(80px); opacity:0; } to { transform:translateY(0); opacity:1; } }
    @keyframes toastOut { to { transform:translateY(80px); opacity:0; } }
    @keyframes recordPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(192,57,43,0.5); } 50% { box-shadow: 0 0 0 12px rgba(192,57,43,0); } }
    @keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
    @keyframes typing { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    .record-pulse { animation: recordPulse 1.5s ease infinite; }
    .fade-in { animation: fadeIn 0.3s ease forwards; }
    .slide-right { animation: slideRight 0.3s ease forwards; }
    .slide-up { animation: slideUp 0.35s ease forwards; }
    .skeleton { animation: pulse 1.5s ease infinite; background: linear-gradient(90deg, var(--surface2) 25%, var(--surface3) 50%, var(--surface2) 75%); background-size: 200% 100%; }
    .hover-lift { transition: transform 0.2s ease, box-shadow 0.2s ease; }
    .hover-lift:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(15,32,68,0.12); }

    /* ─── RESPONSIVE ─── */
    /* Griglie adattive: collassano su tablet/mobile via media query.
       Gli stili inline restano il default desktop; queste regole hanno la priorità grazie a !important. */
    @media (max-width: 1024px) {
      .vd-grid-kpi { grid-template-columns: repeat(2, 1fr) !important; }
      .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main { grid-template-columns: 1fr 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 18px !important; }
    }
    @media (max-width: 640px) {
      .vd-grid-kpi, .vd-grid-2col, .vd-grid-3col, .vd-grid-dash-main,
      .vd-grid-collapse { grid-template-columns: 1fr !important; }
      .vd-grid-dash-main > * { grid-column: auto !important; }
      .vd-pad { padding: 14px !important; }
      .vd-hide-mobile { display: none !important; }
      .vd-row-wrap { flex-wrap: wrap !important; }
    }
    /* Bottom nav: solo mobile/tablet */
    .vd-bottom-nav { display: none; }
    @media (max-width: 1024px) {
      .vd-bottom-nav {
        display: flex;
        position: fixed; bottom: 0; left: 0; right: 0; z-index: 450;
        background: var(--sky); border-top: 1px solid rgba(212,168,67,0.3);
        padding: 6px 4px env(safe-area-inset-bottom, 6px);
        justify-content: space-around; align-items: stretch;
        box-shadow: 0 -4px 20px rgba(0,0,0,0.25);
      }
      .vd-main-scroll { padding-bottom: 70px !important; }
    }
    /* ─── MODALI / SCHEDE: viewport dinamico (fix iOS Safari) ───
       Su Safari iOS le unità "vh" si riferiscono al viewport GRANDE (barre del
       browser nascoste): un modale centrato alto 90vh sfora l'area realmente
       visibile e il footer (es. il pulsante "Salva") finisce fuori schermo o
       dietro la bottom-nav, risultando irraggiungibile. "dvh" = altezza del
       viewport DINAMICO (cambia quando compaiono/scompaiono le barre), quindi il
       contenuto sta sempre dentro lo schermo visibile. La doppia dichiarazione
       (vh poi dvh) è un fallback: i browser che non conoscono dvh ignorano la
       seconda riga e usano vh. */
    .vd-modal-mh { max-height: 90vh; max-height: 90dvh; }
    .vd-sheet-full { height: 100vh; height: 100dvh; }
    @media (max-width: 1024px) {
      /* Mobile/tablet: lascia spazio alla bottom-nav (~64px + safe-area) così il
         footer del modale resta sopra di essa e tappabile, senza sovrapposizioni. */
      .vd-modal-mh { max-height: calc(100dvh - 76px); }
    }
  `}</style>
);

// ─── VIEWPORT (responsive) ─────────────────────────────────────────────────
// ViewportContext, useViewport, ViewportProvider → src/components/Viewport.jsx (Step P Phase 2e)

// ─── CONTEXT ───────────────────────────────────────────────────────────────
const AppContext = createContext(null);
// reducer, makeInitialState (+ baseReducer, buildLogEntry, LOGGED_ACTIONS,
// ADMIN_ONLY_ACTIONS) → src/state/reducer.js

// ─── UTILS ─────────────────────────────────────────────────────────────────
// formatDate, formatTime, getDayKey, isOverdue, isUrgent, isActiveTask,
// getActiveTasks, getTrashedTasks, isMyTask, isInGlobalQueue → src/lib/taskUtils.js
// getMember, getAssignableTeam, getRoleType, isAdmin, isDriver,
// canViewTask, canEditTask, canCreateTaskCategory, canAccessAdmin,
// getAvailableCategories, getVisibleTasks → src/state/appGlobals.js

// ─── SWIPE ACTIONS / UI PRIMITIVES ─────────────────────────────────────────
// SwipeActions → src/components/SwipeActions.jsx (Step P Phase 2e)
// Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast → src/components/ui/

// ─── ADVANCED SEARCH PANEL ─────────────────────────────────────────────────
// Pannello di ricerca unificato: la keyword è controllata dall'input lente nella
// Topbar (props keyword / onKeyword), i filtri avanzati restano locali al pannello.
// Topbar + AdvancedSearchPanel/UserSwitcher/NotificationsPanel → src/components/shell/Topbar.jsx (Step P Phase 2f)
// Sidebar + BottomNav + NavBadge + NAV helpers → src/components/shell/Sidebar.jsx (Step P Phase 2f)

const initialConversations = [
  {
    id: "c1", type: "direct", participants: ["marco", "sofia"], name: null,
    pinned: true,
  },
  {
    id: "c2", type: "direct", participants: ["marco", "roberto"], name: null,
  },
  {
    id: "c3", type: "direct", participants: ["marco", "luca"], name: null,
  },
  {
    id: "c4", type: "group", participants: ["marco", "sofia", "luca", "roberto", "giulia"],
    name: "Team VoyageDesk", icon: "🌍",
  },
  {
    id: "c5", type: "group", participants: ["marco", "sofia", "roberto"],
    name: "Pratica Maldive - Rossi", icon: "🏝️",
  },
  {
    id: "c6", type: "group", participants: ["marco", "sofia", "luca"],
    name: "Marketing & Promo", icon: "📣",
  },
  {
    id: "c7", type: "direct", participants: ["marco", "giulia"], name: null,
  },
];

const t = (minAgo) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - minAgo);
  return d.toISOString();
};

const initialMessages = {
  c1: [
    { id: "m1", sender: "sofia", type: "text", text: "Ciao Marco, ho contattato Four Seasons per i Rossi 🌊", time: t(180), readBy: ["marco", "sofia"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto! Hanno confermato i bungalow?", time: t(175), readBy: ["marco", "sofia"], replyTo: "m1" },
    { id: "m3", sender: "sofia", type: "text", text: "Sì, 2 overwater bungalow disponibili dal 15 al 22. Aspetto conferma sul prezzo finale.", time: t(170), readBy: ["marco", "sofia"], reactions: { "👍": ["marco"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 28, time: t(120), readBy: ["marco", "sofia"], waveform: [0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.5, 0.9, 0.7, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.4, 0.5, 0.8, 0.6, 0.4, 0.7, 0.5, 0.3, 0.6, 0.8, 0.5, 0.4, 0.6, 0.7] },
    { id: "m5", sender: "marco", type: "text", text: "Ok ricevuto, ascolto subito", time: t(115), readBy: ["marco", "sofia"] },
    { id: "m6", sender: "sofia", type: "file", fileName: "Preventivo_Maldive_Rossi.pdf", fileSize: "342 KB", fileType: "pdf", time: t(45), readBy: ["marco", "sofia"], reactions: { "🔥": ["marco"], "✅": ["marco"] } },
    { id: "m7", sender: "sofia", type: "text", text: "Ti ho mandato il preventivo aggiornato 📎", time: t(44), readBy: ["marco", "sofia"] },
    { id: "m8", sender: "marco", type: "text", text: "Grande, lo guardo nel pomeriggio 👍", time: t(30), readBy: ["marco", "sofia"] },
    { id: "m9", sender: "sofia", type: "text", text: "Una cosa, il cliente chiede transfer privato in idrovolante - lo includiamo?", time: t(5), readBy: ["sofia"] },
  ],
  c2: [
    { id: "m1", sender: "roberto", type: "text", text: "Marco, ho emesso la polizza Allianz per la famiglia Rossi", time: t(360), readBy: ["marco", "roberto"] },
    { id: "m2", sender: "marco", type: "text", text: "Perfetto Roberto, importo finale?", time: t(355), readBy: ["marco", "roberto"] },
    { id: "m3", sender: "roberto", type: "text", text: "€342 totali per 4 persone, annullamento + medica", time: t(350), readBy: ["marco", "roberto"] },
    { id: "m4", sender: "roberto", type: "file", fileName: "Polizza_Rossi_Allianz.pdf", fileSize: "186 KB", fileType: "pdf", time: t(348), readBy: ["marco", "roberto"] },
    { id: "m5", sender: "marco", type: "text", text: "Ricevuto, archiviato nel CRM ✓", time: t(60), readBy: ["marco", "roberto"] },
  ],
  c3: [
    { id: "m1", sender: "luca", type: "text", text: "Ciao! Newsletter giugno al 60%, ti mando bozza?", time: t(240), readBy: ["marco", "luca"] },
    { id: "m2", sender: "marco", type: "text", text: "Sì certo, mandala", time: t(235), readBy: ["marco", "luca"] },
    { id: "m3", sender: "luca", type: "voice", duration: 42, time: t(200), readBy: ["marco", "luca"], waveform: [0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.9, 0.6, 0.4, 0.5, 0.8, 0.7, 0.3, 0.6, 0.9, 0.5, 0.4, 0.7, 0.6, 0.8, 0.5, 0.3, 0.6, 0.4, 0.7, 0.5, 0.8, 0.6, 0.4, 0.3] },
    { id: "m4", sender: "marco", type: "text", text: "Buona idea per la sezione Grecia 🇬🇷", time: t(190), readBy: ["marco", "luca"] },
  ],
  c4: [
    { id: "m1", sender: "marco", type: "text", text: "Buongiorno team! Ricordo la riunione operativa di venerdì alle 10 ☕", time: t(480), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m2", sender: "sofia", type: "text", text: "Confermo presenza", time: t(475), readBy: ["marco", "sofia", "luca", "roberto"], reactions: { "👍": ["marco", "luca"] } },
    { id: "m3", sender: "luca", type: "text", text: "Ci sarò ✋", time: t(470), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m4", sender: "roberto", type: "text", text: "Presente. Porto il report Q1 stampato", time: t(465), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m5", sender: "giulia", type: "text", text: "Io arrivo alle 10:15, ho transfer Bianchi alle 9", time: t(450), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m6", sender: "marco", type: "text", text: "Nessun problema Giulia, ti aggiorniamo dopo", time: t(440), readBy: ["marco", "sofia", "luca", "roberto", "giulia"] },
    { id: "m7", sender: "sofia", type: "file", fileName: "Agenda_Riunione_Venerdi.docx", fileSize: "24 KB", fileType: "doc", time: t(120), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m8", sender: "sofia", type: "text", text: "Ecco l'agenda della riunione, date un'occhiata 📋", time: t(119), readBy: ["marco", "sofia", "luca", "roberto"] },
    { id: "m9", sender: "luca", type: "text", text: "Aggiungo un punto sul nuovo template newsletter?", time: t(20), readBy: ["marco", "luca"] },
  ],
  c5: [
    { id: "m1", sender: "sofia", type: "text", text: "Aggiornamento Pratica Rossi: voli confermati, hotel in conferma", time: t(360), readBy: ["marco", "sofia", "roberto"] },
    { id: "m2", sender: "roberto", type: "text", text: "Polizza emessa oggi ✓", time: t(300), readBy: ["marco", "sofia", "roberto"], reactions: { "🎉": ["sofia", "marco"] } },
    { id: "m3", sender: "marco", type: "text", text: "Ottimo lavoro squadra, cliente molto contento al telefono ieri", time: t(280), readBy: ["marco", "sofia", "roberto"], reactions: { "❤️": ["sofia"], "🙌": ["roberto"] } },
    { id: "m4", sender: "sofia", type: "voice", duration: 15, time: t(180), readBy: ["marco", "sofia", "roberto"], waveform: [0.5, 0.7, 0.9, 0.4, 0.6, 0.8, 0.5, 0.3, 0.7, 0.6, 0.8, 0.5, 0.4, 0.7, 0.6] },
    { id: "m5", sender: "roberto", type: "text", text: "Acconto del 30% richiesto via mail", time: t(10), readBy: ["marco", "roberto"] },
  ],
  c6: [
    { id: "m1", sender: "luca", type: "text", text: "Ho qualche idea per la campagna autunno 2025 🍁", time: t(720), readBy: ["marco", "sofia", "luca"] },
    { id: "m2", sender: "sofia", type: "text", text: "Sparami!", time: t(715), readBy: ["marco", "sofia", "luca"] },
    { id: "m3", sender: "luca", type: "text", text: "Pensavo: Foliage Canada, Halloween NYC, Dolomiti d'oro. Cosa ne dite?", time: t(710), readBy: ["marco", "sofia", "luca"], reactions: { "🔥": ["sofia"], "💡": ["marco"] } },
    { id: "m4", sender: "marco", type: "text", text: "Mi piacciono tutte e tre. Iniziamo con Foliage che è il più richiesto", time: t(700), readBy: ["marco", "sofia", "luca"] },
  ],
  c7: [
    { id: "m1", sender: "giulia", type: "text", text: "Marco, transfer Bianchi confermato per martedì 6:45", time: t(60), readBy: ["marco", "giulia"] },
    { id: "m2", sender: "marco", type: "text", text: "Grazie Giulia. NCC stesso autista?", time: t(55), readBy: ["marco", "giulia"] },
    { id: "m3", sender: "giulia", type: "text", text: "Sì, Antonio. Sa già del volo ANA", time: t(50), readBy: ["marco", "giulia"] },
  ],
};

// ChatPanel + sotto-componenti chat (ChatContext, ConversationView/List, ChatMessage, VoicePlayer, ...) → src/components/chat/ChatPanel.jsx (Step P Phase 2f)

// ─── FLOATING ACTION BUTTON ────────────────────────────────────────────────
// FAB → src/components/shell/FAB.jsx (Step P Phase 2f)

// ─── TRASH (CESTINO) ───────────────────────────────────────────────────────
// Trash → src/components/views/Trash.jsx (Step P Phase 2f)

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
// AdminView + tab (Team/IO/Stats/Categories/Log) → src/components/admin/AdminView.jsx (Step P Phase 2f)

// stili admin condivisi (sectionH/cardStyle/btnPrimary/modalOverlay/...) → src/components/admin/adminStyles.js (Step P Phase 2f)

// ─── ADMIN ROLLBACK BANNER ────────────────────────────────────────────────
// Mostrato quando si passa come Admin: countdown 60s → auto-ripristino utente.
// La logica tick è locale al componente; non inquina lo state globale con date.
const ROLLBACK_SECS = 60;

function AdminRollbackBanner({ rollbackTo, switchedAt, dispatch }) {
  const [secs, setSecs] = useState(() => {
    if (!switchedAt) return ROLLBACK_SECS;
    const elapsed = Math.floor((Date.now() - new Date(switchedAt).getTime()) / 1000);
    return Math.max(0, ROLLBACK_SECS - elapsed);
  });
  const secsRef = useRef(secs);
  secsRef.current = secs;

  useEffect(() => {
    if (!switchedAt || !rollbackTo) return;
    const iv = setInterval(() => {
      setSecs(prev => {
        if (prev <= 1) {
          clearInterval(iv);
          dispatch({ type: "SET_CURRENT_USER", payload: rollbackTo });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [switchedAt, rollbackTo, dispatch]);

  const rollbackMember = rollbackTo
    ? (typeof getMember === "function" ? getMember(rollbackTo) : null)
    : null;

  return (
    <div style={{
      background: "#C8832A", color: "#fff", fontSize: 13, fontWeight: 500,
      padding: "6px 16px", display: "flex", alignItems: "center", gap: 10,
      justifyContent: "space-between", flexWrap: "wrap",
      boxShadow: "0 2px 8px rgba(200,131,42,0.35)",
    }}>
      <span>
        ⏱ Sessione Admin attiva — ripristino automatico
        {rollbackMember ? ` a ${rollbackMember.name}` : ""} tra{" "}
        <strong>{secs}s</strong>
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => dispatch({ type: "CANCEL_ADMIN_ROLLBACK" })}
          style={{
            background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.5)",
            color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
          }}
        >
          Rimani come Admin
        </button>
        {rollbackTo && (
          <button
            onClick={() => dispatch({ type: "SET_CURRENT_USER", payload: rollbackTo })}
            style={{
              background: "#fff", border: "none",
              color: "#C8832A", borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              fontSize: 12, fontWeight: 700,
            }}
          >
            Torna ora →
          </button>
        )}
      </div>
    </div>
  );
}

// ─── LAZY FALLBACK ─────────────────────────────────────────────────────────
// Spinner mostrato mentre un chunk lazy (Step P Phase 2g: AdminView,
// BulkTaskCreator, TaskSlideOver) viene scaricato. `overlay` lo centra a tutto
// schermo per i modali; altrimenti riempie l'area della vista.
const LazyFallback = ({ overlay = false }) => {
  const ring = (size, track, top) => (
    <div style={{
      width: size, height: size,
      border: `3px solid ${track}`, borderTopColor: top,
      borderRadius: "50%", animation: "spin 0.8s linear infinite",
    }} />
  );
  if (overlay) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 500,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(8,21,45,0.35)",
      }}>
        {ring(40, "rgba(255,255,255,0.3)", "var(--gold)")}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      {ring(34, "var(--surface3)", "var(--gold)")}
    </div>
  );
};

// ─── KEYBOARD SHORTCUTS OVERLAY (v2.8 Round 10) ────────────────────────────
const SHORTCUTS = [
  { key: "K",       desc: "Nuovo task rapido" },
  { key: "Ctrl+K",  desc: "Cerca (focus barra ricerca)" },
  { key: "?",       desc: "Mostra queste scorciatoie" },
  { key: "Esc",     desc: "Chiudi pannello / modal" },
];

function KeyboardHelpOverlay({ onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1100,
      background: "rgba(8,21,45,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="slide-up" style={{
        background: "var(--card)", borderRadius: 14, padding: "28px 32px",
        width: "min(420px, 96vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)" }}>Scorciatoie tastiera</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SHORTCUTS.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.desc}</span>
              <kbd style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: "3px 10px", borderRadius: 6, fontSize: 12, fontFamily: "monospace",
                background: "var(--surface2)", border: "1px solid var(--border)",
                color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap",
              }}>{s.key}</kbd>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Premi <strong>Esc</strong> o clicca fuori per chiudere
        </div>
      </div>
    </div>
  );
}

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function VoyageDesk({ initialTeam, initialCurrentUserId } = {}) {
  return (
    <ViewportProvider>
      <VoyageDeskInner
        initialTeam={initialTeam}
        initialCurrentUserId={initialCurrentUserId}
      />
    </ViewportProvider>
  );
}

function VoyageDeskInner({ initialTeam, initialCurrentUserId }) {
  const [state, rawDispatch] = useReducer(
    reducer,
    { team: initialTeam, currentUserId: initialCurrentUserId },
    makeInitialState
  );

  // Modalità DB: attiva solo se AuthContext ha fornito un team reale.
  // Senza, l'app resta sui mock (dev/preview senza login).
  const useSupabase = Array.isArray(initialTeam) && initialTeam.length > 0;

  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  // Caveat #10: il pattern reload+debounce+gen-counter vive in
  // useDebouncedTableSubscription; le tasks ascoltano anche comments e
  // task_history (cronologia per-task, sessione 42).
  useDebouncedTableSubscription(["tasks", "comments", "task_history"], async (isCurrent) => {
    // includeDeleted: true → portiamo anche le task soft-deleted nello stato,
    // altrimenti la ri-idratazione realtime (che parte subito dopo un DELETE_TASK)
    // le filtrerebbe via, svuotando il Cestino. Le viste attive (Dashboard,
    // Calendario) filtrano comunque con getActiveTasks/isActiveTask, quindi le
    // cestinate restano confinate alla vista Cestino.
    const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Tasks.list", error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento task fallito: ${error.message || ""}` } });
      return;
    }
    rawDispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
  }, { enabled: useSupabase, deps: [useSupabase] });

  useDebouncedTableSubscription(["notices"], async (isCurrent) => {
    const { data, error } = await NoticesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Notices.list", error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento avvisi fallito: ${error.message || ""}` } });
      return;
    }
    rawDispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
  }, { enabled: useSupabase, deps: [useSupabase] });

  // Idratazione + realtime categorie task (Admin → Categorie). Prima di questa
  // sub, ADD_CATEGORY/UPDATE_CATEGORY/REMOVE_CATEGORY toccavano solo lo stato
  // React in memoria: una categoria creata spariva al primo reload perché non
  // veniva mai scritta su Supabase (vedi migration 20260630_categories_table).
  useDebouncedTableSubscription(["categories"], async (isCurrent) => {
    const { data, error } = await CategoriesAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Categories.list", error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento categorie fallito: ${error.message || ""}` } });
      return;
    }
    const categories = {};
    for (const row of data || []) {
      const c = fromDbCategory(row);
      categories[c.key] = { label: c.label, icon: c.icon, color: c.color, bg: c.bg };
    }
    rawDispatch({ type: "SET_CATEGORIES", payload: categories });
  }, { enabled: useSupabase, deps: [useSupabase] });

  // Loading state chat: true finché non completa il primo reload da Supabase.
  // Evita il flash "nessun messaggio" mentre l'idratazione è in volo.
  const [chatLoading, setChatLoading] = useState(useSupabase);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  const [notifications, setNotifications] = useState([]);
  useDebouncedTableSubscription(["notifications"], async (isCurrent) => {
    const { data, error } = await NotificationsAPI.list({ limit: 100 });
    if (!isCurrent()) return;
    if (error) {
      console.error("[notifications] list", error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: caricamento fallito: ${error.message || ""}` } });
      return;
    }
    setNotifications((data || []).map(fromDbNotification));
  }, { enabled: useSupabase, deps: [useSupabase] });

  // Refresh team live (sessione 29). Senza questo sub, l'admin invita o
  // approva un utente e l'elenco Team non si aggiorna fino a un reload.
  // Risub-scrive ai change su `users` e ricarica la lista completa (inclusi
  // pending=true e active=false: l'admin deve vederli). normalize() allinea
  // photo_url → photoUrl, idem AuthContext.
  //
  // filterEvent (sessione 29 cleanup): saltiamo gli UPDATE che cambiano solo
  // i campi di presence (status, last_seen_at) — la presence ha già il suo
  // proprio canale (presenceMap), il team non ne ha bisogno. Senza filtro,
  // ogni heartbeat di un altro client (ogni 30s) provocava un reload del
  // team. REPLICA IDENTITY FULL su public.users (migration 20260612) ci
  // garantisce il pre-image in payload.old per fare il confronto.
  useDebouncedTableSubscription(["users"], async (isCurrent) => {
    // listAll() legge solo public.users → NON contiene email/phone, che vivono
    // in public.user_contacts (RLS own+admin). Senza ri-merge, ad ogni refresh
    // del team (incluso quello iniziale al mount) i contatti dell'utente loggato
    // verrebbero azzerati nello stato: ProfileEditor li mostrerebbe vuoti dopo
    // il reload, facendo sembrare che le modifiche a mail/telefono non si
    // persistano (in realtà sono salvate, ma sovrascritte qui). Li recuperiamo
    // e li reinnestiamo nella sola entry dell'utente loggato, come fa
    // AuthContext.loadProfile alla prima idratazione.
    const [listRes, contactsRes] = await Promise.all([
      UsersAPI.listAll(),
      initialCurrentUserId
        ? UsersAPI.getContacts(initialCurrentUserId)
        : Promise.resolve({ data: null }),
    ]);
    const { data, error } = listRes;
    if (!isCurrent()) return;
    if (error) {
      console.error("[VoyageDesk] Users.listAll", error);
      return;
    }
    const myContacts = {
      email: contactsRes?.data?.email ?? null,
      phone: contactsRes?.data?.phone ?? null,
    };
    const team = (data || []).map(u => {
      const base = { ...u, photoUrl: u.photo_url ?? null };
      return u.id === initialCurrentUserId ? { ...base, ...myContacts } : base;
    });
    rawDispatch({ type: "SET_TEAM", payload: team });
  }, {
    enabled: useSupabase,
    delay: 800,
    deps: [useSupabase],
    filterEvent: (payload) => {
      if (payload?.eventType !== "UPDATE") return true; // INSERT/DELETE sempre
      const oldRow = payload.old;
      const newRow = payload.new;
      if (!oldRow || !newRow) return true; // pre-image mancante → safe-reload
      const PRESENCE_ONLY = new Set(["status", "last_seen_at", "origin_client"]);
      for (const key of Object.keys(newRow)) {
        if (PRESENCE_ONLY.has(key)) continue;
        if (oldRow[key] !== newRow[key]) return true; // campo "interessante" cambiato
      }
      return false; // solo presence → skip reload
    },
  });

  // Loading state CRM: true finché non completa il primo fetch da Supabase.
  // Senza login parte già false (nessuna idratazione: si usano i dati mock).
  const [crmLoading, setCrmLoading] = useState(useSupabase);

  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    ClientsAPI.list()
      .then((cRes) => {
        if (cancelled) return;
        if (!cRes.error) rawDispatch({ type: "SET_CLIENTS", payload: (cRes.data || []).map(fromDbClient) });
      }).catch(e => console.error("[CRM] hydration", e))
      .finally(() => { if (!cancelled) setCrmLoading(false); });
    return () => { cancelled = true; };
  }, [useSupabase]);

  const markNotificationRead = useCallback((id) => {
    if (!useSupabase) return;
    // Ottimistico
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    NotificationsAPI.markRead(id).then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifica: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // currentUserId vivo, per persistere i comments con l'autore giusto.
  const currentUserIdRef = useRef(state.currentUserId);
  useEffect(() => { currentUserIdRef.current = state.currentUserId; }, [state.currentUserId]);

  // Snapshot vivo dello state per il wrapper dispatch: leggendo tasks/notices/
  // team da qui (invece che dalle deps della useCallback) `dispatch` resta
  // un'identità STABILE. Prima aveva [state.tasks, state.notices, state.team]
  // nelle deps → veniva ricreato a ogni mutazione, rompendo la memoizzazione
  // dei figli che ricevono dispatch/openTaskById. Il ref è sempre aggiornato.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Wrapper dispatch: applica al reducer (UI istantanea) e poi sincronizza
  // su Supabase fire-and-forget. Per ADD_TASK normalizza l'id in uuid in
  // modo coerente tra reducer e DB.
  // Ritorna una promise { error } così i chiamanti che devono concatenare
  // operazioni dipendenti dalla persistenza (es. upload allegati subito dopo
  // ADD_TASK, che via RLS richiede la riga task già scritta) possono await-arla.
  const dispatch = useCallback((action) => {
    if (!useSupabase) { rawDispatch(action); return Promise.resolve({ error: null }); }

    const uid = currentUserIdRef.current;

    // Pre-check permessi: rispecchia i gate del reducer (ADMIN_ONLY_ACTIONS in
    // state/reducer.js) *prima* di costruire dbOps. Senza questo, un'azione
    // negata lato reducer (stato locale invariato + toast d'errore) veniva
    // comunque inviata a Supabase, affidando l'unica vera barriera alla RLS
    // lato server — nessuna difesa in profondità lato client.
    if (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(uid)) {
      rawDispatch(action);
      return Promise.resolve({ error: null });
    }

    let toDispatch = action;
    let dbOps = null;

    switch (action.type) {
      case "ADD_TASK": {
        if (!canCreateTaskCategory(action.payload?.category, uid)) break;
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => TasksAPI.create(toDbTask(payload));
        break;
      }
      case "ADD_TASKS_BULK": {
        if ((action.payload || []).some(t => !canCreateTaskCategory(t?.category, uid))) break;
        const payload = (action.payload || []).map(t => ({
          ...t, id: isUuid(t?.id) ? t.id : newId(),
        }));
        toDispatch = { ...action, payload };
        dbOps = () => Promise.all(payload.map(t => TasksAPI.create(toDbTask(t))));
        break;
      }
      case "UPDATE_TASK": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload.id);
        if (!prev || !canEditTask(prev, uid)) break;
        dbOps = () => TasksAPI.update(action.payload.id, toDbTaskPatch(action.payload));
        break;
      }
      case "MOVE_TASK": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload.taskId);
        if (!prev || !canEditTask(prev, uid)) break;
        dbOps = () => TasksAPI.update(action.payload.taskId, { status: action.payload.newStatus });
        break;
      }
      case "DELETE_TASK": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload);
        if (!prev || !canEditTask(prev, uid)) break;
        dbOps = () => TasksAPI.softDelete(action.payload);
        break;
      }
      case "RESTORE_TASK": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload);
        if (!prev || !canEditTask(prev, uid)) break;
        dbOps = () => TasksAPI.restore(action.payload);
        break;
      }
      case "PURGE_TASK": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload);
        if (!prev || !canEditTask(prev, uid)) break;
        dbOps = () => TasksAPI.hardDelete(action.payload);
        break;
      }
      case "UNDO_LAST_ACTION": {
        // Il reducer applica l'undo solo allo stato locale (state.lastAction,
        // popolato da MOVE_TASK/DELETE_TASK/UPDATE_TASK con swipe:true). Senza
        // questo case, il toast "↩ Annulla" tornava indietro solo in UI: la
        // riga su Supabase restava nello stato post-azione e ricompariva al
        // primo reload/evento realtime.
        const la = stateRef.current.lastAction;
        if (la?.type === "MOVE_TASK") {
          dbOps = () => TasksAPI.update(la.taskId, { status: la.prevStatus });
        } else if (la?.type === "DELETE_TASK") {
          dbOps = () => TasksAPI.restore(la.taskId);
        } else if (la?.type === "UPDATE_TASK") {
          dbOps = () => TasksAPI.update(la.taskId, toDbTaskPatch(la.prevSnapshot));
        }
        break;
      }
      case "EMPTY_TRASH": {
        // Deve rispecchiare esattamente il filtro del reducer (case "EMPTY_TRASH"
        // in state/reducer.js): altrimenti un utente non-admin che vede solo un
        // sottoinsieme di task nel proprio Cestino finirebbe per far eliminare
        // sul DB anche i task cestinati di altri, di cui non ha i permessi.
        const ids = stateRef.current.tasks
          .filter(t => t.deletedAt && canEditTask(t, uid))
          .map(t => t.id);
        dbOps = () => Promise.all(ids.map(id => TasksAPI.hardDelete(id)));
        break;
      }
      case "ADD_COMMENT": {
        const prev = stateRef.current.tasks.find(t => t.id === action.payload.taskId);
        if (!prev || !canViewTask(prev, uid)) break;
        dbOps = () => CommentsAPI.create({
          task_id: action.payload.taskId,
          user_id: uid,
          text: action.payload.comment?.text ?? "",
        });
        break;
      }
      case "ADD_NOTICE": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id, author: action.payload.author ?? currentUserIdRef.current };
        toDispatch = { ...action, payload };
        dbOps = () => NoticesAPI.create(toDbNotice(payload));
        break;
      }
      case "UPDATE_NOTICE":
        dbOps = () => NoticesAPI.update(action.payload.id, toDbNoticePatch(action.payload));
        break;
      case "DELETE_NOTICE":
        dbOps = () => NoticesAPI.remove(action.payload);
        break;
      case "TOGGLE_PIN_NOTICE": {
        const prev = stateRef.current.notices.find(n => n.id === action.payload);
        const pinned = !(prev?.pinned);
        dbOps = () => NoticesAPI.togglePin(action.payload, pinned);
        break;
      }
      // ─── CRM sync ───
      case "ADD_CLIENT": {
        const id = newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => ClientsAPI.create(toDbClient(payload));
        break;
      }
      case "UPDATE_CLIENT":
        dbOps = () => ClientsAPI.update(action.payload.id, toDbClient(action.payload));
        break;
      case "DELETE_CLIENT":
        dbOps = () => ClientsAPI.remove(action.payload);
        break;
      // ─── ADMIN: CATEGORIES sync ───
      case "ADD_CATEGORY":
        dbOps = () => CategoriesAPI.create(toDbCategory(action.payload));
        break;
      case "UPDATE_CATEGORY": {
        const { key, ...rest } = action.payload;
        dbOps = () => CategoriesAPI.update(key, rest);
        break;
      }
      case "REMOVE_CATEGORY":
        dbOps = () => CategoriesAPI.remove(action.payload);
        break;
      // ─── ADMIN: TEAM sync ───
      // Persistiamo le azioni che operano su utenti reali (creati via signup o
      // invito): approvazione, attivazione/disattivazione ed eliminazione.
      // ADD/UPDATE restano locali — ADD_TEAM_MEMBER non ha una riga auth.users
      // associata, e UPDATE del ruolo richiederebbe il mapping all'enum DB
      // (niente sotto-ruolo Junior/Senior nello schema attuale).
      case "APPROVE_TEAM_MEMBER":
        dbOps = () => UsersAPI.approve(action.payload);
        break;
      // Eliminazione definitiva: hard-delete via Edge Function delete-user.
      // Rimuove la riga auth.users (CASCADE → public.users + user_contacts),
      // così l'email torna libera e l'invito può essere rifatto da zero.
      case "REMOVE_TEAM_MEMBER":
        dbOps = () => UsersAPI.deleteUser(action.payload);
        break;
      case "TOGGLE_TEAM_MEMBER_ACTIVE": {
        const curr = stateRef.current.team.find(m => m.id === action.payload);
        const nextActive = !(curr?.active);
        dbOps = () => UsersAPI.setActive(action.payload, nextActive);
        break;
      }
      // ─── ADMIN: RESTORE_BACKUP sync ───
      // Il reducer applicava il restore solo allo stato locale: l'admin vedeva
      // "Backup ripristinato con successo!" ma su Supabase restavano i dati
      // pre-restore, che ritornavano a galla al primo hydrate/evento realtime.
      // Sincronizza tasks/categories/notices in upsert (update se l'id/key
      // esiste già, altrimenti create). Il team resta local-only, come
      // ADD/UPDATE_TEAM_MEMBER sopra: i membri sono righe auth.users, non
      // ricreabili né cancellabili da un semplice restore client-side.
      case "RESTORE_BACKUP": {
        const payload = action.payload || {};
        const existingTaskIds = new Set(stateRef.current.tasks.map(t => t.id));
        const existingCategoryKeys = new Set(Object.keys(stateRef.current.categories || {}));
        const existingNoticeIds = new Set(stateRef.current.notices.map(n => n.id));
        dbOps = () => Promise.all([
          ...(Array.isArray(payload.tasks) ? payload.tasks.map(t => existingTaskIds.has(t.id)
            ? TasksAPI.update(t.id, toDbTaskPatch(t))
            : TasksAPI.create(toDbTask(t))
          ) : []),
          ...(payload.categories && typeof payload.categories === "object" ? Object.entries(payload.categories).map(([key, cat]) => existingCategoryKeys.has(key)
            ? CategoriesAPI.update(key, cat)
            : CategoriesAPI.create(toDbCategory({ key, ...cat }))
          ) : []),
          ...(Array.isArray(payload.notices) ? payload.notices.map(n => existingNoticeIds.has(n.id)
            ? NoticesAPI.update(n.id, toDbNoticePatch(n))
            : NoticesAPI.create(toDbNotice(n))
          ) : []),
        ]);
        break;
      }
      default:
        break;
    }

    rawDispatch(toDispatch);
    if (dbOps) {
      return Promise.resolve()
        .then(dbOps)
        .then((res) => {
          const err = Array.isArray(res) ? res.find(r => r?.error)?.error : res?.error;
          if (err) {
            console.error(`[VoyageDesk] sync ${action.type}`, err);
            rawDispatch({
              type: "SHOW_TOAST",
              payload: {
                type: "error",
                message: `Salvataggio fallito: ${err.message || "errore sconosciuto"}`,
              },
            });
          }
          return { error: err || null };
        })
        .catch((e) => {
          console.error(`[VoyageDesk] sync ${action.type}`, e);
          rawDispatch({
            type: "SHOW_TOAST",
            payload: {
              type: "error",
              message: `Salvataggio fallito: ${e?.message || "errore di rete"}`,
            },
          });
          return { error: e };
        });
    }
    return Promise.resolve({ error: null });
  }, [useSupabase]);

  // Step J: navigazione da notifica → TaskSlideOver
  // Se il task referenziato dalla notifica non è (più) raggiungibile — cestinato,
  // purgato o non più visibile per riassegnazione/permessi — il pannello si
  // chiude comunque e la notifica viene marcata come letta lato chiamante: senza
  // un toast esplicito l'utente clicca e non vede succedere nulla, in silenzio.
  const openTaskById = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) {
      dispatch({ type: "SET_SELECTED_TASK", payload: t });
    } else {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Task non più disponibile (spostato nel cestino o riassegnato)" } });
    }
  }, [state.tasks, dispatch]);


  const markAllNotificationsRead = useCallback(() => {
    if (!useSupabase) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    NotificationsAPI.markAllRead().then(r => {
      if (r?.error) {
        console.error("[notifications] markAllRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // Pulizia elenco notifiche: rimozione singola e in blocco. Tutte ottimistiche
  // con rollback allo snapshot precedente se la delete su DB fallisce.
  const removeNotification = useCallback((id) => {
    if (!useSupabase) return;
    let snapshot = [];
    setNotifications(prev => { snapshot = prev; return prev.filter(n => n.id !== id); });
    NotificationsAPI.remove(id).then(r => {
      if (r?.error) {
        console.error("[notifications] remove", r.error);
        setNotifications(snapshot);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifica: eliminazione fallita` } });
      }
    });
  }, [useSupabase]);

  const clearAllNotifications = useCallback(() => {
    if (!useSupabase) return;
    let snapshot = [];
    setNotifications(prev => { snapshot = prev; return []; });
    NotificationsAPI.removeAll().then(r => {
      if (r?.error) {
        console.error("[notifications] removeAll", r.error);
        setNotifications(snapshot);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: pulizia fallita` } });
      }
    });
  }, [useSupabase]);

  // Presence (Step H): heartbeat + subscribe a users
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  // Stato "Occupato" manuale: il toggle vive in ChatPanel; lo teniamo in un ref
  // così il beat() lo legge senza far ripartire l'effetto presence.
  const [myBusy, setMyBusy] = useState(false);
  const myBusyRef = useRef(false);
  const toggleMyBusy = useCallback(() => {
    setMyBusy(prev => {
      const nv = !prev;
      myBusyRef.current = nv;
      const myId = initialCurrentUserId;
      if (useSupabase && myId) {
        const st = nv ? 'busy' : 'online';
        UsersAPI.setPresence(myId, st).then(() => {});
        setPresenceMap(p => ({
          ...p,
          [myId]: { ...(p[myId] || {}), status: st, last_seen_at: new Date().toISOString() },
        }));
      }
      return nv;
    });
  }, [useSupabase, initialCurrentUserId]);
  useEffect(() => {
    if (!useSupabase) return;
    const myId = initialCurrentUserId;
    let cancelled = false;
    let hbTimer = null;

    // Snapshot iniziale di tutti gli utenti
    const reload = () => {
      // Non passare per UsersAPI.list (filtra active=true): vogliamo tutti
      // gli utenti del team. initialTeam è già lo snapshot completo; uso quello
      // più aggiornamenti via realtime.
      const map = {};
      for (const u of initialTeam || []) map[u.id] = u;
      setPresenceMap(prev => ({ ...map, ...prev }));
    };
    reload();

    // Se status non è passato esplicitamente, rispetta il toggle "Occupato".
    const beat = (status) => {
      if (!myId) return;
      const eff = status || (myBusyRef.current ? 'busy' : 'online');
      UsersAPI.setPresence(myId, eff).then(r => {
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status: eff, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat();
    // Caveat #3: heartbeat ogni 30s (era 45s), allineato al tick di ageing
    // della presenza → lo stato online/away resta più reattivo.
    hbTimer = setInterval(() => beat(), 30 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat('away');
      else beat();
    };
    const onBeforeUnload = () => beat('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Realtime: aggiorna presenceMap quando un altro utente cambia status
    const unsub = subscribeToTable("users", (payload) => {
      const row = payload?.new || payload?.record;
      if (!row || !row.id) return;
      setPresenceMap(prev => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), ...row } }));
    });

    // Tick di re-render: ogni 30s ricomputo presenza per ageing
    const tick = setInterval(() => {
      if (cancelled) return;
      setPresenceMap(prev => ({ ...prev })); // shallow rerender
    }, 30 * 1000);

    return () => {
      cancelled = true;
      clearInterval(hbTimer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsub?.();
      // Best-effort: segnala offline
      if (myId) UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [useSupabase, initialCurrentUserId, initialTeam]);

  // Idratazione chat (conversations + messages) + realtime.
  // chatLoading parte da `useSupabase`: senza login è già false, quindi non
  // serve azzerarlo qui (l'hook non gira affatto quando enabled=false).
  useDebouncedTableSubscription(["conversations", "messages"], async (isCurrent) => {
    const [convsRes, msgsRes] = await Promise.all([
      ConversationsAPI.listMine(),
      MessagesAPI.listAll(),
    ]);
    if (!isCurrent()) return;
    if (convsRes.error) {
      console.error("[chat] convs.list", convsRes.error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento conversazioni fallito: ${convsRes.error.message || ""}` } });
    }
    if (msgsRes.error) {
      console.error("[chat] msgs.list", msgsRes.error);
      rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento messaggi fallito: ${msgsRes.error.message || ""}` } });
    }
    const convs = (convsRes.data || []).map(fromDbConversation);
    const msgsByConv = {};
    for (const r of msgsRes.data || []) {
      const m = fromDbMessage(r);
      (msgsByConv[m.conversation_id] ||= []).push(m);
    }
    setConversationsRaw(convs);
    setMessagesRaw(msgsByConv);
    setChatLoading(false);
  }, { enabled: useSupabase, deps: [useSupabase] });

  const [showFABModal, setShowFABModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false); // v2.8 Round 10
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // In modalità Supabase partiamo da stato vuoto e idratiamo dal DB.
  // Senza login i mock restano per smoke-test rapido.
  const [conversations, setConversationsRaw] = useState(
    useSupabase ? [] : initialConversations
  );
  const [messages, setMessagesRaw] = useState(
    useSupabase ? {} : initialMessages
  );

  // Mappa convId → Promise dell'INSERT conversazione ancora in volo. Serve a
  // serializzare il primo messaggio dietro la creazione della conversazione:
  // senza, la RLS messages_insert rifiuta il messaggio perché la conversation_id
  // non esiste ancora lato DB (race conv→primo messaggio = "messaggio non arriva").
  const convCreatePromises = useRef(new Map());

  // Wrapper di setConversations: diff vs prev e persiste create/update(pinned).
  const setConversations = useCallback((updater) => {
    setConversationsRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;
      const prevById = new Map(prev.map(c => [c.id, c]));
      return nextRaw.map(c => {
        if (!prevById.has(c.id)) {
          const id = isUuid(c.id) ? c.id : newId();
          const normalized = { ...c, id };
          const createPromise = ConversationsAPI.create(toDbConversation(normalized));
          convCreatePromises.current.set(id, createPromise);
          createPromise
            .then(r => { if (r?.error) { console.error('[chat] conv.create', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: creazione conversazione fallita: ${r.error.message || ''}` } }); } })
            .finally(() => { convCreatePromises.current.delete(id); });
          return normalized;
        }
        const prevC = prevById.get(c.id);
        if (prevC.pinned !== c.pinned || prevC.name !== c.name || prevC.icon !== c.icon) {
          ConversationsAPI.update(c.id, {
            pinned: !!c.pinned, name: c.name ?? null, icon: c.icon ?? null,
          }).then(r => { if (r?.error) { console.error('[chat] conv.update', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento conversazione fallito: ${r.error.message || ''}` } }); } });
        }
        return c;
      });
    });
  }, [useSupabase]);

  // Wrapper di setMessages: diff per conv e persiste insert + reactions + readBy.
  const setMessages = useCallback((updater) => {
    setMessagesRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;

      const eqArr = (a, b) => {
        if (a === b) return true;
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const eqReactions = (a, b) => {
        const ka = Object.keys(a || {}), kb = Object.keys(b || {});
        if (ka.length !== kb.length) return false;
        for (const k of ka) if (!eqArr(a[k], b[k])) return false;
        return true;
      };

      const next = {};
      for (const convId of Object.keys(nextRaw)) {
        const prevArr = prev[convId] || [];
        const nextArr = nextRaw[convId] || [];
        const prevById = new Map(prevArr.map(m => [m.id, m]));
        next[convId] = nextArr.map(m => {
          if (!prevById.has(m.id)) {
            const id = isUuid(m.id) ? m.id : newId();
            const normalized = { ...m, id };
            const sendMsg = () => MessagesAPI.send(toDbMessage(normalized, convId))
              .then(r => { if (r?.error) { console.error('[chat] msg.send', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: invio messaggio fallito: ${r.error.message || ''}` } }); } });
            // Se la conversazione è appena stata creata e l'INSERT è ancora in
            // volo, attendi che il DB l'abbia persistita: altrimenti la RLS
            // messages_insert rifiuta il primo messaggio (conversation_id non
            // ancora esistente). Se la creazione conversazione è fallita, non
            // tentare l'invio (il toast d'errore è già stato mostrato).
            const pendingConv = convCreatePromises.current.get(convId);
            if (pendingConv) {
              pendingConv.then(r => { if (!r?.error) sendMsg(); });
            } else {
              sendMsg();
            }
            return normalized;
          }
          const prevM = prevById.get(m.id);
          if (!eqReactions(prevM.reactions, m.reactions)) {
            MessagesAPI.setReactions(m.id, m.reactions || {})
              .then(r => { if (r?.error) { console.error('[chat] msg.reactions', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento reazione fallito: ${r.error.message || ''}` } }); } });
          }
          if (!eqArr(prevM.readBy, m.readBy)) {
            MessagesAPI.markRead(m.id, m.readBy || [])
              .then(r => { if (r?.error) { console.error('[chat] msg.readBy', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } }); } });
          }
          if (!!prevM.pinned !== !!m.pinned) {
            // pinnedBy: chi sta fissando (per l'audit). Solo al pin; all'unpin
            // l'API azzera comunque pinned_by/pinned_at.
            MessagesAPI.setPinned(m.id, !!m.pinned, m.pinned ? (m.pinnedBy ?? null) : null)
              .then(r => { if (r?.error) { console.error('[chat] msg.pinned', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: pin fallito: ${r.error.message || ''}` } }); } });
          }
          return m;
        });
      }
      return next;
    });
  }, [useSupabase]);

  // Step Q.4: markRead bulk all'apertura conversazione.
  // Bypassa il wrapper setMessages (che farebbe N UPDATE) e fa:
  // 1) update locale ottimistico via setMessagesRaw, 2) una sola RPC che
  // marca letti tutti i messaggi non letti della conv. origin_client è
  // tagged così l'eco realtime viene filtrata sul nostro client.
  const markConversationRead = useCallback((convId) => {
    const uid = currentUserIdRef.current;
    if (!convId || !uid) return;
    setMessagesRaw(prev => {
      const list = prev[convId] || [];
      let changed = false;
      const next = list.map(m => {
        if (m.sender !== uid && !m.readBy?.includes(uid)) {
          changed = true;
          return { ...m, readBy: [...(m.readBy || []), uid] };
        }
        return m;
      });
      return changed ? { ...prev, [convId]: next } : prev;
    });
    if (!useSupabase || !isUuid(convId)) return;
    MessagesAPI.markReadBulk(convId).then(r => {
      if (r?.error) {
        console.error('[chat] markReadBulk', r.error);
        rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } });
      }
    });
  }, [useSupabase]);

  // La lista chat è PERSONALE: mostra solo le conversazioni di cui l'utente è
  // davvero partecipante (e scarta le dirette orfane → "Sconosciuto"). Vedi
  // scopeConversationsForUser per il perché (RLS admin-see-all + invio bloccato
  // sulle conversazioni di cui non si è partecipanti).
  const chatConversations = useMemo(() => {
    if (!useSupabase) return conversations;
    const teamIds = new Set((state.team || []).map(m => m.id));
    return scopeConversationsForUser(conversations, state.currentUserId, teamIds);
  }, [conversations, state.team, state.currentUserId, useSupabase]);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat)
  const unreadChat = chatConversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id),
    0
  );

  // Apre la chat verso un utente specifico, opzionalmente con link a task
  const openChatTo = (intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  };

  useEffect(() => {
    const handler = (e) => {
      const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
        return;
      }
      if (inInput) return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setShowFABModal(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShowKeyHelp(p => !p);
      } else if (e.key === "Escape") {
        setShowKeyHelp(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Quando l'utente cambia, se la view corrente non è permessa il reducer la riporta a dashboard.
  // Inoltre chiudo eventuali pannelli aperti.
  useEffect(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
  }, [state.currentUserId]);

  const renderView = () => {
    switch (state.activeView) {
      case "dashboard":  return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar":   return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "clienti":    return <ClientiView state={state} dispatch={dispatch} loading={crmLoading} />;
      case "team":       return <Team state={state} dispatch={dispatch} />;
      case "archivio":   return <Archive state={state} dispatch={dispatch} />;
      case "trash":      return <Trash state={state} dispatch={dispatch} />;
      case "admin":      return <AdminView state={state} dispatch={dispatch} />;
      default:           return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  return (
    <>
      <FontLoader />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
        <Topbar
          state={state}
          dispatch={dispatch}
          notifications={notifications}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
          onRemoveNotification={removeNotification}
          onClearAllNotifications={clearAllNotifications}
          onOpenTask={openTaskById}
        />
        {state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner
            rollbackTo={state.adminRollbackTo}
            switchedAt={state.adminSwitchedAt}
            dispatch={dispatch}
          />
        )}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={unreadChat} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {/* Suspense per la vista attiva: solo AdminView è lazy (Phase 2g),
                le altre viste risolvono sincronicamente. */}
            <Suspense fallback={<LazyFallback />}>
              {renderView()}
            </Suspense>
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} onOpenChat={() => { setChatIntent(null); setShowChat(true); }} unreadChat={unreadChat} />

        {/* Slide-over (lazy, Phase 2g) */}
        {state.selectedTask && (
          <Suspense fallback={<LazyFallback overlay />}>
            <TaskSlideOver task={state.selectedTask} dispatch={dispatch} clients={state.clients || []} />
          </Suspense>
        )}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={chatConversations}
          setConversations={setConversations}
          messages={messages}
          setMessages={setMessages}
          markConversationRead={markConversationRead}
          intent={chatIntent}
          tasks={state.tasks}
          currentUserId={state.currentUserId}
          dispatch={dispatch}
          presenceMap={presenceMap}
          messageTemplates={state.messageTemplates}
          loading={chatLoading}
          myBusy={myBusy}
          onToggleBusy={toggleMyBusy}
        />

        {/* FAB principale (singolo task). La creazione bulk/multi-task è ora in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "archivio" && state.activeView !== "admin" && (
          <FAB onClick={() => setShowFABModal(true)} />
        )}
        {showFABModal && <QuickAddTask clients={state.clients || []} onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Overlay scorciatoie tastiera (v2.8 Round 10) */}
        {showKeyHelp && <KeyboardHelpOverlay onClose={() => setShowKeyHelp(false)} />}

        {/* Bulk Task Creator (lazy, Phase 2g) */}
        {showBulkModal && (
          <Suspense fallback={<LazyFallback overlay />}>
            <BulkTaskCreator
              existingTasks={getActiveTasks(state.tasks)}
              onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
              onClose={() => setShowBulkModal(false)}
              clients={state.clients || []}
            />
          </Suspense>
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </>
  );
}
// Step J — touched
