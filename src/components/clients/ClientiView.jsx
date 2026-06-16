// src/components/clients/ClientiView.jsx
// Anagrafica Clienti — Fase 1 modello dati.
import { useState, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", city: "", notes: "" };

const fieldStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "#fff",
  fontSize: 14, color: "var(--text)", outline: "none",
  fontFamily: "inherit",
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };

function ClienteModal({ cliente, onSave, onClose }) {
  const [form, setForm] = useState(cliente
    ? { name: cliente.name, email: cliente.email || "", phone: cliente.phone || "", address: cliente.address || "", city: cliente.city || "", notes: cliente.notes || "" }
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
        background: "#fff", borderRadius: 14, padding: 28, width: "min(540px, 96vw)",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="playfair" style={{ fontSize: 20, color: "var(--navy)" }}>
            {cliente ? "Modifica Cliente" : "Nuovo Cliente"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nome *</label>
              <input style={fieldStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo o ragione sociale" required />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={fieldStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@esempio.it" />
            </div>
            <div>
              <label style={labelStyle}>Telefono</label>
              <input style={fieldStyle} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+39 000 000 0000" />
            </div>
            <div>
              <label style={labelStyle}>Indirizzo</label>
              <input style={fieldStyle} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Via, numero civico" />
            </div>
            <div>
              <label style={labelStyle}>Città</label>
              <input style={fieldStyle} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Città" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Note</label>
              <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Preferenze, note speciali..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "#fff", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            }}>Annulla</button>
            <button type="submit" disabled={saving || !form.name.trim()} style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              opacity: (!form.name.trim() || saving) ? 0.5 : 1,
            }}>{saving ? "Salvataggio..." : (cliente ? "Salva" : "Aggiungi")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClienteCard({ cliente, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: "#fff", borderRadius: 12, padding: "16px 18px",
        border: `1px solid ${hovered ? "var(--navy-light)" : "var(--border)"}`,
        transition: "all 0.18s", cursor: "default",
        boxShadow: hovered ? "0 4px 16px rgba(15,32,68,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: "var(--navy)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {cliente.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--navy)", fontSize: 15 }}>{cliente.name}</div>
              {cliente.city && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{cliente.city}</div>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
            {cliente.email && (
              <a href={`mailto:${cliente.email}`} style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}>
                ✉️ {cliente.email}
              </a>
            )}
            {cliente.phone && (
              <a href={`tel:${cliente.phone}`} style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}>
                📞 {cliente.phone}
              </a>
            )}
          </div>
          {cliente.notes && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", whiteSpace: "pre-line" }}>
              {cliente.notes.length > 80 ? cliente.notes.slice(0, 80) + "…" : cliente.notes}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onEdit(cliente)} style={{
              padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
              background: "#fff", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
            }}>✏️</button>
            <button onClick={() => onDelete(cliente)} style={{
              padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
              background: "#fff", cursor: "pointer", fontSize: 12, color: "var(--danger)",
            }}>🗑️</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientiView({ state, dispatch, loading = false }) {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "add" | "edit", cliente?: {} }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const clients = state.clients || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q)
    );
  }, [clients, search]);

  const handleSave = async (form) => {
    if (modal?.mode === "edit" && modal.cliente) {
      dispatch({ type: "UPDATE_CLIENT", payload: { ...modal.cliente, ...form } });
    } else {
      dispatch({ type: "ADD_CLIENT", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });
    }
    setModal(null);
  };

  const handleDelete = (cliente) => {
    dispatch({ type: "DELETE_CLIENT", payload: cliente.id });
    setConfirmDelete(null);
  };

  return (
    <div className="vd-pad" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--navy)", marginBottom: 4 }}>
            Clienti
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {loading && clients.length === 0
              ? "Caricamento…"
              : `${clients.length} ${clients.length === 1 ? "cliente" : "clienti"} in anagrafica`}
          </div>
        </div>
        <button
          onClick={() => setModal({ mode: "add" })}
          style={{
            padding: "10px 18px", borderRadius: 9, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer",
            fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          + Nuovo cliente
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, città…"
          style={{ ...fieldStyle, maxWidth: 360 }}
        />
      </div>

      {/* Lista */}
      {loading && clients.length === 0 ? (
        <SkeletonCards />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--text-muted)" }}>
          {search ? "Nessun cliente trovato" : (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Nessun cliente ancora</div>
              <div style={{ fontSize: 13 }}>Aggiungi il primo cliente per iniziare</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {filtered.map(c => (
            <ClienteCard
              key={c.id}
              cliente={c}
              onEdit={c => setModal({ mode: "edit", cliente: c })}
              onDelete={c => setConfirmDelete(c)}
            />
          ))}
        </div>
      )}

      {/* Modal add/edit */}
      {modal && (
        <ClienteModal
          cliente={modal.cliente}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Conferma eliminazione */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 700,
          background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: 24, width: "min(380px, 92vw)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)", animation: "slideUp 0.2s ease",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--navy)", marginBottom: 8 }}>Rimuovi cliente</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
              Rimuovere <strong>{confirmDelete.name}</strong> dall'anagrafica?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff",
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
