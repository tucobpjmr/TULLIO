// src/components/dashboard/queues/UnassignedQueue.jsx
// Coda globale: task non assegnati a nessuno, che chi ne ha i permessi può
// prendere in carico. Il Driver non la vede.
import { useMemo, useState } from "react";
import { SwipeActions } from "../../tasks/SwipeActions.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, isOverdue } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { QUEUE_PAGINA, useOpenTask } from "./queueShared.js";
import { useFinestra } from "../../../hooks/useFinestra.js";
import { MostraAltri } from "../../ui/MostraAltri.jsx";
import { QueueShell } from "./QueueShell.jsx";
import { SkeletonCards } from "../../ui/SkeletonCards.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap6 = {
  display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
  marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(212,168,67,0.2)",
};
const boxF11Muted = {
  padding: "3px 9px", borderRadius: 99, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--text-muted)",
  fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};
const rowCenterMiddle = {
  background: "var(--surface2)", color: "var(--text-muted)",
  borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600,
  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
  marginTop: 2,
};
const rowCenterMiddle2 = {
  background: "var(--gold)", color: "var(--navy)",
  border: "none", borderRadius: 8,
  padding: "8px 12px", fontSize: 12, fontWeight: 700,
  cursor: "pointer", display: "flex", alignItems: "center",
  justifyContent: "center", gap: 6,
  fontFamily: "inherit",
  transition: "background 0.15s, transform 0.15s",
  marginTop: 2,
};

// ─── UNASSIGNED QUEUE (coda globale) ───────────────────────────────────────
// `loading` (criticità #6): finché il primo fetch non torna, la coda non è
// vuota — è ignota. "Tutti gli incarichi hanno un proprietario" detto su zero
// task caricati è la bugia più cara di questa vista: è la coda su cui si
// decide se prendere in carico qualcosa.
export const UnassignedQueue = ({ tasks, onTake, uid, loading = false }) => {
  const { categories, isJuniorAgent } = useAppData();
  const isJunior = isJuniorAgent(uid);
  const openTask = useOpenTask();
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const caricando = loading && tasks.length === 0;
  const empty = tasks.length === 0 && !caricando;

  // Categorie e priorità presenti nelle task della coda (no chip vuoti).
  const presentCategories = useMemo(
    () => Array.from(new Set(tasks.map(t => t.category).filter(Boolean))), [tasks]);
  const presentPriorities = useMemo(
    () => Array.from(new Set(tasks.map(t => t.priority).filter(Boolean)))
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a] ?? 9) - (order[b] ?? 9);
      }),
    [tasks]);
  const filtered = useMemo(
    () => tasks.filter(t =>
      (!categoryFilter || t.category === categoryFilter) &&
      (!priorityFilter || t.priority === priorityFilter)),
    [tasks, categoryFilter, priorityFilter]);
  // M-2 · La finestra sulla coda. La coda globale è l'altra senza tetto
  // naturale (con le scadute): si allunga quando nessuno prende in carico.
  const finestra = useFinestra(filtered, QUEUE_PAGINA, [categoryFilter, priorityFilter]);
  const hasFilter = categoryFilter || priorityFilter;
  const filteredEmpty = !empty && filtered.length === 0;

  return (
    <QueueShell
      accent="unassigned"
      icon="🙋"
      title="Coda globale"
      tight={empty}
      badge={caricando ? "…" : empty ? null : (hasFilter ? `${filtered.length}/${tasks.length}` : `${tasks.length} in attesa`)}
    >

      {/* Filtri categoria + priorità */}
      {!empty && (presentCategories.length > 1 || presentPriorities.length > 1 || hasFilter) && (
        <div style={rowCenterGap6}>
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
            const meta = categories[c];
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
            <button onClick={() => { setCategoryFilter(""); setPriorityFilter(""); }} style={boxF11Muted}>✕ Reset</button>
          )}
        </div>
      )}

      {/* Lista */}
      {caricando ? (
        <SkeletonCards count={3} minWidth={280} compact label="Caricamento della coda globale" />
      ) : empty ? (
        <div style={stiliComuni.intestazioneSezione}>
          <span style={stiliComuni.txtF18}>✨</span>
          Nessun task in coda. Tutti gli incarichi hanno un proprietario!
        </div>
      ) : filteredEmpty ? (
        <div style={stiliComuni.intestazioneSezione}>
          <span style={stiliComuni.txtF18}>🔍</span>
          Nessun task per i filtri selezionati.
        </div>
      ) : (
        <>
        <div style={stiliComuni.grigliaSchede}>
          {finestra.visibili.map(t => {
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            const overdue = isOverdue(t);
            return (
              <SwipeActions key={t.id} task={t}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  gap={10}
                  opacity={isJunior ? 0.8 : 1}
                  border={`1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`}
                  badges={
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                      background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                    }}>{prio.label}</div>
                  }
                  meta={t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                    </span>
                  )}
                  /* Take ownership — nascosto per Junior Agent */
                  footer={isJunior ? (
                    <div style={rowCenterMiddle}>
                      🔒 Chiedi a un Senior per l&#39;assegnazione
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onTake(t); }}
                      style={rowCenterMiddle2}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--gold-light)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--gold)"; }}
                    >
                      🙋 Prendi in carico
                    </button>
                  )}
                />
              </SwipeActions>
            );
          })}
        </div>
        <MostraAltri
          finestra={finestra}
          azione={`Mostra altre ${Math.min(QUEUE_PAGINA, finestra.restanti)} di ${finestra.restanti}`}
          conteggio={`${finestra.visibili.length} di ${finestra.totale} task`}
        />
        </>
      )}
    </QueueShell>
  );
};
