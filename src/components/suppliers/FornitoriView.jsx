// src/components/suppliers/FornitoriView.jsx
// Anagrafica Fornitori — Fase 1 modello dati.
import { useState, useMemo } from "react";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { useViewport } from "../Viewport.jsx";

const SUPPLIER_CATEGORIES = [
  { value: "hotel",         label: "🏨 Hotel" },
  { value: "volo",          label: "✈️ Volo" },
  { value: "transfer",      label: "🚐 Transfer" },
  { value: "tour_operator", label: "🗺️ Tour Operator" },
  { value: "assicurazione", label: "🛡️ Assicurazione" },
  { value: "crociera",      label: "🚢 Crociera" },
  { value: "altro",         label: "📦 Altro" },
];

const CATEGORY_LABEL = Object.fromEntries(SUPPLIER_CATEGORIES.map(c => [c.value, c.label]));

const EMPTY_FORM = { name: "", category: "", email: "", phone: "", address: "", city: "", country: "", notes: "" };

const fieldStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--card)",
  fontSize: 14, color: "var(--text)", outline: "none",
  fontFamily: "inherit",
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };

function FornitoreModal({ fornitore, onSave, onClose }) {
  const [form, setForm] = useState(fornitore
    ? { name: fornitore.name, category: fornitore.category || "", email: fornitore.email || "", phone: fornitore.phone || "", address: fornitore.address || "", city: fornitore.city || "", country: fornitore.country || "", notes: fornitore.notes || "" }
    : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave({ ...form, name: form.name.trim() });
    setSaving(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--card)", borderRadius: 14, padding: 28, width: "min(580px, 96vw)",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="playfair" style={{ fontSize: 20, color: "var(--heading)" }}>
            {fornitore ? "Modifica Fornitore" : "Nuovo Fornitore"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input style={fieldStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ragione sociale" required />
            </div>
            <div>
              <label style={labelStyle}>Categoria</label>
              <select style={fieldStyle} value={form.category} onChange={e => set("category", e.target.value)}>
                <option value="">— nessuna —</option>
                {SUPPLIER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={fieldStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@fornitore.it" />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input style={fieldStyle} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+39 000 000 0000" />
            </div>
            <div>
              <label style={labelStyle}>Città</label>
              <input style={fieldStyle} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Città" />
            </div>
            <div>
              <label style={labelStyle}>Paese</label>
              <input style={fieldStyle} value={form.country} onChange={e => set("country", e.target.value)} placeholder="Italia" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Indirizzo</label>
              <input style={fieldStyle} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Via, numero civico" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Note</label>
              <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Condizioni contrattuali, contatti, note..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--card)", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            }}>Annulla</button>
            <button type="submit" disabled={saving || !form.name.trim()} style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              opacity: (!form.name.trim() || saving) ? 0.5 : 1,
            }}>{saving ? "Salvataggio..." : (fornitore ? "Salva" : "Aggiungi")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FornitoreCard({ fornitore, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const catLabel = fornitore.category ? CATEGORY_LABEL[fornitore.category] : null;

  return (
    <div
      style={{
        background: "var(--card)", borderRadius: 12, padding: "16px 18px",
        border: `1px solid ${hovered ? "var(--navy-light)" : "var(--border)"}`,
        transition: "all 0.18s",
        boxShadow: hovered ? "0 4px 16px rgba(15,32,68,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ fontWeight: 600, color: "var(--heading)", fontSize: 15 }}>{fornitore.name}</div>
            {catLabel && (
              <span style={{
                fontSize: 11, fontWeight: 600, background: "var(--surface2)",
                color: "var(--text-muted)", borderRadius: 20, padding: "2px 8px",
              }}>{catLabel}</span>
            )}
          </div>
          {(fornitore.city || fornitore.country) && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
              📍 {[fornitore.city, fornitore.country].filter(Boolean).join(", ")}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px" }}>
            {fornitore.email && (
              <a href={`mailto:${fornitore.email}`} style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}>
                ✉️ {fornitore.email}
              </a>
            )}
            {fornitore.phone && (
              <a href={`tel:${fornitore.phone}`} style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}>
                📞 {fornitore.phone}
              </a>
            )}
          </div>
          {fornitore.notes && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              {fornitore.notes.length > 80 ? fornitore.notes.slice(0, 80) + "…" : fornitore.notes}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={() => onEdit(fornitore)} style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
          }}>✏️</button>
          <button onClick={() => onDelete(fornitore)} style={{
            padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
            background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--danger)",
          }}>🗑️</button>
        </div>
      </div>
    </div>
  );
}

export function FornitoriView({ state, dispatch, loading = false }) {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const suppliers = state.suppliers || [];

  const filtered = useMemo(() => {
    let list = suppliers;
    if (filterCat) list = list.filter(s => s.category === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.city || "").toLowerCase().includes(q) ||
        (s.country || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, search, filterCat]);

  const handleSave = async (form) => {
    if (modal?.mode === "edit" && modal.fornitore) {
      dispatch({ type: "UPDATE_SUPPLIER", payload: { ...modal.fornitore, ...form } });
    } else {
      dispatch({ type: "ADD_SUPPLIER", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });
    }
    setModal(null);
  };

  const handleDelete = (fornitore) => {
    dispatch({ type: "DELETE_SUPPLIER", payload: fornitore.id });
    setConfirmDelete(null);
  };

  return (
    <div className="vd-pad" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--heading)", marginBottom: 4 }}>
            Fornitori
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {loading && suppliers.length === 0
              ? "Caricamento…"
              : `${suppliers.length} ${suppliers.length === 1 ? "fornitore" : "fornitori"} in anagrafica`}
          </div>
        </div>
        <button
          onClick={() => setModal({ mode: "add" })}
          style={{
            padding: "10px 18px", borderRadius: 9, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer",
            fontSize: 14, fontWeight: 600,
          }}
        >
          + Nuovo fornitore
        </button>
      </div>

      {/* Filtri */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, città…"
          style={{ ...fieldStyle, maxWidth: 300, flex: "1 1 200px" }}
        />
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ ...fieldStyle, maxWidth: 200, flex: "0 0 auto" }}
        >
          <option value="">Tutte le categorie</option>
          {SUPPLIER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading && suppliers.length === 0 ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--text-muted)" }}>
          {(search || filterCat) ? "Nessun fornitore trovato" : (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Nessun fornitore ancora</div>
              <div style={{ fontSize: 13 }}>Aggiungi il primo fornitore per iniziare</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {filtered.map(f => (
            <FornitoreCard
              key={f.id}
              fornitore={f}
              onEdit={f => setModal({ mode: "edit", fornitore: f })}
              onDelete={f => setConfirmDelete(f)}
            />
          ))}
        </div>
      )}

      {modal && (
        <FornitoreModal
          fornitore={modal.fornitore}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 700,
          background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: "var(--card)", borderRadius: 12, padding: 24, width: "min(380px, 92vw)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)", animation: "slideUp 0.2s ease",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--heading)", marginBottom: 8 }}>Rimuovi fornitore</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              Rimuovere <strong>{confirmDelete.name}</strong> dall'anagrafica?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)",
                cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
              }}>Annulla</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--danger)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              }}>Rimuovi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
