// src/components/tasks/bulk/ImportTab.jsx
// Import da CSV/Excel: parsing, mappatura colonne, anteprima, validazione.
// È la tab con più stato locale delle quattro — parsing, mapping e preview
// sono tre fasi che si passano dati a vicenda.
import { useState, useRef, useMemo, useEffect } from "react";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { PriorityBadge } from "../../ui/PriorityBadge.jsx";
import { STATUS_LABELS } from "../../../lib/taskConstants.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { readFirstSheetRows, MAX_IMPORT_BYTES } from "../../../lib/xlsx.js";
import { formatFileSize } from "../../../lib/fileUtils.js";
import {
  normCat, isRecognizedCat, normPrio, isRecognizedPrio, normStat, isRecognizedStat,
  normAssignee, normDate, detectColumns,
} from "../../../lib/bulkImport.js";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";
import * as stiliComuni from "../../../styles/common.js";
import {
  boxF12Bold, boxF12Warning, boxF13Danger, boxR8, boxR82, boxStickyBold, boxTxtCenterR12,
  boxW8H8, gridGap8, maxW180, mt4Op085, rowCenterBetween, rowCenterBetween3, rowCenterGap5,
  rowGap8F10, txt, txtBoldMb2, txtF10Bold, txtF10Bold3, txtF11Muted, txtF11WFull, txtF14Bold,
  txtF40Mb10, txtSuccess,
} from "./importTabStyles.js";


// ─── BULK: IMPORT TAB ──────────────────────────────────────────────────────
export const ImportTab = ({ onCreate, onClose, onCancel, onDirty }) => {
  const { team, categories } = useAppData();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [mapping, setMapping] = useState({});
  // Campi il cui abbinamento è stato indovinato automaticamente al caricamento:
  // li evidenziamo così l'operatore sa cosa verificare (e cosa mappare a mano).
  const [autoDetected, setAutoDetected] = useState({});
  // Errori della FASE DI LETTURA (file troppo grande, vuoto, illeggibile).
  // L'esito del salvataggio vive invece in `erroreImport` più sotto: i due
  // condividono un banner, non uno stato — il primo lo spegne chi carica un
  // file nuovo, il secondo si spegne al tentativo successivo.
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { onDirty?.(rows.length > 0); }, [rows.length, onDirty]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Il limite dentro readFirstSheetRows scatta solo dopo che FileReader ha già
    // caricato l'intero file in memoria: su un file da centinaia di MB il tab
    // resterebbe comunque a corto di risorse prima ancora di arrivare al parse.
    // file.size è sincrono e non richiede di leggere il file: il rifiuto arriva
    // prima di qualunque lettura, non dopo.
    if (file.size > MAX_IMPORT_BYTES) {
      setError(`File troppo grande (${formatFileSize(file.size)}, max ${formatFileSize(MAX_IMPORT_BYTES)}).`);
      e.target.value = "";
      return;
    }
    setFileName(file.name);
    setError(null);
    // Anche l'esito di un import precedente: il banner è uno solo, e un file
    // nuovo rende stantio qualunque messaggio lo stia occupando.
    azzeraErroreImport();
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
      if (mapping.category && r[mapping.category] && !isRecognizedCat(categories, r[mapping.category])) badCategory++;
      if (mapping.priority && r[mapping.priority] && !isRecognizedPrio(r[mapping.priority])) badPriority++;
      if (mapping.status && r[mapping.status] && !isRecognizedStat(r[mapping.status])) badStatus++;
      if (mapping.dueDate && r[mapping.dueDate] && !normDate(r[mapping.dueDate])) badDate++;
      if (mapping.assignee && String(r[mapping.assignee] || "").trim() && !normAssignee(team, r[mapping.assignee])) badAssignee++;
    }
    const total = badCategory + badPriority + badStatus + badDate + badAssignee;
    return total > 0 ? { badCategory, badPriority, badStatus, badDate, badAssignee } : null;
  }, [validRows, mapping, team, categories]);

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
      const assigneeId = mapping.assignee ? normAssignee(team, r[mapping.assignee]) : null;
      return {
        title: String(r[mapping.title]).trim(),
        category: normCat(categories, mapping.category ? r[mapping.category] : null),
        priority: normPrio(mapping.priority ? r[mapping.priority] : null),
        status: normStat(mapping.status ? r[mapping.status] : null),
        client: mapping.client ? String(r[mapping.client] || "").trim() : "",
        due, dueLost: !!(dueRaw && !due),
        assigneeId, assigneeLost: !!(assigneeRaw && !assigneeId),
      };
    });
  }, [validRows, mapping, team, categories]);

  // Il freno al doppio invio, l'attesa a schermo e il «file e mappatura sono
  // ancora qui» vengono da useSalvataggio (A-2 dell'audit del 23 agosto,
  // secondo passaggio): erano `busyRef` + `busy` scritti a mano, con il
  // teardown ricopiato in quattro punti di uscita e nessun `finally` — un
  // throw di `onCreate` lasciava `busyRef` a `true` per sempre, cioè la modale
  // viva col bottone spento e nessun messaggio. Qui il costo era il più alto
  // delle quattro tab: ricaricare significa ricaricare il CSV e rimappare
  // tutte le colonne.
  const { salva, azzera: azzeraErroreImport, inVolo: busy, errore: erroreImport } = useSalvataggio(
    // Import fallito: il modale resta aperto con file e mappatura intatti,
    // altrimenti l'operatore dovrebbe ricaricare il CSV e rimappare tutto.
    (tasks) => onCreate(tasks),
    {
      alSuccesso: onClose,
      messaggioErrore: (e) =>
        `Importazione non riuscita: ${e?.message || "errore sconosciuto"}. Il file e la mappatura sono ancora qui, riprova.`,
    },
  );

  const handleCreate = () => {
    const tasks = validRows.map((r) => {
      const assignee = mapping.assignee ? normAssignee(team, r[mapping.assignee]) : null;
      return {
        id: crypto.randomUUID(),
        title: String(r[mapping.title]).trim(),
        category: normCat(categories, mapping.category ? r[mapping.category] : null),
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
    // Zero task da importare non è né un successo né un errore: resta un no-op
    // silenzioso come prima. Il guard sta QUI e non dentro `esegui` perché per
    // useSalvataggio un ritorno senza errore è un successo, e chiuderebbe la
    // modale senza aver importato nulla.
    if (!tasks.length) return;
    return salva(tasks);
  };

  // `azzeraErroreImport` insieme a `setError(null)`: i due messaggi
  // condividono il banner, e cambiare file deve spegnerlo qualunque delle due
  // fasi l'abbia acceso.
  const reset = () => { setRows([]); setColumns([]); setMapping({}); setAutoDetected({}); setFileName(""); setError(null); azzeraErroreImport(); };

  const fields = [
    { key: "title", label: "Titolo *" }, { key: "category", label: "Categoria" },
    { key: "priority", label: "Priorità" }, { key: "status", label: "Stato" },
    { key: "client", label: "Cliente" }, { key: "dueDate", label: "Scadenza" },
    { key: "assignee", label: "Assegnato" },
    { key: "description", label: "Descrizione" },
    { key: "contact", label: "Contatti" },
  ];

  return (
    <div style={stiliComuni.colGap14}>
      {!rows.length && (
        <div onClick={() => fileInputRef.current?.click()} style={boxTxtCenterR12}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold)"; e.currentTarget.style.background = "rgba(212,168,67,0.04)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; }}
        >
          <div style={txtF40Mb10}>📥</div>
          <div style={txtF14Bold}>Clicca per caricare CSV o Excel</div>
          <div style={stiliComuni.txtF12Muted}>Formati supportati: .csv, .xlsx, .xls</div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); downloadTemplate(); }}
            style={boxF12Bold}
          >⬇ Scarica un file modello</button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} style={stiliComuni.hidden} />
        </div>
      )}

      {/* Un banner, due fasi: lettura del file ed esito dell'import. Sono
          mutuamente esclusivi nei fatti — senza righe lette non c'è nulla da
          importare — ma restano due stati distinti, perché si spengono in
          momenti diversi. */}
      {(error || erroreImport) && (
        <div style={boxF13Danger}>
          ⚠️ {error || erroreImport}
        </div>
      )}

      {importWarnings && (
        <div style={boxF12Warning}>
          <div style={txtBoldMb2}>⚠️ Valori non riconosciuti nel file</div>
          {importWarnings.badCategory > 0 && <div>{importWarnings.badCategory} righe con categoria non riconosciuta → verrà usata "Amministrazione"</div>}
          {importWarnings.badPriority > 0 && <div>{importWarnings.badPriority} righe con priorità non riconosciuta → verrà usata "Media"</div>}
          {importWarnings.badStatus > 0 && <div>{importWarnings.badStatus} righe con stato non riconosciuto → verrà usato "Da fare"</div>}
          {importWarnings.badDate > 0 && <div>{importWarnings.badDate} righe con data non interpretabile → scadenza lasciata vuota</div>}
          {importWarnings.badAssignee > 0 && <div>{importWarnings.badAssignee} righe con assegnatario non trovato nel team → task lasciata non assegnata</div>}
          <div style={mt4Op085}>Controlla l'anteprima sotto prima di importare, o correggi il file sorgente.</div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div style={rowCenterBetween}>
            <div style={stiliComuni.txtF13}>📄 <strong>{fileName}</strong> — {rows.length} righe, {columns.length} colonne</div>
            <button onClick={reset} style={stiliComuni.btnOutlineMini}>Cambia file</button>
          </div>

          <div>
            <div style={rowCenterBetween3}>
              <div style={txtF10Bold}>MAPPATURA COLONNE</div>
              <div style={rowCenterGap5}>
                <span style={boxW8H8} />
                rilevato automaticamente — verifica
              </div>
            </div>
            <div style={gridGap8}>
              {fields.map(f => {
                const isAuto = autoDetected[f.key] && mapping[f.key];
                return (
                  <div key={f.key}>
                    <div style={txtF10Bold3}>
                      {f.label}{isAuto && <span style={txtSuccess}>✓</span>}
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
              <div style={stiliComuni.txtF10Bold2}>
                ANTEPRIMA TASK — COME VERRANNO CREATI
              </div>
              <div style={boxR8}>
                {normalizedPreview.map((t, i) => {
                  const assigneeName = t.assigneeId ? (team.find(m => m.id === t.assigneeId)?.name || t.assigneeId) : null;
                  return (
                    <div key={i} style={{
                      padding: "8px 12px", borderBottom: i === normalizedPreview.length - 1 ? "none" : "1px solid var(--border)",
                      display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                    }}>
                      <span style={stiliComuni.txtF14}>{categories[t.category]?.icon}</span>
                      <div className="vd-flex-1-min0">
                        <div style={txt}>{t.title}</div>
                        <div style={rowGap8F10}>
                          <span>{categories[t.category]?.label}</span>
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
                <div style={txtF11Muted}>
                  …e altri {validRows.length - normalizedPreview.length} task non mostrati in anteprima.
                </div>
              )}
            </div>
          )}

          <div>
            <div style={stiliComuni.txtF10Bold2}>
              FILE SORGENTE (prime 5 righe)
            </div>
            <div style={boxR82}>
              <table style={txtF11WFull}>
                <thead>
                  <tr>{columns.map(c => (
                    <th key={c} style={boxStickyBold}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>{columns.map(c => (
                      <td key={c} style={maxW180}>
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

      <div style={stiliComuni.rowCenterBetween2}>
        <div style={stiliComuni.txtF12Muted}>
          {validRows.length} task validi {!mapping.title && rows.length > 0 && "(mappa il TITOLO)"}
        </div>
        <div style={stiliComuni.rowGap8}>
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
