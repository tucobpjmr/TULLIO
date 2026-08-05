// src/components/modals/bulk/ManualTab.jsx
// Inserimento a mano: N righe con impostazioni comuni e override per riga.
import { useState, useEffect } from "react";
import { useViewport } from "../../Viewport.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { clientContact } from "../../../lib/taskUtils.js";
import { CATEGORIES, getAssignableTeam, CURRENT_USER } from "../../../state/appGlobals.js";
import { DateTimePicker, formatPickerValue } from "../../ui/DateTimePicker.jsx";
import { TaskFiles } from "../../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, isWithinSizeLimit } from "../../../lib/fileUtils.js";
import { bulkInputStyle, bulkTextareaStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";
import { RowAttachments } from "./RowAttachments.jsx";


// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
export const ManualTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const { isMobile } = useViewport();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "", praticaRef: "", contact: "", dueDate: "" });
  const [clientFocus, setClientFocus] = useState(false);
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", description: "", category: "", priority: "", assignee: "", dueDate: "", files: [] });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  // Creazione in corso: blocca il doppio invio (un secondo tap sul pulsante
  // creava un secondo batch identico) e con allegati tiene aperto il modale
  // finché tutti gli upload non sono finiti, così un errore è visibile.
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState("");

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  // Gli allegati oltre il limite del bucket vengono scartati subito: caricarli
  // fallirebbe comunque, ma solo a task già create.
  const addRowFiles = (key, fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    const tooBig = arr.filter(f => !isWithinSizeLimit(f.size));
    const ok = arr.filter(f => isWithinSizeLimit(f.size));
    setFileError(tooBig.length
      ? `${tooBig.map(f => `"${f.name}"`).join(", ")} super${tooBig.length === 1 ? "a" : "ano"} il limite di ${formatFileSize(MAX_TASK_FILE_SIZE)} per file`
      : "");
    if (ok.length) setRows(rs => rs.map(r => r.key === key ? { ...r, files: [...r.files, ...ok] } : r));
  };
  const removeRowFile = (key, idx) =>
    setRows(rs => rs.map(r => r.key === key ? { ...r, files: r.files.filter((_, i) => i !== idx) } : r));

  const validRows = rows.filter(r => r.title.trim());
  // Righe con qualche dato ma senza titolo: verrebbero scartate in silenzio.
  const rowHasData = (r) => r.description.trim() || r.category || r.priority || r.assignee || r.dueDate || r.files.length > 0;
  const ignoredRows = rows.filter(r => !r.title.trim() && rowHasData(r));
  const totalFiles = validRows.reduce((n, r) => n + r.files.length, 0);

  // Etichette delle impostazioni comuni, mostrate come valore ereditato nelle
  // righe che non specificano nulla (così l'operatore vede cosa uscirà davvero).
  const commonCatLabel = CATEGORIES[common.category]?.label || "categoria";
  const commonPrioLabel = PRIORITIES[common.priority]?.label || "priorità";
  const commonAssigneeLabel = common.assignee
    ? (getAssignableTeam().find(m => m.id === common.assignee)?.name.split(" ")[0] || "assegnato")
    : "nessuno";
  // La scadenza comune non ha una <option> in cui comparire come le altre:
  // viene mostrata come placeholder del picker di riga, così anche qui si vede
  // la data che la riga erediterà invece del generico "gg/mm/aaaa --:--".
  // Vuota quando non è impostata, per lasciare il placeholder di default.
  const commonDueLabel = common.dueDate ? formatPickerValue(common.dueDate) : "";

  const isDirty = validRows.length > 0 || ignoredRows.length > 0 ||
    !!(common.client.trim() || common.praticaRef.trim() || common.contact.trim() || common.dueDate);
  useEffect(() => { onDirty?.(isDirty); }, [isDirty, onDirty]);

  const handleCreate = async () => {
    if (busy) return;
    // UUID generati qui: dispatch li conserva perché già validi, così
    // conosciamo l'id definitivo di ogni task e possiamo caricarci gli
    // allegati (il path nel bucket e la RLS partono dal task_id).
    const prepared = validRows.map((r) => ({
      files: r.files,
      task: {
        id: crypto.randomUUID(),
        title: r.title.trim(),
        category: r.category || common.category,
        priority: r.priority || common.priority,
        status: "todo",
        assignees: (r.assignee || common.assignee) ? [r.assignee || common.assignee] : [],
        client: common.client.trim() || null,
        praticaRef: common.praticaRef || null,
        contact: common.contact.trim() || null,
        dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : (common.dueDate ? new Date(common.dueDate).toISOString() : null),
        estimatedHours: 1,
        description: r.description.trim(),
        comments: [],
      },
    }));

    const withFiles = prepared.filter(p => p.files.length > 0);
    setBusy(true);
    setFileError("");

    const result = await onCreate(prepared.map(p => p.task));

    // Creazione fallita: niente upload (senza la riga task la RLS del bucket
    // rifiuterebbe comunque) e soprattutto il modale RESTA APERTO con i dati
    // inseriti. Prima si chiudeva comunque: le task sparivano al reload e
    // l'unico segnale era un toast che passava inosservato.
    if (result && result.error) {
      setFileError(`Creazione non riuscita: ${result.error.message || "errore sconosciuto"}. I dati sono ancora qui, riprova.`);
      setBusy(false);
      return;
    }

    if (!withFiles.length) {
      setBusy(false);
      onClose();
      return;
    }

    for (const { task, files } of withFiles) {
      for (const f of files) {
        const { error } = await TaskFiles.upload(f, task.id, { uploadedBy: CURRENT_USER });
        if (error) {
          // Le task sono già create: teniamo aperto il modale per dire quale
          // allegato è rimasto indietro e dove recuperarlo.
          setFileError(`Task create, ma l'upload di "${f.name}" su "${task.title}" è fallito. Riprova dal dettaglio della task.`);
          setBusy(false);
          return;
        }
      }
    }
    setBusy(false);
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
                        onMouseDown={() => {
                          setCommon(p => ({ ...p, client: c.name, contact: p.contact.trim() ? p.contact : clientContact(c) }));
                          setClientFocus(false);
                        }}
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
                        {(c.phone || c.city || c.email) && (
                          <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                            {[c.phone, c.city, c.email].filter(Boolean).join(" · ")}
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
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, maxWidth: isMobile ? "100%" : 900 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>N° PRATICA</div>
            <input value={common.praticaRef} onChange={e => setCommon({ ...common, praticaRef: e.target.value })} placeholder="es. PR-2026-001" style={bulkInputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CONTATTI</div>
            <input value={common.contact} onChange={e => setCommon({ ...common, contact: e.target.value })} placeholder="Telefono, email…" style={bulkInputStyle} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>SCADENZA</div>
            <DateTimePicker
              value={common.dueDate || null}
              onChange={iso => setCommon({ ...common, dueDate: iso || "" })}
              align={isMobile ? "left" : "right"}
            />
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
                  placeholder={commonDueLabel ? `${commonDueLabel} (comune)` : undefined}
                />
              </div>
              <textarea
                value={r.description}
                onChange={e => updateRow(r.key, "description", e.target.value)}
                rows={2}
                placeholder="Descrizione (facoltativa)…"
                style={bulkTextareaStyle}
              />
              <RowAttachments
                files={r.files}
                onAdd={fl => addRowFiles(r.key, fl)}
                onRemove={i => removeRowFile(r.key, i)}
                disabled={busy}
              />
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
                placeholder={commonDueLabel || undefined}
              />
              <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
                background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
                fontSize: 14, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1,
              }}>✕</button>
              {/* Seconda riga della griglia: allineata sotto al titolo, senza
                  occupare le colonne del numero e del pulsante di rimozione. */}
              <textarea
                value={r.description}
                onChange={e => updateRow(r.key, "description", e.target.value)}
                rows={2}
                placeholder="Descrizione (facoltativa)…"
                style={{ ...bulkTextareaStyle, gridColumn: "2 / -2" }}
              />
              {/* Terza riga della griglia: allegati della singola task, allineati
                  sotto al titolo come la descrizione. */}
              <RowAttachments
                files={r.files}
                onAdd={fl => addRowFiles(r.key, fl)}
                onRemove={i => removeRowFile(r.key, i)}
                disabled={busy}
                style={{ gridColumn: "2 / -2" }}
              />
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
          <span>
            {validRows.length} task da creare
            {totalFiles > 0 && ` · ${totalFiles} allegat${totalFiles === 1 ? "o" : "i"}`}
          </span>
          {ignoredRows.length > 0 && (
            <span style={{ color: "var(--warning)", fontWeight: 600 }}>
              ⚠ {ignoredRows.length} rig{ignoredRows.length === 1 ? "a" : "he"} senza titolo {ignoredRows.length === 1 ? "verrà ignorata" : "verranno ignorate"}
              {ignoredRows.some(r => r.files.length > 0) && " (allegati compresi)"}
            </span>
          )}
          {fileError && <span style={{ color: "var(--danger)", fontWeight: 600 }}>{fileError}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || busy} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || busy) ? 0.5 : 1,
            cursor: (validRows.length === 0 || busy) ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Creazione…" : `✓ Crea ${validRows.length} task`}</button>
        </div>
      </div>
    </div>
  );
};
