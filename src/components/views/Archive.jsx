// ─── ARCHIVIO ──────────────────────────────────────────────────────────────
// Vista che raccoglie le task completate (status "done", non cestinate) e,
// in una sezione dedicata, le liste buoni viaggio chiuse (stato "esaurita",
// non cestinate). Il sistema convoglia qui gli elementi chiusi: spariscono
// dalle code/home attive e restano consultabili/riapribili in questa sezione.
import { useCallback, useEffect, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { TaskCard } from "../tasks/TaskCard.jsx";
import { formatDate, getArchivedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { ListeAPI, eur, fmtDate, runListeCall, saldoClass } from "../../lib/listeApi.js";

const PERIOD_OPTIONS = [
  { key: "all",       label: "Sempre" },
  { key: "week",      label: "Ultimi 7 gg" },
  { key: "month",     label: "Questo mese" },
  { key: "lastMonth", label: "Mese scorso" },
];

// Filtra elementi per una data (completamento task o chiusura lista). Gli
// elementi senza quella data (completati prima dell'introduzione del campo)
// restano fuori dai filtri temporali ma compaiono in "Sempre".
const filterByPeriod = (items, period, dateField) => {
  if (period === "all") return items;
  const now = new Date();
  return items.filter(it => {
    if (!it[dateField]) return false;
    const d = new Date(it[dateField]);
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

const SALDO_COLORS = { pos: "var(--success)", neg: "var(--danger)", zero: "var(--text-muted)" };

export const Archive = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const { categories, getVisibleTasks, canEditTask, isDriver } = useAppData();
  const me = state.currentUserId;
  // Le liste buoni viaggio sono precluse ai Driver (stessa RLS del modulo
  // Liste Viaggio): niente tab, niente fetch, per chi non può comunque accedervi.
  const listeAllowed = !isDriver(me);
  const [tab, setTab] = useState("task");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState("all");

  // Solo le task completate che l'utente può vedere (rispetta i permessi).
  // Ordinate per data di completamento (completedAt) decrescente; fallback su
  // dueDate per task completate prima dell'introduzione di completed_at.
  const archived = getVisibleTasks(getArchivedTasks(state.tasks), me)
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

  const handleTrash = (task) => {
    if (window.confirm(`Spostare "${task.title}" nel cestino?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
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
            {archived.length === 0
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
          {archived.length === 0 ? (
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
        <ArchivedListe dispatch={dispatch} isMobile={isMobile} />
      )}
    </div>
  );
};

// ─── Sezione "Liste buoni viaggio" (liste con stato "esaurita", non cestinate) ──
// Le liste non vivono nello state globale come i task (il modulo Liste le
// fetcha sempre on-demand da Supabase): stesso pattern qui, con stato locale.
const ArchivedListe = ({ dispatch, isMobile }) => {
  const [liste, setListe] = useState([]);
  const [saldi, setSaldi] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("all");

  const load = useCallback(async () => {
    setLoadError(null);
    const [rListe, rSaldi] = await Promise.all([ListeAPI.list(), ListeAPI.saldi()]);
    const failed = [rListe, rSaldi].find(r => r.error);
    if (failed) {
      console.error("[liste] archivio", failed.error);
      setLoadError(failed.error.message);
      setLoading(false);
      return;
    }
    setListe((rListe.data || []).filter(l => l.stato === "esaurita"));
    setSaldi(Object.fromEntries((rSaldi.data || []).map(s => [s.lista_id, s])));
    setLoading(false);
  }, []);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const visible = filterByPeriod(liste, period, "closed_at").filter(l => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const hay = `${l.clients?.name || ""} ${l.titolo || ""} ${l.note || ""}`.toLowerCase();
    return hay.includes(q);
  }).sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0));

  const hasActiveFilter = query.trim() || period !== "all";
  const resetFilters = () => { setQuery(""); setPeriod("all"); };

  const apri = (l) => dispatch({ type: "SET_VIEW", payload: "liste", lista: l.id });

  const handleReopen = async (l) => {
    const { ok } = await runListeCall(dispatch, ListeAPI.cambiaStato(l.id, "attiva"), "Lista riaperta");
    if (ok) load();
  };

  const handleTrash = async (l) => {
    if (!window.confirm(`Spostare la lista di "${l.clients?.name || "—"}" nel cestino?`)) return;
    const { ok } = await runListeCall(dispatch, ListeAPI.archivia(l.id), "Lista spostata nel cestino");
    if (ok) load();
  };

  if (loading) {
    return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Caricamento liste…</div>;
  }

  if (loadError) {
    return (
      <div style={{ background: "var(--card)", borderRadius: 12, padding: "40px 20px", textAlign: "center", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Non riesco a caricare le liste buoni viaggio.</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{loadError}</div>
        <button onClick={load} style={{
          marginTop: 10, padding: "6px 14px", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--card)",
          color: "var(--navy)", cursor: "pointer", fontSize: 13, fontWeight: 600,
          fontFamily: "inherit",
        }}>Riprova</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
        {liste.length === 0
          ? "Nessuna lista buono viaggio esaurita"
          : hasActiveFilter
            ? `${visible.length} di ${liste.length} liste — filtrate`
            : `${liste.length} ${liste.length === 1 ? "lista esaurita" : "liste esaurite"}. Riaprile o spostale nel cestino.`
        }
      </div>

      {/* Filtri — solo se ci sono liste chiuse */}
      {liste.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per cliente, titolo, note…"
            style={{
              flex: "1 1 100%", minWidth: 0, padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--gold)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        </div>
      )}

      {/* Filtro periodo (per data di chiusura) — solo se ci sono liste chiuse */}
      {liste.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Chiuse:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)} style={chipStyle(period === opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {liste.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🧾</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 }}>Nessuna lista esaurita</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Le liste buoni viaggio chiuse verranno raccolte qui. Potrai riaprirle o spostarle nel cestino.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "40px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--heading)", marginBottom: 4 }}>
            Nessuna lista per i filtri selezionati
          </div>
          <button type="button" onClick={resetFilters} style={{
            marginTop: 8, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Azzera filtri</button>
        </div>
      ) : isMobile ? (
        /* Mobile: card list */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(l => {
            const s = saldi[l.id] || { saldo: 0 };
            return (
              <div
                key={l.id}
                onClick={() => apri(l)}
                style={{
                  background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
                  padding: "14px 16px", cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--heading)", fontSize: 14, marginBottom: 6 }}>
                  {l.clients?.name || "—"}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  {l.titolo && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.titolo}</span>}
                  <span style={{ fontSize: 12, fontWeight: 700, color: SALDO_COLORS[saldoClass(Number(s.saldo))] }}>{eur(s.saldo)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {l.closed_at ? `chiusa ${fmtDate(l.closed_at.slice(0, 10))}` : "—"}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleReopen(l)} style={{
                      background: "var(--navy)", color: "#fff", border: "none",
                      padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                      fontWeight: 600, fontFamily: "inherit",
                    }}>↩ Riapri</button>
                    <button onClick={() => handleTrash(l)} style={{
                      background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                      fontWeight: 600, fontFamily: "inherit",
                    }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop: table */
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle("left", "16px")}>CLIENTE</th>
                <th style={thStyle("left")}>TITOLO</th>
                <th style={thStyle("left")}>SALDO</th>
                <th style={thStyle("left")}>CHIUSA IL</th>
                <th style={thStyle("right", "16px")}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(l => {
                const s = saldi[l.id] || { saldo: 0 };
                return (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "pointer" }}
                    onClick={() => apri(l)}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--heading)" }}>{l.clients?.name || "—"}</td>
                    <td style={{ padding: "12px 8px", color: "var(--text)" }}>
                      {l.titolo || <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 700, color: SALDO_COLORS[saldoClass(Number(s.saldo))] }}>
                      {eur(s.saldo)}
                    </td>
                    <td style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                      {l.closed_at ? fmtDate(l.closed_at.slice(0, 10)) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => handleReopen(l)} title="Riapri (rimetti attiva)" style={{
                          background: "var(--navy)", color: "#fff", border: "none",
                          padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                          fontWeight: 600, fontFamily: "inherit",
                        }}>↩ Riapri</button>
                        <button onClick={() => handleTrash(l)} title="Sposta nel cestino" style={{
                          background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                          padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                          fontWeight: 600, fontFamily: "inherit",
                        }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

const thStyle = (align, padX = "8px") => ({
  padding: `12px ${padX}`, textAlign: align, fontSize: 11, fontWeight: 700,
  color: "var(--text-muted)", letterSpacing: 0.5,
});

const chipStyle = (active) => ({
  padding: "5px 12px", borderRadius: 999, cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--card)",
  color: active ? "#fff" : "var(--text-muted)",
  transition: "background 0.15s, color 0.15s",
});

const tabStyle = (active) => ({
  padding: "7px 14px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--card)",
  color: active ? "#fff" : "var(--text)",
  transition: "background 0.15s, color 0.15s",
});
