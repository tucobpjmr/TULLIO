// ─── CLIENTI — Anagrafica CRM (v1.0) ──────────────────────────────────────
import { useState, useMemo } from "react";
import { useViewport } from "../contexts/ViewportContext.jsx";
import { getActiveTasks } from "../utils/helpers.js";
import { CATEGORIES } from "../data/mockData.js";
import CategoryChip from "../components/ui/CategoryChip.jsx";
import PriorityBadge from "../components/ui/PriorityBadge.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";

// ─── UTILS ────────────────────────────────────────────────────────────────
const genId = () => `cl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const TYPE_LABELS = { individual: "Privato", corporate: "Azienda" };
const TYPE_COLORS = { individual: { color: "#2D7A4F", bg: "#D1FAE5" }, corporate: { color: "#0F2044", bg: "#E0E7FF" } };

// ─── TAG CHIP ─────────────────────────────────────────────────────────────
const TagChip = ({ tag, onRemove }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 99,
    background: "var(--surface3)", color: "var(--text-muted)",
    fontSize: 11, fontWeight: 600,
  }}>
    {tag}
    {onRemove && (
      <button onClick={() => onRemove(tag)} style={{
        border: "none", background: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: 0, lineHeight: 1, fontSize: 12,
      }}>×</button>
    )}
  </span>
);

// ─── TYPE BADGE ───────────────────────────────────────────────────────────
const TypeBadge = ({ type }) => {
  const cfg = TYPE_COLORS[type] || TYPE_COLORS.individual;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.4, background: cfg.bg, color: cfg.color,
    }}>
      {TYPE_LABELS[type] || type}
    </span>
  );
};

// ─── EMPTY STATE ──────────────────────────────────────────────────────────
const EmptyState = ({ filtered, onAdd }) => (
  <div style={{
    background: "#fff", borderRadius: 12, padding: "60px 20px",
    textAlign: "center", border: "1px solid var(--border)",
  }}>
    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.25 }}>🧑‍💼</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
      {filtered ? "Nessun cliente trovato" : "Nessun cliente ancora"}
    </div>
    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
      {filtered ? "Prova a modificare i filtri di ricerca." : "Aggiungi il primo cliente per iniziare."}
    </div>
    {!filtered && (
      <button onClick={onAdd} style={{
        background: "var(--navy)", color: "#fff", border: "none",
        padding: "10px 20px", borderRadius: 8, cursor: "pointer",
        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
      }}>+ Nuovo cliente</button>
    )}
  </div>
);

// ─── CLIENT CARD ──────────────────────────────────────────────────────────
const ClientCard = ({ client, taskCount, onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        background: "#fff", borderRadius: 12, padding: "18px 20px",
        border: `1px solid ${hovered ? "var(--gold)" : "var(--border)"}`,
        cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 4px 18px rgba(15,32,68,0.10)" : "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {client.name}
          </div>
          <TypeBadge type={client.type} />
        </div>
        {taskCount > 0 && (
          <span style={{
            minWidth: 24, height: 24, borderRadius: 99,
            background: "var(--navy)", color: "#fff",
            fontSize: 11, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }} title={`${taskCount} task attivi`}>{taskCount}</span>
        )}
      </div>

      {/* Contacts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {client.email && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
            <span>✉️</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.email}</span>
          </div>
        )}
        {client.phone && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span>📞</span><span>{client.phone}</span>
          </div>
        )}
      </div>

      {/* Tags */}
      {client.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {client.tags.slice(0, 3).map(tag => <TagChip key={tag} tag={tag} />)}
          {client.tags.length > 3 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}>+{client.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── CLIENT FORM MODAL ────────────────────────────────────────────────────
const ClientFormModal = ({ initial, onSave, onClose }) => {
  const { isMobile } = useViewport();
  const [form, setForm] = useState({
    name: "", type: "individual", email: "", phone: "",
    address: "", notes: "", tags: [],
    ...initial,
  });
  const [tagInput, setTagInput] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) {
      set("tags", [...form.tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  const fieldStyle = {
    width: "100%", padding: "9px 12px", border: "1px solid var(--border)",
    borderRadius: 8, fontSize: 13, fontFamily: "inherit",
    background: "#fff", color: "var(--text)", outline: "none",
    boxSizing: "border-box",
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
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "var(--navy)" }}>
          {initial ? "✏️ Modifica cliente" : "➕ Nuovo cliente"}
        </div>

        {/* Tipo */}
        <div>
          <label style={labelStyle}>Tipo</label>
          <div style={{ display: "flex", gap: 8 }}>
            {["individual", "corporate"].map(t => (
              <button key={t} type="button" onClick={() => set("type", t)} style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                border: `2px solid ${form.type === t ? "var(--navy)" : "var(--border)"}`,
                background: form.type === t ? "var(--navy)" : "#fff",
                color: form.type === t ? "#fff" : "var(--text-muted)",
                fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                transition: "all 0.15s",
              }}>{TYPE_LABELS[t]}</button>
            ))}
          </div>
        </div>

        {/* Nome */}
        <div>
          <label style={labelStyle}>Nome *</label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder={form.type === "corporate" ? "es. Azienda Rossi SRL" : "es. Famiglia Rossi"}
            required style={fieldStyle} />
        </div>

        {/* Email + Phone */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
              placeholder="cliente@email.com" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Telefono</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)}
              placeholder="+39 347 …" style={fieldStyle} />
          </div>
        </div>

        {/* Indirizzo */}
        <div>
          <label style={labelStyle}>Indirizzo</label>
          <input value={form.address} onChange={e => set("address", e.target.value)}
            placeholder="Via Roma 1, Milano" style={fieldStyle} />
        </div>

        {/* Note */}
        <div>
          <label style={labelStyle}>Note</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Preferenze di viaggio, note importanti…"
            rows={3} style={{ ...fieldStyle, resize: "vertical" }} />
        </div>

        {/* Tags */}
        <div>
          <label style={labelStyle}>Tag</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {form.tags.map(tag => <TagChip key={tag} tag={tag} onRemove={removeTag} />)}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Aggiungi tag…" style={{ ...fieldStyle, flex: 1 }} />
            <button type="button" onClick={addTag} style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "9px 14px", cursor: "pointer",
              fontSize: 13, fontFamily: "inherit", whiteSpace: "nowrap",
            }}>+ Tag</button>
          </div>
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
          }}>{initial ? "Salva modifiche" : "Crea cliente"}</button>
        </div>
      </form>
    </div>
  );
};

// ─── CLIENT DETAIL SLIDE-OVER ─────────────────────────────────────────────
const ClientDetail = ({ client, tasks, dispatch, onEdit, onClose }) => {
  const { isMobile } = useViewport();
  const clientTasks = useMemo(() =>
    getActiveTasks(tasks).filter(t => t.client === client.name),
    [tasks, client.name]
  );

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
      zIndex: 500, display: "flex", justifyContent: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} className="slide-right" style={{
        width: isMobile ? "100vw" : 420,
        height: "100%", background: "#fff",
        display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 32px rgba(0,0,0,0.12)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          background: "var(--navy)",
        }}>
          <div>
            <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
              {client.name}
            </div>
            <TypeBadge type={client.type} />
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
            width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
            fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Contatti */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "✉️", label: "Email", value: client.email },
              { icon: "📞", label: "Telefono", value: client.phone },
              { icon: "📍", label: "Indirizzo", value: client.address },
            ].map(({ icon, label, value }) => value ? (
              <div key={label} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 1 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: "var(--text)" }}>{value}</div>
                </div>
              </div>
            ) : null)}
          </div>

          {/* Note */}
          {client.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>NOTE</div>
              <div style={{
                fontSize: 13, color: "var(--text)", lineHeight: 1.6,
                background: "var(--surface2)", borderRadius: 8, padding: "10px 14px",
                border: "1px solid var(--border)",
              }}>{client.notes}</div>
            </div>
          )}

          {/* Tags */}
          {client.tags?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>TAG</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {client.tags.map(tag => <TagChip key={tag} tag={tag} />)}
              </div>
            </div>
          )}

          {/* Task associati */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 8 }}>
              TASK ASSOCIATI ({clientTasks.length})
            </div>
            {clientTasks.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>Nessun task attivo per questo cliente.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientTasks.map(task => (
                  <div key={task.id} style={{
                    padding: "10px 12px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "var(--surface)",
                    display: "flex", flexDirection: "column", gap: 5,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
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

        {/* Footer actions */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{
            flex: 1, background: "var(--navy)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>✏️ Modifica</button>
          <button onClick={() => {
            if (window.confirm(`Eliminare il cliente "${client.name}"?\nPotrà essere ripristinato in seguito.`)) {
              dispatch({ type: "DELETE_CLIENT", payload: client.id });
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
const Clienti = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const activeClients = useMemo(() =>
    (state.clients || []).filter(c => !c.deletedAt),
    [state.clients]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activeClients.filter(c => {
      const matchSearch = !q
        || c.name.toLowerCase().includes(q)
        || c.email?.toLowerCase().includes(q)
        || c.phone?.includes(q)
        || c.tags?.some(t => t.toLowerCase().includes(q));
      const matchType = filterType === "all" || c.type === filterType;
      return matchSearch && matchType;
    });
  }, [activeClients, search, filterType]);

  const selectedClient = useMemo(() =>
    activeClients.find(c => c.id === selectedId),
    [activeClients, selectedId]
  );

  const taskCounts = useMemo(() => {
    const active = getActiveTasks(state.tasks);
    const counts = {};
    activeClients.forEach(c => {
      counts[c.id] = active.filter(t => t.client === c.name && t.status !== "done").length;
    });
    return counts;
  }, [state.tasks, activeClients]);

  const handleSave = (form) => {
    if (editingClient) {
      dispatch({ type: "UPDATE_CLIENT", payload: { ...editingClient, ...form } });
    } else {
      dispatch({
        type: "ADD_CLIENT",
        payload: { ...form, id: genId(), createdAt: new Date().toISOString(), deletedAt: null },
      });
    }
    setShowForm(false);
    setEditingClient(null);
  };

  const openEdit = () => {
    setEditingClient(selectedClient);
    setSelectedId(null);
    setShowForm(true);
  };

  return (
    <div className="vd-pad fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

      {/* ─── HEADER ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700, color: "var(--navy)" }}>
            🧑‍💼 Clienti
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {activeClients.length} {activeClients.length === 1 ? "cliente" : "clienti"} in anagrafica
          </div>
        </div>
        <button onClick={() => { setEditingClient(null); setShowForm(true); }} style={{
          background: "var(--navy)", color: "#fff", border: "none",
          padding: "10px 18px", borderRadius: 8, cursor: "pointer",
          fontSize: 13, fontWeight: 700, fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
          boxShadow: "0 4px 14px rgba(15,32,68,0.25)",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
        >
          + Nuovo cliente
        </button>
      </div>

      {/* ─── FILTRI ─── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ flex: "1 1 200px", position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text-muted)" }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, email, tag…"
            style={{
              width: "100%", padding: "9px 12px 9px 32px",
              border: "1px solid var(--border)", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", background: "#fff",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Tipo filter */}
        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "Tutti"], ["individual", "Privati"], ["corporate", "Aziende"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilterType(val)} style={{
              padding: "8px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${filterType === val ? "var(--navy)" : "var(--border)"}`,
              background: filterType === val ? "var(--navy)" : "#fff",
              color: filterType === val ? "#fff" : "var(--text-muted)",
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "Totale clienti", value: activeClients.length, icon: "🧑‍💼" },
          { label: "Privati", value: activeClients.filter(c => c.type === "individual").length, icon: "👤" },
          { label: "Aziende", value: activeClients.filter(c => c.type === "corporate").length, icon: "🏢" },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            background: "#fff", borderRadius: 10, padding: "14px 16px",
            border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── GRID CLIENTI ─── */}
      {filtered.length === 0 ? (
        <EmptyState filtered={search !== "" || filterType !== "all"} onAdd={() => setShowForm(true)} />
      ) : (
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {filtered.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              taskCount={taskCounts[client.id] || 0}
              onClick={() => setSelectedId(client.id)}
            />
          ))}
        </div>
      )}

      {/* ─── DETAIL SLIDE-OVER ─── */}
      {selectedClient && (
        <ClientDetail
          client={selectedClient}
          tasks={state.tasks}
          dispatch={dispatch}
          onEdit={openEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ─── FORM MODAL ─── */}
      {showForm && (
        <ClientFormModal
          initial={editingClient}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingClient(null); }}
        />
      )}
    </div>
  );
};

export default Clienti;
