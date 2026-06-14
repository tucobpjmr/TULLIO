// src/components/dossiers/PraticheView.jsx
// Pratiche di viaggio — Fase 1 modello dati.
import { useState, useMemo, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { formatDate } from "../../lib/taskUtils.js";
import { DossierSuppliers as DossierSuppliersAPI } from "../../lib/api.js";
import { fromDbDossierSupplier, toDbDossierSupplier } from "../../lib/mappers.js";

const DOSSIER_STATUSES = [
  { value: "bozza",      label: "Bozza",      color: "#6B7280", bg: "#F3F4F6" },
  { value: "confermata", label: "Confermata",  color: "#2D7A4F", bg: "#D1FAE5" },
  { value: "in_corso",   label: "In corso",    color: "#C8832A", bg: "#FEF3C7" },
  { value: "completata", label: "Completata",  color: "#1E40AF", bg: "#DBEAFE" },
  { value: "annullata",  label: "Annullata",   color: "#C0392B", bg: "#FEE2E2" },
];

const STATUS_META = Object.fromEntries(DOSSIER_STATUSES.map(s => [s.value, s]));

const SUPPLIER_CATEGORY_LABELS = {
  hotel: "🏨 Hotel", volo: "✈️ Volo", transfer: "🚐 Transfer",
  tour_operator: "🗺️ Tour Operator", assicurazione: "🛡️ Assicurazione",
  crociera: "🚢 Crociera", altro: "📦 Altro",
};

const fieldStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8,
  border: "1px solid var(--border)", background: "#fff",
  fontSize: 14, color: "var(--text)", outline: "none", fontFamily: "inherit",
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" };

// ─── MODAL NUOVA PRATICA ───────────────────────────────────────────────────
function PraticaModal({ clients, currentUserId, onSave, onClose }) {
  const [form, setForm] = useState({
    title: "", clientId: "", destination: "",
    departureDate: "", returnDate: "",
    paxAdults: 1, paxChildren: 0,
    budgetTotal: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({
      ...form,
      title: form.title.trim(),
      clientId: form.clientId || null,
      paxAdults: Number(form.paxAdults) || 0,
      paxChildren: Number(form.paxChildren) || 0,
      budgetTotal: form.budgetTotal ? Number(form.budgetTotal) : null,
      createdBy: currentUserId,
    });
    setSaving(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 600,
      background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 28, width: "min(600px, 96vw)",
        maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="playfair" style={{ fontSize: 20, color: "var(--navy)" }}>Nuova Pratica</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Titolo pratica *</label>
              <input style={fieldStyle} value={form.title} onChange={e => set("title", e.target.value)} placeholder="es. Maldive — Famiglia Rossi" required />
            </div>
            <div>
              <label style={labelStyle}>Cliente</label>
              <select style={fieldStyle} value={form.clientId} onChange={e => set("clientId", e.target.value)}>
                <option value="">— nessun cliente —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Destinazione</label>
              <input style={fieldStyle} value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="es. Maldive" />
            </div>
            <div>
              <label style={labelStyle}>Partenza</label>
              <input style={fieldStyle} type="date" value={form.departureDate} onChange={e => set("departureDate", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Ritorno</label>
              <input style={fieldStyle} type="date" value={form.returnDate} onChange={e => set("returnDate", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Pax adulti</label>
              <input style={fieldStyle} type="number" min="0" value={form.paxAdults} onChange={e => set("paxAdults", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Pax bambini</label>
              <input style={fieldStyle} type="number" min="0" value={form.paxChildren} onChange={e => set("paxChildren", e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Budget totale (€)</label>
              <input style={fieldStyle} type="number" min="0" step="0.01" value={form.budgetTotal} onChange={e => set("budgetTotal", e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Note</label>
              <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Richieste speciali, dettagli..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "#fff", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            }}>Annulla</button>
            <button type="submit" disabled={saving || !form.title.trim()} style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              opacity: (!form.title.trim() || saving) ? 0.5 : 1,
            }}>{saving ? "Creazione..." : "Crea pratica"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── BADGE STATUS ──────────────────────────────────────────────────────────
function StatusBadgeDossier({ status }) {
  const meta = STATUS_META[status] || STATUS_META.bozza;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 9px",
      color: meta.color, background: meta.bg, whiteSpace: "nowrap",
    }}>{meta.label}</span>
  );
}

// ─── CARD PRATICA ──────────────────────────────────────────────────────────
function PraticaCard({ dossier, taskCount, onClick }) {
  const [hovered, setHovered] = useState(false);
  const pax = (dossier.paxAdults || 0) + (dossier.paxChildren || 0);

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 12, padding: "16px 18px",
        border: `1px solid ${hovered ? "var(--navy-light)" : "var(--border)"}`,
        transition: "all 0.18s", cursor: "pointer",
        boxShadow: hovered ? "0 4px 20px rgba(15,32,68,0.1)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginBottom: 2 }}>{dossier.number}</div>
          <div style={{ fontWeight: 700, color: "var(--navy)", fontSize: 15, lineHeight: 1.3 }}>{dossier.title}</div>
        </div>
        <StatusBadgeDossier status={dossier.status} />
      </div>

      {dossier.client && (
        <div style={{ fontSize: 13, color: "var(--navy-light)", marginBottom: 4 }}>👤 {dossier.client.name}</div>
      )}
      {dossier.destination && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>📍 {dossier.destination}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
        {dossier.departureDate && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>🛫 {formatDate(dossier.departureDate)}</span>
        )}
        {dossier.returnDate && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>🛬 {formatDate(dossier.returnDate)}</span>
        )}
        {pax > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>👥 {pax} pax</span>
        )}
        {dossier.budgetTotal != null && (
          <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>
            💰 €{dossier.budgetTotal.toLocaleString("it-IT", { minimumFractionDigits: 0 })}
          </span>
        )}
        {taskCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>✅ {taskCount} task</span>
        )}
      </div>
    </div>
  );
}

// ─── PANNELLO FORNITORI PRATICA (caveat #27) ───────────────────────────────
// Gestisce i fornitori collegati alla pratica via DossierSuppliers API.
// I dossier_suppliers sono dati di dettaglio per-pratica (no realtime, no
// stato globale): li carico/aggiorno localmente quando il pannello è aperto.
function FornitoriPanel({ dossierId, suppliers, dispatch }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ supplierId: "", serviceType: "", cost: "" });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    DossierSuppliersAPI.list(dossierId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Errore caricamento fornitori pratica" } });
      } else {
        setLinks((data || []).map(fromDbDossierSupplier));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dossierId, dispatch]);

  const handleAdd = async () => {
    if (!form.supplierId || adding) return;
    setAdding(true);
    const payload = toDbDossierSupplier({
      dossierId,
      supplierId: form.supplierId,
      serviceType: form.serviceType.trim() || null,
      cost: form.cost ? Number(form.cost) : null,
    });
    const { data, error } = await DossierSuppliersAPI.create(payload);
    if (error) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Errore aggiunta fornitore" } });
    } else {
      // Il create non porta dietro il join suppliers: lo recupero dalla lista.
      const link = fromDbDossierSupplier(data);
      link.supplier = suppliers.find(s => s.id === link.supplierId) || null;
      setLinks(prev => [...prev, link]);
      setForm({ supplierId: "", serviceType: "", cost: "" });
    }
    setAdding(false);
  };

  const handleRemove = async (id) => {
    const prev = links;
    setLinks(links.filter(l => l.id !== id));
    const { error } = await DossierSuppliersAPI.remove(id);
    if (error) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Errore rimozione fornitore" } });
      setLinks(prev);
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", marginBottom: 10 }}>
        Fornitori ({links.length})
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>Caricamento…</div>
      ) : links.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic", marginBottom: 10 }}>
          Nessun fornitore collegato
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {links.map(l => (
            <div key={l.id} style={{
              padding: "8px 12px", borderRadius: 8, background: "var(--surface2)",
              fontSize: 13, color: "var(--text)", display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {l.supplier?.category && (SUPPLIER_CATEGORY_LABELS[l.supplier.category]?.split(" ")[0] || "")} {l.supplier?.name || "—"}
                </div>
                {(l.serviceType || l.cost != null) && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {l.serviceType}{l.serviceType && l.cost != null ? " · " : ""}
                    {l.cost != null && <span style={{ color: "var(--success)", fontWeight: 600 }}>€{l.cost.toLocaleString("it-IT")}</span>}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleRemove(l.id)}
                title="Rimuovi fornitore"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 14, flexShrink: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Form aggiunta */}
      {suppliers.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
          Aggiungi prima dei fornitori nell'anagrafica
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 140px", minWidth: 0 }}>
            <label style={labelStyle}>Fornitore</label>
            <select style={fieldStyle} value={form.supplierId} onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}>
              <option value="">— seleziona —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 120px", minWidth: 0 }}>
            <label style={labelStyle}>Servizio</label>
            <input style={fieldStyle} value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} placeholder="es. Volo A/R" />
          </div>
          <div style={{ flex: "0 1 100px" }}>
            <label style={labelStyle}>Costo €</label>
            <input style={fieldStyle} type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="0" />
          </div>
          <button
            onClick={handleAdd}
            disabled={!form.supplierId || adding}
            style={{
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
              opacity: (!form.supplierId || adding) ? 0.5 : 1,
            }}
          >{adding ? "…" : "+ Aggiungi"}</button>
        </div>
      )}
    </div>
  );
}

// ─── DETTAGLIO PRATICA ────────────────────────────────────────────────────
function PraticaDetail({ dossier, tasks, suppliers, dispatch, onClose }) {
  const linkedTasks = useMemo(
    () => tasks.filter(t => t.dossierId === dossier.id && !t.deletedAt),
    [tasks, dossier.id]
  );

  const statusOptions = DOSSIER_STATUSES;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 500,
      width: "min(520px, 100vw)", background: "#fff",
      boxShadow: "-8px 0 40px rgba(0,0,0,0.16)",
      display: "flex", flexDirection: "column",
      animation: "slideRight 0.25s ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--navy)", color: "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 2 }}>{dossier.number}</div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>{dossier.title}</div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8,
            width: 32, height: 32, cursor: "pointer", color: "#fff", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>✕</button>
        </div>
        <div style={{ marginTop: 10 }}>
          <StatusBadgeDossier status={dossier.status} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

        {/* Cambia stato */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Stato pratica</label>
          <select
            value={dossier.status}
            onChange={e => dispatch({ type: "UPDATE_DOSSIER", payload: { ...dossier, status: e.target.value } })}
            style={fieldStyle}
          >
            {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {/* Info generali */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {dossier.client && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>Cliente</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>👤 {dossier.client.name}</div>
              {dossier.client.email && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{dossier.client.email}</div>}
            </div>
          )}
          {dossier.destination && (
            <div>
              <div style={labelStyle}>Destinazione</div>
              <div style={{ fontSize: 14 }}>📍 {dossier.destination}</div>
            </div>
          )}
          {((dossier.paxAdults || 0) + (dossier.paxChildren || 0)) > 0 && (
            <div>
              <div style={labelStyle}>Passeggeri</div>
              <div style={{ fontSize: 14 }}>
                👥 {dossier.paxAdults || 0} adulti{dossier.paxChildren > 0 ? `, ${dossier.paxChildren} bambini` : ""}
              </div>
            </div>
          )}
          {dossier.departureDate && (
            <div>
              <div style={labelStyle}>Partenza</div>
              <div style={{ fontSize: 14 }}>🛫 {formatDate(dossier.departureDate)}</div>
            </div>
          )}
          {dossier.returnDate && (
            <div>
              <div style={labelStyle}>Ritorno</div>
              <div style={{ fontSize: 14 }}>🛬 {formatDate(dossier.returnDate)}</div>
            </div>
          )}
          {dossier.budgetTotal != null && (
            <div>
              <div style={labelStyle}>Budget totale</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--success)" }}>
                €{dossier.budgetTotal.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </div>
            </div>
          )}
          {dossier.notes && (
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={labelStyle}>Note</div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", whiteSpace: "pre-line" }}>{dossier.notes}</div>
            </div>
          )}
        </div>

        {/* Task collegati */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--navy)", marginBottom: 10 }}>
            Task collegati ({linkedTasks.length})
          </div>
          {linkedTasks.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
              Nessun task collegato a questa pratica
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {linkedTasks.map(t => (
                <div key={t.id} style={{
                  padding: "8px 12px", borderRadius: 8, background: "var(--surface2)",
                  fontSize: 13, color: "var(--text)",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ flex: 1 }}>{t.title}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 7px",
                    background: t.status === "done" ? "#D1FAE5" : "#FEF3C7",
                    color: t.status === "done" ? "#2D7A4F" : "#C8832A",
                  }}>{t.status === "done" ? "Fatto" : t.status === "inprogress" ? "In corso" : "Da fare"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fornitori collegati (caveat #27) */}
        <FornitoriPanel dossierId={dossier.id} suppliers={suppliers} dispatch={dispatch} />
      </div>

      {/* Footer */}
      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => { dispatch({ type: "DELETE_DOSSIER", payload: dossier.id }); onClose(); }}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid #fecaca",
            background: "#fff", color: "var(--danger)", cursor: "pointer", fontSize: 13, fontWeight: 600,
          }}
        >🗑️ Rimuovi pratica</button>
      </div>
    </div>
  );
}

// ─── VISTA PRINCIPALE ─────────────────────────────────────────────────────
export function PraticheView({ state, dispatch }) {
  const { isMobile } = useViewport();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const dossiers = state.dossiers || [];
  const clients = state.clients || [];
  const tasks = state.tasks || [];

  const filtered = useMemo(() => {
    let list = dossiers;
    if (filterStatus) list = list.filter(d => d.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.number.toLowerCase().includes(q) ||
        (d.destination || "").toLowerCase().includes(q) ||
        (d.client?.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [dossiers, search, filterStatus]);

  const tasksByDossier = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (t.dossierId && !t.deletedAt) map[t.dossierId] = (map[t.dossierId] || 0) + 1;
    }
    return map;
  }, [tasks]);

  const handleCreate = (form) => {
    dispatch({ type: "ADD_DOSSIER", payload: { id: crypto.randomUUID(), number: "", status: "bozza", ...form, createdAt: new Date().toISOString() } });
    setShowModal(false);
  };

  // Sync selected con lo state aggiornato
  const selectedDossier = selected ? dossiers.find(d => d.id === selected) ?? null : null;

  return (
    <div className="vd-pad" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="playfair" style={{ fontSize: isMobile ? 22 : 26, color: "var(--navy)", marginBottom: 4 }}>
            Pratiche
          </h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {dossiers.length} {dossiers.length === 1 ? "pratica" : "pratiche"} totali
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px 18px", borderRadius: 9, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer",
            fontSize: 14, fontWeight: 600,
          }}
        >
          + Nuova pratica
        </button>
      </div>

      {/* KPI per status */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {DOSSIER_STATUSES.map(s => {
          const cnt = dossiers.filter(d => d.status === s.value).length;
          return (
            <button
              key={s.value}
              onClick={() => setFilterStatus(f => f === s.value ? "" : s.value)}
              style={{
                padding: "5px 12px", borderRadius: 20, border: "none",
                background: filterStatus === s.value ? s.color : s.bg,
                color: filterStatus === s.value ? "#fff" : s.color,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {s.label} {cnt > 0 && `(${cnt})`}
            </button>
          );
        })}
        {filterStatus && (
          <button
            onClick={() => setFilterStatus("")}
            style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid var(--border)", background: "#fff", fontSize: 12, cursor: "pointer", color: "var(--text-muted)" }}
          >✕ Tutti</button>
        )}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cerca per numero, titolo, cliente, destinazione…"
          style={{ ...fieldStyle, maxWidth: 400 }}
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--text-muted)" }}>
          {(search || filterStatus) ? "Nessuna pratica trovata" : (
            <div>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Nessuna pratica ancora</div>
              <div style={{ fontSize: 13 }}>Crea la prima pratica di viaggio</div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
          {filtered.map(d => (
            <PraticaCard
              key={d.id}
              dossier={d}
              taskCount={tasksByDossier[d.id] || 0}
              onClick={() => setSelected(d.id)}
            />
          ))}
        </div>
      )}

      {/* Modal nuova pratica */}
      {showModal && (
        <PraticaModal
          clients={clients}
          currentUserId={state.currentUserId}
          onSave={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Dettaglio pratica (slide-over) */}
      {selectedDossier && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 499, background: "rgba(0,0,0,0.2)" }} onClick={() => setSelected(null)} />
          <PraticaDetail
            dossier={selectedDossier}
            tasks={tasks}
            suppliers={state.suppliers || []}
            dispatch={dispatch}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  );
}
