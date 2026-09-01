// src/components/tasks/bulk/ManualTab.jsx
// Inserimento a mano: N righe con impostazioni comuni e override per riga.
import { useState, useEffect } from "react";
import { useViewport } from "../../ui/Viewport.jsx";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { clientContact } from "../../../lib/taskUtils.js";
import { nuovoTask } from "../../../lib/tasks/nuovoTask.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { DateTimePicker, formatPickerValue } from "../../ui/DateTimePicker.jsx";
import { TaskFiles } from "../../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, isWithinSizeLimit } from "../../../lib/fileUtils.js";
import { bulkInputStyle, bulkTextareaStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";
import { RowAttachments } from "./RowAttachments.jsx";
import { useClientSuggestions, ClientSuggestions } from "../../ui/ClientAutocomplete.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const colGap16 = { display: "flex", flexDirection: "column", gap: 16 };
const boxR10 = { background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" };
const gridGap6F10 = { display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "0 4px", letterSpacing: 0.5 };
const txtF11Bold = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0 };
const txtF105Bold = { fontSize: 10.5, color: "var(--warning)", fontWeight: 600 };
const grid2ColGap8 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 };
const gridCenterGap6 = { display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" };
const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", textAlign: "center" };
const gridColumn2 = { gridColumn: "2 / -2" };
const boxF125Bold = {
  background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
  padding: "9px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
  color: "var(--text-muted)", marginTop: 4,
};
const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)", flexWrap: "wrap", gap: 8 };
const txtBoldWarning = { color: "var(--warning)", fontWeight: 600 };


// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
export const ManualTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const { categories, currentUserId, getAssignableTeam } = useAppData();
  const { isMobile } = useViewport();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "", praticaRef: "", contact: "", dueDate: "" });
  const cli = useClientSuggestions(clients, common.client);
  const pickClient = (c) => {
    setCommon(p => ({ ...p, client: c.name, contact: p.contact.trim() ? p.contact : clientContact(c) }));
    cli.close();
  };
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", description: "", category: "", priority: "", assignee: "", dueDate: "", files: [] });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  // Allegati scartati perché oltre il limite del bucket. È una validazione
  // PRE-VOLO, non l'esito di un salvataggio: vive separata da `errore` di
  // useSalvataggio, che si azzera all'inizio di ogni tentativo. Finché le due
  // cose condividevano uno stato solo, premere «Crea» cancellava in silenzio
  // l'avviso sui file scartati — cioè l'unico posto in cui era scritto che
  // quegli allegati non sarebbero partiti.
  const [avvisoDimensioni, setAvvisoDimensioni] = useState("");
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
    setAvvisoDimensioni(tooBig.length
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
  const commonCatLabel = categories[common.category]?.label || "categoria";
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

  // Creazione: il freno al doppio invio, l'attesa a schermo e il "i dati sono
  // ancora qui" vengono da useSalvataggio (A-2 dell'audit del 23 agosto,
  // secondo passaggio). Prima erano `busyRef` + `busy` + `fileError` scritti a
  // mano, con il teardown `busyRef.current = false; setBusy(false)` ricopiato
  // in quattro punti di uscita e nessun try: se `onCreate` o `TaskFiles.upload`
  // SOLLEVAVA — rete che cade a metà upload — nessuno dei quattro veniva
  // raggiunto, `busyRef` restava `true` per sempre e la guardia in testa
  // rifiutava ogni tentativo successivo. Modale viva, bottone spento, nessun
  // messaggio, e l'unica via d'uscita era ricaricare perdendo tutte le righe.
  // È il caso che il docblock di useSalvataggio dichiara di chiudere, e questo
  // file lo citava in un commento senza importarlo.
  const { salva: handleCreate, inVolo: busy, errore: fileError, avviso, bloccato } = useSalvataggio(
    async () => {
      // Gli uuid li genera `nuovoTask` e il dispatch li conserva perché già
      // validi, così conosciamo l'id definitivo di ogni task e possiamo
      // caricarci gli allegati (il path nel bucket e la RLS partono dal
      // task_id). Trim, "vuoto → null" e conversione della data a ISO stanno
      // lì: qui resta la sola regola di QUESTA tab, cioè che il valore della
      // riga vince su quello comune.
      const prepared = validRows.map((r) => ({
        files: r.files,
        task: nuovoTask({
          title: r.title,
          category: r.category || common.category,
          priority: r.priority || common.priority,
          assignees: [r.assignee || common.assignee],
          client: common.client,
          praticaRef: common.praticaRef,
          contact: common.contact,
          dueDate: r.dueDate || common.dueDate,
          description: r.description,
        }),
      }));

      const result = await onCreate(prepared.map(p => p.task));

      // Creazione fallita: niente upload (senza la riga task la RLS del bucket
      // rifiuterebbe comunque) e soprattutto il modale RESTA APERTO con i dati
      // inseriti. Prima si chiudeva comunque: le task sparivano al reload e
      // l'unico segnale era un toast che passava inosservato.
      if (result?.error) return result;

      for (const { task, files } of prepared.filter(p => p.files.length > 0)) {
        for (const f of files) {
          const { error } = await TaskFiles.upload(f, task.id, { uploadedBy: currentUserId });
          // `avviso` e non `error`: le task ESISTONO già. Il ramo precedente
          // rimetteva `busyRef` a false, quindi «Crea» tornava premibile e un
          // secondo tentativo creava un SECONDO batch identico. `avviso` alza
          // `bloccato` e non lo riabbassa: il pannello resta aperto per dire
          // dov'è finito l'allegato mancante, e la creazione non riparte.
          if (error) return {
            avviso: `Task create, ma l'upload di "${f.name}" su "${task.title}" è fallito. Riprova dal dettaglio della task.`,
          };
        }
      }
      return { error: null };
    },
    {
      alSuccesso: onClose,
      messaggioErrore: (e) =>
        `Creazione non riuscita: ${e?.message || "errore sconosciuto"}. I dati sono ancora qui, riprova.`,
    },
  );

  return (
    <div style={colGap16}>
      <div style={boxR10}>
        <div style={stiliComuni.etichettaSezione}>
          IMPOSTAZIONI COMUNI (usate se la riga non specifica)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
          <div style={stiliComuni.relative}>
            <input
              value={common.client}
              onChange={e => setCommon({ ...common, client: e.target.value })}
              placeholder={clients.length ? "Cerca in anagrafica…" : "Cliente"}
              style={bulkInputStyle}
              {...cli.inputProps}
            />
            <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} compact />
          </div>
          <select value={common.category} onChange={e => setCommon({ ...common, category: e.target.value })} style={bulkInputStyle}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
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
            <div style={stiliComuni.txtF10Bold}>N° PRATICA</div>
            <input value={common.praticaRef} onChange={e => setCommon({ ...common, praticaRef: e.target.value })} placeholder="es. PR-2026-001" style={bulkInputStyle} />
          </div>
          <div>
            <div style={stiliComuni.txtF10Bold}>CONTATTI</div>
            <input value={common.contact} onChange={e => setCommon({ ...common, contact: e.target.value })} placeholder="Telefono, email…" style={bulkInputStyle} />
          </div>
          <div>
            <div style={stiliComuni.txtF10Bold}>SCADENZA</div>
            <DateTimePicker
              value={common.dueDate || null}
              onChange={iso => setCommon({ ...common, dueDate: iso || "" })}
              align={isMobile ? "left" : "right"}
              ariaLabel="Scadenza (comune a tutte le righe)"
            />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 6 }}>
        {!isMobile && (
          <div style={gridGap6F10}>
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
              <div style={stiliComuni.rowCenterGap8}>
                <span style={txtF11Bold}>#{idx + 1}</span>
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
                <div style={txtF105Bold}>⚠ Aggiungi un titolo o questa riga verrà ignorata</div>
              )}
              <div style={grid2ColGap8}>
                <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                  <option value="">{commonCatLabel} (comune)</option>
                  {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
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
                  ariaLabel={`Scadenza riga ${idx + 1}`}
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
            <div key={r.key} style={gridCenterGap6}>
              <div style={txtF11Muted}>{idx + 1}</div>
              <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={{
                ...bulkInputStyle,
                borderColor: !r.title.trim() && rowHasData(r) ? "var(--warning)" : "var(--border)",
              }} title={!r.title.trim() && rowHasData(r) ? "Aggiungi un titolo o la riga verrà ignorata" : undefined} />
              <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
                <option value="">{commonCatLabel}</option>
                {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
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
                ariaLabel={`Scadenza riga ${idx + 1}`}
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
                style={gridColumn2}
              />
            </div>
          )
        ))}
        <button onClick={addRow} style={boxF125Bold}>+ Aggiungi riga</button>
      </div>

      <div style={rowCenterBetween}>
        <div style={stiliComuni.colGap2F12}>
          <span>
            {validRows.length} task da creare
            {totalFiles > 0 && ` · ${totalFiles} allegat${totalFiles === 1 ? "o" : "i"}`}
          </span>
          {ignoredRows.length > 0 && (
            <span style={txtBoldWarning}>
              ⚠ {ignoredRows.length} rig{ignoredRows.length === 1 ? "a" : "he"} senza titolo {ignoredRows.length === 1 ? "verrà ignorata" : "verranno ignorate"}
              {ignoredRows.some(r => r.files.length > 0) && " (allegati compresi)"}
            </span>
          )}
          {avvisoDimensioni && <span style={stiliComuni.txtBoldDanger}>{avvisoDimensioni}</span>}
          {fileError && <span style={stiliComuni.txtBoldDanger}>{fileError}</span>}
          {/* Riuscito a metà: le task ci sono, un allegato no. Non è un errore
              da riprovare — è un'istruzione su dove recuperare il pezzo
              mancante — quindi ha il colore dell'avviso e non del pericolo. */}
          {avviso && <span style={txtBoldWarning}>{avviso}</span>}
        </div>
        <div style={stiliComuni.rowGap8}>
          {/* «Annulla» resta premibile anche da `bloccato`: è la sola via
              d'uscita quando la creazione è riuscita a metà. */}
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0 || busy || bloccato} style={{
            ...bulkBtnPrimary,
            opacity: (validRows.length === 0 || busy || bloccato) ? 0.5 : 1,
            cursor: (validRows.length === 0 || busy || bloccato) ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Creazione…" : `✓ Crea ${validRows.length} task`}</button>
        </div>
      </div>
    </div>
  );
};
