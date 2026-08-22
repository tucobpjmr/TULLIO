// src/components/modals/bulk/RowAttachments.jsx
// Allegati di una singola riga in creazione.
import { useRef } from "react";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon } from "../../../lib/fileUtils.js";
import { bulkAttachBtn, bulkFileChip } from "./bulkStyles.js";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const flexShrink2 = { flexShrink: 0 };
const minW0 = { overflow: "stiliComuni.hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
const txtMuted = { color: "var(--text-muted)", flexShrink: 0 };


// ─── BULK: ALLEGATI DI RIGA ────────────────────────────────────────────────
// I file scelti qui restano in memoria: l'upload richiede l'UUID definitivo
// della task (path `<task_id>/…` e policy RLS del bucket 'task-files'), quindi
// avviene in handleCreate subito dopo la persistenza — stesso schema di
// QuickAddTask per la creazione singola.
export const RowAttachments = ({ files, onAdd, onRemove, disabled, style }) => {
  const inputRef = useRef(null);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 0, ...style }}>
      <input
        ref={inputRef}
        type="file"
        multiple
        style={stiliComuni.hidden}
        onChange={e => { onAdd(e.target.files); if (inputRef.current) inputRef.current.value = ""; }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title={`Allega file a questa task · max ${formatFileSize(MAX_TASK_FILE_SIZE)} per file`}
        style={{ ...bulkAttachBtn, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >📎 Allega{files.length > 0 ? ` (${files.length})` : ""}</button>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} style={bulkFileChip} title={`${f.name} · ${formatFileSize(f.size)}`}>
          <span style={flexShrink2}>{fileIcon(f.type || f.name)}</span>
          <span style={minW0}>{f.name}</span>
          <span style={txtMuted}>{formatFileSize(f.size)}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onRemove(i)}
            aria-label={`Rimuovi ${f.name}`}
            title="Rimuovi"
            style={{
              background: "none", border: "none", padding: 0, marginLeft: 2, fontSize: 11,
              color: "var(--text-muted)", flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer",
            }}
          >✕</button>
        </span>
      ))}
    </div>
  );
};
