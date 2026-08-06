// src/components/clients/ClienteDetailPanel.jsx
// Il pannello contestuale di un cliente: due tab, i suoi task e le sue liste
// viaggio. Il tab Liste è precluso al Driver (stessa RLS del modulo).
import { useState, useMemo, useEffect, useCallback } from "react";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { TaskRow } from "../tasks/TaskCard.jsx";
import { formatDate, isActiveTask } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { ClienteListePanel } from "../liste/ClienteListePanel.jsx";
import { ListeChip } from "./ClienteCard.jsx";
import { parseClientNotes } from "../../lib/clientNotes.js";

export function ClienteTaskTab({ cliente, tasks, dispatch }) {
  const { currentUserId: uid, canViewTask } = useAppData();
  // Stabile per la memoizzazione di TaskRow (vedi components/tasks/TaskCard.jsx).
  const openTask = useCallback(
    (task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);
  const clientTasks = useMemo(() => {
    const q = (cliente.name || "").toLowerCase();
    return tasks.filter(t =>
      isActiveTask(t) &&
      canViewTask(t, uid) &&
      (t.client || "").toLowerCase().includes(q)
    );
  }, [tasks, cliente.name, uid, canViewTask]);

  const open = clientTasks.filter(t => t.status !== "done");
  const done = clientTasks.filter(t => t.status === "done");
  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {open.length} aperti
        </span>
        <span style={{ fontSize: 12, color: "var(--success)" }}>
          {done.length} completati
        </span>
      </div>

      {clientTasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
          Nessun task associato a questo cliente
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {clientTasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={openTask}
              padding="9px 12px"
              subtitle={t.dueDate ? `📅 ${formatDate(t.dueDate)}` : null}
              trailing={<>
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </>}
            />
          ))}
        </div>
      )}
    </>
  );
}

// Pannello contestuale del cliente selezionato: testata + tab.
// Il tab "Liste viaggio" è il secondo punto d'ingresso al modulo Liste (il
// primo è il bottone nell'header della Dashboard). Il modulo non ha una voce
// di sidebar/bottom-nav: si arriva da qui e da lì.
// I campi "Etichetta: valore" ereditati dall'import, resi come scheda invece
// che come blocco di testo. Nessun dato viene riscritto: è solo il modo di
// mostrarlo. Le note vere restano sotto, in chiaro.
export function DatiAnagrafici({ notes }) {
  const { fields, text } = useMemo(() => parseClientNotes(notes), [notes]);
  if (!fields.length && !text) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {fields.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: "6px 16px", padding: "10px 12px", borderRadius: 10,
          background: "var(--surface2)", border: "1px solid var(--border)",
        }}>
          {fields.map((f, i) => (
            <div key={`${f.label}-${i}`} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-light)", letterSpacing: 0.4, textTransform: "uppercase" }}>{f.label}</div>
              <div style={{ fontSize: 12.5, wordBreak: "break-word" }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
      {text && (
        <div style={{ marginTop: fields.length ? 8 : 0, fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "pre-line" }}>
          {text}
        </div>
      )}
    </div>
  );
}

export function ClienteDetailPanel({ cliente, tasks, dispatch, onClose, showListe, liste = null, initialTab = null }) {
  const [tab, setTab] = useState("task");

  // Cambiando cliente si riparte dal tab Task: il tab Liste rifà comunque la
  // query, ma mostrare il cliente precedente per un frame è peggio.
  // `initialTab` è l'eccezione: chi apre il pannello da "Vedi le liste" della
  // conferma di eliminazione vuole vedere proprio quelle.
  useEffect(() => {
    setTab(initialTab === "liste" && showListe ? "liste" : "task");
  }, [cliente.id, initialTab, showListe]);

  // Se il tab "Liste viaggio" era aperto e nel frattempo l'utente attivo
  // cambia in un Driver (showListe passa a false), la barra dei tab sparisce
  // ma senza questo il contenuto già montato resterebbe quello del tab Liste:
  // il Driver vedrebbe comunque il pannello che non deve poter aprire.
  useEffect(() => { if (!showListe) setTab("task"); }, [showListe]);

  const tabs = [
    { key: "task", label: "Task" },
    ...(showListe ? [{ key: "liste", label: "Liste viaggio" }] : []),
  ];

  return (
    <div className="slide-up" style={{
      background: "var(--card)", borderRadius: 12, padding: "20px 22px",
      border: "1px solid var(--border)", boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
      marginTop: 6, marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <span className="playfair" style={{ fontWeight: 700, fontSize: 16 }}>{cliente.name}</span>
          <ListeChip liste={liste} />
        </div>
        <button onClick={onClose} aria-label="Chiudi il pannello" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
      </div>

      <DatiAnagrafici notes={cliente.notes} />

      {tabs.length > 1 && (
        <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                padding: "8px 14px", border: "none", background: "none",
                cursor: "pointer", fontSize: 13, fontFamily: "inherit",
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "var(--navy)" : "var(--text-muted)",
                borderBottom: `2px solid ${tab === t.key ? "var(--gold)" : "transparent"}`,
                marginBottom: -1,
              }}
            >{t.label}</button>
          ))}
        </div>
      )}

      {tab === "liste"
        ? <ClienteListePanel cliente={cliente} dispatch={dispatch} />
        : <ClienteTaskTab cliente={cliente} tasks={tasks} dispatch={dispatch} />}
    </div>
  );
}

// Opzioni di ordinamento per la lista clienti (v2.8 Round 8)
