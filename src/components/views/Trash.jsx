// ─── TRASH ───────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { PRIORITIES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, getTrashedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";

const PERIOD_OPTIONS = [
  { key: "all",       label: "Tutti" },
  { key: "week",      label: "Ultimi 7 gg" },
  { key: "month",     label: "Questo mese" },
  { key: "lastMonth", label: "Mese scorso" },
];

const filterByPeriod = (tasks, period) => {
  if (period === "all") return tasks;
  const now = new Date();
  return tasks.filter(t => {
    if (!t.deletedAt) return false;
    const d = new Date(t.deletedAt);
    if (period === "week") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === "lastMonth") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= start && d < end;
    }
    return true;
  });
};

export const Trash = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const { categories, getAssignableTeam, canEditTask, getVisibleTasks } = useAppData();
  const [restoring, setRestoring] = useState(null); // task being restored/edited
  const [period, setPeriod] = useState("all");
  const me = state.currentUserId;
  // La LISTA mostra tutti i task cestinati che l'utente può VEDERE (canViewTask,
  // via getVisibleTasks) — stesso pattern di Archive.jsx: chi ha solo permesso di
  // visualizzazione su un task (es. stakeholder in sola lettura, o ruolo che vede
  // ma non gestisce quella categoria) deve poterlo vedere anche cestinato, non
  // solo quando è completato/archiviato.
  // Le AZIONI di ripristino/eliminazione restano invece gated da canEditTask
  // (admin: tutti; manager/agent: propri + coda globale; driver: solo transfer
  // propri/globali) — prerogativa di status, applicata sia qui in UI (toast di
  // errore) sia a valle nel reducer (RESTORE_TASK/PURGE_TASK/EMPTY_TRASH).
  const trashed = getVisibleTasks(getTrashedTasks(state.tasks), me)
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  const visible = filterByPeriod(trashed, period);
  const editableCount = trashed.filter(t => canEditTask(t, me)).length;

  const handleRestore = (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi ripristinare questo task" } });
      return;
    }
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
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi eliminare definitivamente questo task" } });
      return;
    }
    if (window.confirm(`Eliminare definitivamente "${task.title}"?\n\nQuesta azione è irreversibile.`)) {
      dispatch({ type: "PURGE_TASK", payload: task.id });
    }
  };

  const handleEmpty = () => {
    if (trashed.length === 0) return;
    if (editableCount === 0) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non hai permessi per svuotare il cestino" } });
      return;
    }
    if (window.confirm(`Svuotare il cestino?\n\n${editableCount} task verranno eliminati definitivamente. Azione irreversibile.`)) {
      dispatch({ type: "EMPTY_TRASH" });
    }
  };

  const updateField = (field, value) => setRestoring(prev => ({ ...prev, [field]: value }));

  return (
    <div className="vd-pad" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="playfair" style={{ fontSize: 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
            🗑️ Cestino
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {trashed.length === 0
              ? "Nessun task nel cestino"
              : period !== "all"
                ? `${visible.length} di ${trashed.length} task — filtrati per periodo`
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

      {/* Filtro periodo — solo se ci sono task */}
      {trashed.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Periodo:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              style={{
                padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                border: `1px solid ${period === opt.key ? "var(--navy)" : "var(--border)"}`,
                background: period === opt.key ? "var(--navy)" : "var(--card)",
                color: period === opt.key ? "#fff" : "var(--text-muted)",
                transition: "background 0.15s, color 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {trashed.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗑️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 }}>
            Cestino vuoto
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "40px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--heading)", marginBottom: 4 }}>
            Nessun task nel periodo selezionato
          </div>
          <button type="button" onClick={() => setPeriod("all")} style={{
            marginTop: 8, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Mostra tutti</button>
        </div>
      ) : (
        /* Trash table */
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
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
              {visible.map(task => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--heading)", marginBottom: 2 }}>{task.title}</div>
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
                        background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
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
          {/* Centratura con inset:0 + margin:auto invece di
              translate(-50%,-50%): il transform renderebbe questa card
              containing block per i discendenti position:fixed, e il backdrop
              mobile del DateTimePicker qui sotto (campo SCADENZA) resterebbe
              confinato — e scrollabile — dentro la card invece di coprire lo
              schermo. Vedi ui/ModalPortal.jsx per il dettaglio del meccanismo. */}
          <div className="vd-modal-mh" style={{
            position: "fixed", inset: 0, margin: "auto", height: "fit-content",
            background: "var(--card)", borderRadius: 16, zIndex: 1001,
            width: isMobile ? "calc(100vw - 32px)" : 520, maxWidth: "100%",
            overflowY: "auto",
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
                      background: "var(--card)", cursor: "pointer",
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
                      background: "var(--card)", cursor: "pointer",
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
                      background: "var(--card)", cursor: "pointer",
                    }}
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 4, display: "block" }}>SCADENZA</label>
                  <DateTimePicker
                    value={restoring.dueDate || null}
                    onChange={iso => updateField("dueDate", iso)}
                    align="right"
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
                  {getAssignableTeam().map(m => {
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
                          background: sel ? "var(--navy)" : "var(--card)",
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
                background: "var(--card)", color: "var(--text)", border: "1px solid var(--border)",
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
