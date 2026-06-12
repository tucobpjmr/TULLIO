
import { useState, useReducer, useContext, createContext, useRef, useEffect, useCallback, useMemo } from "react";
// xlsx (SheetJS, ~430KB) è caricato on-demand via import() dinamico solo
// quando l'utente importa o esporta un file (vedi loadXLSX). Tenerlo fuori
// dal bundle iniziale è il singolo guadagno più grande sul chunk principale.
import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Conversations as ConversationsAPI, Messages as MessagesAPI,
  Notifications as NotificationsAPI, Users as UsersAPI,
  subscribeToTable,
} from "./lib/api.js";
import {
  toDbTask, toDbTaskPatch, fromDbTask,
  toDbNotice, toDbNoticePatch, fromDbNotice,
  toDbConversation, fromDbConversation,
  toDbMessage, fromDbMessage,
  fromDbNotification,
  newId, isUuid,
} from "./lib/mappers.js";
// Step O: logout UI — signOut vive in AuthContext, qui viene solo cablato.
import { useAuth } from "./auth/AuthContext.jsx";

// Step P / Fase 2: moduli estratti.
import { ViewportProvider, useViewport } from "./hooks/useViewport.jsx";
import { AppContext, useTeam, useCategories, useCurrentUserId } from "./state/contexts.js";
import { PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS } from "./state/constants.js";
import { NOTIFICATIONS, TASK_TEMPLATES, NOTICE_COLORS } from "./state/seed.js";
import {
  getMember, getAssignableTeam, getRoleType,
  canViewTask, canEditTask, getAvailableCategories, getVisibleTasks,
} from "./state/permissions.js";
import { reducer, makeInitialState } from "./state/reducer.js";
import { formatDate, formatTime } from "./utils/formatters.js";
import {
  isOverdue, isUrgent, isMyTask, isInGlobalQueue,
  isActiveTask, getActiveTasks, getTrashedTasks,
} from "./utils/taskFilters.js";

// Atoms condivisi (badges, avatar)
import { Avatar, PriorityBadge, CategoryChip, StatusBadge } from "./components/atoms/index.jsx";
// Layout
import { FontLoader } from "./components/layout/FontLoader.jsx";
import { Toast } from "./components/layout/Toast.jsx";
import { FAB } from "./components/layout/FAB.jsx";
import { Topbar } from "./components/layout/Topbar.jsx";
import { Sidebar } from "./components/layout/Sidebar.jsx";
import { BottomNav } from "./components/layout/BottomNav.jsx";

// ─── XLSX LAZY LOADER ──────────────────────────────────────────────────────
// Carica SheetJS solo alla prima import/export e ne cachea il modulo, così il
// bundle iniziale resta leggero (caveat #15, Step N).
let _xlsxPromise = null;
const loadXLSX = () => (_xlsxPromise ||= import("xlsx"));

// ─── SWIPE ACTIONS (mobile/tablet) ─────────────────────────────────────────
// Wrapper riusabile: swipe verso destra rivela 3 bottoni (Completato / Cestino / Inoltra).
// Soglia 40% larghezza card → si "blocca aperto". Tap fuori chiude.
// Su desktop è trasparente. Disabilitato anche se l'utente non può editare la task.
const SwipeActions = ({ task, dispatch, children, disabled = false }) => {
  const { isDesktop } = useViewport();
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [offset, setOffset] = useState(0);          // px di traslazione attuale
  const [opened, setOpened] = useState(false);      // stato "aperto" (bottoni visibili)
  const [showForward, setShowForward] = useState(false);
  const containerRef = useRef(null);
  const startX = useRef(null);
  const startY = useRef(null);
  const tracking = useRef(false);
  const containerWidth = useRef(0);

  const OPEN_WIDTH = 210; // larghezza pannello bottoni rivelato (3 bottoni × 70)

  // Disabilita su desktop / disabilitato esplicitamente / no permessi di edit (v0.8)
  const canEdit = canEditTask(task, currentUserId, team);
  const swipeEnabled = !isDesktop && !disabled && canEdit;

  // tap fuori per chiudere
  useEffect(() => {
    if (!opened) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpened(false);
        setOffset(0);
        setShowForward(false);
      }
    };
    document.addEventListener("touchstart", handler, { passive: true });
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("touchstart", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [opened]);

  const onTouchStart = (e) => {
    if (!swipeEnabled) return;
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    tracking.current = false;
    containerWidth.current = containerRef.current?.offsetWidth || 300;
  };

  const onTouchMove = (e) => {
    if (!swipeEnabled || startX.current === null) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;

    // determina se è uno swipe orizzontale (più orizzontale che verticale)
    if (!tracking.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        tracking.current = true;
      } else {
        startX.current = null;
        return;
      }
    }

    // permetti solo swipe destro (dx > 0), max OPEN_WIDTH (+ piccolo overshoot)
    const newOffset = Math.max(0, Math.min(dx, OPEN_WIDTH + 30));
    setOffset(newOffset);
  };

  const onTouchEnd = () => {
    if (!swipeEnabled || startX.current === null) {
      startX.current = null;
      return;
    }
    const threshold = containerWidth.current * 0.4;
    if (offset >= threshold) {
      setOffset(OPEN_WIDTH);
      setOpened(true);
    } else {
      setOffset(0);
      setOpened(false);
    }
    startX.current = null;
    tracking.current = false;
  };

  const closeAndDo = (fn) => {
    setOpened(false);
    setOffset(0);
    setShowForward(false);
    setTimeout(fn, 50);
  };

  const handleComplete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "MOVE_TASK", payload: { taskId: task.id, newStatus: "done" }, swipe: true }));
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    closeAndDo(() => dispatch({ type: "DELETE_TASK", payload: task.id, swipe: true }));
  };

  const handleForwardToggle = (e) => {
    e.stopPropagation();
    setShowForward(s => !s);
  };

  const handleForwardTo = (e, memberId) => {
    e.stopPropagation();
    const member = getMember(memberId, team);
    closeAndDo(() => dispatch({
      type: "UPDATE_TASK",
      payload: { id: task.id, assignees: [memberId] },
      swipe: true,
      toastMessage: `↪ Inoltrato a ${member?.name || memberId}`,
    }));
  };

  if (!swipeEnabled) {
    return <>{children}</>;
  }

  const assignable = getAssignableTeam(team);

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", overflow: "visible", touchAction: "pan-y" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pannello bottoni sotto la card (rivelato da sinistra) */}
      {offset > 0 && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: OPEN_WIDTH, display: "flex",
            borderRadius: 10, overflow: "hidden",
            boxShadow: "inset 0 0 0 1px var(--border)",
          }}
        >
          {/* Completato */}
          <button
            onClick={handleComplete}
            aria-label="Completato"
            style={{
              flex: 1, background: "var(--success)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            <span>Fatto</span>
          </button>
          {/* Cestino */}
          <button
            onClick={handleDelete}
            aria-label="Cestino"
            style={{
              flex: 1, background: "var(--danger)", color: "#fff", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px",
            }}
          >
            <span style={{ fontSize: 20 }}>🗑</span>
            <span>Cestino</span>
          </button>
          {/* Inoltra */}
          <button
            onClick={handleForwardToggle}
            aria-label="Inoltra"
            style={{
              flex: 1, background: "var(--gold)", color: "var(--navy)", border: "none",
              cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 11,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, padding: "0 4px", position: "relative",
            }}
          >
            <span style={{ fontSize: 18 }}>↪</span>
            <span>Inoltra</span>
          </button>
        </div>
      )}

      {/* Forward menu (lista agenti) */}
      {showForward && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            zIndex: 30, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            minWidth: 200, maxHeight: 240, overflowY: "auto",
            padding: 6,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", padding: "6px 10px 4px", letterSpacing: 0.5 }}>
            INOLTRA A
          </div>
          {assignable.map(m => (
            <button
              key={m.id}
              onClick={e => handleForwardTo(e, m.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", background: "transparent", border: "none",
                borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                color: "var(--text)", textAlign: "left",
              }}
              onMouseDown={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseUp={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar memberId={m.id} size={26} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Card traslata */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: tracking.current ? "none" : "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1)",
          position: "relative",
          zIndex: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
};


// Presence (Step H): mappa userId → 'online'|'away'|'offline'
// calcolata dal last_seen_at (online <60s, away <5min, altrimenti offline).
function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) return user.status === 'away' ? 'away' : 'online';
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}
const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  offline: '#94a3b8',
};




// ─── BULK TASK CREATOR (stili helper) ──────────────────────────────────────
const bulkInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "#fff", outline: "none",
};
const bulkBtnPrimary = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600,
};
const bulkBtnGhost = {
  background: "transparent", border: "1px solid var(--border)",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 500,
};
const bulkIconBtnSmall = {
  background: "var(--surface2)", border: "none", borderRadius: 6,
  width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};

// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
const ManualTab = ({ onCreate, onClose }) => {
  const team = useTeam();
  const categories = useCategories();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "" });
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", category: "", priority: "", assignee: "", dueDate: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  const validRows = rows.filter(r => r.title.trim());

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => ({
      id: "t" + ts + "-" + idx,
      title: r.title.trim(),
      category: r.category || common.category,
      priority: r.priority || common.priority,
      status: "todo",
      assignees: (r.assignee || common.assignee) ? [r.assignee || common.assignee] : [],
      client: common.client.trim() || null,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      estimatedHours: 1,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
          IMPOSTAZIONI COMUNI (usate se la riga non specifica)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <input value={common.client} onChange={e => setCommon({ ...common, client: e.target.value })} placeholder="Cliente" style={bulkInputStyle} />
          <select value={common.category} onChange={e => setCommon({ ...common, category: e.target.value })} style={bulkInputStyle}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={common.priority} onChange={e => setCommon({ ...common, priority: e.target.value })} style={bulkInputStyle}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={common.assignee} onChange={e => setCommon({ ...common, assignee: e.target.value })} style={bulkInputStyle}>
            <option value="">— Assegna a —</option>
            {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "0 4px", letterSpacing: 0.5 }}>
          <div>#</div><div>TITOLO *</div><div>CATEGORIA</div><div>PRIORITÀ</div><div>ASSEGNATO</div><div>SCADENZA</div><div></div>
        </div>
        {rows.map((r, idx) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{idx + 1}</div>
            <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={bulkInputStyle} />
            <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
              <option value="">— default —</option>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
            </select>
            <input type="date" value={r.dueDate} onChange={e => updateRow(r.key, "dueDate", e.target.value)} style={bulkInputStyle} />
            <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
              background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
              fontSize: 14, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1,
            }}>✕</button>
          </div>
        ))}
        <button onClick={addRow} style={{
          background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
          padding: "9px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          color: "var(--text-muted)", marginTop: 4,
        }}>+ Aggiungi riga</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{validRows.length} task da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0} style={{
            ...bulkBtnPrimary, opacity: validRows.length === 0 ? 0.5 : 1, cursor: validRows.length === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
const DuplicateTab = ({ tasks, onCreate, onClose }) => {
  const categories = useCategories();
  const [selected, setSelected] = useState({});
  const [titleSuffix, setTitleSuffix] = useState(" (copia)");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected(s => {
    const next = { ...s };
    if (next[id]) delete next[id]; else next[id] = 1;
    return next;
  });
  const setCount = (id, n) => setSelected(s => ({ ...s, [id]: Math.max(1, n) }));

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.client?.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = Object.values(selected).reduce((a, c) => a + (c || 0), 0);

  const handleCreate = () => {
    const newTasks = [];
    const ts = Date.now();
    Object.entries(selected).forEach(([taskId, count]) => {
      const src = tasks.find(t => t.id === taskId);
      if (!src) return;
      for (let i = 0; i < count; i++) {
        let due = src.dueDate;
        if (due && dayOffset) {
          const d = new Date(due);
          d.setDate(d.getDate() + dayOffset);
          due = d.toISOString();
        }
        newTasks.push({
          ...src,
          id: "t" + ts + "-" + newTasks.length,
          title: src.title + titleSuffix + (count > 1 ? ` ${i + 1}` : ""),
          status: "todo",
          comments: [],
          dueDate: due,
        });
      }
    });
    onCreate(newTasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SUFFISSO TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} style={bulkInputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>OFFSET SCADENZA (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca task da duplicare..." style={{ ...bulkInputStyle, padding: "9px 12px" }} />

      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nessun task trovato</div>
        ) : filtered.map(t => {
          const count = selected[t.id] || 0;
          const isSel = count > 0;
          return (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
              cursor: "pointer",
            }} onClick={() => toggle(t.id)}>
              <input type="checkbox" checked={isSel} readOnly style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 14 }}>{categories[t.category]?.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {categories[t.category]?.label} • {t.client || "—"} • {formatDate(t.dueDate)}
                </div>
              </div>
              {isSel && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setCount(t.id, count - 1)} disabled={count <= 1} style={{ ...bulkIconBtnSmall, opacity: count <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{count}</span>
                  <button onClick={() => setCount(t.id, count + 1)} style={bulkIconBtnSmall}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{totalCount} copie da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={totalCount === 0} style={{
            ...bulkBtnPrimary, opacity: totalCount === 0 ? 0.5 : 1, cursor: totalCount === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {totalCount} copie</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
const ImportTab = ({ onCreate, onClose }) => {
  const team = useTeam();
  const categories = useCategories();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await loadXLSX();
        const data = evt.target.result;
        const wb = XLSX.read(data, { type: "binary", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        if (!json.length) { setError("Il file è vuoto o non contiene righe leggibili."); return; }
        const cols = Object.keys(json[0]);
        setRows(json); setColumns(cols);
        const find = (kws) => cols.find(c => kws.some(kw => c.toLowerCase().includes(kw)));
        setMapping({
          title: find(["titolo", "title", "nome", "task"]) || "",
          category: find(["categoria", "category", "tipo"]) || "",
          priority: find(["priorit", "priority"]) || "",
          status: find(["stato", "status"]) || "",
          client: find(["cliente", "client"]) || "",
          dueDate: find(["scadenz", "due", "data"]) || "",
          assignee: find(["assegn", "assign", "owner", "responsab"]) || "",
          estimatedHours: find(["ore", "hours"]) || "",
          description: find(["descriz", "descr", "note"]) || "",
        });
      } catch (err) {
        setError("Impossibile leggere il file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  const normCat = (v) => {
    if (!v) return "admin";
    const s = String(v).toLowerCase().trim();
    return Object.keys(categories).find(k => k === s || categories[k].label.toLowerCase() === s) || "admin";
  };
  const normPrio = (v) => {
    if (!v) return "medium";
    const s = String(v).toLowerCase().trim();
    return Object.keys(PRIORITIES).find(k => k === s || PRIORITIES[k].label.toLowerCase() === s) || "medium";
  };
  const normStat = (v) => {
    if (!v) return "todo";
    const s = String(v).toLowerCase().trim();
    return STATUSES.find(k => k === s || STATUS_LABELS[k].toLowerCase() === s) || "todo";
  };
  const normAssignee = (v) => {
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    const m = team.find(mm => mm.id === s || mm.name.toLowerCase().includes(s) || s.includes(mm.name.toLowerCase().split(" ")[0]));
    return m?.id || null;
  };
  const normDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const validRows = mapping.title ? rows.filter(r => String(r[mapping.title] || "").trim()) : [];

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => {
      const assignee = mapping.assignee ? normAssignee(r[mapping.assignee]) : null;
      return {
        id: "t" + ts + "-" + idx,
        title: String(r[mapping.title]).trim(),
        category: normCat(mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        assignees: assignee ? [assignee] : [],
        client: mapping.client ? (String(r[mapping.client] || "").trim() || null) : null,
        dueDate: mapping.dueDate ? normDate(r[mapping.dueDate]) : null,
        estimatedHours: mapping.estimatedHours ? (parseFloat(r[mapping.estimatedHours]) || 1) : 1,
        description: mapping.description ? String(r[mapping.description] || "").trim() : "",
        comments: [],
      };
    });
    onCreate(tasks);
    onClose();
  };

  const reset = () => { setRows([]); setColumns([]); setMapping({}); setFileName(""); setError(null); };

  const fields = [
    { key: "title", label: "Titolo *" }, { key: "category", label: "Categoria" },
    { key: "priority", label: "Priorità" }, { key: "status", label: "Stato" },
    { key: "client", label: "Cliente" }, { key: "dueDate", label: "Scadenza" },
    { key: "assignee", label: "Assegnato" }, { key: "estimatedHours", label: "Ore stimate" },
    { key: "description", label: "Descrizione" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!rows.length && (
        <div onClick={() => fileInputRef.current?.click()} style={{
          border: "2px dashed var(--border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Clicca per caricare CSV o Excel</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Formati supportati: .csv, .xlsx, .xls</div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13 }}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
            <button onClick={reset} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia file</button>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>MAPPATURA COLONNE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {fields.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>{f.label}</div>
                  <select value={mapping[f.key] || ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} style={bulkInputStyle}>
                    <option value="">— non mappato —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
              ANTEPRIMA (prime 5 righe)
            </div>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>{columns.map(c => (
                    <th key={c} style={{ padding: "8px 10px", background: "var(--surface2)", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", position: "sticky", top: 0 }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{columns.map(c => (
                      <td key={c} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(r[c] || "")}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {validRows.length} task validi {!mapping.title && rows.length > 0 && "(mappa il TITOLO)"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || !mapping.title} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || !mapping.title) ? 0.5 : 1,
            cursor: (validRows.length === 0 || !mapping.title) ? "not-allowed" : "pointer",
          }}>✓ Importa {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: TEMPLATE TAB ────────────────────────────────────────────────────
const TemplateTab = ({ onCreate, onClose }) => {
  const team = useTeam();
  const categories = useCategories();
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");

  const tpl = TASK_TEMPLATES.find(t => t.id === selectedId);
  const previewTasks = tpl && eventDate ? tpl.tasks.map(t => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + t.dayOffset);
    return { ...t, dueDate: d.toISOString() };
  }) : [];

  const handleCreate = () => {
    if (!tpl || !eventDate) return;
    const ts = Date.now();
    const tasks = previewTasks.map((t, idx) => ({
      id: "t" + ts + "-" + idx,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: "todo",
      assignees: defaultAssignee ? [defaultAssignee] : [],
      client: client.trim() || null,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!selectedId ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TASK_TEMPLATES.map(t => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="hover-lift" style={{
              padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
              cursor: "pointer", background: "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{t.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{tpl.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CLIENTE</div>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="Es. Famiglia Rossi" style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>DATA EVENTO *</div>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {eventDate && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={{ fontSize: 14 }}>{categories[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        📅 {new Date(t.dueDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{previewTasks.length} task pronti</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={!tpl || !eventDate} style={{
            ...bulkBtnPrimary,
            opacity: (!tpl || !eventDate) ? 0.5 : 1,
            cursor: (!tpl || !eventDate) ? "not-allowed" : "pointer",
          }}>✓ Crea {previewTasks.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
const BulkTaskCreator = ({ existingTasks, onCreate, onClose }) => {
  const [tab, setTab] = useState("manual");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 820, maxWidth: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📑</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Crea più task</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 }}>MANUALE · DUPLICA · IMPORT · TEMPLATE</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {[
            { id: "manual", icon: "✏️", label: "Manuale" },
            { id: "duplicate", icon: "🔁", label: "Duplica" },
            { id: "import", icon: "📥", label: "Importa file" },
            { id: "template", icon: "📋", label: "Da template" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "manual" && <ManualTab onCreate={onCreate} onClose={onClose} />}
          {tab === "duplicate" && <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} />}
          {tab === "import" && <ImportTab onCreate={onCreate} onClose={onClose} />}
          {tab === "template" && <TemplateTab onCreate={onCreate} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
};

// ─── AI DAY PLANNER ────────────────────────────────────────────────────────
const AIDayPlanner = ({ tasks, onClose }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const today = new Date();

    // I task attivi assegnati a Marco
    const myTasks = tasks.filter(t =>
      t.assignees?.includes(currentUserId) && t.status !== "done"
    );

    // Task di altri operatori: scaduti, oppure urgenti e ancora in "todo"
    // (proxy ragionevole per "non visti / non presi in carico")
    const othersNeglected = tasks.filter(t => {
      if (!t.assignees || t.assignees.includes(currentUserId)) return false;
      if (t.status === "done") return false;
      const urgent = t.priority === "critical" || t.priority === "high";
      const overdue = isOverdue(t);
      const untouched = t.status === "todo";
      return overdue || (urgent && untouched);
    });

    const compact = (t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      client: t.client,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      assignees: t.assignees?.map(a => getMember(a, team)?.name).filter(Boolean),
      overdue: isOverdue(t),
      category: t.category,
    });

    const prompt = `Sei un assistente operativo per un'agenzia viaggi. Pianifica oggi (${today.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}) per Marco Ferretti (Manager).

MIEI TASK ATTIVI:
${JSON.stringify(myTasks.map(compact))}

TASK URGENTI/SCADUTI DI ALTRI OPERATORI CHE SEMBRANO NEGLETTI (potrebbero non averli visti):
${JSON.stringify(othersNeglected.map(compact))}

Rispondi SOLO con JSON valido, senza markdown e senza testo prima o dopo. Schema:
{
  "summary": "1-2 frasi che inquadrano la giornata",
  "schedule": [{ "time": "HH:MM", "duration": "30min", "taskId": "tX", "action": "cosa fare in concreto", "why": "perché ora" }],
  "alerts": [{ "taskId": "tX", "owner": "Nome", "severity": "alta|media", "suggestion": "azione consigliata (sollecito, escalation, presa in carico)" }],
  "tips": ["consiglio breve e concreto"]
}

Regole:
- Orario: 09:00-18:00, pausa pranzo 13:00-14:00.
- Pianifica solo i MIEI task nel campo "schedule"; ordina per priorità (critical/overdue prima).
- I task di ALTRI operatori vanno SOLO in "alerts" (massimo 3, i più urgenti).
- Per i campi "taskId" usa esattamente gli id forniti.
- Massimo 2 "tips", brevi.`;

    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error("Errore di rete (HTTP " + r.status + ")");
        return r.json();
      })
      .then(data => {
        if (cancelled) return;
        const text = (data.content || []).map(b => b.text || "").join("").trim();
        const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(clean);
        setPlan(parsed);
      })
      .catch(e => { if (!cancelled) setError(e.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [tasks, currentUserId, team]);

  const findTask = (id) => tasks.find(t => t.id === id);
  const sevColor = { alta: "var(--danger)", media: "var(--warning)" };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 640, maxWidth: "100%",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: "var(--gold)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
            }}>✨</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>
                Pianifica la mia giornata
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, letterSpacing: 1.2, marginTop: 2 }}>
                ASSISTENTE AI
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🤔</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Sto analizzando i tuoi task...</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Carico, priorità e scadenze del team
              </div>
              <div style={{ marginTop: 16, height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div className="skeleton" style={{ height: "100%", width: "60%" }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{
              background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)",
              padding: "14px 16px", borderRadius: 10, fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Impossibile generare il piano</div>
              <div style={{ fontSize: 12 }}>{error}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                L'assistente AI funziona solo in ambiente Claude.ai (l'API key è iniettata dalla piattaforma).
              </div>
            </div>
          )}

          {plan && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Summary */}
              {plan.summary && (
                <div style={{
                  background: "var(--surface2)", borderLeft: "3px solid var(--gold)",
                  padding: "12px 14px", borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                }}>{plan.summary}</div>
              )}

              {/* Schedule */}
              {plan.schedule?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🗓️ Programma della giornata
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.schedule.map((s, i) => {
                      const t = findTask(s.taskId);
                      return (
                        <div key={i} style={{
                          display: "flex", gap: 12, padding: "10px 12px",
                          border: "1px solid var(--border)", borderRadius: 10, background: "#fff",
                        }}>
                          <div style={{
                            display: "flex", flexDirection: "column", alignItems: "center",
                            minWidth: 54, paddingTop: 2,
                          }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)" }}>{s.time}</div>
                            {s.duration && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{s.duration}</div>}
                          </div>
                          <div style={{ width: 1, background: "var(--border)" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                              {t && <CategoryChip category={t.category} small />}
                              {t && <PriorityBadge priority={t.priority} />}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                              {t?.title || s.action}
                            </div>
                            {s.action && t && (
                              <div style={{ fontSize: 12, color: "var(--text)", marginTop: 4 }}>{s.action}</div>
                            )}
                            {s.why && (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                                💡 {s.why}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Alerts */}
              {plan.alerts?.length > 0 && (
                <div>
                  <div className="playfair" style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
                    🚨 Task di altri operatori da monitorare
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {plan.alerts.map((a, i) => {
                      const t = findTask(a.taskId);
                      const color = sevColor[a.severity] || "var(--warning)";
                      return (
                        <div key={i} style={{
                          background: color + "12", border: `1px solid ${color}40`,
                          borderRadius: 10, padding: "10px 12px",
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{t?.title || a.taskId}</div>
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                Resp. {a.owner}{t?.dueDate && ` • scadenza ${formatDate(t.dueDate)}`}
                              </div>
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, color, textTransform: "uppercase",
                              padding: "2px 8px", borderRadius: 99, background: "#fff", flexShrink: 0,
                            }}>{a.severity}</span>
                          </div>
                          <div style={{ fontSize: 12, marginTop: 6, color: "var(--text)" }}>
                            👉 {a.suggestion}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tips */}
              {plan.tips?.length > 0 && (
                <div style={{
                  background: "linear-gradient(135deg, rgba(212,168,67,0.08), rgba(212,168,67,0.02))",
                  border: "1px dashed rgba(212,168,67,0.4)",
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold-dark)", letterSpacing: 1, marginBottom: 6 }}>
                    ✨ CONSIGLI
                  </div>
                  <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.6, color: "var(--text)" }}>
                    {plan.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 24px", borderTop: "1px solid var(--border)",
          display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: "var(--surface)",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}>Chiudi</button>
        </div>
      </div>
    </div>
  );
};

// ─── NOTICE BOARD (bacheca avvisi) ─────────────────────────────────────────
const NoticeBoard = ({ notices, dispatch }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [editing, setEditing] = useState(null); // null | { id?, text, color }
  const [creating, setCreating] = useState(false);
  const { isMobile } = useViewport();

  // Pinned in alto, poi per data
  const sorted = [...notices].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} g fa`;
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, #faf5e6 0%, #f5efd9 100%)",
      backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(139,90,43,0.04) 23px, rgba(139,90,43,0.04) 24px), repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(139,90,43,0.03) 23px, rgba(139,90,43,0.03) 24px)",
      backgroundColor: "#faf5e6",
      border: "1px solid #d4c08a",
      borderRadius: 12, padding: isMobile ? "14px 12px 16px" : "18px 22px 22px",
      boxShadow: "inset 0 2px 6px rgba(139,90,43,0.1), 0 2px 10px rgba(0,0,0,0.05)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "var(--navy)", color: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📌</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Bacheca avvisi
            </div>
            <div style={{ fontSize: 11, color: "#8b6f3a", marginTop: 2 }}>
              Visibile a tutto il team • chiunque può aggiungere o modificare
            </div>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: "0 2px 8px rgba(15,32,68,0.3)",
          }}
        >
          + Nuovo avviso
        </button>
      </div>

      {/* Board */}
      {sorted.length === 0 ? (
        <div style={{
          padding: "30px 20px", textAlign: "center", color: "#8b6f3a",
          fontSize: 13, fontStyle: "italic",
        }}>
          ✨ Nessun avviso in bacheca. Clicca "+ Nuovo avviso" per pubblicarne uno.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16, padding: "6px 4px",
        }}>
          {sorted.map((n, idx) => {
            const author = getMember(n.author, team);
            const rotation = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.7; // -1.4 a +1.4 deg
            return (
              <div
                key={n.id}
                style={{
                  background: n.color,
                  padding: "14px 14px 12px",
                  borderRadius: 4,
                  position: "relative",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.2s, box-shadow 0.2s",
                  minHeight: 130,
                  display: "flex", flexDirection: "column",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "rotate(0deg) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15), 0 2px 5px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                {/* Pin in alto */}
                {n.pinned && (
                  <div style={{
                    position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                    fontSize: 18, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
                  }}>📌</div>
                )}

                {/* Toolbar actions */}
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  display: "flex", gap: 2, opacity: 0.6,
                }}>
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_PIN_NOTICE", payload: n.id })}
                    title={n.pinned ? "Rimuovi pin" : "Fissa in alto"}
                    style={noticeBtnStyle}
                  >{n.pinned ? "📍" : "📌"}</button>
                  <button
                    onClick={() => setEditing({ id: n.id, text: n.text, color: n.color, pinned: n.pinned })}
                    title="Modifica"
                    style={noticeBtnStyle}
                  >✏️</button>
                  <button
                    onClick={() => {
                      if (window.confirm("Eliminare questo avviso?")) {
                        dispatch({ type: "DELETE_NOTICE", payload: n.id });
                      }
                    }}
                    title="Elimina"
                    style={noticeBtnStyle}
                  >✕</button>
                </div>

                {/* Testo avviso */}
                <div style={{
                  fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  flex: 1, marginTop: 10, marginRight: 50,
                }}>
                  {n.text}
                </div>

                {/* Footer: autore + data */}
                <div style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: "1px dashed rgba(61,47,16,0.2)",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10, color: "#5d4920",
                }}>
                  {author && (
                    <>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", background: author.color,
                        color: "#fff", fontSize: 8, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{author.avatar}</div>
                      <span style={{ fontWeight: 600 }}>{author.name.split(" ")[0]}</span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto" }}>{formatRel(n.updatedAt || n.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <NoticeEditorModal
          notice={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) {
              dispatch({ type: "UPDATE_NOTICE", payload: { id: editing.id, ...data } });
            } else {
              dispatch({
                type: "ADD_NOTICE",
                payload: {
                  id: "n" + Date.now(),
                  ...data,
                  author: currentUserId,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              });
            }
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const noticeBtnStyle = {
  background: "rgba(255,255,255,0.6)", border: "none", borderRadius: 4,
  width: 22, height: 22, cursor: "pointer", fontSize: 11,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
};

const NoticeEditorModal = ({ notice, onClose, onSave }) => {
  const [text, setText] = useState(notice?.text || "");
  const [color, setColor] = useState(notice?.color || NOTICE_COLORS[0]);
  const [pinned, setPinned] = useState(notice?.pinned || false);
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const submit = () => {
    if (!text.trim()) return;
    onSave({ text: text.trim(), color, pinned });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, padding: 24,
        width: "90%", maxWidth: 520,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>
          {notice ? "✏️ Modifica avviso" : "📌 Nuovo avviso"}
        </h3>

        {/* Preview live */}
        <div style={{
          background: color, padding: "12px 14px", borderRadius: 4,
          marginBottom: 16, minHeight: 80,
          boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
          fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {text || <span style={{ color: "#8b6f3a", fontStyle: "italic" }}>Anteprima dell'avviso...</span>}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Scrivi qui il tuo avviso..."
          rows={4}
          maxLength={500}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--border)", fontSize: 13,
            outline: "none", fontFamily: "inherit", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.45,
          }}
          onFocus={e => e.target.style.borderColor = "var(--gold)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
          {text.length}/500
        </div>

        {/* Colore */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Colore post-it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {NOTICE_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 34, height: 34, borderRadius: 6, background: c,
                  cursor: "pointer", border: color === c ? "2px solid var(--navy)" : "2px solid transparent",
                  transition: "transform 0.15s",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  transform: color === c ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Pin */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
          📌 Fissa questo avviso in cima alla bacheca
        </label>

        {/* Footer buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)",
            background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>Annulla</button>
          <button onClick={submit} disabled={!text.trim()} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: text.trim() ? "var(--navy)" : "var(--text-light)",
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: text.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{notice ? "💾 Salva modifiche" : "📌 Pubblica avviso"}</button>
        </div>
      </div>
    </div>
  );
};

// ─── PERSONAL QUEUE (le mie task — v0.8) ───────────────────────────────────
const PersonalQueue = ({ tasks, dispatch, me }) => {
  const { isMobile } = useViewport();
  const categories = useCategories();
  const empty = tasks.length === 0;
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(15,32,68,0.04) 0%, rgba(15,32,68,0.01) 100%)",
      border: "1px solid rgba(15,32,68,0.15)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: me?.color || "var(--navy)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>{me?.avatar || "?"}</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              La mia coda — task assegnate a me
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Ordinate per scadenza • clicca una card per i dettagli
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--navy)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length} {tasks.length === 1 ? "task" : "task"}</div>
        )}
      </div>

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          Nessuna task aperta a tuo nome. Buon lavoro!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = categories[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const urgent = isUrgent(t);
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: `1px solid ${overdue ? "rgba(192,57,43,0.4)" : urgent ? "rgba(200,131,42,0.4)" : "var(--border)"}`,
                  padding: 12, display: "flex", flexDirection: "column", gap: 8,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                  borderLeft: `3px solid ${prio.color}`,
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : urgent ? "var(--warning)" : "var(--text-muted)", fontWeight: (overdue || urgent) ? 700 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
                    </span>
                  )}
                  {t.estimatedHours > 0 && <span>⏱️ {t.estimatedHours}h</span>}
                </div>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── URGENT OTHERS QUEUE (scadenza <24h, non mie — read-only — v0.8) ──────
const UrgentOthersQueue = ({ tasks, dispatch, onOpenChat, uid }) => {
  const { isMobile } = useViewport();
  const categories = useCategories();
  const team = useTeam();
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(200,131,42,0.07) 0%, rgba(200,131,42,0.01) 100%)",
      border: "1px solid rgba(200,131,42,0.35)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--warning)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>⏱</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Urgenti del team — scadenza entro 24h
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Solo visualizzazione • clicca sull'agente per scrivergli in chat
            </div>
          </div>
        </div>
        <div style={{
          background: "var(--warning)", color: "#fff",
          padding: "4px 12px", borderRadius: 999,
          fontSize: 13, fontWeight: 700,
        }}>{tasks.length}</div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        gap: 10,
      }}>
        {tasks.map(t => {
          const cat = categories[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
          const prio = PRIORITIES[t.priority];
          const owner = getMember(t.assignees?.[0], team);
          return (
            <div
              key={t.id}
              style={{
                background: "#fff", borderRadius: 10,
                border: "1px solid rgba(200,131,42,0.3)",
                padding: 12, display: "flex", flexDirection: "column", gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 8px", borderRadius: 999,
                  background: cat.bg, color: cat.color,
                  fontSize: 11, fontWeight: 600,
                }}>
                  <span>{cat.icon}</span> {cat.label}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                  background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                }}>{prio.label}</div>
              </div>

              <div
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35, cursor: "pointer" }}
              >
                {t.title}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                {t.client && <span>👤 {t.client}</span>}
                {t.dueDate && (
                  <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                    ⏱ {formatDate(t.dueDate)} ({formatTime(t.dueDate)})
                  </span>
                )}
              </div>

              {/* Owner cliccabile → apre chat con link al task */}
              {owner && (
                <button
                  onClick={() => onOpenChat && onOpenChat({ toUser: owner.id, taskLink: t.id })}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
                  onMouseLeave={e => e.currentTarget.style.background = "var(--surface2)"}
                  title={`Scrivi a ${owner.name}`}
                >
                  <Avatar memberId={owner.id} size={24} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{owner.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>💬 contatta</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── UNASSIGNED QUEUE (coda globale) ───────────────────────────────────────
const UnassignedQueue = ({ tasks, dispatch, onTake }) => {
  const { isMobile } = useViewport();
  const categories = useCategories();
  const empty = tasks.length === 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(212,168,67,0.05) 0%, rgba(212,168,67,0.01) 100%)",
      border: "1px solid rgba(212,168,67,0.3)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--gold)", color: "var(--navy)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>🙋</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Coda globale — task da prendere in carico
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Task non assegnati • visibili a tutto il team • clicca "Prendi in carico" per autoassegnarti
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--gold)", color: "var(--navy)",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length} in attesa</div>
        )}
      </div>

      {/* Lista */}
      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✨</span>
          Nessun task in coda. Tutti gli incarichi hanno un proprietario!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = categories[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: `1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`,
                  padding: 12, display: "flex", flexDirection: "column", gap: 10,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {/* Top row: category + priority */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>{prio.label}</div>
                </div>

                {/* Title */}
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>

                {/* Meta */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                    </span>
                  )}
                  {t.estimatedHours > 0 && <span>⏱️ {t.estimatedHours}h</span>}
                </div>

                {/* Take ownership button */}
                <button
                  onClick={e => { e.stopPropagation(); onTake(t); }}
                  style={{
                    background: "var(--gold)", color: "var(--navy)",
                    border: "none", borderRadius: 8,
                    padding: "8px 12px", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", display: "flex", alignItems: "center",
                    justifyContent: "center", gap: 6,
                    fontFamily: "inherit",
                    transition: "background 0.15s, transform 0.15s",
                    marginTop: 2,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--gold-light)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--gold)"; }}
                >
                  🙋 Prendi in carico
                </button>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── QUEUE TAB (Dashboard tab card) ───────────────────────────────────────
const QueueTab = ({ active, onClick, icon, label, count, isMobile, dangerCount }) => {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--navy)" : "transparent",
        color: active ? "#fff" : "var(--text)",
        border: active ? "none" : "1px solid var(--border)",
        borderRadius: 10,
        padding: isMobile ? "10px 6px" : "12px 10px",
        cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 4,
        transition: "background 0.15s, transform 0.1s",
        fontFamily: "inherit",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ fontSize: isMobile ? 18 : 20 }}>{icon}</div>
      <div style={{ fontSize: isMobile ? 10 : 11, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{label}</div>
      <div style={{
        background: active ? "rgba(255,255,255,0.2)" : dangerCount && count > 0 ? "var(--danger)" : "var(--surface3)",
        color: active ? "#fff" : dangerCount && count > 0 ? "#fff" : "var(--text-muted)",
        fontSize: 11, fontWeight: 700,
        padding: "1px 8px", borderRadius: 999, minWidth: 22, textAlign: "center",
      }}>{count}</div>
    </button>
  );
};

// ─── OVERDUE QUEUE (task scaduti visibili) ────────────────────────────────
const OverdueQueue = ({ tasks, dispatch }) => {
  const { isMobile } = useViewport();
  const categories = useCategories();
  const team = useTeam();
  const empty = tasks.length === 0;
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(192,57,43,0.05) 0%, rgba(192,57,43,0.01) 100%)",
      border: "1px solid rgba(192,57,43,0.2)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--danger)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📅</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              Task scadute
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Ordinate per data di scadenza • richiedono attenzione immediata
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--danger)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length}</div>
        )}
      </div>

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          Nessuna task scaduta. Tutto in regola!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = categories[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: "1px solid rgba(192,57,43,0.4)",
                  padding: 12, display: "flex", flexDirection: "column", gap: 8,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                  borderLeft: `3px solid ${prio.color}`,
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                      📅 {formatDate(t.dueDate)} ⚠ scaduto
                    </span>
                  )}
                  {t.assignees?.length > 0 && (
                    <span>👥 {t.assignees.map(a => getMember(a, team)?.name?.split(" ")[0]).filter(Boolean).join(", ")}</span>
                  )}
                </div>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────
const Dashboard = ({ state, dispatch, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [showAIPlanner, setShowAIPlanner] = useState(false);
  const [activeQueue, setActiveQueue] = useState("personal");
  const uid = state.currentUserId;
  const team = state.team;
  const categories = state.categories;
  const role = getRoleType(uid, team);
  const me = getMember(uid, team);
  const allTasks = getActiveTasks(state.tasks);
  // Filtro permessi: solo task visibili all'utente
  const tasks = getVisibleTasks(allTasks, uid, team);

  const agentWorkload = getAssignableTeam(team).map(m => ({
    ...m,
    count: allTasks.filter(t => t.assignees?.includes(m.id) && t.status !== "done").length
  }));

  const next7 = tasks
    .filter(t => t.status !== "done" && t.dueDate)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, 6);

  // ─── 3 code distinte (v0.8) ───
  // Coda globale: task non assegnati (Driver non la vede)
  const showGlobalQueue = role !== "driver";
  const unassigned = showGlobalQueue
    ? allTasks.filter(t => isInGlobalQueue(t) && canViewTask(t, uid, team)).sort((a, b) => {
        const prioOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const dp = prioOrder[a.priority] - prioOrder[b.priority];
        if (dp !== 0) return dp;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      })
    : [];

  // Coda personale: task dove sono assegnatario, non completati
  const personalQueue = allTasks
    .filter(t => isMyTask(t, uid) && t.status !== "done")
    .sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

  // Urgenti altrui: task con scadenza < 24h, non mie, non in coda globale (Driver non li vede)
  const showUrgentOthers = role !== "driver" && role !== "admin";
  const urgentOthers = showUrgentOthers
    ? allTasks
      .filter(t => !isMyTask(t, uid) && !isInGlobalQueue(t) && isUrgent(t))
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    : [];

  // Scadute: tutti i task visibili scaduti, non completati
  const overdueTasks = tasks
    .filter(t => t.status !== "done" && isOverdue(t))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const takeOwnership = (task) => {
    // Step I: auto-assegna + auto-move "In Corso" se la task è in todo,
    // più toast personalizzato che cita il titolo.
    const patch = { id: task.id, assignees: [uid] };
    if (task.status === "todo") patch.status = "inprogress";
    dispatch({
      type: "UPDATE_TASK",
      payload: patch,
      swipe: true,
      toastMessage: `Hai preso in carico: ${task.title}`,
    });
  };

  const firstName = me?.name?.split(" ")[0] || "ciao";

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24, minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700 }}>
            Buongiorno, {firstName} ☀️
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2 }}>
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
            {role !== "admin" && <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 8px", background: "var(--surface3)", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.3 }}>{me?.role}</span>}
          </div>
        </div>
        <button onClick={() => setShowAIPlanner(true)} style={{
          background: "linear-gradient(135deg, var(--gold) 0%, var(--gold-dark) 100%)",
          color: "var(--navy)", border: "none",
          padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(212,168,67,0.4)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(212,168,67,0.5)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(212,168,67,0.4)"; }}
        >
          <span>✨</span> Pianifica la mia giornata
        </button>
      </div>

      {/* ─── BACHECA AVVISI ─── */}
      <NoticeBoard notices={state.notices} dispatch={dispatch} />

      {/* ─── TAB CODE ─── */}
      <div style={{
        background: "#fff", borderRadius: 12, padding: isMobile ? 8 : 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: `repeat(${(showGlobalQueue ? 1 : 0) + 1 + 1 + (showUrgentOthers ? 1 : 0)}, 1fr)`,
        gap: isMobile ? 6 : 8,
      }}>
        {showGlobalQueue && (
          <QueueTab
            active={activeQueue === "global"}
            onClick={() => setActiveQueue("global")}
            icon="🌐" label="Coda Globale" count={unassigned.length}
            isMobile={isMobile}
          />
        )}
        <QueueTab
          active={activeQueue === "personal"}
          onClick={() => setActiveQueue("personal")}
          icon="👤" label="Coda Personale" count={personalQueue.length}
          isMobile={isMobile}
        />
        <QueueTab
          active={activeQueue === "overdue"}
          onClick={() => setActiveQueue("overdue")}
          icon="📅" label="Scadute" count={overdueTasks.length}
          isMobile={isMobile} dangerCount
        />
        {showUrgentOthers && (
          <QueueTab
            active={activeQueue === "urgent"}
            onClick={() => setActiveQueue("urgent")}
            icon="⚠️" label="Urgenti" count={urgentOthers.length}
            isMobile={isMobile} dangerCount
          />
        )}
      </div>

      {/* ─── SEZIONE CODA FILTRATA ─── */}
      {activeQueue === "personal" && (
        <PersonalQueue tasks={personalQueue} dispatch={dispatch} me={me} />
      )}
      {activeQueue === "global" && showGlobalQueue && (
        <UnassignedQueue tasks={unassigned} dispatch={dispatch} onTake={takeOwnership} />
      )}
      {activeQueue === "overdue" && (
        <OverdueQueue tasks={overdueTasks} dispatch={dispatch} />
      )}
      {activeQueue === "urgent" && showUrgentOthers && (
        <UrgentOthersQueue tasks={urgentOthers} dispatch={dispatch} onOpenChat={onOpenChat} uid={uid} />
      )}

      <div className="vd-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Upcoming deadlines */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Scadenze Prossime</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {next7.map(t => (
              <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 8, cursor: "pointer", transition: "background 0.15s",
                  background: isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent",
                  border: `1px solid ${isOverdue(t) ? "rgba(192,57,43,0.15)" : "var(--border)"}`,
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = isOverdue(t) ? "rgba(192,57,43,0.05)" : "transparent"}
              >
                <span style={{ fontSize: 16 }}>{categories[t.category]?.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: isOverdue(t) ? "var(--danger)" : "var(--text-muted)" }}>
                    {isOverdue(t) ? "⚠️ Scaduto • " : ""}{formatDate(t.dueDate)}
                  </div>
                </div>
                <PriorityBadge priority={t.priority} />
              </div>
            ))}
          </div>
        </div>

        {/* Agent workload */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Carico di Lavoro Team</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {agentWorkload.map(m => {
              const pct = Math.min(100, Math.round((m.count / m.capacity) * 100));
              const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
              return (
                <div key={m.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                    <Avatar memberId={m.id} size={30} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{m.count}/{m.capacity}</div>
                  </div>
                  <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3, transition: "width 0.6s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAIPlanner && <AIDayPlanner tasks={tasks} onClose={() => setShowAIPlanner(false)} />}
    </div>
  );
};

// ─── QUICK ADD TASK FORM ───────────────────────────────────────────────────
const QuickAddTask = ({ onAdd, onClose }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const categories = useCategories();
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(currentUserId, team, categories);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "", client: "", description: ""
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onAdd({
      id: "t" + Date.now(),
      ...form,
      client: form.client.trim() || null,
      comments: [],
      estimatedHours: 1,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    });
    onClose();
  };

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: {
      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 10px", fontSize: 13, background: "var(--surface)",
      outline: "none", fontFamily: "inherit",
    }
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 14, padding: 28, width: 500, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 30px 80px rgba(0,0,0,0.2)", border: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 20, fontWeight: 700 }}>Nuovo Task</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>TITOLO *</label>
            <input {...inp("title")} placeholder="Descrivi brevemente il task..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CATEGORIA</label>
              <select {...inp("category")} style={{ ...inp("category").style, cursor: "pointer" }}>
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>PRIORITÀ</label>
              <select {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>ASSEGNA A</label>
              <select
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>SCADENZA</label>
              <input type="datetime-local" {...inp("dueDate")} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CLIENTE</label>
            <input {...inp("client")} placeholder="Es. Famiglia Rossi..." />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>Annulla</button>
          <button onClick={handleSubmit} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>✓ Crea Task</button>
        </div>
      </div>
    </div>
  );
};

// ─── TASK DETAIL SLIDE-OVER ────────────────────────────────────────────────
const TaskSlideOver = ({ task, dispatch }) => {
  const { isMobile } = useViewport();
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [newComment, setNewComment] = useState("");

  if (!task) return null;

  const handleComment = () => {
    if (!newComment.trim()) return;
    const authorName = getMember(currentUserId, team)?.name || "Utente";
    dispatch({
      type: "ADD_COMMENT", payload: {
        taskId: task.id,
        comment: { user: authorName, text: newComment, time: new Date().toISOString() }
      }
    });
    setNewComment("");
  };

  const handleStatusChange = (e) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: e.target.value } });
  };

  const handleDelete = () => {
    if (window.confirm(`Spostare nel cestino "${task.title}"?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
  };

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 500 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480, height: "100vh",
        background: "#fff", zIndex: 600, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--navy)", padding: "18px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <CategoryChip category={task.category} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 }}>⚠️ Scaduto</span>}
            </div>
            <div className="playfair" style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={handleDelete} title="Sposta nel cestino" style={{
              background: "rgba(220,38,38,0.15)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
              transition: "background 0.2s"
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.4)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(220,38,38,0.15)"}
            >🗑️</button>
            <button onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Status select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>STATO</div>
              <select value={task.status} onChange={handleStatusChange} style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                background: "white", cursor: "pointer"
              }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>SCADENZA</div>
              <div style={{ fontSize: 13, fontWeight: 500, padding: "7px 10px", background: "var(--surface2)", borderRadius: 8 }}>
                {formatDate(task.dueDate)} {formatTime(task.dueDate) && `ore ${formatTime(task.dueDate)}`}
              </div>
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ASSEGNATI</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {task.assignees?.map(id => {
                  const m = getMember(id, team);
                  return m ? (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", padding: "4px 8px", borderRadius: 99 }}>
                      <Avatar memberId={id} size={20} />
                      <span style={{ fontSize: 12 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  ) : null;
                })}
                {!task.assignees?.length && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Non assegnato</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>CLIENTE</div>
              <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
              </div>
            </div>
          </div>

          {/* ORE */}
          {task.estimatedHours && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>ORE STIMATE</div>
              <div style={{ fontSize: 13 }}>{task.estimatedHours}h</div>
            </div>
          )}

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>DESCRIZIONE</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 }}>
              {task.description || <span style={{ color: "var(--text-muted)" }}>Nessuna descrizione.</span>}
            </div>
          </div>

          {/* Attachments placeholder */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ALLEGATI</div>
            <div style={{
              border: "2px dashed var(--border)", borderRadius: 8, padding: "20px",
              textAlign: "center", color: "var(--text-muted)", fontSize: 13, cursor: "pointer"
            }}>📎 Trascina file qui o clicca per caricare</div>
          </div>

          {/* Comments */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
              ATTIVITÀ & COMMENTI ({task.comments?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(task.comments || []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--navy)",
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#fff", flexShrink: 0
                  }}>
                    {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(c.time)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.5 }}>{c.text}</div>
                  </div>
                </div>
              ))}

              {/* New comment */}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: "var(--gold)",
                  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--navy)", flexShrink: 0
                }}>MF</div>
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="Aggiungi un commento..."
                    style={{
                      flex: 1, border: "1px solid var(--border)", borderRadius: 8,
                      padding: "7px 10px", fontSize: 12, fontFamily: "inherit"
                    }} />
                  <button onClick={handleComment} style={{
                    background: "var(--navy)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13
                  }}>↑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── CALENDAR PLANNER (unificato: mese + settimana + distribuzione agenti) ──
// ─── iCal export (Step G) ────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }
function icsDate(d) {
  // YYYYMMDDTHHmmssZ (UTC)
  const u = new Date(d);
  return (
    u.getUTCFullYear() + pad2(u.getUTCMonth() + 1) + pad2(u.getUTCDate()) +
    "T" + pad2(u.getUTCHours()) + pad2(u.getUTCMinutes()) + pad2(u.getUTCSeconds()) + "Z"
  );
}
function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function buildIcs(tasks) {
  const now = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoyageDesk//Tasks//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const start = new Date(t.dueDate);
    const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@voyagedesk`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(t.title || "Task")}`,
      `DESCRIPTION:${icsEscape((t.description || "") + (t.priority ? "\nPriorità: " + t.priority : ""))}`,
      `CATEGORIES:${icsEscape(t.category || "task")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function exportTasksToIcs(allTasks, uid, team) {
  const tasks = (allTasks || []).filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.dueDate);
  if (tasks.length === 0) return;
  const ics = buildIcs(tasks);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `voyagedesk-tasks-${ts}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const CalendarPlanner = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "week-full" | "day"
  const [dayDate, setDayDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const uid = state.currentUserId;
  const team = state.team;
  const categories = state.categories;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.dueDate && new Date(t.dueDate).toDateString() === d);
  };

  // ── Week helpers ──
  const getWeekDays = (offset) => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const getTasksForDay = (day) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString());

  // ── Distribuzione agenti (settimana corrente in vista week, settimana del mese selezionato in vista month) ──
  const agentWeekDays = viewMode === "week" ? weekDays : (() => {
    // In vista mese, usiamo la settimana corrente
    return getWeekDays(0);
  })();

  // ── Toggle style ──
  const toggleBtn = (mode, label) => (
    <button
      onClick={() => { setViewMode(mode); setSelectedDay(null); }}
      style={{
        background: viewMode === mode ? "var(--navy)" : "transparent",
        color: viewMode === mode ? "#fff" : "var(--text)",
        border: viewMode === mode ? "none" : "1px solid var(--border)",
        borderRadius: 8, padding: isMobile ? "6px 12px" : "6px 16px",
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* ─── Header con toggle + navigazione ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, textTransform: viewMode === "month" ? "capitalize" : "none" }}>
            {viewMode === "month" && monthName}
            {viewMode === "week" && "Settimana"}
            {viewMode === "week-full" && "Settimana piena"}
            {viewMode === "day" && dayDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {(viewMode === "week" || viewMode === "week-full") && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              {weekDays[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
            {toggleBtn("day", isMobile ? "Gior." : "🕒 Giorno")}
            {toggleBtn("week", isMobile ? "Sett." : "📆 Settimana")}
            {toggleBtn("week-full", isMobile ? "Sett.+" : "🗓️ Sett. piena")}
            {toggleBtn("month", isMobile ? "Mese" : "📅 Mese")}
          </div>
          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month - 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; });
              else setWeekOffset(w => w - 1);
            }} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>←</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date());
              else if (viewMode === "day") setDayDate(new Date());
              else setWeekOffset(0);
              setSelectedDay(null);
            }} style={{
              background: "var(--gold)", color: "var(--navy)", border: "none",
              borderRadius: 8, padding: "0 14px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 700
            }}>Oggi</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month + 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; });
              else setWeekOffset(w => w + 1);
            }} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>→</button>
            <button onClick={() => exportTasksToIcs(state.tasks, uid, team)} title="Esporta calendario in iCal (.ics)" style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "var(--navy)",
            }}>⤓ iCal</button>
          </div>
        </div>
      </div>

      {/* ─── VISTA MESE ─── */}
      {viewMode === "month" && (
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--navy)", padding: "10px 0" }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayTasks = getTasksForCalDay(day);
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  padding: isMobile ? "5px 3px" : "8px 6px", cursor: dayTasks.length ? "pointer" : "default",
                  background: selectedDay === day ? "rgba(212,168,67,0.08)" : "#fff",
                  transition: "background 0.15s", display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "stretch",
                }}>
                  <div style={{
                    width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? "var(--navy)" : "transparent",
                    color: isToday ? "#fff" : "var(--text)", marginBottom: 4
                  }}>{day}</div>
                  {isMobile ? (
                    dayTasks.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
                        {dayTasks.slice(0, 4).map(t => (
                          <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: categories[t.category]?.color || "var(--navy)" }} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_TASK", payload: t }); }} style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                          background: categories[t.category]?.color + "20",
                          color: categories[t.category]?.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}>{categories[t.category]?.icon} {t.title}</div>
                      ))}
                      {dayTasks.length > 3 && <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>+{dayTasks.length - 3} altri</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Day detail (month view) ─── */}
      {viewMode === "month" && selectedDay && (() => {
        const dayTasks = getTasksForCalDay(selectedDay);
        if (!dayTasks.length) return null;
        return (
          <div className="slide-up" style={{
            background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
          }}>
            <div className="playfair" style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Task del {selectedDay} {monthName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayTasks.map(t => {
                const row = (
                  <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.15s", background: "#fff",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span style={{ fontSize: 18 }}>{categories[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.client ? `${t.client} • ` : ""}{formatTime(t.dueDate)}</div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                );
                return (
                  <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                    {row}
                  </SwipeActions>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA ─── */}
      {viewMode === "week" && (
        <div style={{ overflowX: isMobile ? "auto" : "visible", scrollSnapType: isMobile ? "x mandatory" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(7, 60vw)" : "repeat(7, 1fr)", gap: 10 }}>
            {weekDays.map((day, i) => {
              const dayTasks = getTasksForDay(day);
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} style={{
                  background: isToday ? "var(--navy)" : "#fff",
                  borderRadius: 10, border: `1px solid ${isToday ? "transparent" : "var(--border)"}`,
                  overflow: "hidden", scrollSnapAlign: isMobile ? "start" : "none",
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: "10px 10px 6px",
                    background: isToday ? "var(--gold)" : "var(--surface2)",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? "var(--navy)" : "var(--text-muted)" }}>{dayNames[i]}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? "var(--navy)" : "var(--text)" }}>
                      {day.getDate()}
                    </div>
                  </div>
                  <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 4, minHeight: 160 }}>
                    {dayTasks.length === 0 ? (
                      <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center", marginTop: 20 }}>Nessun task</div>
                    ) : dayTasks.slice(0, 6).map(t => (
                      <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                        background: isToday ? "rgba(255,255,255,0.12)" : categories[t.category]?.color + "18",
                        borderLeft: `3px solid ${categories[t.category]?.color}`,
                        borderRadius: "0 4px 4px 0", padding: "4px 6px", cursor: "pointer",
                        fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                        color: isToday ? "#fff" : "var(--text)",
                      }}>
                        {categories[t.category]?.icon} {t.title.slice(0, 30)}{t.title.length > 30 ? "…" : ""}
                        <div style={{ fontSize: 9, color: isToday ? "rgba(255,255,255,0.5)" : "var(--text-muted)", marginTop: 1 }}>{formatTime(t.dueDate)}</div>
                      </div>
                    ))}
                    {dayTasks.length > 6 && <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center" }}>+{dayTasks.length - 6} altri</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── VISTA GIORNO (Step G) ─── */}
      {viewMode === "day" && (() => {
        const dayTasks = state.tasks
          .filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.dueDate &&
            new Date(t.dueDate).toDateString() === dayDate.toDateString())
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 44; // px per ora
        const isToday = dayDate.toDateString() === new Date().toDateString();
        const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
        return (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px", background: "var(--surface2)",
              fontSize: 12, color: "var(--text-muted)", fontWeight: 600,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{dayTasks.length} task in agenda</span>
              {isToday && <span style={{ color: "var(--gold)" }}>● Oggi</span>}
            </div>
            <div style={{ position: "relative", display: "flex", maxHeight: 640, overflowY: "auto" }}>
              {/* Colonna ore */}
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, padding: "2px 8px", fontSize: 10, color: "var(--text-muted)",
                    textAlign: "right", borderBottom: "1px solid var(--surface2)",
                  }}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>
              {/* Colonna eventi */}
              <div style={{ flex: 1, position: "relative" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                  }} />
                ))}
                {/* Linea ora corrente */}
                {nowMinutes != null && (
                  <div style={{
                    position: "absolute", left: 0, right: 0,
                    top: (nowMinutes / 60) * SLOT_H,
                    height: 2, background: "var(--gold)", zIndex: 2,
                  }}>
                    <div style={{
                      position: "absolute", left: -4, top: -4, width: 10, height: 10,
                      borderRadius: "50%", background: "var(--gold)",
                    }} />
                  </div>
                )}
                {/* Eventi */}
                {dayTasks.map(t => {
                  const d = new Date(t.dueDate);
                  const startMin = d.getHours() * 60 + d.getMinutes();
                  const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                  const top = (startMin / 60) * SLOT_H;
                  const height = Math.max(28, hours * SLOT_H - 2);
                  const cat = categories[t.category] || {};
                  return (
                    <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                      position: "absolute", top, left: 6, right: 6, height,
                      background: (cat.color || "#94a3b8") + "22",
                      borderLeft: `3px solid ${cat.color || "#94a3b8"}`,
                      borderRadius: "0 6px 6px 0", padding: "4px 8px",
                      cursor: "pointer", overflow: "hidden", fontSize: 12,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", zIndex: 1,
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cat.icon} {t.title}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                        {formatTime(t.dueDate)} · {hours}h
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA PIENA (Step G) ─── */}
      {viewMode === "week-full" && (() => {
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 36;
        const today = new Date().toDateString();
        return (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            {/* Header giorni */}
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, background: "var(--surface2)" }}>
              <div />
              {weekDays.map((d, i) => {
                const isToday = d.toDateString() === today;
                return (
                  <div key={i} style={{
                    padding: "8px 4px", textAlign: "center", fontSize: 11,
                    color: isToday ? "var(--gold)" : "var(--text-muted)",
                    fontWeight: 600, borderLeft: "1px solid var(--border)",
                  }}>
                    {dayNames[i]} {d.getDate()}
                  </div>
                );
              })}
            </div>
            {/* Griglia oraria scrollabile */}
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, position: "relative" }}>
                {/* Colonna ore */}
                <div>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      height: SLOT_H, padding: "2px 6px", fontSize: 9, color: "var(--text-muted)",
                      textAlign: "right", borderBottom: "1px solid var(--surface2)",
                    }}>{String(h).padStart(2, "0")}:00</div>
                  ))}
                </div>
                {weekDays.map((day, di) => {
                  const dayTasks = getTasksForDay(day).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                  const isToday = day.toDateString() === today;
                  return (
                    <div key={di} style={{
                      position: "relative", borderLeft: "1px solid var(--border)",
                      background: isToday ? "rgba(212,168,67,0.04)" : "transparent",
                    }}>
                      {HOURS.map(h => (
                        <div key={h} style={{
                          height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                        }} />
                      ))}
                      {dayTasks.map(t => {
                        const d = new Date(t.dueDate);
                        const startMin = d.getHours() * 60 + d.getMinutes();
                        const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                        const top = (startMin / 60) * SLOT_H;
                        const height = Math.max(20, hours * SLOT_H - 2);
                        const cat = categories[t.category] || {};
                        return (
                          <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                            position: "absolute", top, left: 2, right: 2, height,
                            background: (cat.color || "#94a3b8") + "22",
                            borderLeft: `2px solid ${cat.color || "#94a3b8"}`,
                            borderRadius: "0 4px 4px 0", padding: "2px 5px",
                            cursor: "pointer", overflow: "hidden", fontSize: 10, lineHeight: 1.2,
                          }}>
                            <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cat.icon} {t.title}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatTime(t.dueDate)}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── DISTRIBUZIONE AGENTI (sempre visibile) ─── */}
      <div style={{ background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
        <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Distribuzione Settimanale per Agente</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--surface2)", borderRadius: "8px 0 0 0", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", width: 150 }}>Agente</th>
                {agentWeekDays.map((d, i) => (
                  <th key={i} style={{
                    padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                    color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                    textAlign: "center", minWidth: 70
                  }}>
                    {dayNames[i]}<br />{d.getDate()}
                  </th>
                ))}
                <th style={{ padding: "8px 6px", background: "var(--surface2)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderRadius: "0 8px 0 0" }}>TOT</th>
              </tr>
            </thead>
            <tbody>
              {getAssignableTeam(team).map(m => (
                <tr key={m.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={{ fontWeight: 500 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {agentWeekDays.map((day, i) => {
                    const count = state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      new Date(t.dueDate).toDateString() === day.toDateString()
                    ).length;
                    return (
                      <td key={i} style={{
                        padding: "8px 6px", textAlign: "center", borderBottom: "1px solid var(--border)",
                        background: count > 0 ? m.color + "12" : "transparent",
                      }}>
                        {count > 0 ? (
                          <span style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{count}</span>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--navy)" }}>
                    {state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      agentWeekDays.some(d => new Date(t.dueDate).toDateString() === d.toDateString())
                    ).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
const Team = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [selectedMember, setSelectedMember] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const uid = state.currentUserId;
  const team = state.team;
  const categories = state.categories;

  const memberTasks = (memberId) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.assignees?.includes(memberId));

  const filtered = selectedMember
    ? memberTasks(selectedMember).filter(t => !filterStatus || t.status === filterStatus)
    : [];

  const roleColors = { Manager: "#0F2044", "Senior Agent": "#2D7A4F", "Junior Agent": "#C8832A", Driver: "#7B4F9E", Admin: "#C0392B" };

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28 }}>
      <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 22 }}>Team & Assegnazioni</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginBottom: 28 }}>
        {getAssignableTeam(team).map(m => {
          const tasks = memberTasks(m.id);
          const active = tasks.filter(t => t.status !== "done");
          const done = tasks.filter(t => t.status === "done");
          const pct = Math.min(100, Math.round((active.length / m.capacity) * 100));
          const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
          const isSelected = selectedMember === m.id;

          return (
            <div key={m.id} className="hover-lift" onClick={() => setSelectedMember(isSelected ? null : m.id)} style={{
              background: "#fff", borderRadius: 12, padding: "20px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `2px solid ${isSelected ? m.color : "var(--border)"}`,
              cursor: "pointer", textAlign: "center", transition: "all 0.2s",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: m.color,
                fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", margin: "0 auto 10px"
              }}>{m.avatar}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
                background: roleColors[m.role] + "15", color: roleColors[m.role], marginTop: 4, display: "inline-block"
              }}>{m.role}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, marginBottom: 8 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{active.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Attivi</div>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{done.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Completati</div>
                </div>
              </div>

              <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{active.length}/{m.capacity} capacità</div>
            </div>
          );
        })}
      </div>

      {selectedMember && (() => {
        const m = getMember(selectedMember, team);
        if (!m) return null;
        return (
          <div className="slide-up" style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar memberId={selectedMember} size={40} />
                <div>
                  <div className="playfair" style={{ fontSize: 16, fontWeight: 700 }}>Task di {m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer"
              }}>
                <option value="">Tutti gli stati</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 14 }}>
                  Nessun task trovato per questo filtro
                </div>
              ) : filtered.map(t => (
                <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                  transition: "background 0.15s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 18 }}>{categories[t.category]?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {t.client && `👤 ${t.client} • `}📅 {formatDate(t.dueDate)}
                    </div>
                  </div>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ─── CHAT: MOCK DATA ───────────────────────────────────────────────────────
// L'utente corrente si legge via useCurrentUserId() (AppContext).

// Context per condividere tasks/dispatch (per messaggi con taskLink — v0.8)
const ChatContext = createContext({ tasks: [], dispatch: () => {} });

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

// ─── CHAT: UTILS ───────────────────────────────────────────────────────────
const formatChatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

const formatMsgTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getConversationName = (conv, currentUserId, team) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== currentUserId);
  return getMember(other, team)?.name || "Sconosciuto";
};

const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

const getUnreadCount = (msgs, convId, currentUserId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== currentUserId && !m.readBy?.includes(currentUserId)).length;
};

// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

const ReactionPicker = ({ onPick, onClose }) => (
  <div onClick={e => e.stopPropagation()} style={{
    position: "absolute", bottom: "calc(100% + 4px)", left: 0,
    background: "#fff", borderRadius: 20, padding: "6px 8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
    display: "flex", gap: 2, zIndex: 100,
  }}>
    {EMOJI_REACTIONS.map(e => (
      <button key={e} onClick={() => { onPick(e); onClose(); }} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 18, padding: 4, borderRadius: 6, transition: "background 0.15s",
      }}
        onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
      >{e}</button>
    ))}
  </div>
);

// ─── CHAT: VOICE PLAYER ────────────────────────────────────────────────────
const VoicePlayer = ({ duration, waveform, isMine }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { setPlaying(false); return 0; }
        return p + (100 / (duration * 10));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, duration]);

  const color = isMine ? "rgba(255,255,255,0.9)" : "var(--navy)";
  const dimColor = isMine ? "rgba(255,255,255,0.35)" : "var(--text-light)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
      <button onClick={() => setPlaying(!playing)} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMine ? "rgba(255,255,255,0.2)" : "var(--gold)",
        border: "none", cursor: "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: isMine ? "#fff" : "var(--navy)", fontSize: 12,
        flexShrink: 0,
      }}>{playing ? "⏸" : "▶"}</button>

      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, height: 28 }}>
        {waveform.map((h, i) => {
          const barProgress = (i / waveform.length) * 100;
          const filled = barProgress <= progress;
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`, minHeight: 3,
              background: filled ? color : dimColor,
              borderRadius: 1, transition: "background 0.1s",
            }} />
          );
        })}
      </div>

      <span style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.8)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {formatDuration(Math.floor((100 - progress) / 100 * duration))}
      </span>
    </div>
  );
};

// Parsing task link nel testo dei messaggi (Step H).
// Riconosce il pattern generato da openChatTo+intent.taskLink:
//   🔗 Riferimento task: "TITLE"\n📅 Scadenza: DATE TIME\n\nRESTO
// Ritorna { taskTitle, taskDue, rest } o null se non match.
const TASK_LINK_RE = /^🔗 Riferimento task: "([^"]+)"\n📅 Scadenza:([^\n]*)\n\n([\s\S]*)$/;
function parseTaskLink(text) {
  if (typeof text !== "string") return null;
  const m = TASK_LINK_RE.exec(text);
  if (!m) return null;
  return { taskTitle: m[1], taskDue: m[2].trim(), rest: m[3] };
}

// Renderizza testo del messaggio con eventuale pill task cliccabile.
// Step K: lookup preferito per `taskRef` (UUID) se presente sul messaggio;
// fallback per titolo (compat messaggi vecchi senza taskRef).
const MessageTextContent = ({ text, isMine, taskRef }) => {
  const { tasks, dispatch } = useContext(ChatContext);
  const link = parseTaskLink(text);
  if (!link) {
    return <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>{text}</div>;
  }
  // Step K: prima cerca per UUID, poi fallback al match titolo.
  const tByRef = taskRef ? (tasks || []).find(x => x.id === taskRef && !x.deletedAt) : null;
  const t = tByRef || (tasks || []).find(x => x.title === link.taskTitle && !x.deletedAt);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!t) return;
    dispatch?.({ type: "SET_SELECTED_TASK", payload: t });
  };
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!t}
        title={t ? "Apri task" : "Task non disponibile"}
        style={{
          display: "block", textAlign: "left", width: "100%",
          background: isMine ? "rgba(255,255,255,0.12)" : "var(--surface2)",
          border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--border)",
          color: "inherit",
          padding: "6px 10px", borderRadius: 8, marginBottom: link.rest ? 6 : 0,
          cursor: t ? "pointer" : "not-allowed", opacity: t ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 0.5 }}>
          🔗 RIFERIMENTO TASK
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
          {link.taskTitle}
        </div>
        {link.taskDue && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            📅 {link.taskDue}
          </div>
        )}
      </button>
      {link.rest && <div>{link.rest}</div>}
    </div>
  );
};

// ─── CHAT: FILE HELPERS (Step M) ───────────────────────────────────────────
// Limite bucket 'chat-files' (vedi migration 20260611_chat_files_storage.sql).
// Replicato qui per validazione client prima di iniziare l'upload.
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Deduce il "kind" UI (icona) dall'estensione del file caricato.
const fileKindFromName = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "img";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "default";
};

// fileSize reale è in byte (bigint su DB); i vecchi mock usano stringhe
// già formattate ("245 KB") → passthrough.
const formatFileSize = (size) => {
  if (typeof size !== "number") return size || "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

// ─── CHAT: MESSAGE ─────────────────────────────────────────────────────────
const ChatMessage = ({ msg, prevMsg, conv, allMessages, onReact, onReply, onContextMenu }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isMine = msg.sender === currentUserId;
  const sender = getMember(msg.sender, team);
  const showAvatar = !prevMsg || prevMsg.sender !== msg.sender;
  const showName = conv.type === "group" && !isMine && showAvatar;

  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replyAuthor = replyMsg ? getMember(replyMsg.sender, team) : null;

  // Read indicator
  const otherParticipants = conv.participants.filter(p => p !== currentUserId);
  const readByAll = isMine && otherParticipants.every(p => msg.readBy?.includes(p));
  const readBySome = isMine && otherParticipants.some(p => msg.readBy?.includes(p));

  const fileIcons = { pdf: "📄", doc: "📝", img: "🖼️", xls: "📊", default: "📎" };

  // Step M: apre l'allegato con una signed URL temporanea dal bucket privato.
  const [fileOpening, setFileOpening] = useState(false);
  const openFile = async () => {
    if (!msg.fileUrl || fileOpening) return;
    setFileOpening(true);
    const { url, error } = await MessagesAPI.getFileUrl(msg.fileUrl);
    setFileOpening(false);
    if (error || !url) { console.error("[chat] signed url", error); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReactions(false); }}
      style={{
        display: "flex", flexDirection: isMine ? "row-reverse" : "row",
        gap: 8, marginTop: showAvatar ? 12 : 2, alignItems: "flex-end",
        position: "relative",
      }}>
      {/* Avatar */}
      <div style={{ width: 28, flexShrink: 0 }}>
        {!isMine && showAvatar && <Avatar memberId={msg.sender} size={28} />}
      </div>

      {/* Message bubble */}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", position: "relative" }}>
        {showName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: sender?.color, marginBottom: 3, marginLeft: 12 }}>
            {sender?.name}
          </div>
        )}

        <div style={{
          background: isMine ? "var(--navy)" : "#fff",
          color: isMine ? "#fff" : "var(--text)",
          padding: msg.type === "voice" ? "8px 12px" : "8px 12px",
          borderRadius: 14,
          borderTopRightRadius: isMine && showAvatar ? 4 : 14,
          borderTopLeftRadius: !isMine && showAvatar ? 4 : 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}>
          {/* Reply preview */}
          {replyMsg && (
            <div style={{
              borderLeft: `3px solid ${isMine ? "var(--gold)" : replyAuthor?.color || "var(--navy)"}`,
              padding: "4px 8px", marginBottom: 6, borderRadius: 4,
              background: isMine ? "rgba(255,255,255,0.1)" : "var(--surface2)",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: isMine ? "var(--gold)" : replyAuthor?.color }}>
                {replyAuthor?.name}
              </div>
              <div style={{ opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                {replyMsg.type === "voice" ? "🎙️ Vocale" : replyMsg.type === "file" ? `📎 ${replyMsg.fileName}` : replyMsg.text}
              </div>
            </div>
          )}

          {/* Content */}
          {msg.type === "text" && (
            <MessageTextContent text={msg.text} isMine={isMine} taskRef={msg.taskRef} />
          )}

          {msg.type === "voice" && (
            <VoicePlayer duration={msg.duration} waveform={msg.waveform} isMine={isMine} />
          )}

          {msg.type === "file" && (
            <div
              onClick={openFile}
              title={msg.fileUrl ? "Scarica file" : "File di esempio (nessun contenuto)"}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                minWidth: 220, cursor: msg.fileUrl ? "pointer" : "default",
              }}>
              <div style={{
                width: 40, height: 40, background: isMine ? "rgba(255,255,255,0.15)" : "var(--surface2)",
                borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{fileIcons[msg.fileType] || fileIcons.default}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.fileName}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{formatFileSize(msg.fileSize)}</div>
              </div>
              {msg.fileUrl && <div style={{ fontSize: 16, opacity: 0.7 }}>{fileOpening ? "⏳" : "⬇"}</div>}
            </div>
          )}

          {/* Timestamp + read indicator inside bubble */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end",
            marginTop: 3, fontSize: 10, opacity: 0.7,
          }}>
            <span>{formatMsgTime(msg.time)}</span>
            {isMine && (
              <span style={{ fontSize: 12, lineHeight: 1, color: readByAll ? "var(--gold-light)" : "currentColor" }}>
                {readByAll ? "✓✓" : readBySome ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: "flex", gap: 3, marginTop: 4,
            marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
          }}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <div key={emoji} style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: 99, padding: "2px 7px", fontSize: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{users.length}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons (hover) */}
        {hovered && (
          <div style={{
            position: "absolute", top: -8, [isMine ? "left" : "right"]: -8,
            display: "flex", gap: 2, background: "#fff",
            border: "1px solid var(--border)", borderRadius: 99,
            padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}>
            <button onClick={() => setShowReactions(s => !s)} style={iconBtn}>😊</button>
            <button onClick={() => onReply(msg)} style={iconBtn}>↩</button>
          </div>
        )}

        {showReactions && (
          <ReactionPicker
            onPick={(e) => onReact(msg.id, e)}
            onClose={() => setShowReactions(false)}
          />
        )}
      </div>
    </div>
  );
};

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
const VoiceRecorder = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)",
      flex: 1,
    }}>
      <div className="record-pulse" style={{
        width: 10, height: 10, borderRadius: "50%", background: "var(--danger)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center", height: 20 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, background: "var(--navy)",
            height: `${30 + Math.random() * 70}%`, minHeight: 3,
            borderRadius: 1,
            animation: `wave 0.${4 + (i % 5)}s ease infinite`,
            animationDelay: `${i * 0.05}s`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        {formatDuration(seconds)}
      </span>
      <button onClick={onCancel} style={{
        background: "var(--surface2)", border: "none", borderRadius: "50%",
        width: 30, height: 30, cursor: "pointer", fontSize: 14,
      }}>✕</button>
      <button onClick={() => onSend(seconds)} style={{
        background: "var(--gold)", color: "var(--navy)", border: "none",
        borderRadius: "50%", width: 30, height: 30, cursor: "pointer",
        fontSize: 14, fontWeight: 700,
      }}>↑</button>
    </div>
  );
};

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
const ConversationView = ({ conv, messages, setMessages, markConversationRead, onBack, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const [typing, setTyping] = useState(false);
  // Step K: taskRef UUID "armato" finché il prossimo invio non lo consuma.
  const [pendingTaskRef, setPendingTaskRef] = useState(null);
  const scrollRef = useRef(null);
  // Step M: upload allegati reale
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const { dispatch } = useContext(ChatContext);
  // Guardia unmount: setState dopo unmount (utente chiude la chat mid-upload)
  // genera un warning React e perde la callback di errore.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Se è arrivato un prefill (es. da "contatta agente" su urgenti altrui), popolalo
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
      if (initialTaskRef) setPendingTaskRef(initialTaskRef);
      if (onInitialInputConsumed) onInitialInputConsumed();
    }
  }, [initialInput, initialTaskRef]);

  const msgs = messages[conv.id] || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // Mark as read on open (Step Q.4: 1 RPC bulk invece di N UPDATE per msg)
  useEffect(() => {
    if (markConversationRead) {
      markConversationRead(conv.id);
      return;
    }
    // Fallback per i call site che non passano il callback (eg. test)
    setMessages(prev => ({
      ...prev,
      [conv.id]: (prev[conv.id] || []).map(m => {
        if (m.sender !== currentUserId && !m.readBy?.includes(currentUserId)) {
          return { ...m, readBy: [...(m.readBy || []), currentUserId] };
        }
        return m;
      })
    }));
  }, [conv.id]);

  // Simulate someone typing
  useEffect(() => {
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.sender === currentUserId) {
      const timer = setTimeout(() => setTyping(true), 800);
      const stop = setTimeout(() => setTyping(false), 3500);
      return () => { clearTimeout(timer); clearTimeout(stop); };
    }
  }, [msgs.length]);

  const sendText = () => {
    if (!input.trim()) return;
    // Step K: se il testo che sta partendo contiene un pattern "🔗 Riferimento task: ..."
    // (perché viene da prefill o l'utente l'ha mantenuto), allega taskRef UUID.
    const textOut = input.trim();
    const stillHasLink = parseTaskLink(textOut) !== null;
    const newMsg = {
      id: "m" + Date.now(), sender: currentUserId, type: "text",
      text: textOut, time: new Date().toISOString(),
      readBy: [currentUserId],
      replyTo: replyingTo?.id,
      ...(stillHasLink && pendingTaskRef ? { taskRef: pendingTaskRef } : {}),
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setInput("");
    setReplyingTo(null);
    setPendingTaskRef(null);
  };

  const sendVoice = (duration) => {
    const waveform = Array.from({ length: 30 }, () => 0.3 + Math.random() * 0.6);
    const newMsg = {
      id: "m" + Date.now(), sender: currentUserId, type: "voice",
      duration, waveform, time: new Date().toISOString(),
      readBy: [currentUserId],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    setRecording(false);
  };

  // Step M: il picker nativo viene aperto con un accept diverso per tipo;
  // l'upload va sul bucket privato 'chat-files' e il messaggio porta il path.
  const pickFile = (accept) => {
    setShowAttach(false);
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  const sendFile = async (file) => {
    if (!file || uploading) return;
    // Validazione client del limite del bucket (vedi migration
    // 20260611_chat_files_storage.sql): senza, l'utente vede l'errore
    // solo dopo aver caricato fino al rifiuto Storage.
    if (file.size > MAX_FILE_SIZE) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` } });
      return;
    }
    // Conv mock (id non-uuid, smoke-test senza login): nessuno storage,
    // il messaggio resta solo locale senza fileUrl.
    let fileUrl = null;
    if (isUuid(conv.id)) {
      setUploading(true);
      const { path, error } = await MessagesAPI.uploadFile(file, conv.id);
      if (!mountedRef.current) return;
      setUploading(false);
      if (error || !path) {
        console.error("[chat] upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Upload fallito: ${error?.message || "errore sconosciuto"}` } });
        return;
      }
      fileUrl = path;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: currentUserId, type: "file",
      fileName: file.name, fileSize: file.size,
      fileType: fileKindFromName(file.name), fileUrl,
      time: new Date().toISOString(),
      readBy: [currentUserId],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
  };

  const handleReact = (msgId, emoji) => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: prev[conv.id].map(m => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(currentUserId)) {
          reactions[emoji] = users.filter(u => u !== currentUserId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, currentUserId];
        }
        return { ...m, reactions };
      })
    }));
  };

  const otherTypingMember = conv.participants.find(p => p !== currentUserId);
  const otherMember = conv.type === "direct" ? getMember(otherTypingMember, team) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface2)" }}>
      {/* Header */}
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
        borderBottom: "1px solid rgba(212,168,67,0.2)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>

        {conv.type === "direct" ? (
          <Avatar memberId={otherTypingMember} size={36} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>{conv.icon || "👥"}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {getConversationName(conv, currentUserId, team)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            {typing ? (
              <span style={{ color: "var(--gold-light)" }}>
                {conv.type === "group" ? `${getMember(otherTypingMember, team)?.name.split(" ")[0]} sta scrivendo` : "sta scrivendo"}
                <span style={{ animation: "typing 1s infinite", animationDelay: "0s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.2s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.4s", display: "inline-block" }}>.</span>
              </span>
            ) : conv.type === "direct" ? (
              <>● Online</>
            ) : (
              `${conv.participants.length} membri`
            )}
          </div>
        </div>

        <button style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 12,
        }}>⋮</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        background: "var(--surface2)",
      }}>
        {msgs.map((m, i) => (
          <ChatMessage
            key={m.id}
            msg={m}
            prevMsg={msgs[i - 1]}
            conv={conv}
            allMessages={msgs}
            onReact={handleReact}
            onReply={setReplyingTo}
          />
        ))}
        {typing && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
            <Avatar memberId={otherTypingMember} size={28} />
            <div style={{
              background: "#fff", border: "1px solid var(--border)",
              borderRadius: 14, borderTopLeftRadius: 4, padding: "8px 12px",
              display: "flex", gap: 3, alignItems: "center",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div style={{
          padding: "8px 14px", background: "#fff", borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-dark)" }}>
              Rispondi a {getMember(replyingTo.sender, team)?.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {replyingTo.type === "voice" ? "🎙️ Vocale" : replyingTo.type === "file" ? `📎 ${replyingTo.fileName}` : replyingTo.text}
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "var(--text-muted)",
          }}>✕</button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: "10px 12px", background: "#fff", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        position: "relative",
      }}>
        {recording ? (
          <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
        ) : (
          <>
            <div style={{ position: "relative" }}>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  sendFile(f);
                }}
              />
              <button onClick={() => setShowAttach(s => !s)} disabled={uploading} style={{
                background: "var(--surface2)", border: "none", borderRadius: "50%",
                width: 36, height: 36, cursor: uploading ? "wait" : "pointer", fontSize: 18, flexShrink: 0,
              }}>{uploading ? "⏳" : "📎"}</button>
              {showAttach && (
                <div className="slide-up" style={{
                  position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                  background: "#fff", borderRadius: 12, padding: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 4, minWidth: 160, zIndex: 100,
                }}>
                  {[
                    { kind: "pdf", icon: "📄", label: "Documento PDF", accept: "application/pdf" },
                    { kind: "img", icon: "🖼️", label: "Immagine", accept: "image/*" },
                    { kind: "doc", icon: "📝", label: "Word/Excel", accept: ".doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt" },
                  ].map(opt => (
                    <button key={opt.kind} onClick={() => pickFile(opt.accept)} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", border: "none", background: "transparent",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, textAlign: "left",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
              placeholder="Scrivi un messaggio..."
              style={{
                flex: 1, border: "1px solid var(--border)", borderRadius: 22,
                padding: "10px 16px", fontSize: 13.5, fontFamily: "inherit",
                outline: "none", background: "var(--surface)",
              }}
            />

            {input.trim() ? (
              <button onClick={sendText} style={{
                background: "var(--navy)", color: "#fff", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>↑</button>
            ) : (
              <button onClick={() => setRecording(true)} style={{
                background: "var(--gold)", color: "var(--navy)", border: "none",
                borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
                fontSize: 16, flexShrink: 0,
              }}>🎙️</button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── CHAT: LIST OF CONVERSATIONS ───────────────────────────────────────────
const ConversationList = ({ conversations, messages, onSelect, onNew }) => {
  const { presenceMap } = useContext(ChatContext);
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const lastA = getLastMessage(messages, a.id);
    const lastB = getLastMessage(messages, b.id);
    if (!lastA) return 1;
    if (!lastB) return -1;
    return new Date(lastB.time) - new Date(lastA.time);
  });

  const matchesSearch = (c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    // 1) nome conversazione
    if (getConversationName(c, currentUserId, team).toLowerCase().includes(q)) return true;
    // 2) nomi partecipanti
    const partNames = (c.participants || [])
      .map(id => getMember(id, team)?.name || "")
      .join(" ")
      .toLowerCase();
    if (partNames.includes(q)) return true;
    // 3) ultimi 30 messaggi della conversazione (testo)
    const msgs = (messages[c.id] || []).slice(-30);
    for (const m of msgs) {
      if (m.type === "text" && m.text && m.text.toLowerCase().includes(q)) return true;
      if (m.type === "file" && m.fileName && m.fileName.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  const filtered = sorted.filter(c => {
    if (filter === "direct" && c.type !== "direct") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && getUnreadCount(messages, c.id, currentUserId) === 0) return false;
    if (!matchesSearch(c)) return false;
    return true;
  });

  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(messages, c.id, currentUserId), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>🔍</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
              outline: "none", background: "var(--surface)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[
            { id: "all", label: "Tutti" },
            { id: "unread", label: `Non letti${totalUnread ? ` (${totalUnread})` : ""}` },
            { id: "direct", label: "Diretti" },
            { id: "group", label: "Gruppi" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              border: "1px solid var(--border)", borderRadius: 99,
              background: filter === f.id ? "var(--navy)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--text-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(c => {
          const last = getLastMessage(messages, c.id);
          const unread = getUnreadCount(messages, c.id, currentUserId);
          const lastSender = last ? getMember(last.sender, team) : null;
          const otherUser = c.type === "direct" ? c.participants.find(p => p !== currentUserId) : null;

          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              borderBottom: "1px solid var(--border)", cursor: "pointer",
              transition: "background 0.15s",
              background: unread > 0 ? "rgba(212,168,67,0.05)" : "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = unread > 0 ? "rgba(212,168,67,0.05)" : "transparent"}
            >
              {c.type === "direct" ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar memberId={otherUser} size={42} />
                  {(() => {
                    const u = (presenceMap || {})[otherUser];
                    const p = u ? computePresence(u) : 'offline';
                    return (
                      <div title={p} style={{
                        position: "absolute", bottom: 0, right: 0, width: 11, height: 11,
                        borderRadius: "50%", background: PRESENCE_COLORS[p],
                        border: "2px solid #fff",
                      }} />
                    );
                  })()}
                </div>
              ) : (
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", background: "var(--gold)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>{c.icon || "👥"}</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                    {c.pinned && <span style={{ fontSize: 10, color: "var(--gold)" }}>📌</span>}
                    <span style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getConversationName(c, currentUserId, team)}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {last && formatChatTime(last.time)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <div style={{
                    fontSize: 12, color: unread > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: unread > 0 ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
                  }}>
                    {last ? (
                      <>
                        {last.sender === currentUserId && <span style={{ color: "var(--text-muted)" }}>Tu: </span>}
                        {c.type === "group" && last.sender !== currentUserId && (
                          <span style={{ color: lastSender?.color, fontWeight: 600 }}>
                            {lastSender?.name.split(" ")[0]}:{" "}
                          </span>
                        )}
                        {last.type === "voice" ? "🎙️ Messaggio vocale" :
                          last.type === "file" ? `📎 ${last.fileName}` :
                            last.text}
                      </>
                    ) : "Nessun messaggio"}
                  </div>
                  {unread > 0 && (
                    <div style={{
                      background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
                      borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0,
                    }}>{unread}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Nessuna conversazione trovata</div>
          </div>
        )}
      </div>

      <button onClick={onNew} style={{
        margin: 14, padding: "10px", background: "var(--navy)", color: "#fff",
        border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>✏️ Nuova chat</button>
    </div>
  );
};

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const currentUserId = useCurrentUserId();
  const team = useTeam();
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");

  const available = team.filter(m => m.id !== currentUserId);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const createDirect = (memberId) => {
    const found = existing.find(c => c.type === "direct" && c.participants.includes(memberId));
    if (found) { onCreate(found); return; }
    const newConv = {
      id: "c" + Date.now(), type: "direct",
      participants: [currentUserId,memberId], name: null,
    };
    onCreate(newConv, true);
  };

  const createGroup = () => {
    if (!groupName.trim() || selected.length < 2) return;
    const newConv = {
      id: "c" + Date.now(), type: "group",
      participants: [currentUserId,...selected],
      name: groupName.trim(), icon: "👥",
    };
    onCreate(newConv, true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>
        <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <button onClick={() => setMode("group")} style={{
              width: "100%", padding: "10px 14px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div key={m.id} onClick={() => createDirect(m.id)} style={{
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "group" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome del gruppo..."
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              SELEZIONA MEMBRI ({selected.length} selezionati)
            </div>
            {available.map(m => {
              const isSel = selected.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(m.id)} style={{
                  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                  cursor: "pointer", background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <Avatar memberId={m.id} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`,
                    background: isSel ? "var(--gold)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: "var(--navy)", fontWeight: 700,
                  }}>{isSel && "✓"}</div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <button onClick={() => setMode("select")} style={{
              flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
            }}>Indietro</button>
            <button onClick={createGroup} disabled={!groupName.trim() || selected.length < 2} style={{
              flex: 2, padding: "10px", background: "var(--navy)", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: (!groupName.trim() || selected.length < 2) ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              opacity: (!groupName.trim() || selected.length < 2) ? 0.5 : 1,
            }}>Crea gruppo</button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── CHAT: MAIN PANEL ──────────────────────────────────────────────────────
const ChatPanel = ({ open, onClose, conversations, setConversations, messages, setMessages, markConversationRead, intent, tasks, currentUserId, dispatch, presenceMap, loading = false }) => {
  const { isMobile } = useViewport();
  const [activeConv, setActiveConv] = useState(null);
  const [newMode, setNewMode] = useState(false);
  const [prefillText, setPrefillText] = useState("");
  // Step K: taskRef UUID da precompilare insieme al testo del riferimento task.
  const [prefillTaskRef, setPrefillTaskRef] = useState(null);

  // Gestione intent: apertura chat verso utente specifico con link a task
  useEffect(() => {
    if (!open || !intent || !intent.toUser) return;
    const me = currentUserId;
    // Cerca conversazione diretta esistente
    let direct = conversations.find(c =>
      c.type === "direct" &&
      c.participants.includes(me) &&
      c.participants.includes(intent.toUser)
    );
    if (!direct) {
      direct = {
        id: "c" + Date.now(),
        type: "direct",
        participants: [me, intent.toUser],
        name: null,
      };
      setConversations(prev => [direct, ...prev]);
    }
    setActiveConv(direct);
    setNewMode(false);
    // Precompila il messaggio con riferimento al task
    if (intent.taskLink) {
      const t = (tasks || []).find(x => x.id === intent.taskLink);
      if (t) {
        const text = `🔗 Riferimento task: "${t.title}"\n📅 Scadenza: ${formatDate(t.dueDate)} ${formatTime(t.dueDate)}\n\n`;
        setPrefillText(text);
        // Step K: salva l'UUID del task per popolare messages.task_ref alla send.
        setPrefillTaskRef(t.id);
      }
    }
  }, [open, intent, currentUserId]);

  if (!open) return null;

  const handleCreate = (conv, addNew = false) => {
    if (addNew) setConversations(c => [conv, ...c]);
    setActiveConv(conv);
    setNewMode(false);
  };

  return (
    <ChatContext.Provider value={{ tasks: tasks || [], currentUserId, dispatch: dispatch || (() => {}), presenceMap: presenceMap || {} }}>
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.3)", zIndex: 700,
      }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 420, height: "100vh",
        background: "#fff", zIndex: 800, boxShadow: "-20px 0 60px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>💬</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                Messaggi
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12, color: "var(--navy)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "3px solid rgba(15,32,68,0.15)", borderTopColor: "var(--gold)",
                animation: "spin 0.8s linear infinite",
              }} />
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>
                Caricamento chat…
              </div>
            </div>
          ) : newMode ? (
            <NewConversationView
              onCreate={handleCreate}
              onCancel={() => setNewMode(false)}
              existing={conversations}
            />
          ) : activeConv ? (
            <ConversationView
              conv={activeConv}
              messages={messages}
              setMessages={setMessages}
              markConversationRead={markConversationRead}
              onBack={() => { setActiveConv(null); setPrefillText(""); setPrefillTaskRef(null); }}
              initialInput={prefillText}
              initialTaskRef={prefillTaskRef}
              onInitialInputConsumed={() => { setPrefillText(""); setPrefillTaskRef(null); }}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              messages={messages}
              onSelect={setActiveConv}
              onNew={() => setNewMode(true)}
            />
          )}
        </div>
      </div>
    </>
    </ChatContext.Provider>
  );
};


// ─── TRASH (CESTINO) ───────────────────────────────────────────────────────
const Trash = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const team = state.team;
  const categories = state.categories;
  const [restoring, setRestoring] = useState(null); // task being restored/edited
  const trashed = getTrashedTasks(state.tasks)
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

  const handleRestore = (task) => {
    setRestoring({ ...task });
  };

  const handleConfirmRestore = () => {
    if (!restoring) return;
    const { deletedAt, ...updates } = restoring;
    dispatch({ type: "UPDATE_TASK", payload: updates });
    dispatch({ type: "RESTORE_TASK", payload: restoring.id });
    setRestoring(null);
  };

  const handlePurge = (task) => {
    if (window.confirm(`Eliminare definitivamente "${task.title}"?\n\nQuesta azione è irreversibile.`)) {
      dispatch({ type: "PURGE_TASK", payload: task.id });
    }
  };

  const handleEmpty = () => {
    if (trashed.length === 0) return;
    if (window.confirm(`Svuotare il cestino?\n\n${trashed.length} task verranno eliminati definitivamente. Azione irreversibile.`)) {
      dispatch({ type: "EMPTY_TRASH" });
    }
  };

  const updateField = (field, value) => setRestoring(prev => ({ ...prev, [field]: value }));

  return (
    <div className="vd-pad" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="playfair" style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", marginBottom: 4 }}>
            🗑️ Cestino
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashed.length === 0
              ? "Nessun task nel cestino"
              : `${trashed.length} task ${trashed.length === 1 ? "eliminato" : "eliminati"}. Ripristinali o rimuovili definitivamente.`
            }
          </div>
        </div>
        {trashed.length > 0 && (
          <button onClick={handleEmpty} style={{
            background: "var(--danger)", color: "#fff", border: "none",
            padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            fontWeight: 600, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(220,38,38,0.25)",
          }}>🔥 Svuota cestino</button>
        )}
      </div>

      {/* Empty state */}
      {trashed.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗑️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
            Cestino vuoto
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : (
        /* Trash table */
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>TASK</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CATEGORIA</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>CLIENTE</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ASSEGNATI</th>
                <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>ELIMINATO</th>
                <th style={{ padding: "12px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5 }}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {trashed.map(task => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--navy)", marginBottom: 2 }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                      <PriorityBadge priority={task.priority} />
                      <span>• {STATUS_LABELS[task.status]}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <CategoryChip category={task.category} />
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text)" }}>
                    {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {formatDate(task.deletedAt)}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => handleRestore(task)} title="Ripristina con modifica" style={{
                        background: "var(--navy)", color: "#fff", border: "none",
                        padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>↻ Ripristina</button>
                      <button onClick={() => handlePurge(task)} title="Elimina definitivamente" style={{
                        background: "#fff", color: "var(--danger)", border: "1px solid var(--danger)",
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODALE RIPRISTINO CON MODIFICA ─── */}
      {restoring && (
        <>
          <div onClick={() => setRestoring(null)} style={{
            position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 1000,
          }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 16, zIndex: 1001,
            width: isMobile ? "calc(100vw - 32px)" : 520, maxWidth: "100%",
            maxHeight: "90vh", overflowY: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Modal header */}
            <div style={{
              background: "var(--navy)", padding: "18px 22px",
              borderRadius: "16px 16px 0 0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ color: "#fff" }}>
                <div className="playfair" style={{ fontSize: 18, fontWeight: 700 }}>↻ Ripristina task</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Modifica i campi se necessario, poi conferma</div>
              </div>
              <button onClick={() => setRestoring(null)} style={{
                background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
                width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
              }}>✕</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Titolo */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>TITOLO</label>
                <input
                  value={restoring.title}
                  onChange={e => updateField("title", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Categoria + Priorità */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CATEGORIA</label>
                  <select
                    value={restoring.category}
                    onChange={e => updateField("category", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(categories).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>PRIORITÀ</label>
                  <select
                    value={restoring.priority}
                    onChange={e => updateField("priority", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Stato + Scadenza */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>STATO</label>
                  <select
                    value={restoring.status}
                    onChange={e => updateField("status", e.target.value)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                      background: "#fff", cursor: "pointer",
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>SCADENZA</label>
                  <input
                    type="datetime-local"
                    value={restoring.dueDate ? restoring.dueDate.slice(0, 16) : ""}
                    onChange={e => updateField("dueDate", e.target.value ? new Date(e.target.value).toISOString() : null)}
                    style={{
                      width: "100%", padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>

              {/* Cliente */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>CLIENTE</label>
                <input
                  value={restoring.client || ""}
                  onChange={e => updateField("client", e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 14, fontFamily: "inherit",
                    outline: "none",
                  }}
                  placeholder="Nome cliente"
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>

              {/* Assegnatari */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>ASSEGNATARI</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {getAssignableTeam(team).map(m => {
                    const sel = restoring.assignees?.includes(m.id);
                    return (
                      <button key={m.id}
                        onClick={() => {
                          const curr = restoring.assignees || [];
                          updateField("assignees", sel ? curr.filter(x => x !== m.id) : [...curr, m.id]);
                        }}
                        style={{
                          padding: "6px 12px", borderRadius: 99,
                          border: sel ? "2px solid var(--navy)" : "1px solid var(--border)",
                          background: sel ? "var(--navy)" : "#fff",
                          color: sel ? "#fff" : "var(--text)",
                          fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 5,
                          transition: "all 0.15s",
                        }}
                      >
                        <span style={{
                          width: 20, height: 20, borderRadius: 99,
                          background: sel ? "rgba(255,255,255,0.2)" : m.color, color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700,
                        }}>{m.avatar}</span>
                        {m.name.split(" ")[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Descrizione */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>DESCRIZIONE</label>
                <textarea
                  value={restoring.description || ""}
                  onChange={e => updateField("description", e.target.value)}
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                    resize: "vertical", outline: "none",
                  }}
                  placeholder="Descrizione task..."
                  onFocus={e => e.target.style.borderColor = "var(--gold)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: "14px 22px 18px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "flex-end", gap: 10,
            }}>
              <button onClick={() => setRestoring(null)} style={{
                background: "#fff", color: "var(--text)", border: "1px solid var(--border)",
                padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                fontWeight: 600, fontFamily: "inherit",
              }}>Annulla</button>
              <button
                onClick={handleConfirmRestore}
                disabled={!restoring.title?.trim()}
                style={{
                  background: restoring.title?.trim() ? "var(--navy)" : "var(--surface3)",
                  color: restoring.title?.trim() ? "#fff" : "var(--text-muted)",
                  border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: restoring.title?.trim() ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  boxShadow: restoring.title?.trim() ? "0 4px 14px rgba(15,32,68,0.3)" : "none",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >↻ Conferma ripristino</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
const AdminView = ({ state, dispatch }) => {
  const [tab, setTab] = useState("team");

  const tabs = [
    { id: "team", icon: "👥", label: "Team" },
    { id: "io", icon: "📤", label: "Import / Export" },
    { id: "stats", icon: "📊", label: "Sistema" },
    { id: "cats", icon: "🏷️", label: "Categorie" },
    { id: "log", icon: "📋", label: "Log attività" },
  ];

  return (
    <div className="vd-pad" style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="playfair" style={{ fontSize: 28, color: "var(--navy)", margin: 0, fontWeight: 700 }}>
          ⚙️ Amministrazione
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
          Gestione team, categorie, import/export, statistiche e log attività
        </p>
      </div>

      {/* Tab nav */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto", whiteSpace: "nowrap",
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                color: active ? "var(--navy)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="fade-in" key={tab}>
        {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
        {tab === "io" && <AdminIOTab state={state} dispatch={dispatch} />}
        {tab === "stats" && <AdminStatsTab state={state} />}
        {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
        {tab === "log" && <AdminLogTab state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
};

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
const AdminTeamTab = ({ state, dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const pending = state.team.filter(m => m.pending);
  const active = state.team.filter(m => !m.pending && m.active);
  const disabled = state.team.filter(m => !m.pending && !m.active);

  const taskCount = (id) => state.tasks.filter(t => !t.deletedAt && (t.assignees || []).includes(id)).length;

  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.name?.trim()) return;
    dispatch({ type: "UPDATE_TEAM_MEMBER", payload: draft });
    cancelEdit();
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    return (
      <div key={m.id} style={{
        background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex", alignItems: "center", gap: 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: m.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{m.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                placeholder="Ruolo" style={fieldStyle} />
              <input type="number" min="1" max="50" value={draft.capacity}
                onChange={e => setDraft({...draft, capacity: parseInt(e.target.value) || 1})}
                placeholder="Cap" style={fieldStyle} />
              <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                style={{ ...fieldStyle, padding: 2, height: 32 }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {m.role} • Capacità {m.capacity} task • {count} task assegnati
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isEditing ? (
            <>
              <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
              <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
            </>
          ) : (
            <>
              {opts.canApprove && (
                <button onClick={() => dispatch({ type: "APPROVE_TEAM_MEMBER", payload: m.id })} style={btnGold}>
                  ✓ Approva
                </button>
              )}
              {!m.pending && (
                <>
                  <button onClick={() => startEdit(m)} style={btnGhost} title="Modifica">✏️</button>
                  <button onClick={() => dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: m.id })}
                    style={m.active ? btnWarning : btnPrimary} title={m.active ? "Disattiva" : "Riattiva"}>
                    {m.active ? "⏸️ Disattiva" : "▶️ Riattiva"}
                  </button>
                </>
              )}
              <button onClick={() => {
                if (count > 0) {
                  alert(`Impossibile rimuovere: l'agente ha ${count} task assegnati. Riassegnali prima di procedere.`);
                  return;
                }
                if (window.confirm(`Rimuovere definitivamente "${m.name}"?`)) {
                  dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
                }
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header con pulsante aggiungi */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={{ color: "var(--gold-dark)" }}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={{ display: "grid", gap: 10 }}>
            {pending.map(m => card(m, { canApprove: true, dim: true }))}
          </div>
        </div>
      )}

      {/* Attivi */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={{ display: "grid", gap: 10 }}>
          {active.map(m => card(m))}
        </div>
      </div>

      {/* Disabilitati */}
      {disabled.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={{ display: "grid", gap: 10 }}>
            {disabled.map(m => card(m, { dim: true }))}
          </div>
        </div>
      )}

      {showAdd && <AddTeamMemberModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingIds={state.team.map(m => m.id)} />}
    </div>
  );
};

const AddTeamMemberModal = ({ onClose, dispatch, existingIds }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Junior Agent");
  const [capacity, setCapacity] = useState(8);
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);

  const submit = () => {
    if (!name.trim()) return;
    const parts = name.trim().split(/\s+/);
    const avatar = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
    let id = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    let suffix = 0;
    while (existingIds.includes(suffix ? `${id}${suffix}` : id)) suffix++;
    if (suffix) id = `${id}${suffix}`;
    dispatch({
      type: "ADD_TEAM_MEMBER",
      payload: { id, name: name.trim(), role, avatar, color, capacity, active: !pending, pending }
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuovo agente</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              <option>Manager</option>
              <option>Senior Agent</option>
              <option>Junior Agent</option>
              <option>Driver</option>
              <option>Admin</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Capacità task</label>
              <input type="number" min="1" max="50" value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
            Crea come "in attesa di approvazione" (simula iscrizione)
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea agente</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
const AdminIOTab = ({ state, dispatch }) => {
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? state.tasks : state.tasks.filter(t => !t.deletedAt);

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Ore","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "",
      t.estimatedHours || 0,
      (t.assignees || []).join("|"),
      (t.description || "").replace(/\n/g, " "),
      t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "",
      Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Ore: t.estimatedHours || 0,
      Assegnati: (t.assignees || []).map(a => getMember(a, state.team)?.name || a).join(", "),
      Descrizione: t.description || "",
      Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.5",
      exportedAt: new Date().toISOString(),
      agencyName: state.agencyName,
      tasks: state.tasks,
      team: state.team,
      categories: state.categories,
      notices: state.notices,
    };
    downloadFile(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`
    );
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("ATTENZIONE: il ripristino sovrascrive tutti i dati correnti (task, team, categorie). Continuare?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error("File backup non valido");
        dispatch({ type: "RESTORE_BACKUP", payload: data });
      } catch (err) {
        alert("Errore nel ripristino: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const total = tasksToExport().length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Export task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          📦 <b>{total}</b> task pronti per l'export
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      {/* Import task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Ore, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      {/* Backup completo */}
      <div style={cardStyle}>
        <h3 style={cardH}>💾 Backup &amp; Restore completo</h3>
        <p style={cardP}>Esporta o ripristina <b>tutto lo stato dell'applicazione</b> (task, team, categorie, impostazioni) come file JSON.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportBackup} style={btnPrimary}>⬇️ Esporta backup JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnWarning}>⬆️ Ripristina da backup</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 10 }}>
          ⚠️ Il ripristino sovrascrive completamente i dati correnti. Esporta prima un backup di sicurezza.
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: SISTEMA / STATS ────────────────────────────────────────────
const AdminStatsTab = ({ state }) => {
  const active = state.tasks.filter(t => !t.deletedAt);
  const trashed = state.tasks.filter(t => t.deletedAt);
  const overdue = active.filter(t => isOverdue(t));
  const done = active.filter(t => t.status === "done");
  const completionRate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const byStatus = STATUSES.map(s => ({
    s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: active.filter(t => t.status === s).length,
  }));

  const byCategory = Object.entries(state.categories).map(([k, c]) => ({
    k, label: c.label, color: c.color, icon: c.icon,
    count: active.filter(t => t.category === k).length,
  })).sort((a,b) => b.count - a.count);

  const byMember = state.team.filter(m => !m.pending).map(m => {
    const count = active.filter(t => (t.assignees || []).includes(m.id) && t.status !== "done").length;
    return { m, count, pct: m.capacity ? Math.min(100, Math.round((count / m.capacity) * 100)) : 0 };
  });

  const kpiCard = (label, value, sub, color) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--navy)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* KPI */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCard("Task attivi", active.length, `${trashed.length} nel cestino`)}
        {kpiCard("Completati", done.length, `${completionRate}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", state.team.filter(m => m.active && !m.pending).length, `${state.team.filter(m => m.pending).length} in attesa`)}
      </div>

      {/* Distribuzione per status */}
      <div style={cardStyle}>
        <h3 style={cardH}>📊 Distribuzione per status</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {byStatus.map(s => {
            const pct = active.length ? (s.count / active.length) * 100 : 0;
            return (
              <div key={s.s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 140, fontSize: 13, color: "var(--text)" }}>{s.label}</div>
                <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.3s" }} />
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Carico team */}
      <div style={cardStyle}>
        <h3 style={cardH}>👥 Carico di lavoro per agente</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {byMember.map(({ m, count, pct }) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={{ width: 160, fontSize: 13 }}>{m.name}</div>
              <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct > 90 ? "var(--danger)" : pct > 70 ? "var(--warning)" : "var(--success)",
                  transition: "width 0.3s",
                }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                {count}/{m.capacity} • <b style={{ color: "var(--text)" }}>{pct}%</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categorie */}
      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {byCategory.map(c => (
            <div key={c.k} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff",
              }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.count} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: CATEGORIE ──────────────────────────────────────────────────
const AdminCategoriesTab = ({ state, dispatch }) => {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const usageCount = (key) => state.tasks.filter(t => !t.deletedAt && t.category === key).length;

  const startEdit = (key, c) => { setEditingKey(key); setDraft({ key, ...c }); };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.label?.trim()) return;
    dispatch({ type: "UPDATE_CATEGORY", payload: draft });
    cancelEdit();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🏷️ <b>{Object.keys(state.categories).length}</b> categorie definite
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(state.categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
              padding: 14, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.bg, color: c.color, flexShrink: 0,
              }}>{isEditing ? draft.icon : c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 }}>
                    <input value={draft.label} onChange={e => setDraft({...draft, label: e.target.value})}
                      placeholder="Etichetta" style={fieldStyle} />
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})}
                      placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Chiave: <code>{key}</code> • {count} task usano questa categoria
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {isEditing ? (
                  <>
                    <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
                    <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={() => {
                      if (count > 0) {
                        alert(`Impossibile rimuovere: ${count} task usano questa categoria.`);
                        return;
                      }
                      if (window.confirm(`Rimuovere categoria "${c.label}"?`)) {
                        dispatch({ type: "REMOVE_CATEGORY", payload: key });
                      }
                    }} style={btnDanger}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddCategoryModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingKeys={Object.keys(state.categories)} />}
    </div>
  );
};

const AddCategoryModal = ({ onClose, dispatch, existingKeys }) => {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState("#3B82F6");
  const [bg, setBg] = useState("#EFF6FF");

  const submit = () => {
    if (!label.trim()) return;
    let key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
    if (!key) key = "custom";
    let suffix = 0;
    while (existingKeys.includes(suffix ? `${key}${suffix}` : key)) suffix++;
    if (suffix) key = `${key}${suffix}`;
    dispatch({ type: "ADD_CATEGORY", payload: { key, label: label.trim(), icon, color, bg } });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuova categoria</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Es. Trasferimenti" style={fieldStyle} autoFocus />
          </div>
          <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Icona (emoji)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ ...fieldStyle, textAlign: "center", fontSize: 18 }} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
            <div>
              <label style={labelStyle}>Sfondo</label>
              <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
          </div>
          {/* Preview */}
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Anteprima</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999, background: bg, color: color,
              fontSize: 12, fontWeight: 600,
            }}>
              <span>{icon}</span> {label || "Nome categoria"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea categoria</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: LOG ATTIVITÀ ───────────────────────────────────────────────
const AdminLogTab = ({ state, dispatch }) => {
  const [filter, setFilter] = useState("all");

  const groups = {
    all: () => state.activityLog,
    task: () => state.activityLog.filter(l => ["ADD_TASK","ADD_TASKS_BULK","UPDATE_TASK","MOVE_TASK","ADD_COMMENT"].includes(l.type)),
    trash: () => state.activityLog.filter(l => ["DELETE_TASK","RESTORE_TASK","PURGE_TASK","EMPTY_TRASH"].includes(l.type)),
    admin: () => state.activityLog.filter(l => l.type.includes("TEAM_MEMBER") || l.type.includes("CATEGORY") || l.type === "RESTORE_BACKUP"),
  };
  const list = groups[filter]();

  const iconFor = (type) => {
    if (type.includes("DELETE") || type.includes("PURGE") || type.includes("EMPTY")) return "🗑️";
    if (type.includes("RESTORE")) return "↻";
    if (type.includes("ADD_TASK")) return "➕";
    if (type.includes("UPDATE_TASK")) return "✏️";
    if (type === "MOVE_TASK") return "🔄";
    if (type === "ADD_COMMENT") return "💬";
    if (type.includes("TEAM")) return "👤";
    if (type.includes("CATEGORY")) return "🏷️";
    if (type.includes("BACKUP")) return "💾";
    return "•";
  };

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "all", label: "Tutte" },
            { id: "task", label: "Task" },
            { id: "trash", label: "Cestino" },
            { id: "admin", label: "Admin" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "#fff",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <button onClick={() => {
            if (window.confirm("Svuotare il log attività? Non è reversibile.")) {
              dispatch({ type: "CLEAR_ACTIVITY_LOG" });
            }
          }} style={btnDanger}>🔥 Svuota log</button>
        )}
      </div>

      <div style={cardStyle}>
        {list.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>Nessuna attività registrata{filter !== "all" ? " in questo filtro" : " ancora"}</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Le azioni effettuate appariranno qui (ultime 100)</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {list.map(l => (
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
              }}>
                <div style={{ fontSize: 16, width: 24, textAlign: "center" }}>{iconFor(l.type)}</div>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{l.text}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatRel(l.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN: STILI CONDIVISI ────────────────────────────────────────────────
const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
const cardStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--navy)" };
const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
const fieldStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "var(--text)" };
const btnPrimary = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--navy)", background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGold = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--gold)", background: "var(--gold)", color: "var(--navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnDanger = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--danger)", background: "#fff", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnWarning = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--warning)", background: "#fff", color: "var(--warning)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 };
const modalCard = { background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };

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
  const { isDesktop } = useViewport();
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
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    // Generation counter: scarta risposte stale quando un evento realtime
    // ri-triggera reload mentre uno è ancora in volo (caveat #21, finding #2).
    let tasksGen = 0;
    let noticesGen = 0;

    const reloadTasks = () => {
      const my = ++tasksGen;
      TasksAPI.list({ withComments: true }).then(({ data, error }) => {
        if (cancelled || my !== tasksGen) return;
        if (error) {
          console.error("[VoyageDesk] Tasks.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento task fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
      });
    };
    const reloadNotices = () => {
      const my = ++noticesGen;
      NoticesAPI.list().then(({ data, error }) => {
        if (cancelled || my !== noticesGen) return;
        if (error) {
          console.error("[VoyageDesk] Notices.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento avvisi fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
      });
    };

    reloadTasks();
    reloadNotices();

    // Debounce: gli eventi arrivano a raffica durante inserimenti bulk.
    let tasksTimer = null;
    let noticesTimer = null;
    const debouncedTasks = () => {
      clearTimeout(tasksTimer);
      tasksTimer = setTimeout(reloadTasks, 200);
    };
    const debouncedNotices = () => {
      clearTimeout(noticesTimer);
      noticesTimer = setTimeout(reloadNotices, 200);
    };

    const unsubTasks = subscribeToTable("tasks", debouncedTasks);
    const unsubComments = subscribeToTable("comments", debouncedTasks);
    const unsubNotices = subscribeToTable("notices", debouncedNotices);

    return () => {
      cancelled = true;
      clearTimeout(tasksTimer);
      clearTimeout(noticesTimer);
      unsubTasks?.();
      unsubComments?.();
      unsubNotices?.();
    };
  }, [useSupabase]);

  // Loading state chat: true finché non completa il primo reload da Supabase.
  // Evita il flash "nessun messaggio" mentre l'idratazione è in volo.
  const [chatLoading, setChatLoading] = useState(useSupabase);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    let loadGen = 0;
    const reload = () => {
      const my = ++loadGen;
      NotificationsAPI.list({ limit: 100 }).then(({ data, error }) => {
        if (cancelled || my !== loadGen) return;
        if (error) {
          console.error("[notifications] list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: caricamento fallito: ${error.message || ""}` } });
          return;
        }
        setNotifications((data || []).map(fromDbNotification));
      });
    };
    reload();
    let timer = null;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(reload, 200); };
    const unsub = subscribeToTable("notifications", debounced);
    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
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
      UsersAPI.setPresence(myId, status).then(r => {
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat('online');
    hbTimer = setInterval(() => beat('online'), 45 * 1000);

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

  // Idratazione chat (conversations + messages) + realtime.
  useEffect(() => {
    if (!useSupabase) { setChatLoading(false); return; }
    let cancelled = false;
    // Generation counter: durante il primo reload può arrivare un evento
    // realtime che fa partire un secondo reload. Senza guardia, l'ordine di
    // completamento delle due fetch non è garantito → un load più vecchio
    // sovrascrive uno più nuovo (caveat #21, finding #2).
    let loadGen = 0;

    const reload = async () => {
      const my = ++loadGen;
      const [convsRes, msgsRes] = await Promise.all([
        ConversationsAPI.listMine(),
        MessagesAPI.listAll(),
      ]);
      if (cancelled || my !== loadGen) return;
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
    };

    reload();

    let timer = null;
    const debouncedReload = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 200);
    };
    const unsubConvs = subscribeToTable("conversations", debouncedReload);
    const unsubMsgs = subscribeToTable("messages", debouncedReload);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubConvs?.();
      unsubMsgs?.();
    };
  }, [useSupabase]);

  const [showFABModal, setShowFABModal] = useState(false);
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
    (acc, c) => acc + getUnreadCount(messages, c.id, state.currentUserId),
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
      case "dashboard": return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "team": return <Team state={state} dispatch={dispatch} />;
      case "trash": return <Trash state={state} dispatch={dispatch} />;
      case "admin": return <AdminView state={state} dispatch={dispatch} />;
      default: return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  // Dati condivisi esposti via AppContext: i componenti li leggono con gli hook
  // useTeam/useCategories/useCurrentUserId invece che da globali mutabili.
  const appData = useMemo(
    () => ({ team: state.team, categories: state.categories, currentUserId: state.currentUserId }),
    [state.team, state.categories, state.currentUserId]
  );

  return (
    <AppContext.Provider value={appData}>
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
        />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {renderView()}
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} />

        {/* Slide-over */}
        {state.selectedTask && <TaskSlideOver task={state.selectedTask} dispatch={dispatch} />}

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
          currentUserId={state.currentUserId}
          dispatch={dispatch}
          presenceMap={presenceMap}
          loading={chatLoading}
        />

        {/* FAB principale (singolo task) + FAB secondario (bulk) */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <>
            <button
              onClick={() => setShowBulkModal(true)}
              title="Crea più task / Import / Template"
              style={{
                position: "fixed", bottom: isDesktop ? 32 : 84, right: isDesktop ? 92 : 76, width: 44, height: 44,
                borderRadius: "50%", background: "var(--navy)", border: "none",
                boxShadow: "0 6px 20px rgba(15,32,68,0.35)", cursor: "pointer",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", zIndex: 400,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >📑</button>
            <FAB onClick={() => setShowFABModal(true)} />
          </>
        )}
        {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Bulk Task Creator */}
        {showBulkModal && (
          <BulkTaskCreator
            existingTasks={getActiveTasks(state.tasks)}
            onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
            onClose={() => setShowBulkModal(false)}
          />
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </AppContext.Provider>
  );
}
// Step J — touched
