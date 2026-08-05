// src/components/modals/bulk/RowAttachments.jsx
// Allegati di una singola riga in creazione.
import { useRef } from "react";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon } from "../../../lib/fileUtils.js";
import { bulkAttachBtn, bulkFileChip } from "./bulkStyles.js";


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
        style={{ display: "none" }}
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
          <span style={{ flexShrink: 0 }}>{fileIcon(f.type || f.name)}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{f.name}</span>
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{formatFileSize(f.size)}</span>
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
