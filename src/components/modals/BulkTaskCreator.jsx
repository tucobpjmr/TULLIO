// ─── BULK TASK CREATOR ───────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Contiene ManualTab, DuplicateTab, ImportTab, TemplateTab (helper interni,
// non esportati) + il modale principale BulkTaskCreator.
import { useState, useRef, useMemo, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { PRIORITIES, STATUSES, STATUS_LABELS, TASK_TEMPLATES } from "../../lib/taskConstants.js";
import { formatDate } from "../../lib/taskUtils.js";
import { TEAM, CATEGORIES, getAssignableTeam } from "../../state/appGlobals.js";
import { readFirstSheetRows } from "../../lib/xlsx.js";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";

// ─── BULK TASK CREATOR (stili helper) ──────────────────────────────────────
const bulkInputStyle = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 6,
  padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit",
  background: "var(--card)", outline: "none",
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
const ManualTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const { isMobile } = useViewport();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "", praticaRef: "", contact: "" });
  const [clientFocus, setClientFocus] = useState(false);
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", category: "", priority: "", assignee: "", dueDate: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  const validRows = rows.filter(r => r.title.trim());
  // Righe con qualche dato ma senza titolo: verrebbero scartate in silenzio.
  const rowHasData = (r) => r.category || r.priority || r.assignee || r.dueDate;
  const ignoredRows = rows.filter(r => !r.title.trim() && rowHasData(r));

  // Etichette delle impostazioni comuni, mostrate come valore ereditato nelle
  // righe che non specificano nulla (così l'operatore vede cosa uscirà davvero).
  const commonCatLabel = CATEGORIES[common.category]?.label || "categoria";
  const commonPrioLabel = PRIORITIES[common.priority]?.label || "priorità";
  const commonAssigneeLabel = common.assignee
    ? (getAssignableTeam().find(m => m.id === common.assignee)?.name.split(" ")[0] || "assegnato")
    : "nessuno";

  const isDirty = validRows.length > 0 || ignoredRows.length > 0 ||
    !!(common.client.trim() || common.praticaRef.trim() || common.contact.trim());
  useEffect(() => { onDirty?.(isDirty); }, [isDirty, onDirty]);

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
      praticaRef: common.praticaRef || null,
      contact: common.contact.trim() || null,
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
          {(() => {
            const q = common.client.trim().toLowerCase();
            const matches = (q ? clients.filter(c => c.name?.toLowerCase().includes(q)) : clients).slice(0, 6);
            const showList = clientFocus && matches.length > 0 &&
              !(matches.length === 1 && matches[0].name?.toLowerCase() === q);
            return (
              <div style={{ position: "relative" }}>
                <input
                  value={common.client}
                  onChange={e => setCommon({ ...common, client: e.target.value })}
                  placeholder={clients.length ? "Cerca in anagrafica…" : "Cliente"}
                  style={bulkInputStyle}
                  autoComplete="off"
                  onFocus={() => setClientFocus(true)}
                  onBlur={() => setTimeout(() => setClientFocus(false), 150)}
                />
                {showList && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
                    marginTop: 3, background: "var(--card)", border: "1px solid var(--border)",
                    borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                    maxHeight: 180, overflowY: "auto",
                  }}>
                    {matches.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => { setCommon(p => ({ ...p, client: c.name })); setClientFocus(false); }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                          width: "100%", textAlign: "left", padding: "7px 10px", border: "none",
                          borderBottom: "1px solid var(--border)", background: "transparent",
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
                        {(c.city || c.email) && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                            {[c.city, c.email].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
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
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8, maxWidth: isMobile ? "100%" : 660 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>N° PRATICA</div>
            <input value={common.praticaRef} onChange={e => setCommon({ ...common, praticaRef: e.target.value })} placeholder="es. PR-2026-001" style={bulkInputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CONTATTI</div>
            <input value={common.contact} onChange={e => setCommon({ ...common, contact: e.target.value })} placeholder="Telefono, email…" style={bulkInputStyle} />
          </div>
        </div>
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
            <div key={r.key} style={{
              border: `1px solid ${!r.title.trim() && rowHasData(r) ? "var(--warning)" : "var(--border)"}`,
              borderRadius: 10, padding: 10, background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 }}>#{idx + 1}</span>
                <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={{
                  ...bulkInputStyle, flex: 1,
                  borderColor: !r.title.trim() && rowHasData(r) ? "var(--warning)" : "var(--border)",
                }} />
                <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
                  background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
                  fontSize: 16, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1, flexShrink: 0,
                }}>✕</button>
              </div>
              {!r.title.trim() && rowHasData(r) && (
                <div style={{ fontSize: 10.5, color: "var(--warning)", fontWeight: 600 }}>⚠ Aggiungi un titolo o questa riga verrà ignorata</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                  <option value="">{commonCatLabel} (comune)</option>
                  {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
                <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
                  <option value="">{commonPrioLabel} (comune)</option>
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
                  <option value="">{commonAssigneeLabel} (comune)</option>
                  {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
                </select>
                <DateTimePicker
                  value={r.dueDate || null}
                  onChange={iso => updateRow(r.key, "dueDate", iso || "")}
                  align="right"
                />
              </div>
            </div>
          ) : (
            <div key={r.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{idx + 1}</div>
              <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={{
                ...bulkInputStyle,
                borderColor: !r.title.trim() && rowHasData(r) ? "var(--warning)" : "var(--border)",
              }} title={!r.title.trim() && rowHasData(r) ? "Aggiungi un titolo o la riga verrà ignorata" : undefined} />
              <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                <option value="">{commonCatLabel}</option>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
              <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
                <option value="">{commonPrioLabel}</option>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
                <option value="">{commonAssigneeLabel}</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
              </select>
              <DateTimePicker
                value={r.dueDate || null}
                onChange={iso => updateRow(r.key, "dueDate", iso || "")}
                align="right"
              />
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{validRows.length} task da creare</span>
          {ignoredRows.length > 0 && (
            <span style={{ color: "var(--warning)", fontWeight: 600 }}>
              ⚠ {ignoredRows.length} rig{ignoredRows.length === 1 ? "a" : "he"} senza titolo {ignoredRows.length === 1 ? "verrà ignorata" : "verranno ignorate"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel || onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0} style={{
            ...bulkBtnPrimary, opacity: validRows.length === 0 ? 0.5 : 1, cursor: validRows.length === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: DUPLICATE TAB ───────────────────────────────────────────────────
const DuplicateTab = ({ tasks, onCreate, onClose, onCancel, onDirty }) => {
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

  useEffect(() => { onDirty?.(totalCount > 0); }, [totalCount, onDirty]);

  // Scadenza risultante dopo l'offset (relativo alla scadenza originale, non a
  // oggi): usata per l'anteprima sotto ogni task selezionato.
  const resultingDue = (src) => {
    if (!src.dueDate) return "senza scadenza";
    if (!dayOffset) return formatDate(src.dueDate);
    const d = new Date(src.dueDate);
    d.setDate(d.getDate() + dayOffset);
    return formatDate(d.toISOString());
  };

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
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>TESTO DA AGGIUNGERE AL TITOLO</div>
          <input value={titleSuffix} onChange={e => setTitleSuffix(e.target.value)} placeholder=" (copia)" style={bulkInputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Aggiunto in fondo al titolo di ogni copia</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SPOSTA LA SCADENZA DI (giorni)</div>
          <input type="number" value={dayOffset} onChange={e => setDayOffset(parseInt(e.target.value) || 0)} style={bulkInputStyle} />
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>+7 = una settimana dopo l'originale, −3 = tre giorni prima</div>
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
                {isSel && (
                  <div style={{ fontSize: 10.5, color: "var(--success)", fontWeight: 600, marginTop: 3 }}>
                    → {t.title}{titleSuffix}{count > 1 ? ` 1…${count}` : ""} · scad. {resultingDue(t)}
                  </div>
                )}
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
          <button onClick={onCancel || onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={totalCount === 0} style={{
            ...bulkBtnPrimary, opacity: totalCount === 0 ? 0.5 : 1, cursor: totalCount === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {totalCount} copie</button>
        </div>
      </div>
    </div>
  );
};

// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
const ImportTab = ({ onCreate, onClose, onCancel, onDirty }) => {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  // Campi il cui abbinamento è stato indovinato automaticamente al caricamento:
  // li evidenziamo così l'operatore sa cosa verificare (e cosa mappare a mano).
  const [autoDetected, setAutoDetected] = useState({});
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { onDirty?.(rows.length > 0); }, [rows.length, onDirty]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        // Lettura "hardened" (limite dimensione + guard anti prototype-pollution)
        // centralizzata in src/lib/xlsx.js — vedi nota sicurezza SheetJS 0.18.5.
        const json = await readFirstSheetRows(evt.target.result);
        if (!json.length) { setError("Il file è vuoto o non contiene righe leggibili."); return; }
        const cols = Object.keys(json[0]);
        setRows(json); setColumns(cols);
        const find = (kws) => cols.find(c => kws.some(kw => c.toLowerCase().includes(kw)));
        const auto = {
          title: find(["titolo", "title", "nome", "task"]) || "",
          category: find(["categoria", "category", "tipo"]) || "",
          priority: find(["priorit", "priority"]) || "",
          status: find(["stato", "status"]) || "",
          client: find(["cliente", "client"]) || "",
          dueDate: find(["scadenz", "due", "data"]) || "",
          assignee: find(["assegn", "assign", "owner", "responsab"]) || "",
          estimatedHours: find(["ore", "hours"]) || "",
          description: find(["descriz", "descr", "note"]) || "",
          contact: find(["contatt", "contact", "telefono", "phone", "cellulare"]) || "",
        };
        setMapping(auto);
        setAutoDetected(Object.fromEntries(Object.entries(auto).filter(([, v]) => v).map(([k]) => [k, true])));
      } catch (err) {
        setError("Impossibile leggere il file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Genera e scarica un CSV modello con intestazioni riconosciute e una riga
  // d'esempio con valori validi, così l'operatore parte da un file corretto.
  const downloadTemplate = () => {
    const headers = ["Titolo", "Categoria", "Priorità", "Stato", "Cliente", "Scadenza", "Assegnato", "Descrizione", "Contatti"];
    const example = ["Prenotare volo Roma-Parigi", "Booking", "Alto", "Da Fare", "Mario Rossi", "31/12/2026", "", "Volo diretto andata/ritorno", "mario.rossi@example.com"];
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [headers, example].map(r => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modello-task.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const normCat = (v) => {
    if (!v) return "admin";
    const s = String(v).toLowerCase().trim();
    return Object.keys(CATEGORIES).find(k => k === s || CATEGORIES[k].label.toLowerCase() === s) || "admin";
  };
  const isRecognizedCat = (v) => {
    if (!v) return true;
    const s = String(v).toLowerCase().trim();
    return Object.keys(CATEGORIES).some(k => k === s || CATEGORIES[k].label.toLowerCase() === s);
  };
  const normPrio = (v) => {
    if (!v) return "medium";
    const s = String(v).toLowerCase().trim();
    return Object.keys(PRIORITIES).find(k => k === s || PRIORITIES[k].label.toLowerCase() === s) || "medium";
  };
  const isRecognizedPrio = (v) => {
    if (!v) return true;
    const s = String(v).toLowerCase().trim();
    return Object.keys(PRIORITIES).some(k => k === s || PRIORITIES[k].label.toLowerCase() === s);
  };
  const normStat = (v) => {
    if (!v) return "todo";
    const s = String(v).toLowerCase().trim();
    return STATUSES.find(k => k === s || STATUS_LABELS[k].toLowerCase() === s) || "todo";
  };
  const isRecognizedStat = (v) => {
    if (!v) return true;
    const s = String(v).toLowerCase().trim();
    return STATUSES.some(k => k === s || STATUS_LABELS[k].toLowerCase() === s);
  };
  const normAssignee = (v) => {
    if (!v) return null;
    const s = String(v).toLowerCase().trim();
    const m = TEAM.find(mm => mm.id === s || mm.name.toLowerCase().includes(s) || s.includes(mm.name.toLowerCase().split(" ")[0]));
    return m?.id || null;
  };
  // Formato italiano gg/mm/aaaa (o gg-mm-aaaa): il costruttore Date nativo
  // interpreta "31/12/2026" come Invalid Date (prova mm/dd/yyyy, 31 non è un
  // mese valido) → veniva scartata senza avviso; per date ambigue come
  // "05/03/2026" la interpretava invece come 3 maggio anziché 5 marzo,
  // invertendo silenziosamente giorno e mese. L'app è italiana: per questo
  // pattern trattiamo sempre giorno-mese-anno, con validazione esplicita
  // (rifiuta es. 31/02 invece di farlo scivolare al 3 marzo).
  const normDate = (v) => {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
    const s = String(v).trim();
    const itMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (itMatch) {
      const dd = Number(itMatch[1]);
      const mm = Number(itMatch[2]);
      let yyyy = Number(itMatch[3]);
      if (itMatch[3].length === 2) yyyy += yyyy < 70 ? 2000 : 1900;
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      const valid = d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
      return valid ? d.toISOString() : null;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const validRows = useMemo(
    () => mapping.title ? rows.filter(r => String(r[mapping.title] || "").trim()) : [],
    [rows, mapping.title]
  );

  // Conta le righe che verrebbero importate con un valore "silenziosamente"
  // sostituito da un default (categoria/priorità/stato non riconosciuti) o
  // con la scadenza persa (data non interpretabile) — prima l'operatore non
  // se ne accorgeva finché non ispezionava i task già creati.
  const importWarnings = useMemo(() => {
    if (!validRows.length) return null;
    let badCategory = 0, badPriority = 0, badStatus = 0, badDate = 0, badAssignee = 0;
    for (const r of validRows) {
      if (mapping.category && r[mapping.category] && !isRecognizedCat(r[mapping.category])) badCategory++;
      if (mapping.priority && r[mapping.priority] && !isRecognizedPrio(r[mapping.priority])) badPriority++;
      if (mapping.status && r[mapping.status] && !isRecognizedStat(r[mapping.status])) badStatus++;
      if (mapping.dueDate && r[mapping.dueDate] && !normDate(r[mapping.dueDate])) badDate++;
      if (mapping.assignee && String(r[mapping.assignee] || "").trim() && !normAssignee(r[mapping.assignee])) badAssignee++;
    }
    const total = badCategory + badPriority + badStatus + badDate + badAssignee;
    return total > 0 ? { badCategory, badPriority, badStatus, badDate, badAssignee } : null;
  }, [validRows, mapping]);

  // Anteprima dei task "come verranno creati" (fase 2): applica le stesse
  // normalizzazioni di handleCreate così l'operatore vede il risultato reale
  // — categoria/priorità/stato tradotti, data interpretata, assegnatario
  // abbinato — invece delle celle grezze del file.
  const normalizedPreview = useMemo(() => {
    if (!mapping.title) return [];
    return validRows.slice(0, 8).map(r => {
      const dueRaw = mapping.dueDate ? String(r[mapping.dueDate] || "").trim() : "";
      const due = mapping.dueDate ? normDate(r[mapping.dueDate]) : null;
      const assigneeRaw = mapping.assignee ? String(r[mapping.assignee] || "").trim() : "";
      const assigneeId = mapping.assignee ? normAssignee(r[mapping.assignee]) : null;
      return {
        title: String(r[mapping.title]).trim(),
        category: normCat(mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        client: mapping.client ? String(r[mapping.client] || "").trim() : "",
        due, dueLost: !!(dueRaw && !due),
        assigneeId, assigneeLost: !!(assigneeRaw && !assigneeId),
      };
    });
  }, [validRows, mapping]);

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
        contact: mapping.contact ? (String(r[mapping.contact] || "").trim() || null) : null,
        comments: [],
      };
    });
    onCreate(tasks);
    onClose();
  };

  const reset = () => { setRows([]); setColumns([]); setMapping({}); setAutoDetected({}); setFileName(""); setError(null); };

  const fields = [
    { key: "title", label: "Titolo *" }, { key: "category", label: "Categoria" },
    { key: "priority", label: "Priorità" }, { key: "status", label: "Stato" },
    { key: "client", label: "Cliente" }, { key: "dueDate", label: "Scadenza" },
    { key: "assignee", label: "Assegnato" },
    { key: "description", label: "Descrizione" },
    { key: "contact", label: "Contatti" },
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
          <button
            type="button"
            onClick={e => { e.stopPropagation(); downloadTemplate(); }}
            style={{
              marginTop: 14, background: "transparent", border: "1px solid var(--border)",
              borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "var(--navy)", fontFamily: "inherit",
            }}
          >⬇ Scarica un file modello</button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid rgba(192,57,43,0.3)", color: "var(--danger)", padding: "12px 14px", borderRadius: 10, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {importWarnings && (
        <div style={{ background: "#FEF3C7", border: "1px solid rgba(200,131,42,0.35)", color: "var(--warning)", padding: "12px 14px", borderRadius: 10, fontSize: 12, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>⚠️ Valori non riconosciuti nel file</div>
          {importWarnings.badCategory > 0 && <div>{importWarnings.badCategory} righe con categoria non riconosciuta → verrà usata "Amministrazione"</div>}
          {importWarnings.badPriority > 0 && <div>{importWarnings.badPriority} righe con priorità non riconosciuta → verrà usata "Media"</div>}
          {importWarnings.badStatus > 0 && <div>{importWarnings.badStatus} righe con stato non riconosciuto → verrà usato "Da fare"</div>}
          {importWarnings.badDate > 0 && <div>{importWarnings.badDate} righe con data non interpretabile → scadenza lasciata vuota</div>}
          {importWarnings.badAssignee > 0 && <div>{importWarnings.badAssignee} righe con assegnatario non trovato nel team → task lasciata non assegnata</div>}
          <div style={{ marginTop: 4, opacity: 0.85 }}>Controlla l'anteprima sotto prima di importare, o correggi il file sorgente.</div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13 }}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
            <button onClick={reset} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia file</button>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>MAPPATURA COLONNE</div>
              <div style={{ fontSize: 10.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--success)", display: "inline-block" }} />
                rilevato automaticamente — verifica
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {fields.map(f => {
                const isAuto = autoDetected[f.key] && mapping[f.key];
                return (
                  <div key={f.key}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 3 }}>
                      {f.label}{isAuto && <span style={{ color: "var(--success)", marginLeft: 4 }}>✓</span>}
                    </div>
                    <select
                      value={mapping[f.key] || ""}
                      onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                      style={{
                        ...bulkInputStyle,
                        borderColor: isAuto ? "var(--success)" : "var(--border)",
                        background: isAuto ? "rgba(45,122,79,0.05)" : "var(--card)",
                      }}
                    >
                      <option value="">— non mappato —</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {normalizedPreview.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                ANTEPRIMA TASK — COME VERRANNO CREATI
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {normalizedPreview.map((t, i) => {
                  const assigneeName = t.assigneeId ? (TEAM.find(m => m.id === t.assigneeId)?.name || t.assigneeId) : null;
                  return (
                    <div key={i} style={{
                      padding: "8px 12px", borderBottom: i === normalizedPreview.length - 1 ? "none" : "1px solid var(--border)",
                      display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                    }}>
                      <span style={{ fontSize: 14 }}>{CATEGORIES[t.category]?.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: 8, marginTop: 2 }}>
                          <span>{CATEGORIES[t.category]?.label}</span>
                          <span>{STATUS_LABELS[t.status]}</span>
                          {t.client && <span>👤 {t.client}</span>}
                          <span style={{ color: t.dueLost ? "var(--warning)" : "var(--text-muted)", fontWeight: t.dueLost ? 700 : 400 }}>
                            📅 {t.due ? formatDate(t.due) : (t.dueLost ? "⚠ scadenza persa" : "nessuna")}
                          </span>
                          <span style={{ color: t.assigneeLost ? "var(--warning)" : "var(--text-muted)", fontWeight: t.assigneeLost ? 700 : 400 }}>
                            👥 {assigneeName || (t.assigneeLost ? "⚠ non trovato" : "non assegnato")}
                          </span>
                        </div>
                      </div>
                      <PriorityBadge priority={t.priority} />
                    </div>
                  );
                })}
              </div>
              {validRows.length > normalizedPreview.length && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  …e altri {validRows.length - normalizedPreview.length} task non mostrati in anteprima.
                </div>
              )}
            </div>
          )}

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
              FILE SORGENTE (prime 5 righe)
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
          <button onClick={onCancel || onClose} style={bulkBtnGhost}>Annulla</button>
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
const TemplateTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [clientFocus, setClientFocus] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");
  const [praticaRef, setPraticaRef] = useState("");
  const [contact, setContact] = useState("");

  useEffect(() => { onDirty?.(!!selectedId); }, [selectedId, onDirty]);

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
      praticaRef: praticaRef || null,
      contact: contact.trim() || null,
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
              cursor: "pointer", background: "var(--card)",
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
              {(() => {
                const q = client.trim().toLowerCase();
                const matches = (q ? clients.filter(c => c.name?.toLowerCase().includes(q)) : clients).slice(0, 6);
                const showList = clientFocus && matches.length > 0 &&
                  !(matches.length === 1 && matches[0].name?.toLowerCase() === q);
                return (
                  <div style={{ position: "relative" }}>
                    <input
                      value={client}
                      onChange={e => setClient(e.target.value)}
                      placeholder={clients.length ? "Cerca in anagrafica…" : "Es. Famiglia Rossi"}
                      style={bulkInputStyle}
                      autoComplete="off"
                      onFocus={() => setClientFocus(true)}
                      onBlur={() => setTimeout(() => setClientFocus(false), 150)}
                    />
                    {showList && (
                      <div style={{
                        position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
                        marginTop: 3, background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        maxHeight: 180, overflowY: "auto",
                      }}>
                        {matches.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => { setClient(c.name); setClientFocus(false); }}
                            style={{
                              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                              width: "100%", textAlign: "left", padding: "7px 10px", border: "none",
                              borderBottom: "1px solid var(--border)", background: "transparent",
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
                            {(c.city || c.email) && (
                              <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                                {[c.city, c.email].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>DATA EVENTO *</div>
              <DateTimePicker
                value={eventDate || null}
                onChange={iso => setEventDate(iso || "")}
                withTime={false}
                placeholder="gg/mm/aaaa"
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>N° PRATICA</div>
              <input value={praticaRef} onChange={e => setPraticaRef(e.target.value)} placeholder="es. PR-2026-001" style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CONTATTI</div>
              <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Telefono, email…" style={bulkInputStyle} />
            </div>
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
          <button onClick={onCancel || onClose} style={bulkBtnGhost}>Annulla</button>
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

// Descrizione breve di ogni modalità: mostrata sotto le tab per orientare
// l'operatore su "quando" usare ciascuna (v-bulk-ux fase 1).
const TAB_META = [
  { id: "manual",    icon: "✏️", label: "Manuale",     desc: "Inserisci le task a mano, una per riga. Le impostazioni comuni valgono per le righe che non specificano un valore." },
  { id: "duplicate", icon: "🔁", label: "Duplica",      desc: "Riparti da task esistenti: scegli quali duplicare, cambia il titolo e sposta le scadenze." },
  { id: "import",    icon: "📥", label: "Importa file", desc: "Carica un file CSV o Excel e abbina le colonne ai campi delle task." },
  { id: "template",  icon: "📋", label: "Da template",  desc: "Genera una serie di task predefinite a partire dalla data di un evento." },
];

// ─── BULK TASK CREATOR (modale principale) ─────────────────────────────────
export const BulkTaskCreator = ({ existingTasks, onCreate, onClose, clients = [] }) => {
  const { isMobile } = useViewport();
  const [tab, setTab] = useState("manual");
  // Fase 2: si parte da una schermata di scelta ("Come vuoi creare i task?")
  // con 4 card grandi, invece di atterrare direttamente su una tab fitta —
  // riduce il carico cognitivo, soprattutto su mobile. `entered` distingue la
  // schermata di scelta dal contenuto della modalità.
  const [entered, setEntered] = useState(false);
  // Traccia se ogni modalità contiene dati non ancora creati, così la chiusura
  // (✕ / sfondo / Annulla) può avvisare invece di buttare via il lavoro.
  const [dirty, setDirty] = useState({});
  const markDirty = (id) => (v) => setDirty(d => (d[id] === v ? d : { ...d, [id]: v }));
  const anyDirty = Object.values(dirty).some(Boolean);
  const requestClose = () => {
    if (anyDirty && !window.confirm("Ci sono dati inseriti non ancora creati. Vuoi chiudere e perderli?")) return;
    onClose();
  };

  const activeMeta = TAB_META.find(t => t.id === tab);

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20,
      }}
    >
      <div className="slide-up vd-modal-mh" style={{
        background: "var(--card)", borderRadius: 16, width: 820, maxWidth: "100%",
        display: "flex", flexDirection: "column",
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
          <button onClick={requestClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>

        {/* Barra tab + descrizione: solo dopo aver scelto una modalità. */}
        {entered && (
          <>
            <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexShrink: 0 }}>
              {TAB_META.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  flex: 1, padding: "12px 8px", background: tab === t.id ? "#fff" : "transparent",
                  border: "none", borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
                  cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? "var(--navy)" : "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s",
                  position: "relative",
                }}>
                  <span>{t.icon}</span> {!isMobile && t.label}
                  {dirty[t.id] && tab !== t.id && (
                    <span title="Contiene dati non ancora creati" style={{
                      position: "absolute", top: 8, right: 8, width: 7, height: 7,
                      borderRadius: "50%", background: "var(--gold)",
                    }} />
                  )}
                </button>
              ))}
            </div>

            {activeMeta && (
              <div style={{
                padding: "9px 22px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
                fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4, flexShrink: 0,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <button
                  type="button"
                  onClick={() => setEntered(false)}
                  title="Torna alla scelta della modalità"
                  style={{
                    background: "transparent", border: "1px solid var(--border)", borderRadius: 6,
                    padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                    color: "var(--text-muted)", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap",
                  }}
                >‹ Modalità</button>
                <span>{activeMeta.desc}</span>
              </div>
            )}
          </>
        )}

        {/* Le 4 modalità restano montate (display:none quando inattive o in
            schermata di scelta): cambiare tab o tornare alla scelta non azzera
            i dati già inseriti. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
          {!entered && (
            <div>
              <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
                Come vuoi creare i task?
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16 }}>
                Scegli una modalità. Potrai passare da una all'altra senza perdere quello che hai inserito.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                {TAB_META.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setTab(t.id); setEntered(true); }}
                    className="hover-lift"
                    style={{
                      textAlign: "left", padding: "16px 18px", borderRadius: 12,
                      border: `1px solid ${dirty[t.id] ? "var(--gold)" : "var(--border)"}`,
                      background: "var(--card)", cursor: "pointer", fontFamily: "inherit",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, background: "var(--surface2)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0,
                      }}>{t.icon}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{t.label}</div>
                      {dirty[t.id] && (
                        <span title="Contiene dati non ancora creati" style={{
                          marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "var(--navy)",
                          background: "rgba(212,168,67,0.18)", borderRadius: 999, padding: "2px 8px", flexShrink: 0,
                        }}>bozza</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: entered && tab === "manual" ? "block" : "none" }}>
            <ManualTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("manual")} clients={clients} />
          </div>
          <div style={{ display: entered && tab === "duplicate" ? "block" : "none" }}>
            <DuplicateTab tasks={existingTasks} onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("duplicate")} />
          </div>
          <div style={{ display: entered && tab === "import" ? "block" : "none" }}>
            <ImportTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("import")} />
          </div>
          <div style={{ display: entered && tab === "template" ? "block" : "none" }}>
            <TemplateTab onCreate={onCreate} onClose={onClose} onCancel={requestClose} onDirty={markDirty("template")} clients={clients} />
          </div>
        </div>
      </div>
    </div>
  );
};
