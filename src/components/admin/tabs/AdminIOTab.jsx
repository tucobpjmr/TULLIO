// src/components/admin/tabs/AdminIOTab.jsx
// Import/export di task e backup completo dello stato.
// Il backup in ingresso passa da validateBackup: un JSON arbitrario che
// sostituisce team e categorie è la cosa più pericolosa che l'app accetti.
import { useState, useRef } from "react";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useTasks } from "../../../state/TasksContext.jsx";
import { cardStyle, cardH, cardP, btnPrimary, btnWarning } from "../adminStyles.js";
import { validateBackup } from "../../../lib/backupValidation.js";
import { loadXLSX } from "../../../lib/xlsx.js";
import { downloadFile, escapeCSV } from "../adminExport.js";
import { useConfirm } from "../../../state/ConfirmContext.jsx";
import { hidden } from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const gridGap20 = { display: "grid", gap: 20 };
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 };
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", marginBottom: 12 };
const rowGap10 = { display: "flex", gap: 10 };
const boxF12Muted = { fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" };
const txtF11Danger = { fontSize: 11, color: "var(--danger)", marginTop: 10 };

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
// `agencyName` e `notices` arrivano come prop perché sono le uniche due fette
// dello state che il backup usa e che non vivono già in un contesto: team,
// categorie e utente corrente sono in AppDataContext, i task in TasksContext.
export const AdminIOTab = ({ dispatch, agencyName, notices = [] }) => {
  const conferma = useConfirm();
  const { getMember, team, categories } = useAppData();
  const tasks = useTasks();
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? tasks : tasks.filter(t => !t.deletedAt);

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "",
      (t.assignees || []).join("|"),
      (t.description || "").replace(/\n/g, " "),
      t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "",
      Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Assegnati: (t.assignees || []).map(a => getMember(a)?.name || a).join(", "),
      Descrizione: t.description || "",
      Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.5",
      exportedAt: new Date().toISOString(),
      agencyName,
      tasks,
      team,
      categories,
      notices,
    };
    downloadFile(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`
    );
  };

  // Criticità #8: due `window.confirm` e un `alert` in un solo flusso. Il
  // secondo confirm era anche il caso peggiore per un modale di sistema —
  // ci finiva dentro un elenco di problemi lungo fino a dieci righe, in una
  // finestra che non sa formattare né far scorrere il testo.
  const importBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Il campo va azzerato SUBITO: fra l'apertura della conferma e la
    // risposta passa tempo reale (prima il thread era bloccato e la cosa non
    // si poneva), e senza reset ri-selezionare lo stesso file non emette un
    // nuovo `change`.
    e.target.value = "";
    const procedi = await conferma({
      title: "Ripristinare questo backup?",
      body: "Il ripristino UNISCE il backup ai dati correnti: i record con lo stesso id/chiave (task, categorie, avvisi) vengono aggiornati, i nuovi aggiunti. Nulla viene eliminato.",
      cta: "Ripristina",
    });
    if (!procedi) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const { fatalError, sanitized, warnings } = validateBackup(data);
        if (fatalError) throw new Error(fatalError);
        if (warnings.length > 0) {
          const MAX_SHOWN = 10;
          const preview = warnings.slice(0, MAX_SHOWN).join("\n")
            + (warnings.length > MAX_SHOWN ? `\n… e altri ${warnings.length - MAX_SHOWN} problemi` : "");
          const proceed = await conferma({
            title: `Il backup contiene ${warnings.length} problema/i`,
            body: `Righe non valide o non riconosciute:\n\n${preview}\n\nLe righe interessate verranno escluse o corrette con valori di default.`,
            cta: "Ripristina comunque",
            danger: true,
          });
          if (!proceed) return;
        }
        dispatch({ type: "RESTORE_BACKUP", payload: sanitized });
      } catch (err) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Ripristino non riuscito: ${err.message}` } });
      }
    };
    reader.readAsText(file);
  };

  const total = tasksToExport().length;

  return (
    <div style={gridGap20}>
      {/* Export task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={rowCenterGap8}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={txtF12Muted}>
          📦 <b>{total}</b> task pronti per l'export
        </div>
        <div style={rowGap10}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      {/* Import task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={boxF12Muted}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      {/* Backup completo */}
      <div style={cardStyle}>
        <h3 style={cardH}>💾 Backup &amp; Restore completo</h3>
        <p style={cardP}>Esporta o ripristina <b>tutto lo stato dell'applicazione</b> (task, team, categorie, impostazioni) come file JSON.</p>
        <div style={rowGap10}>
          <button onClick={exportBackup} style={btnPrimary}>⬇️ Esporta backup JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnWarning}>⬆️ Ripristina da backup</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={hidden} />
        </div>
        <div style={txtF11Danger}>
          ⚠️ Il ripristino sovrascrive completamente i dati correnti. Esporta prima un backup di sicurezza.
        </div>
      </div>
    </div>
  );
};
