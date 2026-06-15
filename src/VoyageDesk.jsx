
import { useState, useReducer, useContext, createContext, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
// xlsx (SheetJS, ~430KB) è caricato on-demand via import() dinamico solo
// quando l'utente importa o esporta un file (vedi loadXLSX). Tenerlo fuori
// dal bundle iniziale è il singolo guadagno più grande sul chunk principale.
import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Conversations as ConversationsAPI, Messages as MessagesAPI,
  Notifications as NotificationsAPI, Users as UsersAPI,
  Clients as ClientsAPI, Suppliers as SuppliersAPI, Dossiers as DossiersAPI,
  subscribeToTable,
} from "./lib/api.js";
import {
  toDbTask, toDbTaskPatch, fromDbTask,
  toDbNotice, toDbNoticePatch, fromDbNotice,
  toDbConversation, fromDbConversation,
  toDbMessage, fromDbMessage,
  fromDbNotification,
  fromDbClient, toDbClient,
  fromDbSupplier, toDbSupplier,
  fromDbDossier, toDbDossier,
  newId, isUuid,
} from "./lib/mappers.js";
// Step O: logout UI — signOut vive in AuthContext, qui viene solo cablato.
import { useAuth } from "./auth/AuthContext.jsx";
// Step P Phase 2a: costanti e utility pure estratte dal monolite.
import {
  PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS,
  NOTICE_COLORS, TASK_TEMPLATES,
} from "./lib/taskConstants.js";
import {
  formatDate, formatTime, getDayKey,
  isOverdue, isUrgent,
  isActiveTask, getActiveTasks, getTrashedTasks,
  isMyTask, isInGlobalQueue,
} from "./lib/taskUtils.js";
// Step P Phase 2b: dati mock (solo le notifiche, le altre seed vivono nel reducer).
// Step P Phase 2c: globals mutabili e helper permessi estratti.
import {
  TEAM, CATEGORIES, CURRENT_USER,
  getMember, getAssignableTeam,
  getRoleType, isAdmin, isDriver,
  canViewTask, canEditTask, canCreateTaskCategory,
  canAccessAdmin, getAvailableCategories, getVisibleTasks,
} from "./state/appGlobals.js";
// Step P Phase 2d: reducer e factory dell'initial state estratti.
import { reducer, makeInitialState } from "./state/reducer.js";
// Caveat #10: hook che astrae idratazione + subscribe realtime debounced.
import { useDebouncedTableSubscription } from "./hooks/useDebouncedTableSubscription.js";
import { usePreferences } from "./lib/preferences.js";
// Step P Phase 2e: foundation + UI primitives estratti in src/components/.
import { useViewport, ViewportProvider } from "./components/Viewport.jsx";
// Step P Phase 2f: loader xlsx condiviso estratto in lib/xlsx.js.
import { loadXLSX } from "./lib/xlsx.js";
import { SwipeActions } from "./components/SwipeActions.jsx";
import { Avatar } from "./components/ui/Avatar.jsx";
import { PriorityBadge } from "./components/ui/PriorityBadge.jsx";
import { CategoryChip } from "./components/ui/CategoryChip.jsx";
import { StatusBadge } from "./components/ui/StatusBadge.jsx";
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
// Fase 1: Clienti, Fornitori, Pratiche
import { ClientiView } from "./components/clients/ClientiView.jsx";
import { FornitoriView } from "./components/suppliers/FornitoriView.jsx";
import { PraticheView } from "./components/dossiers/PraticheView.jsx";

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
      --sky: #87CEEB;
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
    }
    /* Dark mode (sessione 24): l'attributo data-theme="dark" su <html>
       viene impostato dal hook usePreferences (src/lib/preferences.js). */
    html[data-theme="dark"] {
      --navy: #0a1530;
      --navy-light: #15244a;
      --navy-dark: #050b1e;
      --sky: #1f3357;
      --gold: #E0B85A;
      --gold-light: #F0CC7A;
      --gold-dark: #B89638;
      --surface: #0F1424;
      --surface2: #181E33;
      --surface3: #232A40;
      --text: #E6E6F0;
      --text-muted: #9BA0B4;
      --text-light: #6F7591;
      --border: #2A3147;
    }
    html[data-theme="dark"] body { color-scheme: dark; }
    body { font-family: 'DM Sans', sans-serif; background: var(--surface); color: var(--text); }
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
  // Preferenze UI locali (tema, locale, dateFormat). Sessione 24.
  // L'hook applica il tema corrente su <html data-theme="…"> al mount e ad
  // ogni cambio (vedi src/lib/preferences.js).
  const [prefs, setPrefs] = usePreferences();

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
  // useDebouncedTableSubscription; le tasks ascoltano anche i comments.
  useDebouncedTableSubscription(["tasks", "comments"], async (isCurrent) => {
    const { data, error } = await TasksAPI.list({ withComments: true });
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

  // Fase 1: idratazione CRM (clienti, fornitori, pratiche) al mount.
  // Reference data, nessun realtime — semplice fetch one-shot.
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    Promise.all([
      ClientsAPI.list(),
      SuppliersAPI.list(),
      DossiersAPI.list(),
    ]).then(([cRes, sRes, dRes]) => {
      if (cancelled) return;
      if (!cRes.error) rawDispatch({ type: "SET_CLIENTS", payload: (cRes.data || []).map(fromDbClient) });
      if (!sRes.error) rawDispatch({ type: "SET_SUPPLIERS", payload: (sRes.data || []).map(fromDbSupplier) });
      if (!dRes.error) rawDispatch({ type: "SET_DOSSIERS", payload: (dRes.data || []).map(fromDbDossier) });
    }).catch(e => console.error("[CRM] hydration", e));
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

  // Wrapper dispatch: applica al reducer (UI istantanea) e poi sincronizza
  // su Supabase fire-and-forget. Per ADD_TASK normalizza l'id in uuid in
  // modo coerente tra reducer e DB.
  const dispatch = useCallback((action) => {
    if (!useSupabase) { rawDispatch(action); return; }

    let toDispatch = action;
    let dbOps = null;

    switch (action.type) {
      case "ADD_TASK": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => TasksAPI.create(toDbTask(payload));
        break;
      }
      case "ADD_TASKS_BULK": {
        const payload = (action.payload || []).map(t => ({
          ...t, id: isUuid(t?.id) ? t.id : newId(),
        }));
        toDispatch = { ...action, payload };
        dbOps = () => Promise.all(payload.map(t => TasksAPI.create(toDbTask(t))));
        break;
      }
      case "UPDATE_TASK":
        dbOps = () => TasksAPI.update(action.payload.id, toDbTaskPatch(action.payload));
        break;
      case "MOVE_TASK":
        dbOps = () => TasksAPI.update(action.payload.taskId, { status: action.payload.newStatus });
        break;
      case "DELETE_TASK":
        dbOps = () => TasksAPI.softDelete(action.payload);
        break;
      case "RESTORE_TASK":
        dbOps = () => TasksAPI.restore(action.payload);
        break;
      case "PURGE_TASK":
        dbOps = () => TasksAPI.hardDelete(action.payload);
        break;
      case "EMPTY_TRASH": {
        const ids = state.tasks.filter(t => t.deletedAt).map(t => t.id);
        dbOps = () => Promise.all(ids.map(id => TasksAPI.hardDelete(id)));
        break;
      }
      case "ADD_COMMENT": {
        const uid = currentUserIdRef.current;
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
        const prev = state.notices.find(n => n.id === action.payload);
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
      case "ADD_SUPPLIER": {
        const id = newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => SuppliersAPI.create(toDbSupplier(payload));
        break;
      }
      case "UPDATE_SUPPLIER":
        dbOps = () => SuppliersAPI.update(action.payload.id, toDbSupplier(action.payload));
        break;
      case "DELETE_SUPPLIER":
        dbOps = () => SuppliersAPI.remove(action.payload);
        break;
      case "ADD_DOSSIER": {
        const id = newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = async () => {
          const res = await DossiersAPI.create(toDbDossier(payload));
          // Il trigger DB popola il numero: aggiorna lo state con il numero generato
          if (!res.error && res.data?.number) {
            rawDispatch({ type: "UPDATE_DOSSIER", payload: { id, number: res.data.number } });
          }
          return res;
        };
        break;
      }
      case "UPDATE_DOSSIER":
        dbOps = () => DossiersAPI.update(action.payload.id, toDbDossier(action.payload));
        break;
      case "DELETE_DOSSIER":
        dbOps = () => DossiersAPI.remove(action.payload);
        break;
      default:
        break;
    }

    rawDispatch(toDispatch);
    if (dbOps) {
      Promise.resolve()
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
        });
    }
  }, [useSupabase, state.tasks, state.notices]);

  // Step J: navigazione da notifica → TaskSlideOver
  const openTaskById = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) dispatch({ type: "SET_SELECTED_TASK", payload: t });
  }, [state.tasks, dispatch]);

  // Caveat #28: navigazione da notifica pratica → PraticheView con detail aperto
  const openDossierById = useCallback((dossierId) => {
    if (!dossierId) return;
    dispatch({ type: "SET_VIEW", payload: "pratiche" });
    setTargetDossierId(dossierId);
  }, [dispatch]);

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

  // Presence (Step H): heartbeat + subscribe a users
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  // Sessione 24: override presenza manuale (null | "busy"). Il toggle nel
  // UserSwitcher imposta lo stato; l'heartbeat lo rispetta tramite ref
  // così non re-instanzia i timer ad ogni cambio.
  const [presenceOverride, setPresenceOverrideState] = useState(null);
  const presenceOverrideRef = useRef(null);
  useEffect(() => { presenceOverrideRef.current = presenceOverride; }, [presenceOverride]);
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

    const beat = (status = 'online') => {
      if (!myId) return;
      const effective = presenceOverrideRef.current || status;
      UsersAPI.setPresence(myId, effective).then(r => {
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status: effective, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat('online');
    // Caveat #3: heartbeat ogni 30s (era 45s), allineato al tick di ageing
    // della presenza → lo stato online/away resta più reattivo.
    hbTimer = setInterval(() => beat('online'), 30 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat('away');
      else beat('online');
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

  // Setter "smart": applica subito lo stato sul DB così l'utente vede il cambio
  // senza aspettare il prossimo tick di heartbeat. L'effetto sopra continuerà
  // a usare il valore aggiornato via ref.
  const setPresenceOverride = useCallback((next) => {
    setPresenceOverrideState(next);
    const myId = initialCurrentUserId;
    if (!useSupabase || !myId) return;
    const effective = next || 'online';
    UsersAPI.setPresence(myId, effective).then(r => {
      if (r?.error) console.warn("[presence] setPresence (manual)", r.error);
      setPresenceMap(prev => ({
        ...prev,
        [myId]: { ...(prev[myId] || {}), status: effective, last_seen_at: new Date().toISOString() },
      }));
    });
    rawDispatch({ type: "SHOW_TOAST", payload: { type: "success", message: next === 'busy' ? "🟡 Sei in modalità Occupato" : "🟢 Sei di nuovo Online" } });
  }, [useSupabase, initialCurrentUserId]);

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
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [targetDossierId, setTargetDossierId] = useState(null);
  // In modalità Supabase partiamo da stato vuoto e idratiamo dal DB.
  // Senza login i mock restano per smoke-test rapido.
  const [conversations, setConversationsRaw] = useState(
    useSupabase ? [] : initialConversations
  );
  const [messages, setMessagesRaw] = useState(
    useSupabase ? {} : initialMessages
  );

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
          ConversationsAPI.create(toDbConversation(normalized))
            .then(r => { if (r?.error) { console.error('[chat] conv.create', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: creazione conversazione fallita: ${r.error.message || ''}` } }); } });
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
            MessagesAPI.send(toDbMessage(normalized, convId))
              .then(r => { if (r?.error) { console.error('[chat] msg.send', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: invio messaggio fallito: ${r.error.message || ''}` } }); } });
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
    MessagesAPI.markReadBulk(convId, uid).then(r => {
      if (r?.error) {
        console.error('[chat] markReadBulk', r.error);
        rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } });
      }
    });
  }, [useSupabase]);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat)
  const unreadChat = conversations.reduce(
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
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
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
      case "calendar":   return <CalendarPlanner state={state} dispatch={dispatch} onOpenDossier={openDossierById} />;
      case "clienti":    return <ClientiView state={state} dispatch={dispatch} />;
      case "fornitori":  return <FornitoriView state={state} dispatch={dispatch} />;
      case "pratiche":   return <PraticheView state={state} dispatch={dispatch} initialDossierId={targetDossierId} />;
      case "team":       return <Team state={state} dispatch={dispatch} />;
      case "trash":      return <Trash state={state} dispatch={dispatch} />;
      case "admin":      return <AdminView state={state} dispatch={dispatch} prefs={prefs} setPrefs={setPrefs} />;
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
          onOpenChat={() => { setChatIntent(null); setShowChat(true); }}
          unreadChat={unreadChat}
          notifications={notifications}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
          onOpenTask={openTaskById}
          onOpenDossier={openDossierById}
          presenceOverride={presenceOverride}
          onSetPresence={setPresenceOverride}
        />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {/* Suspense per la vista attiva: solo AdminView è lazy (Phase 2g),
                le altre viste risolvono sincronicamente. */}
            <Suspense fallback={<LazyFallback />}>
              {renderView()}
            </Suspense>
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} onOpenBulk={() => setShowBulkModal(true)} />

        {/* Slide-over (lazy, Phase 2g) */}
        {state.selectedTask && (
          <Suspense fallback={<LazyFallback overlay />}>
            <TaskSlideOver task={state.selectedTask} dispatch={dispatch} dossiers={state.dossiers} />
          </Suspense>
        )}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={conversations}
          setConversations={setConversations}
          messages={messages}
          setMessages={setMessages}
          markConversationRead={markConversationRead}
          intent={chatIntent}
          tasks={state.tasks}
          dossiers={state.dossiers || []}
          currentUserId={state.currentUserId}
          dispatch={dispatch}
          presenceMap={presenceMap}
          loading={chatLoading}
          onOpenDossier={openDossierById}
        />

        {/* FAB principale (singolo task). La creazione bulk/multi-task è ora in Sidebar/BottomNav. */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <FAB onClick={() => setShowFABModal(true)} />
        )}
        {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} dossiers={state.dossiers} />}

        {/* Bulk Task Creator (lazy, Phase 2g) */}
        {showBulkModal && (
          <Suspense fallback={<LazyFallback overlay />}>
            <BulkTaskCreator
              existingTasks={getActiveTasks(state.tasks)}
              onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
              onClose={() => setShowBulkModal(false)}
              dossiers={state.dossiers}
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
