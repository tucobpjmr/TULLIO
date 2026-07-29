// src/components/clients/ClientiView.jsx
// Anagrafica Clienti — Fase 1 modello dati.
import { useState, useMemo, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { ContactActions } from "../ui/ContactActions.jsx";
import { formatDate, isActiveTask } from "../../lib/taskUtils.js";
import { CATEGORIES, CURRENT_USER, canViewTask, getRoleType } from "../../state/appGlobals.js";
import { ClientImportModal } from "./ClientImportModal.jsx";
import { ClienteListePanel } from "../liste/ClienteListePanel.jsx";

const EMPTY_FORM = { name: "", email: "", phone: "", address: "", city: "", notes: "" };

const fieldStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--card)",
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
      <div className="vd-modal-mh" style={{
        background: "var(--card)", borderRadius: 14, padding: 28, width: "min(540px, 96vw)",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="playfair" style={{ fontSize: 20, color: "var(--heading)" }}>
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
              background: "var(--card)", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
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

function ClienteCard({ cliente, onEdit, onDelete, onSelect, selected }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        background: "var(--card)", borderRadius: 12, padding: "16px 18px",
        border: `2px solid ${selected ? "var(--navy)" : hovered ? "var(--navy-light)" : "var(--border)"}`,
        transition: "all 0.18s", cursor: "default",
        boxShadow: hovered ? "0 4px 16px rgba(15,32,68,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onSelect(cliente)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: selected ? "var(--navy)" : "var(--navy-light)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {cliente.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--heading)", fontSize: 15 }}>{cliente.name}</div>
              {cliente.city && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{cliente.city}</div>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}
              >
                ✉️ {cliente.email}
              </a>
            )}
            {cliente.phone && (
              <ContactActions phone={cliente.phone} style={{ fontSize: 13 }} />
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
              background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
            }}>✏️</button>
            <button onClick={() => onDelete(cliente)} style={{
              padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
              background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--danger)",
            }}>🗑️</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Task collegati al cliente selezionato (v2.8 Round 9). Dal porting del modulo
// Liste viaggio il pannello contestuale ha due tab: questo è il contenuto del
// primo, la testata e la barra tab stanno in ClienteDetailPanel.
function ClienteTaskTab({ cliente, tasks, dispatch }) {
  const uid = CURRENT_USER;
  const clientTasks = useMemo(() => {
    const q = (cliente.name || "").toLowerCase();
    return tasks.filter(t =>
      isActiveTask(t) &&
      canViewTask(t, uid) &&
      (t.client || "").toLowerCase().includes(q)
    );
  }, [tasks, cliente.name, uid]);

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
            <div
              key={t.id}
              onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)",
                cursor: "pointer", transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ fontSize: 16 }}>{CATEGORIES[t.category]?.icon || "📋"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                {t.dueDate && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>📅 {formatDate(t.dueDate)}</div>}
              </div>
              <PriorityBadge priority={t.priority} />
              <StatusBadge status={t.status} />
            </div>
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
function ClienteDetailPanel({ cliente, tasks, dispatch, onClose, showListe }) {
  const [tab, setTab] = useState("task");

  // Cambiando cliente si riparte dal tab Task: il tab Liste rifà comunque la
  // query, ma mostrare il cliente precedente per un frame è peggio.
  useEffect(() => { setTab("task"); }, [cliente.id]);

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
        <span className="playfair" style={{ fontWeight: 700, fontSize: 16 }}>{cliente.name}</span>
        <button onClick={onClose} aria-label="Chiudi il pannello" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-muted)" }}>✕</button>
      </div>

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
const CLIENT_SORT_OPTS = [
  { key: "name",    label: "Nome A-Z" },
  { key: "name_z",  label: "Nome Z-A" },
  { key: "date",    label: "Più recenti" },
  { key: "city",    label: "Città A-Z" },
];

export function ClientiView({ state, dispatch, loading = false }) {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name"); // v2.8 Round 8
  const [selectedClient, setSelectedClient] = useState(null); // v2.8 Round 9
  const [modal, setModal] = useState(null); // null | { mode: "add" | "edit", cliente?: {} }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const clients = state.clients || [];

  // Il modulo Liste viaggio è precluso al ruolo Driver (RLS lato DB, migrazione
  // 20260728190100): senza questo gate il tab comparirebbe e mostrerebbe solo
  // una lista vuota filtrata dalle policy.
  const showListe = getRoleType(state.currentUserId) !== "driver";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q ? clients : clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.notes || "").toLowerCase().includes(q)
    );
    return [...base].sort((a, b) => {
      if (sortBy === "name")   return (a.name || "").localeCompare(b.name || "", "it");
      if (sortBy === "name_z") return (b.name || "").localeCompare(a.name || "", "it");
      if (sortBy === "city")   return (a.city || "").localeCompare(b.city || "", "it");
      // date: più recenti prima (createdAt desc)
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [clients, search, sortBy]);

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
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--heading)", marginBottom: 4 }}>
            Clienti
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {loading && clients.length === 0
              ? "Caricamento…"
              : `${clients.length} ${clients.length === 1 ? "cliente" : "clienti"} in anagrafica`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setImportOpen(true)}
            style={{
              padding: "10px 16px", borderRadius: 9, border: "1px solid var(--border)",
              background: "var(--card)", color: "var(--navy)", cursor: "pointer",
              fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}
          >
            📥 Importa da Excel
          </button>
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
      </div>

      {/* Search + Sort */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per nome, email, città, telefono…"
          style={{ ...fieldStyle, maxWidth: 360 }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
          {CLIENT_SORT_OPTS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              style={{
                padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                border: `1px solid ${sortBy === opt.key ? "var(--navy)" : "var(--border)"}`,
                background: sortBy === opt.key ? "var(--navy)" : "var(--card)",
                color: sortBy === opt.key ? "#fff" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >{opt.label}</button>
          ))}
        </div>
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
              onSelect={c => setSelectedClient(sc => sc?.id === c.id ? null : c)}
              selected={selectedClient?.id === c.id}
            />
          ))}
        </div>
      )}

      {/* Pannello del cliente selezionato (v2.8 Round 9): task + liste viaggio */}
      {selectedClient && (
        <ClienteDetailPanel
          cliente={selectedClient}
          tasks={state.tasks || []}
          dispatch={dispatch}
          onClose={() => setSelectedClient(null)}
          showListe={showListe}
        />
      )}

      {/* Modal add/edit */}
      {modal && (
        <ClienteModal
          cliente={modal.cliente}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Import anagrafica da Excel/CSV */}
      {importOpen && (
        <ClientImportModal
          existingClients={clients}
          onImport={(newClients) => dispatch({ type: "ADD_CLIENTS_BULK", payload: newClients })}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Conferma eliminazione */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 700,
          background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: "var(--card)", borderRadius: 12, padding: 24, width: "min(380px, 92vw)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)", animation: "slideUp 0.2s ease",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "var(--heading)", marginBottom: 8 }}>Rimuovi cliente</div>
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
