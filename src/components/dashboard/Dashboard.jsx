// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { PRIORITIES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue, isUrgent, isMyTask, isInGlobalQueue, getActiveTasks, getDayKey } from "../../lib/taskUtils.js";
import { CATEGORIES, getMember, getRoleType, getAssignableTeam, canViewTask, getVisibleTasks, isJuniorAgent } from "../../state/appGlobals.js";
import { NoticeBoard } from "./NoticeBoard.jsx";

// ─── CSV EXPORT HELPER ───────────────────────────────────────────────────────
const _esc = v => {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
};
const exportTasksCSV = (tasks, filename = "coda-personale") => {
  const headers = ["Titolo", "Categoria", "Priorità", "Stato", "Cliente", "Pratica", "Assegnati", "Scadenza"];
  const rows = tasks.map(t => [
    t.title,
    CATEGORIES[t.category]?.label || t.category,
    PRIORITIES[t.priority]?.label || t.priority,
    STATUS_LABELS[t.status] || t.status,
    t.client || "",
    t.praticaRef || "",
    (t.assignees || []).map(id => getMember(id)?.name || id).join("; "),
    t.dueDate ? new Date(t.dueDate).toLocaleString("it-IT") : "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(_esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

// ─── PERSONAL QUEUE (le mie task — v0.8) ───────────────────────────────────
// enableDateFilter (v22): per il Driver (vista transfer-oriented) abilita un
// filtro data/ora — i transfer sono time-sensitive, Giulia filtra la coda per
// giornata (Tutte / Oggi / Domani / data specifica).
// Ordini disponibili per la coda personale (v2.8 Round 5)
const QUEUE_SORT_OPTIONS = [
  { key: "date",     label: "Scadenza" },
  { key: "priority", label: "Priorità" },
  { key: "client",   label: "Cliente"  },
  { key: "status",   label: "Stato"    },
];
const PRIO_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = { todo: 0, inprogress: 1, awaiting_client: 2, awaiting_supplier: 3, done: 4 };

const PersonalQueue = ({ tasks, dispatch, me, enableDateFilter = false }) => {
  const { isMobile } = useViewport();
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "tomorrow" | "YYYY-MM-DD"
  const [sortBy, setSortBy] = useState("date"); // "date" | "priority" | "client" | "status"

  let filtered = tasks;
  if (enableDateFilter && dateFilter !== "all") {
    let targetKey;
    if (dateFilter === "today") {
      targetKey = new Date().toDateString();
    } else if (dateFilter === "tomorrow") {
      const d = new Date(); d.setDate(d.getDate() + 1); targetKey = d.toDateString();
    } else {
      // dateFilter = "YYYY-MM-DD" da <input type="date"> → mezzogiorno locale (no shift TZ)
      targetKey = new Date(dateFilter + "T12:00:00").toDateString();
    }
    filtered = tasks.filter(t => t.dueDate && getDayKey(t.dueDate) === targetKey);
  }
  // Ordinamento locale (il chiamante li ordina per data di default).
  // Driver: mantiene l'ordine per orario quando sortBy === "date".
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === "priority") {
      const dp = (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9);
      if (dp !== 0) return dp;
    }
    if (sortBy === "client") {
      return (a.client || "").localeCompare(b.client || "", "it");
    }
    if (sortBy === "status") {
      const ds = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (ds !== 0) return ds;
    }
    // Fallback: per scadenza (default e tie-breaker)
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate) - new Date(b.dueDate);
  });
  const empty = filtered.length === 0;

  const customDate = !["all", "today", "tomorrow"].includes(dateFilter) ? dateFilter : "";
  const chip = (key, label) => (
    <button
      type="button"
      onClick={() => setDateFilter(key)}
      style={{
        padding: "5px 12px", borderRadius: 999, cursor: "pointer",
        fontSize: 12, fontWeight: 600, fontFamily: "inherit",
        border: `1px solid ${dateFilter === key ? "var(--navy)" : "var(--border)"}`,
        background: dateFilter === key ? "var(--navy)" : "var(--card)",
        color: dateFilter === key ? "#fff" : "var(--text-muted)",
        transition: "background 0.15s, color 0.15s",
      }}
    >{label}</button>
  );

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
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              {enableDateFilter ? "La mia coda transfer" : "La mia coda"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {filtered.length > 0 && (
            <button
              type="button"
              title="Esporta come CSV"
              onClick={() => exportTasksCSV(filtered, "coda-personale")}
              style={{
                background: "none", border: "1px solid var(--border)",
                color: "var(--text-muted)", padding: "4px 10px", borderRadius: 999,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >↓ CSV</button>
          )}
        </div>
      </div>

      {/* Barra di ordinamento (v2.8) — non mostrata per i Driver (usano il filtro data) */}
      {!enableDateFilter && tasks.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginRight: 2 }}>Ordina:</span>
          {QUEUE_SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              style={{
                padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                border: `1px solid ${sortBy === opt.key ? "var(--navy)" : "var(--border)"}`,
                background: sortBy === opt.key ? "var(--navy)" : "var(--card)",
                color: sortBy === opt.key ? "#fff" : "var(--text-muted)",
                transition: "background 0.15s, color 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
      )}

      {enableDateFilter && (
        <div className="vd-row-wrap" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {chip("all", "Tutte")}
          {chip("today", "Oggi")}
          {chip("tomorrow", "Domani")}
          <input
            type="date"
            value={customDate}
            onChange={e => setDateFilter(e.target.value || "all")}
            aria-label="Filtra per data"
            style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 12, fontFamily: "inherit",
              border: `1px solid ${customDate ? "var(--navy)" : "var(--border)"}`,
              background: "var(--card)", color: "var(--text)", cursor: "pointer",
            }}
          />
          {customDate && (
            <button type="button" onClick={() => setDateFilter("all")} title="Azzera filtro" style={{
              background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, fontWeight: 600,
            }}>✕ azzera</button>
          )}
        </div>
      )}

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>{enableDateFilter && dateFilter !== "all" ? "📭" : "🎉"}</span>
          {enableDateFilter && dateFilter !== "all" ? "Nessun transfer per la giornata selezionata." : "Nessuna task aperta a tuo nome. Buon lavoro!"}
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {filtered.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const urgent = isUrgent(t);
            const card = (
              <div
                style={{
                  background: "var(--card)", borderRadius: 10,
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
                      📅 {formatDate(t.dueDate)}{enableDateFilter ? ` 🕑 ${formatTime(t.dueDate)}` : ""}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
                    </span>
                  )}
                </div>
                {/* Avanzamento rapido status (v2.8 Round 14) */}
                {t.status !== "done" && (() => {
                  const quickBtn = (label, newStatus, color) => (
                    <button
                      key={newStatus}
                      type="button"
                      onClick={e => { e.stopPropagation(); dispatch({ type: "UPDATE_TASK", payload: { ...t, status: newStatus } }); }}
                      style={{
                        padding: "3px 10px", borderRadius: 999, border: `1px solid ${color}`,
                        background: "transparent", color, cursor: "pointer",
                        fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = color; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = color; }}
                    >{label}</button>
                  );
                  if (t.status === "todo") return <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>{quickBtn("▶ Avvia", "inprogress", "var(--navy)")}{quickBtn("✓ Fatto", "done", "var(--success)")}</div>;
                  return <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>{quickBtn("✓ Fatto", "done", "var(--success)")}</div>;
                })()}
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

// ─── URGENT QUEUE (tutte le task in scadenza <24h — visibile a non-driver) ──
// Mostra sia le proprie task urgenti (editabili dal dettaglio) sia quelle
// altrui (read-only, con scorciatoia "contatta" verso l'assegnatario).
// windowH: finestra temporale selezionabile (ore). 24 = default (badge tab).
const URGENT_WINDOWS = [
  { h: 24, label: "Entro 24h" },
  { h: 48, label: "Entro 48h" },
  { h: 72, label: "Entro 72h" },
];

const UrgentQueue = ({ tasks, dispatch, onOpenChat, uid }) => {
  const { isMobile } = useViewport();
  const [filterAgent, setFilterAgent] = useState(null);
  const [windowH, setWindowH] = useState(24);

  // `tasks` arriva già limitato a 72h dal parent: qui restringo alla finestra
  // selezionata, poi (eventualmente) al singolo agente.
  const windowMs = windowH * 60 * 60 * 1000;
  const inWindow = tasks.filter(t => {
    const diff = new Date(t.dueDate).getTime() - Date.now();
    return diff >= 0 && diff <= windowMs;
  });

  const presentAgents = [...new Set(
    inWindow.map(t => t.assignees?.[0]).filter(Boolean)
  )];

  const visibleTasks = filterAgent
    ? inWindow.filter(t => t.assignees?.[0] === filterAgent)
    : inWindow;

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
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Urgenti
            </div>
          </div>
        </div>
        <div style={{
          background: "var(--warning)", color: "#fff",
          padding: "4px 12px", borderRadius: 999,
          fontSize: 13, fontWeight: 700,
        }}>{visibleTasks.length}{filterAgent ? `/${inWindow.length}` : ""}</div>
      </div>

      {/* Selettore finestra temporale (24/48/72h) */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {URGENT_WINDOWS.map(w => {
          const on = windowH === w.h;
          const n = tasks.filter(t => {
            const diff = new Date(t.dueDate).getTime() - Date.now();
            return diff >= 0 && diff <= w.h * 60 * 60 * 1000;
          }).length;
          return (
            <button
              key={w.h}
              type="button"
              onClick={() => { setWindowH(w.h); setFilterAgent(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                border: `1px solid ${on ? "var(--warning)" : "var(--border)"}`,
                background: on ? "var(--warning)" : "var(--card)",
                color: on ? "#fff" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >
              {w.label}
              <span style={{
                background: on ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                borderRadius: 999, padding: "1px 6px", fontSize: 11,
                color: on ? "#fff" : "var(--text-muted)",
              }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Filtro per agente — Round 15 */}
      {presentAgents.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setFilterAgent(null)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 12px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              border: `1px solid ${!filterAgent ? "var(--warning)" : "var(--border)"}`,
              background: !filterAgent ? "var(--warning)" : "var(--card)",
              color: !filterAgent ? "#fff" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >Tutti</button>
          {presentAgents.map(agentId => {
            const m = getMember(agentId);
            if (!m) return null;
            const active = filterAgent === agentId;
            const count = inWindow.filter(t => t.assignees?.[0] === agentId).length;
            return (
              <button
                key={agentId}
                type="button"
                onClick={() => setFilterAgent(active ? null : agentId)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--warning)" : "var(--border)"}`,
                  background: active ? "var(--warning)" : "var(--card)",
                  color: active ? "#fff" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >
                <Avatar memberId={agentId} size={16} />
                {m.name}
                <span style={{
                  background: active ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                  borderRadius: 999, padding: "1px 5px", fontSize: 10,
                  color: active ? "#fff" : "var(--text-muted)",
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {visibleTasks.length === 0 ? (
        <div style={{
          padding: "26px 20px", textAlign: "center", color: "var(--text-muted)",
          fontSize: 13, fontStyle: "italic",
        }}>
          ✅ Nessuna task in scadenza entro {windowH}h{filterAgent ? " per questo agente" : ""}.
          {windowH < 72 && " Prova ad allargare la finestra."}
        </div>
      ) : (
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        gap: 10,
      }}>
        {visibleTasks.map(t => {
          const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
          const prio = PRIORITIES[t.priority];
          const owner = getMember(t.assignees?.[0]);
          const mine = (t.assignees || []).includes(uid);
          return (
            <div
              key={t.id}
              title={mine ? "Tua task in scadenza — clicca per i dettagli" : "Task di un altro agente in scadenza"}
              style={{
                background: "var(--card)", borderRadius: 10,
                border: mine ? "1px solid rgba(200,131,42,0.45)" : "1.5px dashed rgba(200,131,42,0.45)",
                padding: 12, display: "flex", flexDirection: "column", gap: 8,
                position: "relative",
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
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {!mine && (
                    <span
                      aria-label="Solo visualizzazione"
                      style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                        background: "var(--surface2)", color: "var(--text-muted)",
                        display: "inline-flex", alignItems: "center", gap: 3,
                        textTransform: "uppercase", letterSpacing: 0.4,
                      }}
                    >🔒 Read-only</span>
                  )}
                  <div style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                    background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                  }}>{prio.label}</div>
                </div>
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

              {/* Owner cliccabile → apre chat con link al task (solo task altrui) */}
              {owner && !mine && (
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
      )}
    </div>
  );
};

// ─── UNASSIGNED QUEUE (coda globale) ───────────────────────────────────────
const UnassignedQueue = ({ tasks, dispatch, onTake, uid }) => {
  const isJunior = isJuniorAgent(uid);
  const { isMobile } = useViewport();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const empty = tasks.length === 0;

  // Categorie e priorità presenti nelle task della coda (no chip vuoti).
  const presentCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean)));
  const presentPriorities = Array.from(new Set(tasks.map(t => t.priority).filter(Boolean)))
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    });
  const filtered = tasks.filter(t =>
    (!categoryFilter || t.category === categoryFilter) &&
    (!priorityFilter || t.priority === priorityFilter)
  );
  const hasFilter = categoryFilter || priorityFilter;
  const filteredEmpty = !empty && filtered.length === 0;

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
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Coda globale
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--gold)", color: "var(--navy)",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{hasFilter ? `${filtered.length}/${tasks.length}` : `${tasks.length} in attesa`}</div>
        )}
      </div>

      {/* Filtri categoria + priorità */}
      {!empty && (presentCategories.length > 1 || presentPriorities.length > 1 || hasFilter) && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          {presentPriorities.length > 1 && presentPriorities.map(p => {
            const meta = PRIORITIES[p];
            if (!meta) return null;
            const active = priorityFilter === p;
            return (
              <button key={`p-${p}`} onClick={() => setPriorityFilter(active ? "" : p)} style={{
                padding: "3px 9px", borderRadius: 99, border: "1px solid",
                borderColor: active ? meta.color : meta.bg,
                background: active ? meta.color : meta.bg,
                color: active ? "#fff" : meta.color,
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 0.3,
              }}>{meta.label}</button>
            );
          })}
          {presentCategories.length > 1 && presentCategories.map(c => {
            const meta = CATEGORIES[c];
            if (!meta) return null;
            const active = categoryFilter === c;
            return (
              <button key={`c-${c}`} onClick={() => setCategoryFilter(active ? "" : c)} style={{
                padding: "3px 9px", borderRadius: 99, border: "1px solid",
                borderColor: active ? meta.color : meta.bg,
                background: active ? meta.color : meta.bg,
                color: active ? "#fff" : meta.color,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4,
              }}>{meta.icon} {meta.label}</button>
            );
          })}
          {hasFilter && (
            <button onClick={() => { setCategoryFilter(""); setPriorityFilter(""); }} style={{
              padding: "3px 9px", borderRadius: 99, border: "1px solid var(--border)",
              background: "var(--card)", color: "var(--text-muted)",
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>✕ Reset</button>
          )}
        </div>
      )}

      {/* Lista */}
      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✨</span>
          Nessun task in coda. Tutti gli incarichi hanno un proprietario!
        </div>
      ) : filteredEmpty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          Nessun task per i filtri selezionati.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {filtered.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const card = (
              <div
                style={{
                  background: "var(--card)", borderRadius: 10,
                  border: `1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`,
                  padding: 12, display: "flex", flexDirection: "column", gap: 10,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                  opacity: isJunior ? 0.8 : 1,
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
                </div>

                {/* Take ownership button — nascosto per Junior Agent */}
                {isJunior ? (
                  <div style={{
                    background: "var(--surface2)", color: "var(--text-muted)",
                    borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    marginTop: 2,
                  }}>
                    🔒 Chiedi a un Senior per l'assegnazione
                  </div>
                ) : (
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
                )}
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
  const [filterAssignee, setFilterAssignee] = useState(null);
  const empty = tasks.length === 0;

  const presentAssignees = Array.from(new Set(
    tasks.flatMap(t => t.assignees || [])
  )).filter(Boolean);
  const visible = filterAssignee
    ? tasks.filter(t => (t.assignees || []).includes(filterAssignee))
    : tasks;

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
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Task scadute
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--danger)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{filterAssignee ? `${visible.length}/${tasks.length}` : tasks.length}</div>
        )}
      </div>

      {/* Filtro assegnatario — solo se più di un assegnatario presente */}
      {!empty && presentAssignees.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setFilterAssignee(null)}
            style={{
              padding: "3px 10px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              border: `1px solid ${!filterAssignee ? "var(--danger)" : "var(--border)"}`,
              background: !filterAssignee ? "var(--danger)" : "var(--card)",
              color: !filterAssignee ? "#fff" : "var(--text-muted)",
            }}
          >Tutti</button>
          {presentAssignees.map(id => {
            const m = getMember(id);
            if (!m) return null;
            const active = filterAssignee === id;
            const cnt = tasks.filter(t => (t.assignees || []).includes(id)).length;
            return (
              <button key={id} type="button"
                onClick={() => setFilterAssignee(active ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--danger)" : "var(--border)"}`,
                  background: active ? "rgba(192,57,43,0.08)" : "var(--card)",
                  color: active ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", background: m.color,
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>{m.avatar}</span>
                {m.name.split(" ")[0]}
                <span style={{
                  background: active ? "var(--danger)" : "var(--surface2)",
                  color: active ? "#fff" : "var(--text-muted)",
                  borderRadius: 99, padding: "0 5px", fontSize: 10, fontWeight: 700,
                }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          Nessuna task scaduta. Tutto in regola!
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "14px 0 4px", color: "var(--text-muted)", fontSize: 13, display: "flex", gap: 8 }}>
          <span>📭</span> Nessuna task scaduta per l&#39;agente selezionato.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {visible.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const card = (
              <div
                style={{
                  background: "var(--card)", borderRadius: 10,
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
                    <span>👥 {t.assignees.map(a => getMember(a)?.name?.split(" ")[0]).filter(Boolean).join(", ")}</span>
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
export const Dashboard = ({ state, dispatch, onOpenChat }) => {
  const { isMobile } = useViewport();
  const [activeQueue, setActiveQueue] = useState("personal");
  const uid = state.currentUserId;
  const role = getRoleType(uid);
  const me = getMember(uid);
  const allTasks = getActiveTasks(state.tasks);
  // Filtro permessi: solo task visibili all'utente
  const tasks = getVisibleTasks(allTasks, uid);

  const agentWorkload = getAssignableTeam().map(m => ({
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
    ? allTasks.filter(t => isInGlobalQueue(t) && canViewTask(t, uid)).sort((a, b) => {
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

  // Urgenti: task visibili con scadenza imminente (Driver non le vede).
  // Visibile a tutti gli altri ruoli, admin inclusi. La tab Urgenti permette
  // di allargare la finestra (24/48/72h); qui prepariamo i candidati entro 72h
  // e lasciamo il filtro temporale al componente. Il badge della tab usa la
  // finestra di default (24h) via isUrgent.
  const showUrgent = role !== "driver";
  const WINDOW_72H = 72 * 60 * 60 * 1000;
  const urgentCandidates = showUrgent
    ? tasks
      .filter(t => {
        if (!t.dueDate || t.status === "done") return false;
        const diff = new Date(t.dueDate).getTime() - Date.now();
        return diff >= 0 && diff <= WINDOW_72H;
      })
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    : [];
  const urgentTasks = urgentCandidates.filter(t => isUrgent(t));

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
          <div style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 2, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span>{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</span>
            {role !== "admin" && (
              <>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", background: "var(--surface3)", borderRadius: 99, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.3 }}>{me?.role}</span>
                  {isJuniorAgent(uid) && (
                    <span style={{ fontSize: 10, padding: "1px 6px", background: "#FFF3CD", color: "#856404", borderRadius: 99, fontWeight: 700, letterSpacing: 0.3 }}>JUNIOR</span>
                  )}
                </span>
                {overdueTasks.length > 0 && (
                  <span style={{
                    fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 700,
                    background: "rgba(192,57,43,0.08)", color: "var(--danger)",
                    border: "1px solid rgba(192,57,43,0.2)",
                  }}>⚠ {overdueTasks.length} scadut{overdueTasks.length === 1 ? "a" : "e"}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── BACHECA AVVISI ─── */}
      <NoticeBoard notices={state.notices} dispatch={dispatch} />

      {/* ─── TAB CODE ─── */}
      <div style={{
        background: "var(--card)", borderRadius: 12, padding: isMobile ? 8 : 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)",
        display: "grid",
        gridTemplateColumns: `repeat(${(showGlobalQueue ? 1 : 0) + 1 + 1 + (showUrgent ? 1 : 0)}, 1fr)`,
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
        {showUrgent && (
          <QueueTab
            active={activeQueue === "urgent"}
            onClick={() => setActiveQueue("urgent")}
            icon="⚠️" label="Urgenti" count={urgentTasks.length}
            isMobile={isMobile} dangerCount
          />
        )}
      </div>

      {/* ─── SEZIONE CODA FILTRATA ─── */}
      {activeQueue === "personal" && (
        <PersonalQueue tasks={personalQueue} dispatch={dispatch} me={me} enableDateFilter={role === "driver"} />
      )}
      {activeQueue === "global" && showGlobalQueue && (
        <UnassignedQueue tasks={unassigned} dispatch={dispatch} onTake={takeOwnership} uid={uid} />
      )}
      {activeQueue === "overdue" && (
        <OverdueQueue tasks={overdueTasks} dispatch={dispatch} />
      )}
      {activeQueue === "urgent" && showUrgent && (
        <UrgentQueue tasks={urgentCandidates} dispatch={dispatch} onOpenChat={onOpenChat} uid={uid} />
      )}

      <div className="vd-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Upcoming deadlines */}
        <div style={{ background: "var(--card)", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
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
                <span style={{ fontSize: 16 }}>{CATEGORIES[t.category]?.icon}</span>
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
        <div style={{ background: "var(--card)", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
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
    </div>
  );
};
