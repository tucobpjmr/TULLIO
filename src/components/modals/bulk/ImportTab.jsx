// src/components/modals/bulk/ImportTab.jsx
// Import da CSV/Excel: parsing, mappatura colonne, anteprima, validazione.
// È la tab con più stato locale delle quattro — parsing, mapping e preview
// sono tre fasi che si passano dati a vicenda.
import { useState, useRef, useMemo, useEffect } from "react";
import { PriorityBadge } from "../../ui/PriorityBadge.jsx";
import { STATUS_LABELS } from "../../../lib/taskConstants.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { TEAM, CATEGORIES } from "../../../state/appGlobals.js";
import { readFirstSheetRows } from "../../../lib/xlsx.js";
import {
  normCat, isRecognizedCat, normPrio, isRecognizedPrio, normStat, isRecognizedStat,
  normAssignee, normDate, detectColumns,
} from "../../../lib/bulkImport.js";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";


// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
export const ImportTab = ({ onCreate, onClose, onCancel, onDirty }) => {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  // Campi il cui abbinamento è stato indovinato automaticamente al caricamento:
  // li evidenziamo così l'operatore sa cosa verificare (e cosa mappare a mano).
  const [autoDetected, setAutoDetected] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
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
        const auto = detectColumns(cols);
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
      if (mapping.category && r[mapping.category] && !isRecognizedCat(CATEGORIES, r[mapping.category])) badCategory++;
      if (mapping.priority && r[mapping.priority] && !isRecognizedPrio(r[mapping.priority])) badPriority++;
      if (mapping.status && r[mapping.status] && !isRecognizedStat(r[mapping.status])) badStatus++;
      if (mapping.dueDate && r[mapping.dueDate] && !normDate(r[mapping.dueDate])) badDate++;
      if (mapping.assignee && String(r[mapping.assignee] || "").trim() && !normAssignee(TEAM, r[mapping.assignee])) badAssignee++;
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
      const assigneeId = mapping.assignee ? normAssignee(TEAM, r[mapping.assignee]) : null;
      return {
        title: String(r[mapping.title]).trim(),
        category: normCat(CATEGORIES, mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        client: mapping.client ? String(r[mapping.client] || "").trim() : "",
        due, dueLost: !!(dueRaw && !due),
        assigneeId, assigneeLost: !!(assigneeRaw && !assigneeId),
      };
    });
  }, [validRows, mapping]);

  const handleCreate = async () => {
    if (busy) return;
    const tasks = validRows.map((r) => {
      const assignee = mapping.assignee ? normAssignee(TEAM, r[mapping.assignee]) : null;
      return {
        id: crypto.randomUUID(),
        title: String(r[mapping.title]).trim(),
        category: normCat(CATEGORIES, mapping.category ? r[mapping.category] : null),
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
    if (!tasks.length) return;
    setBusy(true);
    setError(null);
    const result = await onCreate(tasks);
    // Import fallito: il modale resta aperto con file e mappatura intatti,
    // altrimenti l'operatore dovrebbe ricaricare il CSV e rimappare tutto.
    if (result && result.error) {
      setError(`Importazione non riuscita: ${result.error.message || "errore sconosciuto"}. Il file e la mappatura sono ancora qui, riprova.`);
      setBusy(false);
      return;
    }
    setBusy(false);
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
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || !mapping.title || busy} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || !mapping.title || busy) ? 0.5 : 1,
            cursor: (validRows.length === 0 || !mapping.title || busy) ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Importazione…" : `✓ Importa ${validRows.length} task`}</button>
        </div>
      </div>
    </div>
  );
};
