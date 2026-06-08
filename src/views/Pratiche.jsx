// ─── PRATICHE DI VIAGGIO (v1.0) ────────────────────────────────────────────
import { useState, useMemo } from "react";
import { useViewport } from "../contexts/ViewportContext.jsx";
import { PRATICA_STATI, STATI_SEQUENCE, formatNumeroPratica } from "../data/mockPratiche.js";
import { getMember, getActiveTasks, formatDate } from "../utils/helpers.js";
import { CATEGORIES } from "../data/mockData.js";
import { SUPPLIER_TYPES } from "../data/mockSuppliers.js";
import CategoryChip from "../components/ui/CategoryChip.jsx";
import PriorityBadge from "../components/ui/PriorityBadge.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";

// ─── UTILS ────────────────────────────────────────────────────────────────
const genId = () => `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const getNextNumero = (pratiche) => {
  const year = new Date().getFullYear();
  const existing = pratiche
    .filter(p => p.numero?.startsWith(`PR-${year}-`))
    .map(p => parseInt(p.numero.split("-")[2]) || 0);
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return formatNumeroPratica(year, next);
};

const calcDurata = (partenza, ritorno) => {
  if (!partenza || !ritorno) return null;
  const diff = new Date(ritorno) - new Date(partenza);
  const giorni = Math.round(diff / (1000 * 60 * 60 * 24));
  return giorni > 0 ? `${giorni} giorn${giorni === 1 ? "o" : "i"}` : null;
};

// ─── STATO BADGE ──────────────────────────────────────────────────────────
const StatoBadge = ({ stato }) => {
  const cfg = PRATICA_STATI[stato] || PRATICA_STATI.bozza;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700,
      letterSpacing: 0.3, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── TIMELINE STATO ───────────────────────────────────────────────────────
const StatoTimeline = ({ stato, onChangeStato, readonly }) => {
  const currentIdx = STATI_SEQUENCE.indexOf(stato);
  const isAnnullata = stato === "annullata";

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 10 }}>STATO PRATICA</div>
      {isAnnullata ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatoBadge stato="annullata" />
          {!readonly && (
            <button onClick={() => onChangeStato("bozza")} style={{
              fontSize: 11, color: "var(--text-muted)", background: "none",
              border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px",
              cursor: "pointer", fontFamily: "inherit",
            }}>↩ Riapri come bozza</button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {STATI_SEQUENCE.map((s, i) => {
            const cfg = PRATICA_STATI[s];
            const done = i <= currentIdx;
            const isCurrent = i === currentIdx;
            const canAdvance = !readonly && i === currentIdx + 1;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", flex: i < STATI_SEQUENCE.length - 1 ? 1 : 0 }}>
                <div
                  onClick={canAdvance ? () => onChangeStato(s) : undefined}
                  title={canAdvance ? `Avanza a "${cfg.label}"` : cfg.label}
                  style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: done ? cfg.color : "var(--surface3)",
                    color: done ? "#fff" : "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700,
                    cursor: canAdvance ? "pointer" : "default",
                    border: isCurrent ? `3px solid ${cfg.color}` : "none",
                    boxSizing: "border-box",
                    transition: "all 0.2s",
                    transform: canAdvance ? "scale(1.05)" : "scale(1)",
                  }}
                >{cfg.icon}</div>
                {i < STATI_SEQUENCE.length - 1 && (
                  <div style={{
                    flex: 1, height: 3, margin: "0 2px",
                    background: i < currentIdx ? cfg.color : "var(--surface3)",
                    transition: "background 0.3s",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {STATI_SEQUENCE.map(s => (
          <div key={s} style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center", flex: 1 }}>
            {PRATICA_STATI[s].label}
          </div>
        ))}
      </div>
      {!readonly && stato !== "annullata" && stato !== "completata" && (
        <button onClick={() => onChangeStato("annullata")} style={{
          marginTop: 10, fontSize: 11, color: "var(--danger)", background: "none",
          border: "1px solid rgba(192,57,43,0.3)", borderRadius: 6, padding: "4px 10px",
          cursor: "pointer", fontFamily: "inherit",
        }}>❌ Annulla pratica</button>
      )}
    </div>
  );
};

// ─── PRATICA CARD ─────────────────────────────────────────────────────────
const PraticaCard = ({ pratica, client, taskCount, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const cfg = PRATICA_STATI[pratica.stato] || PRATICA_STATI.bozza;
  const durata = calcDurata(pratica.dataPartenza, pratica.dataRitorno);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        background: "#fff", borderRadius: 12,
        border: `1px solid ${hovered ? "var(--gold)" : "var(--border)"}`,
        cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 4px 18px rgba(15,32,68,0.10)" : "0 1px 4px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Colored top bar */}
      <div style={{ height: 4, background: cfg.color }} />

      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 3 }}>
              {pratica.numero}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {pratica.titolo}
            </div>
          </div>
          <StatoBadge stato={pratica.stato} />
        </div>

        {/* Client */}
        {client && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span>🧑‍💼</span><span>{client.name}</span>
          </div>
        )}

        {/* Destination + dates */}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 12, color: "var(--text)", display: "flex", alignItems: "center", gap: 5 }}>
            <span>📍</span><span style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{pratica.destinazione}</span>
          </div>
          {pratica.dataPartenza && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
              <span>📅</span>
              <span>{formatDate(pratica.dataPartenza)} → {formatDate(pratica.dataRitorno)}</span>
              {durata && <span style={{ marginLeft: 4, padding: "1px 6px", background: "var(--surface2)", borderRadius: 99, fontSize: 10, fontWeight: 600 }}>{durata}</span>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            👥 {pratica.adulti + (pratica.bambini || 0)} pax
            {pratica.bambini > 0 && <span style={{ fontSize: 10, marginLeft: 4 }}>({pratica.bambini} bambini)</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {pratica.budget > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>
                €{pratica.budget.toLocaleString("it-IT")}
              </div>
            )}
            {taskCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px",
                background: "var(--navy)", color: "#fff", borderRadius: 99,
              }}>{taskCount} task</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── PRATICA FORM MODAL ───────────────────────────────────────────────────
const PraticaFormModal = ({ initial, clients, pratiche, onSave, onClose }) => {
  const { isMobile } = useViewport();
  const [form, setForm] = useState({
    titolo: "", clientId: "", stato: "bozza", destinazione: "",
    adulti: 2, bambini: 0, budget: 0, note: "",
    ...initial,
    dataPartenza: initial?.dataPartenza ? initial.dataPartenza.slice(0, 10) : "",
    dataRitorno: initial?.dataRitorno ? initial.dataRitorno.slice(0, 10) : "",
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.titolo.trim()) return;
    onSave({
      ...form,
      adulti: parseInt(form.adulti) || 0,
      bambini: parseInt(form.bambini) || 0,
      budget: parseFloat(form.budget) || 0,
      dataPartenza: form.dataPartenza ? new Date(form.dataPartenza).toISOString() : null,
      dataRitorno: form.dataRitorno ? new Date(form.dataRitorno).toISOString() : null,
    });
  };

  const fieldStyle = {
    width: "100%", padding: "9px 12px", border: "1px solid var(--border)",
    borderRadius: 8, fontSize: 13, fontFamily: "inherit",
    background: "#fff", color: "var(--text)", outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 600, padding: 16,
    }}>
      <form onClick={e => e.stopPropagation()} onSubmit={handleSubmit} style={{
        background: "#fff", borderRadius: 14, padding: isMobile ? 20 : 28,
        width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>
          {initial ? "✏️ Modifica pratica" : "✈️ Nuova pratica"}
        </div>

        {/* Numero pratica (readonly) */}
        {initial && (
          <div style={{
            padding: "8px 12px", background: "var(--surface2)", borderRadius: 8,
            fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5,
          }}>PRATICA {initial.numero}</div>
        )}

        {/* Titolo */}
        <div>
          <label style={labelStyle}>Titolo pratica *</label>
          <input value={form.titolo} onChange={e => set("titolo", e.target.value)}
            placeholder="es. Viaggio Maldive — Famiglia Rossi" required style={fieldStyle} />
        </div>

        {/* Cliente + Stato */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Cliente</label>
            <select value={form.clientId} onChange={e => set("clientId", e.target.value)} style={fieldStyle}>
              <option value="">— Seleziona cliente —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Stato</label>
            <select value={form.stato} onChange={e => set("stato", e.target.value)} style={fieldStyle}>
              {Object.entries(PRATICA_STATI).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Destinazione */}
        <div>
          <label style={labelStyle}>Destinazione</label>
          <input value={form.destinazione} onChange={e => set("destinazione", e.target.value)}
            placeholder="es. Maldive, Four Seasons Kuda Huraa" style={fieldStyle} />
        </div>

        {/* Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Data partenza</label>
            <input type="date" value={form.dataPartenza} onChange={e => set("dataPartenza", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Data ritorno</label>
            <input type="date" value={form.dataRitorno} onChange={e => set("dataRitorno", e.target.value)} style={fieldStyle} />
          </div>
        </div>

        {/* Pax + Budget */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Adulti</label>
            <input type="number" min="0" value={form.adulti} onChange={e => set("adulti", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bambini</label>
            <input type="number" min="0" value={form.bambini} onChange={e => set("bambini", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Budget (€)</label>
            <input type="number" min="0" step="100" value={form.budget} onChange={e => set("budget", e.target.value)} style={fieldStyle} />
          </div>
        </div>

        {/* Note */}
        <div>
          <label style={labelStyle}>Note</label>
          <textarea value={form.note} onChange={e => set("note", e.target.value)}
            placeholder="Note operative, condizioni speciali…"
            rows={3} style={{ ...fieldStyle, resize: "vertical" }} />
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" onClick={onClose} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 20px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>Annulla</button>
          <button type="submit" style={{
            background: "var(--navy)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px 20px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>{initial ? "Salva modifiche" : "Crea pratica"}</button>
        </div>
      </form>
    </div>
  );
};

// ─── PRATICA DETAIL SLIDE-OVER ────────────────────────────────────────────
const PraticaDetail = ({ pratica, clients, suppliers, tasks, dispatch, onEdit, onClose }) => {
  const { isMobile } = useViewport();
  const client = useMemo(() => clients.find(c => c.id === pratica.clientId), [clients, pratica.clientId]);
  const linkedTasks = useMemo(() =>
    getActiveTasks(tasks).filter(t => pratica.taskIds?.includes(t.id)),
    [tasks, pratica.taskIds]
  );
  const linkedSuppliers = useMemo(() =>
    (suppliers || []).filter(s => pratica.supplierIds?.includes(s.id) && !s.deletedAt),
    [suppliers, pratica.supplierIds]
  );
  const durata = calcDurata(pratica.dataPartenza, pratica.dataRitorno);
  const cfg = PRATICA_STATI[pratica.stato] || PRATICA_STATI.bozza;

  const handleChangeStato = (nuovoStato) => {
    dispatch({ type: "UPDATE_PRATICA", payload: { ...pratica, stato: nuovoStato } });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
      zIndex: 500, display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} className="slide-right" style={{
        width: isMobile ? "100vw" : 460,
        height: "100%", background: "#fff",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{ background: cfg.color, padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
                {pratica.numero}
              </div>
              <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "#fff", lineHeight: 1.3 }}>
                {pratica.titolo}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
              width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>×</button>
          </div>
          <StatoBadge stato={pratica.stato} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Timeline */}
          <StatoTimeline stato={pratica.stato} onChangeStato={handleChangeStato} />

          {/* Info principali */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { icon: "🧑‍💼", label: "Cliente", value: client?.name || "—" },
              { icon: "📍", label: "Destinazione", value: pratica.destinazione || "—" },
              { icon: "📅", label: "Partenza", value: formatDate(pratica.dataPartenza) },
              { icon: "🏁", label: "Ritorno", value: formatDate(pratica.dataRitorno) },
              { icon: "⏱️", label: "Durata", value: durata || "—" },
              { icon: "👥", label: "Partecipanti", value: `${pratica.adulti + (pratica.bambini || 0)} pax${pratica.bambini > 0 ? ` (${pratica.bambini} bambini)` : ""}` },
            ].map(({ icon, label, value }) => (
              <div key={label} style={{ background: "var(--surface)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 3 }}>{icon} {label.toUpperCase()}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--navy)" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Budget */}
          {pratica.budget > 0 && (
            <div style={{
              background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
              borderRadius: 10, padding: "14px 18px", color: "#fff",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, opacity: 0.7, marginBottom: 4 }}>BUDGET TOTALE</div>
                <div className="playfair" style={{ fontSize: 26, fontWeight: 700, color: "var(--gold)" }}>
                  €{pratica.budget.toLocaleString("it-IT")}
                </div>
              </div>
              <span style={{ fontSize: 36, opacity: 0.3 }}>💰</span>
            </div>
          )}

          {/* Note */}
          {pratica.note && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>NOTE</div>
              <div style={{
                fontSize: 13, color: "var(--text)", lineHeight: 1.6,
                background: "var(--surface2)", borderRadius: 8, padding: "10px 14px",
                border: "1px solid var(--border)",
              }}>{pratica.note}</div>
            </div>
          )}

          {/* Fornitori */}
          {linkedSuppliers.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 8 }}>
                FORNITORI ({linkedSuppliers.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {linkedSuppliers.map(s => {
                  const typeCfg = SUPPLIER_TYPES[s.type] || SUPPLIER_TYPES.other;
                  return (
                    <div key={s.id} style={{
                      padding: "8px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", background: typeCfg.bg,
                      display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ fontSize: 16 }}>{typeCfg.icon}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: typeCfg.color }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{typeCfg.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Task collegati */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 8 }}>
              TASK COLLEGATI ({linkedTasks.length})
            </div>
            {linkedTasks.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>Nessun task collegato.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {linkedTasks.map(task => (
                  <div key={task.id} style={{
                    padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    display: "flex", flexDirection: "column", gap: 5,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                      <CategoryChip category={task.category} />
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{
            flex: 1, background: "var(--navy)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>✏️ Modifica</button>
          <button onClick={() => {
            if (window.confirm(`Eliminare la pratica "${pratica.numero}"?\nPotrà essere ripristinata in seguito.`)) {
              dispatch({ type: "DELETE_PRATICA", payload: pratica.id });
              onClose();
            }
          }} style={{
            background: "var(--surface2)", color: "var(--danger)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "10px 14px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>🗑️</button>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN VIEW ────────────────────────────────────────────────────────────
const Pratiche = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [filterStato, setFilterStato] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingPratica, setEditingPratica] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const activePratiche = useMemo(() =>
    (state.pratiche || []).filter(p => !p.deletedAt),
    [state.pratiche]
  );
  const activeClients = useMemo(() =>
    (state.clients || []).filter(c => !c.deletedAt),
    [state.clients]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activePratiche.filter(p => {
      const matchSearch = !q
        || p.titolo.toLowerCase().includes(q)
        || p.numero.toLowerCase().includes(q)
        || p.destinazione?.toLowerCase().includes(q)
        || activeClients.find(c => c.id === p.clientId)?.name.toLowerCase().includes(q);
      const matchStato = filterStato === "all" || p.stato === filterStato;
      return matchSearch && matchStato;
    });
  }, [activePratiche, search, filterStato, activeClients]);

  const selectedPratica = useMemo(() =>
    activePratiche.find(p => p.id === selectedId),
    [activePratiche, selectedId]
  );

  const taskCounts = useMemo(() => {
    const counts = {};
    activePratiche.forEach(p => {
      counts[p.id] = getActiveTasks(state.tasks).filter(t => p.taskIds?.includes(t.id) && t.status !== "done").length;
    });
    return counts;
  }, [state.tasks, activePratiche]);

  const kpi = useMemo(() => ({
    total: activePratiche.length,
    bozza: activePratiche.filter(p => p.stato === "bozza").length,
    confermata: activePratiche.filter(p => p.stato === "confermata").length,
    in_corso: activePratiche.filter(p => p.stato === "in_corso").length,
    completata: activePratiche.filter(p => p.stato === "completata").length,
    budgetTotale: activePratiche.filter(p => p.stato !== "annullata").reduce((a, p) => a + (p.budget || 0), 0),
  }), [activePratiche]);

  const handleSave = (form) => {
    if (editingPratica) {
      dispatch({ type: "UPDATE_PRATICA", payload: { ...editingPratica, ...form } });
    } else {
      dispatch({
        type: "ADD_PRATICA",
        payload: {
          ...form, id: genId(),
          numero: getNextNumero(activePratiche),
          taskIds: [], supplierIds: [],
          createdAt: new Date().toISOString(),
          createdBy: state.currentUserId,
          deletedAt: null,
        },
      });
    }
    setShowForm(false);
    setEditingPratica(null);
  };

  const openEdit = () => {
    setEditingPratica(selectedPratica);
    setSelectedId(null);
    setShowForm(true);
  };

  return (
    <div className="vd-pad fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

      {/* ─── HEADER ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700, color: "var(--navy)" }}>
            ✈️ Pratiche di Viaggio
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {activePratiche.length} {activePratiche.length === 1 ? "pratica" : "pratiche"} · budget totale{" "}
            <strong style={{ color: "var(--navy)" }}>€{kpi.budgetTotale.toLocaleString("it-IT")}</strong>
          </div>
        </div>
        <button onClick={() => { setEditingPratica(null); setShowForm(true); }} style={{
          background: "var(--navy)", color: "#fff", border: "none",
          padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(15,32,68,0.25)",
          transition: "transform 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          + Nuova pratica
        </button>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        {[
          { label: "Totale", value: kpi.total, ...PRATICA_STATI.bozza, color: "var(--navy)" },
          { label: "Bozze", value: kpi.bozza, ...PRATICA_STATI.bozza },
          { label: "Confermate", value: kpi.confermata, ...PRATICA_STATI.confermata },
          { label: "In Corso", value: kpi.in_corso, ...PRATICA_STATI.in_corso },
          { label: "Completate", value: kpi.completata, ...PRATICA_STATI.completata },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            background: "#fff", borderRadius: 10, padding: "14px 16px",
            border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--navy)", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── FILTRI ─── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text-muted)" }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per numero, titolo, cliente, destinazione…"
            style={{
              width: "100%", padding: "9px 12px 9px 32px",
              border: "1px solid var(--border)", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", background: "#fff",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setFilterStato("all")} style={{
            padding: "8px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${filterStato === "all" ? "var(--navy)" : "var(--border)"}`,
            background: filterStato === "all" ? "var(--navy)" : "#fff",
            color: filterStato === "all" ? "#fff" : "var(--text-muted)",
            fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
          }}>Tutti</button>
          {Object.entries(PRATICA_STATI).map(([key, cfg]) => (
            <button key={key} onClick={() => setFilterStato(key)} style={{
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${filterStato === key ? cfg.color : "var(--border)"}`,
              background: filterStato === key ? cfg.bg : "#fff",
              color: filterStato === key ? cfg.color : "var(--text-muted)",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
            }}>{cfg.icon} {!isMobile && cfg.label}</button>
          ))}
        </div>
      </div>

      {/* ─── GRID PRATICHE ─── */}
      {filtered.length === 0 ? (
        <div style={{
          background: "#fff", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.25 }}>✈️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
            {search || filterStato !== "all" ? "Nessuna pratica trovata" : "Nessuna pratica ancora"}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            {search || filterStato !== "all" ? "Prova a modificare i filtri." : "Crea la prima pratica di viaggio."}
          </div>
          {!search && filterStato === "all" && (
            <button onClick={() => setShowForm(true)} style={{
              background: "var(--navy)", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}>+ Nuova pratica</button>
          )}
        </div>
      ) : (
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {filtered
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(pratica => (
              <PraticaCard
                key={pratica.id}
                pratica={pratica}
                client={activeClients.find(c => c.id === pratica.clientId)}
                taskCount={taskCounts[pratica.id] || 0}
                onClick={() => setSelectedId(pratica.id)}
              />
            ))}
        </div>
      )}

      {/* ─── DETAIL SLIDE-OVER ─── */}
      {selectedPratica && (
        <PraticaDetail
          pratica={selectedPratica}
          clients={activeClients}
          suppliers={state.suppliers || []}
          tasks={state.tasks}
          dispatch={dispatch}
          onEdit={openEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ─── FORM MODAL ─── */}
      {showForm && (
        <PraticaFormModal
          initial={editingPratica}
          clients={activeClients}
          pratiche={activePratiche}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingPratica(null); }}
        />
      )}
    </div>
  );
};

export default Pratiche;
