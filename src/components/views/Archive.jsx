// ─── ARCHIVIO ──────────────────────────────────────────────────────────────
// Vista che raccoglie le task completate (status "done", non cestinate) e,
// in una sezione dedicata, le liste buoni viaggio chiuse (stato "esaurita",
// non cestinate). Il sistema convoglia qui gli elementi chiusi: spariscono
// dalle code/home attive e restano consultabili/riapribili in questa sezione.
import { memo, useState, useCallback, lazy, Suspense } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { TaskCard } from "../tasks/TaskCard.jsx";
import { LazyFallback } from "../ui/LazyFallback.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { formatDate, getArchivedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { PERIOD_OPTIONS, filterByPeriod, thStyle, chipStyle } from "./archiveFilters.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
// La sezione "liste buoni viaggio" è del modulo Liste e viene montata per
// composizione: questa vista non conosce il suo data layer. Chunk async per lo
// stesso motivo di ClienteDetailPanel.jsx — porta con sé lib/listeApi.js.
const ArchivedListe = lazy(() =>
  import("../liste/ArchivedListe.jsx").then(m => ({ default: m.ArchivedListe }))
);

// `memo` + lettura dal contesto: senza il memo il provider non servirebbe a
// nulla, perché il genitore ri-renderizza a ogni azione (vedi
// state/TasksContext.jsx). `dispatch` ha identità stabile, quindi il confronto
// shallow riesce e il render si salta finché non cambiano davvero i task.
// `loading` (criticità #6): "Archivio vuoto" e "archivio non ancora caricato"
// sono due frasi diverse, e finora l'utente vedeva sempre la prima.
export const Archive = memo(function Archive({ dispatch, loading = false }) {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { categories, currentUserId, getVisibleTasks, canEditTask, canAccessListe } = useAppData();
  const tasks = useTasks();
  const me = currentUserId;
  // Le liste buoni viaggio seguono l'accesso al modulo Liste Viaggio (stessa
  // RLS): niente tab, niente fetch, per chi non può comunque accedervi.
  const listeAllowed = canAccessListe(me);
  const [tab, setTab] = useState("task");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState("all");

  // Solo le task completate che l'utente può vedere (rispetta i permessi).
  // Ordinate per data di completamento (completedAt) decrescente; fallback su
  // dueDate per task completate prima dell'introduzione di completed_at.
  const archived = getVisibleTasks(getArchivedTasks(tasks), me)
    .sort((a, b) => new Date(b.completedAt || b.dueDate || 0) - new Date(a.completedAt || a.dueDate || 0));

  const visible = filterByPeriod(archived, period, "completedAt").filter(t => {
    if (category !== "all" && t.category !== category) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${t.title} ${t.client || ""} ${t.praticaRef || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // "Sto ancora caricando e non ho ancora nulla": vedi Dashboard.jsx.
  const caricando = loading && tasks.length === 0;
  const hasActiveFilter = category !== "all" || query.trim() || period !== "all";
  const resetFilters = () => { setCategory("all"); setQuery(""); setPeriod("all"); };

  // Stabile per la memoizzazione di TaskCard (vedi components/tasks/TaskCard.jsx).
  const openTask = useCallback(
    (task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);

  const handleReopen = (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi riaprire questa task" } });
      return;
    }
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: "inprogress" } });
  };

  const handleTrash = async (task) => {
    const ok = await conferma({
      title: "Spostare nel cestino?",
      body: `"${task.title}" resterà recuperabile dal Cestino.`,
      cta: "Sposta nel cestino", danger: true,
    });
    if (ok) dispatch({ type: "DELETE_TASK", payload: task.id });
  };

  // Categorie effettivamente presenti tra le task archiviate (per il filtro).
  const presentCats = Array.from(new Set(archived.map(t => t.category)));

  const pad = isMobile ? "16px" : "24px 32px";
  const showTaskTab = !listeAllowed || tab === "task";

  return (
    <div className="vd-pad" style={{ padding: pad, maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="playfair" style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
          📦 Archivio
        </div>

        {listeAllowed && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={() => setTab("task")} style={tabStyle(tab === "task")}>📋 Task</button>
            <button type="button" onClick={() => setTab("liste")} style={tabStyle(tab === "liste")}>🧾 Liste buoni viaggio</button>
          </div>
        )}
      </div>

      {showTaskTab ? (
        <>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            {caricando
              ? "Caricamento dell'archivio…"
              : archived.length === 0
              ? "Nessuna task completata"
              : hasActiveFilter
                ? `${visible.length} di ${archived.length} task — filtrate`
                : `${archived.length} task ${archived.length === 1 ? "completata" : "completate"}. Riaprile o spostale nel cestino.`
            }
          </div>

          {/* Filtri — solo se ci sono task */}
          {archived.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cerca per titolo, cliente, pratica…"
                style={{
                  flex: "1 1 100%", minWidth: 0, padding: "8px 12px", borderRadius: 8,
                  border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
              <button type="button" onClick={() => setCategory("all")} style={chipStyle(category === "all")}>Tutte</button>
              {presentCats.map(k => (
                <button key={k} type="button" onClick={() => setCategory(k)} style={chipStyle(category === k)}>
                  {categories[k]?.icon} {categories[k]?.label || k}
                </button>
              ))}
            </div>
          )}

          {/* Filtro periodo (per data di completamento) — solo se ci sono task */}
          {archived.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Completate:</span>
              {PERIOD_OPTIONS.map(opt => (
                <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)} style={chipStyle(period === opt.key)}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {caricando ? (
            <SkeletonCards count={4} label="Caricamento dell'archivio" />
          ) : archived.length === 0 ? (
            <div style={{
              background: "var(--card)", borderRadius: 12, padding: "60px 20px",
              textAlign: "center", border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📦</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 }}>Archivio vuoto</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Le task completate verranno raccolte qui. Potrai riaprirle o spostarle nel cestino.
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div style={{
              background: "var(--card)", borderRadius: 12, padding: "40px 20px",
              textAlign: "center", border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--heading)", marginBottom: 4 }}>
                Nessuna task per i filtri selezionati
              </div>
              <button type="button" onClick={resetFilters} style={{
                marginTop: 8, padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--card)",
                color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}>Azzera filtri</button>
            </div>
          ) : isMobile ? (
            /* Mobile: card list — no horizontal overflow */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visible.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={openTask}
                  radius={12}
                  padding="14px 16px"
                  gap={8}
                  titleColor="var(--heading)"
                  showCategory={false}
                  showClient={false}
                  /* I badge stanno SOTTO il titolo, non sopra: qui la card è una
                     riga d'archivio, il titolo è l'informazione principale. */
                  subheader={
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <PriorityBadge priority={task.priority} />
                      <CategoryChip category={task.category} />
                      <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>✓ Completata</span>
                    </div>
                  }
                  footer={
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        {task.client && (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{task.client}</span>
                        )}
                        {task.completedAt && (
                          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(task.completedAt)}</span>
                        )}
                        {task.assignees?.length > 0 && (
                          <div style={{ display: "flex", gap: 3 }}>
                            {task.assignees.map(id => <Avatar key={id} memberId={id} size={20} />)}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleReopen(task)} style={{
                          background: "var(--navy)", color: "#fff", border: "none",
                          padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                          fontWeight: 600, fontFamily: "inherit",
                        }}>↩ Riapri</button>
                        <button onClick={() => handleTrash(task)} style={{
                          background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                          padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                          fontWeight: 600, fontFamily: "inherit",
                        }}>🗑️</button>
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          ) : (
            /* Desktop: table */
            <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    <th style={thStyle("left", "16px")}>TASK</th>
                    <th style={thStyle("left")}>CATEGORIA</th>
                    <th style={thStyle("left")}>CLIENTE</th>
                    <th style={thStyle("left")}>ASSEGNATI</th>
                    <th style={thStyle("left")}>COMPLETATA</th>
                    <th style={thStyle("right", "16px")}>AZIONI</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(task => (
                    <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "pointer" }}
                      onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: task })}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--heading)", marginBottom: 2 }}>{task.title}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                          <PriorityBadge priority={task.priority} />
                          <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Completata</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px" }}><CategoryChip category={task.category} /></td>
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
                        {task.completedAt ? formatDate(task.completedAt) : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button onClick={() => handleReopen(task)} title="Riapri (rimetti in lavorazione)" style={{
                            background: "var(--navy)", color: "#fff", border: "none",
                            padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                            fontWeight: 600, fontFamily: "inherit",
                          }}>↩ Riapri</button>
                          <button onClick={() => handleTrash(task)} title="Sposta nel cestino" style={{
                            background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                            padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                            fontWeight: 600, fontFamily: "inherit",
                          }}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <Suspense fallback={<LazyFallback />}>
          <ArchivedListe dispatch={dispatch} isMobile={isMobile} />
        </Suspense>
      )}
    </div>
  );
});

const tabStyle = (active) => ({
  padding: "7px 14px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--card)",
  color: active ? "#fff" : "var(--text)",
  transition: "background 0.15s, color 0.15s",
});
