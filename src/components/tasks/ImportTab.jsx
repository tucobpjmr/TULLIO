import { useState, useRef } from "react";

import { PRIORITIES, STATUSES, STATUS_LABELS } from "../../state/constants.js";
import { useTeam, useCategories } from "../../state/contexts.js";
import { loadXLSX } from "../../utils/xlsx.js";

import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";

// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
export const ImportTab = ({ onCreate, onClose }) => {
  const team = useTeam();
  const categories = useCategories();
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
        const data = evt.target.result;
        const wb = XLSX.read(data, { type: "binary", cellDates: true });
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
    reader.readAsBinaryString(file);
  };

  const normCat = (v) => {
    if (!v) return "admin";
    const s = String(v).toLowerCase().trim();
    return Object.keys(categories).find(k => k === s || categories[k].label.toLowerCase() === s) || "admin";
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
    const m = team.find(mm => mm.id === s || mm.name.toLowerCase().includes(s) || s.includes(mm.name.toLowerCase().split(" ")[0]));
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
