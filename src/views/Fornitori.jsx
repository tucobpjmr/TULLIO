// ─── FORNITORI — Anagrafica (v1.0) ────────────────────────────────────────
import { useState, useMemo } from "react";
import { useViewport } from "../contexts/ViewportContext.jsx";
import { SUPPLIER_TYPES } from "../data/mockSuppliers.js";

// ─── UTILS ────────────────────────────────────────────────────────────────
const genId = () => `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const formatDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

const isExpiringSoon = (iso) => {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 && diff < 60 * 24 * 60 * 60 * 1000; // < 60 giorni
};

const isExpired = (iso) => {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
};

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
  const cfg = SUPPLIER_TYPES[type] || SUPPLIER_TYPES.other;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.4, background: cfg.bg, color: cfg.color,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── RATING STARS ─────────────────────────────────────────────────────────
const RatingStars = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map(n => (
      <span
        key={n}
        onClick={onChange ? () => onChange(n) : undefined}
        style={{
          fontSize: 16, cursor: onChange ? "pointer" : "default",
          color: n <= value ? "#D4A843" : "var(--border)",
          transition: "color 0.1s",
        }}
      >★</span>
    ))}
  </div>
);

// ─── EMPTY STATE ──────────────────────────────────────────────────────────
const EmptyState = ({ filtered, onAdd }) => (
  <div style={{
    background: "#fff", borderRadius: 12, padding: "60px 20px",
    textAlign: "center", border: "1px solid var(--border)",
  }}>
    <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.25 }}>🤝</div>
    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)", marginBottom: 6 }}>
      {filtered ? "Nessun fornitore trovato" : "Nessun fornitore ancora"}
    </div>
    <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
      {filtered ? "Prova a modificare i filtri di ricerca." : "Aggiungi il primo fornitore per iniziare."}
    </div>
    {!filtered && (
      <button onClick={onAdd} style={{
        background: "var(--navy)", color: "#fff", border: "none",
        padding: "10px 20px", borderRadius: 8, cursor: "pointer",
        fontSize: 13, fontWeight: 600, fontFamily: "inherit",
      }}>+ Nuovo fornitore</button>
    )}
  </div>
);

// ─── SUPPLIER CARD ────────────────────────────────────────────────────────
const SupplierCard = ({ supplier, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const expiring = isExpiringSoon(supplier.contractExpiry);
  const expired = isExpired(supplier.contractExpiry);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fade-in"
      style={{
        background: "#fff", borderRadius: 12, padding: "18px 20px",
        border: `1px solid ${expired ? "rgba(192,57,43,0.3)" : expiring ? "rgba(200,131,42,0.4)" : hovered ? "var(--gold)" : "var(--border)"}`,
        cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 4px 18px rgba(15,32,68,0.10)" : "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--navy)", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {supplier.name}
          </div>
          <TypeBadge type={supplier.type} />
        </div>
        <RatingStars value={supplier.rating || 0} />
      </div>

      {/* Contacts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {supplier.contactName && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
            <span>👤</span><span>{supplier.contactName}</span>
          </div>
        )}
        {supplier.email && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
            <span>✉️</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{supplier.email}</span>
          </div>
        )}
      </div>

      {/* Contract expiry */}
      {supplier.contractExpiry && (
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: expired ? "var(--danger)" : expiring ? "var(--warning)" : "var(--text-muted)",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span>{expired ? "⚠️" : expiring ? "⏳" : "📄"}</span>
          <span>Contratto: {formatDate(supplier.contractExpiry)}{expired ? " — SCADUTO" : expiring ? " — in scadenza" : ""}</span>
        </div>
      )}

      {/* Tags */}
      {supplier.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {supplier.tags.slice(0, 3).map(tag => <TagChip key={tag} tag={tag} />)}
          {supplier.tags.length > 3 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "2px 4px" }}>+{supplier.tags.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ─── SUPPLIER FORM MODAL ──────────────────────────────────────────────────
const SupplierFormModal = ({ initial, onSave, onClose }) => {
  const { isMobile } = useViewport();
  const [form, setForm] = useState({
    name: "", type: "hotel", contactName: "", email: "", phone: "",
    address: "", notes: "", tags: [], contractExpiry: "", rating: 3,
    ...initial,
    contractExpiry: initial?.contractExpiry ? initial.contractExpiry.slice(0, 10) : "",
  });
  const [tagInput, setTagInput] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
  };
  const removeTag = (tag) => set("tags", form.tags.filter(t => t !== tag));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      contractExpiry: form.contractExpiry ? new Date(form.contractExpiry).toISOString() : null,
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
          {initial ? "✏️ Modifica fornitore" : "➕ Nuovo fornitore"}
        </div>

        {/* Tipo */}
        <div>
          <label style={labelStyle}>Tipo di fornitore</label>
          <select value={form.type} onChange={e => set("type", e.target.value)} style={fieldStyle}>
            {Object.entries(SUPPLIER_TYPES).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
            ))}
          </select>
        </div>

        {/* Nome */}
        <div>
          <label style={labelStyle}>Ragione sociale *</label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="es. Emirates Airlines" required style={fieldStyle} />
        </div>

        {/* Referente + Email */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Referente</label>
            <input value={form.contactName} onChange={e => set("contactName", e.target.value)}
              placeholder="Nome referente commerciale" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
              placeholder="commerciale@fornitore.com" style={fieldStyle} />
          </div>
        </div>

        {/* Telefono + Scadenza contratto */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Telefono</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)}
              placeholder="+39 …" style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Scadenza contratto</label>
            <input type="date" value={form.contractExpiry} onChange={e => set("contractExpiry", e.target.value)}
              style={fieldStyle} />
          </div>
        </div>

        {/* Indirizzo */}
        <div>
          <label style={labelStyle}>Indirizzo / Sede</label>
          <input value={form.address} onChange={e => set("address", e.target.value)}
            placeholder="Via Roma 1, Milano" style={fieldStyle} />
        </div>

        {/* Valutazione */}
        <div>
          <label style={labelStyle}>Valutazione</label>
          <RatingStars value={form.rating} onChange={v => set("rating", v)} />
        </div>

        {/* Note */}
        <div>
          <label style={labelStyle}>Note / Condizioni</label>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Condizioni contrattuali, commissioni, note operative…"
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
          }}>{initial ? "Salva modifiche" : "Crea fornitore"}</button>
        </div>
      </form>
    </div>
  );
};

// ─── SUPPLIER DETAIL SLIDE-OVER ───────────────────────────────────────────
const SupplierDetail = ({ supplier, dispatch, onEdit, onClose }) => {
  const { isMobile } = useViewport();
  const expiring = isExpiringSoon(supplier.contractExpiry);
  const expired = isExpired(supplier.contractExpiry);

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
          background: "var(--navy)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div className="playfair" style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>
              {supplier.name}
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
              width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TypeBadge type={supplier.type} />
            <RatingStars value={supplier.rating || 0} />
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Contatti */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { icon: "👤", label: "Referente", value: supplier.contactName },
              { icon: "✉️", label: "Email", value: supplier.email },
              { icon: "📞", label: "Telefono", value: supplier.phone },
              { icon: "📍", label: "Sede", value: supplier.address },
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

          {/* Scadenza contratto */}
          {supplier.contractExpiry && (
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: expired ? "rgba(192,57,43,0.08)" : expiring ? "rgba(200,131,42,0.08)" : "var(--surface2)",
              border: `1px solid ${expired ? "rgba(192,57,43,0.2)" : expiring ? "rgba(200,131,42,0.2)" : "var(--border)"}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, color: "var(--text-muted)" }}>CONTRATTO</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: expired ? "var(--danger)" : expiring ? "var(--warning)" : "var(--text)" }}>
                {expired ? "⚠️ Scaduto il " : expiring ? "⏳ Scade il " : "📄 Scade il "}{formatDate(supplier.contractExpiry)}
              </div>
            </div>
          )}

          {/* Note */}
          {supplier.notes && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>NOTE / CONDIZIONI</div>
              <div style={{
                fontSize: 13, color: "var(--text)", lineHeight: 1.6,
                background: "var(--surface2)", borderRadius: 8, padding: "10px 14px",
                border: "1px solid var(--border)",
              }}>{supplier.notes}</div>
            </div>
          )}

          {/* Tags */}
          {supplier.tags?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>TAG</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {supplier.tags.map(tag => <TagChip key={tag} tag={tag} />)}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <button onClick={onEdit} style={{
            flex: 1, background: "var(--navy)", color: "#fff", border: "none",
            borderRadius: 8, padding: "10px", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>✏️ Modifica</button>
          <button onClick={() => {
            if (window.confirm(`Eliminare il fornitore "${supplier.name}"?\nPotrà essere ripristinato in seguito.`)) {
              dispatch({ type: "DELETE_SUPPLIER", payload: supplier.id });
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
const Fornitori = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const activeSuppliers = useMemo(() =>
    (state.suppliers || []).filter(s => !s.deletedAt),
    [state.suppliers]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return activeSuppliers.filter(s => {
      const matchSearch = !q
        || s.name.toLowerCase().includes(q)
        || s.contactName?.toLowerCase().includes(q)
        || s.email?.toLowerCase().includes(q)
        || s.tags?.some(t => t.toLowerCase().includes(q));
      const matchType = filterType === "all" || s.type === filterType;
      return matchSearch && matchType;
    });
  }, [activeSuppliers, search, filterType]);

  const selectedSupplier = useMemo(() =>
    activeSuppliers.find(s => s.id === selectedId),
    [activeSuppliers, selectedId]
  );

  const expiringCount = useMemo(() =>
    activeSuppliers.filter(s => isExpiringSoon(s.contractExpiry) || isExpired(s.contractExpiry)).length,
    [activeSuppliers]
  );

  const handleSave = (form) => {
    if (editingSupplier) {
      dispatch({ type: "UPDATE_SUPPLIER", payload: { ...editingSupplier, ...form } });
    } else {
      dispatch({
        type: "ADD_SUPPLIER",
        payload: { ...form, id: genId(), createdAt: new Date().toISOString(), deletedAt: null },
      });
    }
    setShowForm(false);
    setEditingSupplier(null);
  };

  const openEdit = () => {
    setEditingSupplier(selectedSupplier);
    setSelectedId(null);
    setShowForm(true);
  };

  return (
    <div className="vd-pad fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

      {/* ─── HEADER ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div className="playfair" style={{ fontSize: isMobile ? 21 : 26, fontWeight: 700, color: "var(--navy)" }}>
            🤝 Fornitori
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            {activeSuppliers.length} {activeSuppliers.length === 1 ? "fornitore" : "fornitori"} in anagrafica
            {expiringCount > 0 && (
              <span style={{ marginLeft: 8, color: "var(--warning)", fontWeight: 600 }}>
                · {expiringCount} contratt{expiringCount === 1 ? "o" : "i"} in scadenza
              </span>
            )}
          </div>
        </div>
        <button onClick={() => { setEditingSupplier(null); setShowForm(true); }} style={{
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
          + Nuovo fornitore
        </button>
      </div>

      {/* ─── FILTRI ─── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ flex: "1 1 200px", position: "relative" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text-muted)" }}>🔍</span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca per nome, referente, tag…"
            style={{
              width: "100%", padding: "9px 12px 9px 32px",
              border: "1px solid var(--border)", borderRadius: 8,
              fontSize: 13, fontFamily: "inherit", background: "#fff",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Tipo filter */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => setFilterType("all")} style={{
            padding: "8px 12px", borderRadius: 8, cursor: "pointer",
            border: `1px solid ${filterType === "all" ? "var(--navy)" : "var(--border)"}`,
            background: filterType === "all" ? "var(--navy)" : "#fff",
            color: filterType === "all" ? "#fff" : "var(--text-muted)",
            fontSize: 12, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
          }}>Tutti</button>
          {Object.entries(SUPPLIER_TYPES).map(([key, cfg]) => (
            <button key={key} onClick={() => setFilterType(key)} style={{
              padding: "8px 10px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${filterType === key ? cfg.color : "var(--border)"}`,
              background: filterType === key ? cfg.bg : "#fff",
              color: filterType === key ? cfg.color : "var(--text-muted)",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s",
            }}>{cfg.icon}</button>
          ))}
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Totale", value: activeSuppliers.length, icon: "🤝", color: "var(--navy)" },
          { label: "Con contratto attivo", value: activeSuppliers.filter(s => s.contractExpiry && !isExpired(s.contractExpiry)).length, icon: "📄", color: "var(--success)" },
          { label: "In scadenza / scaduti", value: expiringCount, icon: "⏳", color: expiringCount > 0 ? "var(--warning)" : "var(--text-muted)" },
          { label: "Rating medio", value: activeSuppliers.length ? (activeSuppliers.reduce((a, s) => a + (s.rating || 0), 0) / activeSuppliers.length).toFixed(1) : "—", icon: "⭐", color: "#D4A843" },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            background: "#fff", borderRadius: 10, padding: "14px 16px",
            border: "1px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── GRID FORNITORI ─── */}
      {filtered.length === 0 ? (
        <EmptyState filtered={search !== "" || filterType !== "all"} onAdd={() => setShowForm(true)} />
      ) : (
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {filtered.map(supplier => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              onClick={() => setSelectedId(supplier.id)}
            />
          ))}
        </div>
      )}

      {/* ─── DETAIL SLIDE-OVER ─── */}
      {selectedSupplier && (
        <SupplierDetail
          supplier={selectedSupplier}
          dispatch={dispatch}
          onEdit={openEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* ─── FORM MODAL ─── */}
      {showForm && (
        <SupplierFormModal
          initial={editingSupplier}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingSupplier(null); }}
        />
      )}
    </div>
  );
};

export default Fornitori;
