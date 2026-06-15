// ─── BULK TASK CREATOR ───────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Contiene ManualTab, DuplicateTab, ImportTab, TemplateTab (helper interni,
// non esportati) + il modale principale BulkTaskCreator.
import { useState, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS, TASK_TEMPLATES } from "../../lib/taskConstants.js";
import { formatDate } from "../../lib/taskUtils.js";
import { TEAM, CATEGORIES, getAssignableTeam } from "../../state/appGlobals.js";
import { loadXLSX } from "../../lib/xlsx.js";

// ─── BULK TASK CREATOR (stili helper) ──────────────────────────────────────
const bulkInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "#fff", outline: "none",
  minWidth: 0, boxSizing: "border-box",
};
const bulkBtnPrimary = {
  background: "var(--navy)", color: "#fff", border: "none",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600,
};
const bulkBtnGhost = {
  background: "transparent", border: "1px solid var(--border)",
  padding: "9px 18px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 500,
};
const bulkIconBtnSmall = {
  background: "var(--surface2)", border: "none", borderRadius: 6,
  width: 22, height: 22, cursor: "pointer", fontSize: 13, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
};

// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
const ManualTab = ({ onCreate, onClose, dossiers = [] }) => {
  const { isMobile } = useViewport();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "", dossierId: "" });
  const linkableDossiers = dossiers.filter(d => d.status !== "annullata");
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", category: "", priority: "", assignee: "", dueDate: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  const validRows = rows.filter(r => r.title.trim());

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => ({
      id: "t" + ts + "-" + idx,
      title: r.title.trim(),
      category: r.category || common.category,
      priority: r.priority || common.priority,
      status: "todo",
      assignees: (r.assignee || common.assignee) ? [r.assignee || common.assignee] : [],
      client: common.client.trim() || null,
      dossierId: common.dossierId || null,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      estimatedHours: 1,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
          IMPOSTAZIONI COMUNI (usate se la riga non specifica)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
          <input value={common.client} onChange={e => setCommon({ ...common, client: e.target.value })} placeholder="Cliente" style={bulkInputStyle} />
          <select value={common.category} onChange={e => setCommon({ ...common, category: e.target.value })} style={bulkInputStyle}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={common.priority} onChange={e => setCommon({ ...common, priority: e.target.value })} style={bulkInputStyle}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={common.assignee} onChange={e => setCommon({ ...common, assignee: e.target.value })} style={bulkInputStyle}>
            <option value="">— Assegna a —</option>
            {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {linkableDossiers.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>PRATICA COLLEGATA</div>
            <select value={common.dossierId} onChange={e => setCommon({ ...common, dossierId: e.target.value })} style={{ ...bulkInputStyle, maxWidth: isMobile ? "100%" : 320 }}>
              <option value="">— Nessuna pratica —</option>
              {linkableDossiers.map(d => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 6 }}>
        {!isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "0 4px", letterSpacing: 0.5 }}>
            <div>#</div><div>TITOLO *</div><div>CATEGORIA</div><div>PRIORITÀ</div><div>ASSEGNATO</div><div>SCADENZA</div><div></div>
          </div>
        )}
        {rows.map((r, idx) => (
          isMobile ? (
            /* Mobile: ogni riga è una card impilata (no scroll orizzontale) */
            <div key={r.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>#{idx + 1}</span>
                <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={{ ...bulkInputStyle, flex: 1 }} />
                <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
                  background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
                  fontSize: 16, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1, flexShrink: 0,
                }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                  <option value="">— categoria —</option>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
                  <option value="">— priorità —</option>
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
                  <option value="">— assegna —</option>
                  {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
                </select>
                <input type="date" value={r.dueDate} onChange={e => updateRow(r.key, "dueDate", e.target.value)} style={bulkInputStyle} />
              </div>
            </div>
          ) : (
            <div key={r.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{idx + 1}</div>
              <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={bulkInputStyle} />
              <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                <option value="">— default —</option>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
                <option value="">—</option>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
                <option value="">—</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
              </select>
              <input type="date" value={r.dueDate} onChange={e => updateRow(r.key, "dueDate", e.target.value)} style={bulkInputStyle} />
              <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
                background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
                fontSize: 14, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1,
              }}>✕</button>
            </div>
          )
        ))}
        <button onClick={addRow} style={{
          background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
          padding: "9px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          color: "var(--text-muted)", marginTop: 4,
        }}>+ Aggiungi riga</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{validRows.length} task da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0} style={{
            ...bulkBtnPrimary, opacity: validRows.length === 0 ? 0.5 : 1, cursor: validRows.length === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
const DuplicateTab = ({ tasks, onCreate, onClose }) => {
  const [selected, setSelected] = useState({});
  const [titleSuffix, setTitleSuffix] = useState(" (copia)");
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState("");

  const toggle = (id) => setSelected(s => {
    const next = { ...s };
    if (next[id]) delete next[id]; else next[id] = 1;
    return next;
  });
  const setCount = (id, n) => setSelected(s => ({ ...s, [id]: Math.max(1, n) }));

  const filtered = tasks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.client?.toLowerCase().includes(search.toLowerCase())
  );
  const totalCount = Object.values(selected).reduce((a, c) => a + (c || 0), 0);

  const handleCreate = () => {
    const newTasks = [];
    const ts = Date.now();
    Object.entries(selected).forEach(([taskId, count]) => {
      const src = tasks.find(t => t.id === taskId);
      if (!src) return;
      for (let i = 0; i < count; i++) {
        let due = src.dueDate;
        if (due && dayOffset) {
          const d = new Date(due);
          d.setDate(d.getDate() + dayOffset);
          due = d.toISOString();
        }
        newTasks.push({
          ...src,
          id: "t" + ts + "-" + newTasks.length,
          title: src.title + titleSuffix + (count > 1 ? ` ${i + 1}` : ""),
          status: "todo",
          comments: [],
          dueDate: due,
        });
      }
    });
    onCreate(newTasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SUFFISSO TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} style={bulkInputStyle} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>OFFSET SCADENZA (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca task da duplicare..." style={{ ...bulkInputStyle, padding: "9px 12px" }} />

      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Nessun task trovato</div>
        ) : filtered.map(t => {
          const count = selected[t.id] || 0;
          const isSel = count > 0;
          return (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
              cursor: "pointer",
            }} onClick={() => toggle(t.id)}>
              <input type="checkbox" checked={isSel} readOnly style={{ cursor: "pointer" }} />
              <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {CATEGORIES[t.category]?.label} • {t.client || "—"} • {formatDate(t.dueDate)}
                </div>
              </div>
              {isSel && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => setCount(t.id, count - 1)} disabled={count <= 1} style={{ ...bulkIconBtnSmall, opacity: count <= 1 ? 0.4 : 1 }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{count}</span>
                  <button onClick={() => setCount(t.id, count + 1)} style={bulkIconBtnSmall}>+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{totalCount} copie da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={totalCount === 0} style={{
            ...bulkBtnPrimary, opacity: totalCount === 0 ? 0.5 : 1, cursor: totalCount === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {totalCount} copie</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
const ImportTab = ({ onCreate, onClose }) => {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await loadXLSX();
        // Caveat #18: leggiamo come ArrayBuffer + type "array" (non più binary
        // string). Così SheetJS decodifica correttamente l'UTF-8 dei CSV (e
        // rimuove il BOM iniziale), evitando il mojibake sui caratteri accentati
        // (es. "città", "è"). Funziona anche per .xlsx/.xls.
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
        if (!json.length) { setError("Il file è vuoto o non contiene righe leggibili."); return; }
        const cols = Object.keys(json[0]);
        setRows(json); setColumns(cols);
        const find = (kws) => cols.find(c => kws.some(kw => c.toLowerCase().includes(kw)));
        setMapping({
          title: find(["titolo", "title", "nome", "task"]) || "",
          category: find(["categoria", "category", "tipo"]) || "",
          priority: find(["priorit", "priority"]) || "",
          status: find(["stato", "status"]) || "",
          client: find(["cliente", "client"]) || "",
          dueDate: find(["scadenz", "due", "data"]) || "",
          assignee: find(["assegn", "assign", "owner", "responsab"]) || "",
          estimatedHours: find(["ore", "hours"]) || "",
          description: find(["descriz", "descr", "note"]) || "",
        });
      } catch (err) {
        setError("Impossibile leggere il file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const normCat = (v) => {
    if (!v) return "admin";
    const s = String(v).toLowerCase().trim();
    return Object.keys(CATEGORIES).find(k => k === s || CATEGORIES[k].label.toLowerCase() === s) || "admin";
  };
  const normPrio = (v) => {
    if (!v) return "medium";
    const s = String(v).toLowerCase().trim();
    return Object.keys(PRIORITIES).find(k => k === s || PRIORITIES[k].label.toLowerCase() === s) || "medium";
  };
  const normStat = (v) => {
    if (!v) return "todo";
    const s = String(v).toLowerCase().trim();
    return STATUSES.find(k => k === s || STATUS_LABELS[k].toLowerCase() === s) || "todo";
  };
  const normAssignee = (v) => {
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    const m = TEAM.find(mm => mm.id === s || mm.name.toLowerCase().includes(s) || s.includes(mm.name.toLowerCase().split(" ")[0]));
    return m?.id || null;
  };
  const normDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const validRows = mapping.title ? rows.filter(r => String(r[mapping.title] || "").trim()) : [];

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => {
      const assignee = mapping.assignee ? normAssignee(r[mapping.assignee]) : null;
      return {
        id: "t" + ts + "-" + idx,
        title: String(r[mapping.title]).trim(),
        category: normCat(mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        assignees: assignee ? [assignee] : [],
        client: mapping.client ? (String(r[mapping.client] || "").trim() || null) : null,
        dueDate: mapping.dueDate ? normDate(r[mapping.dueDate]) : null,
        estimatedHours: mapping.estimatedHours ? (parseFloat(r[mapping.estimatedHours]) || 1) : 1,
        description: mapping.description ? String(r[mapping.description] || "").trim() : "",
        comments: [],
      };
    });
    onCreate(tasks);
    onClose();
  };

  const reset = () => { setRows([]); setColumns([]); setMapping({}); setFileName(""); setError(null); };

  const fields = [
    { key: "title", label: "Titolo *" }, { key: "category", label: "Categoria" },
    { key: "priority", label: "Priorità" }, { key: "status", label: "Stato" },
    { key: "client", label: "Cliente" }, { key: "dueDate", label: "Scadenza" },
    { key: "assignee", label: "Assegnato" }, { key: "estimatedHours", label: "Ore stimate" },
    { key: "description", label: "Descrizione" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!rows.length && (
        <div onClick={() => fileInputRef.current?.click()} style={{
          border: "2px dashed var(--border)", borderRadius: 12,
          padding: "40px 20px", textAlign: "center", cursor: "pointer", background: "var(--surface)",
          transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>📥</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Clicca per caricare CSV o Excel</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Formati supportati: .csv, .xlsx, .xls</div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13 }}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
            <button onClick={reset} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia file</button>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>MAPPATURA COLONNE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {fields.map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>{f.label}</div>
                  <select value={mapping[f.key] || ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} style={bulkInputStyle}>
                    <option value="">— non mappato —</option>
                    {columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
              ANTEPRIMA (prime 5 righe)
            </div>
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, maxHeight: 200, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>{columns.map(c => (
                    <th key={c} style={{ padding: "8px 10px", background: "var(--surface2)", textAlign: "left", fontWeight: 600, borderBottom: "1px solid var(--border)", position: "sticky", top: 0 }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{columns.map(c => (
                      <td key={c} style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(r[c] || "")}
                      </td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {validRows.length} task validi {!mapping.title && rows.length > 0 && "(mappa il TITOLO)"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || !mapping.title} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || !mapping.title) ? 0.5 : 1,
            cursor: (validRows.length === 0 || !mapping.title) ? "not-allowed" : "pointer",
          }}>✓ Importa {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: TEMPLATE TAB ────────────────────────────────────────────────────
const TemplateTab = ({ onCreate, onClose, dossiers = [] }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");
  const [dossierId, setDossierId] = useState("");
  const linkableDossiers = dossiers.filter(d => d.status !== "annullata");

  const tpl = TASK_TEMPLATES.find(t => t.id === selectedId);
  const previewTasks = tpl && eventDate ? tpl.tasks.map(t => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + t.dayOffset);
    return { ...t, dueDate: d.toISOString() };
  }) : [];

  const handleCreate = () => {
    if (!tpl || !eventDate) return;
    const ts = Date.now();
    const tasks = previewTasks.map((t, idx) => ({
      id: "t" + ts + "-" + idx,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: "todo",
      assignees: defaultAssignee ? [defaultAssignee] : [],
      client: client.trim() || null,
      dossierId: dossierId || null,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!selectedId ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TASK_TEMPLATES.map(t => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="hover-lift" style={{
              padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
              cursor: "pointer", background: "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{t.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{tpl.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CLIENTE</div>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="Es. Famiglia Rossi" style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>DATA EVENTO *</div>
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {linkableDossiers.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>PRATICA COLLEGATA</div>
                <select value={dossierId} onChange={e => setDossierId(e.target.value)} style={{ ...bulkInputStyle, maxWidth: 360 }}>
                  <option value="">— Nessuna pratica —</option>
                  {linkableDossiers.map(d => <option key={d.id} value={d.id}>{d.number} — {d.title}</option>)}
                </select>
              </div>
            )}
          </div>

          {eventDate && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        📅 {new Date(t.dueDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{previewTasks.length} task pronti</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={!tpl || !eventDate} style={{
            ...bulkBtnPrimary,
            opacity: (!tpl || !eventDate) ? 0.5 : 1,
            cursor: (!tpl || !eventDate) ? "not-allowed" : "pointer",
          }}>✓ Crea {previewTasks.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
export const BulkTaskCreator = ({ existingTasks, onCreate, onClose, dossiers = [] }) => {
  const [tab, setTab] = useState("manual");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 16, width: 820, maxWidth: "100%",
        maxHeight: "92vh", display: "flex", flexDirection: "column",
        boxShadow: "0 30px 80px rgba(0,0,0,0.25)", border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📑</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 17, fontWeight: 700, lineHeight: 1.1 }}>Crea più task</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, letterSpacing: 1.2, marginTop: 2 }}>MANUALE · DUPLICA · IMPORT · TEMPLATE</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
          {[
            { id: "manual", icon: "✏️", label: "Manuale" },
            { id: "duplicate", icon: "🔁", label: "Duplica" },
            { id: "import", icon: "📥", label: "Importa file" },
            { id: "template", icon: "📋", label: "Da template" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
              border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {tab === "manual" && <ManualTab onCreate={onCreate} onClose={onClose} dossiers={dossiers} />}
          {tab === "duplicate" && <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} />}
          {tab === "import" && <ImportTab onCreate={onCreate} onClose={onClose} />}
          {tab === "template" && <TemplateTab onCreate={onCreate} onClose={onClose} dossiers={dossiers} />}
        </div>
      </div>
    </div>
  );
};
