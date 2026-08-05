// src/components/dashboard/queues/PersonalQueue.jsx
// Coda personale: i task assegnati a me.
// enableDateFilter (v22): per il Driver abilita il filtro data/ora — i transfer
// sono time-sensitive e la coda si filtra per giornata.
import { useState } from "react";
import { useViewport } from "../../Viewport.jsx";
import { SwipeActions } from "../../SwipeActions.jsx";
import { StatusBadge } from "../../ui/StatusBadge.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue, isUrgent, getDayKey } from "../../../lib/taskUtils.js";
import { QUEUE_SORT_OPTIONS, PRIO_ORDER, STATUS_ORDER, useOpenTask } from "./queueShared.js";

export const PersonalQueue = ({ tasks, dispatch, me, enableDateFilter = false }) => {
  const { isMobile } = useViewport();
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "tomorrow" | "YYYY-MM-DD"
  const [sortBy, setSortBy] = useState("date"); // "date" | "priority" | "client" | "status"
  const openTask = useOpenTask(dispatch);

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
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            const overdue = isOverdue(t);
            const urgent = isUrgent(t);
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  accent={prio.color}
                  border={`1px solid ${overdue ? "rgba(192,57,43,0.4)" : urgent ? "rgba(200,131,42,0.4)" : "var(--border)"}`}
                  badges={<StatusBadge status={t.status} />}
                  meta={t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : urgent ? "var(--warning)" : "var(--text-muted)", fontWeight: (overdue || urgent) ? 700 : 400 }}>
                      📅 {formatDate(t.dueDate)}{enableDateFilter ? ` 🕑 ${formatTime(t.dueDate)}` : ""}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
                    </span>
                  )}
                />
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};
