// ─── ALLEGATI TASK ───────────────────────────────────────────────────────────
// Estratto da TaskSlideOver.jsx, dove era il secondo componente del file: 190
// righe con stato, upload e anteprime proprie, che con lo slide-over condividono
// solo il taskId. Non passa dal reducer, e non è una dimenticanza: gli allegati
// vivono nello storage, non nello stato applicativo — per questo `TaskFiles`
// resta fuori dal confine delle scritture dichiarato in eslint.config.js.
import { useState, useEffect, useRef, useCallback } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { TaskFiles } from "../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon, isWithinSizeLimit, sourceBadge, mediaKind } from "../../lib/fileUtils.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF11Bold = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 };
const txtF13Muted = { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" };
const colR8 = {
  display: "flex", flexDirection: "column",
  background: "var(--surface2)", borderRadius: 8, overflow: "stiliComuni.hidden",
};
const rowCenterGap10 = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" };
const txtF18 = { fontSize: 18, flexShrink: 0 };
const txtF13Bold = {
  fontSize: 13, fontWeight: 600, color: "var(--text)",
  overflow: "stiliComuni.hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const rowGap6F11 = { fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6, flexWrap: "wrap" };
const boxF15Navy = {
  background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 4, color: "var(--navy)",
};
const boxF13Muted = {
  background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 4, color: "var(--text-muted)",
};
const rowMiddle = { padding: "0 10px 10px", display: "flex", justifyContent: "center" };
const boxMaxWFullR6 = {
  maxWidth: "100%", maxHeight: 360, borderRadius: 6, objectFit: "contain",
};
const boxMaxWFullR62 = { maxWidth: "100%", maxHeight: 360, borderRadius: 6 };
const wFull = { width: "100%" };
const txtF11Light = { fontSize: 11, color: "var(--text-light)", marginTop: 4 };
const txtF12Danger = { fontSize: 12, color: "var(--danger)", marginTop: 6 };

export function TaskAttachments({ taskId, editable }) {
  const conferma = useConfirm();
  const { currentUserId } = useAppData();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  // Anteprima inline: id allegato espanso → signed URL caricata on-demand.
  const [previewId, setPreviewId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const inputRef = useRef(null);

  // Criticità #11: lo slide-over che ospita questo pannello si chiude con un
  // tap sull'overlay, e le risposte dello storage arrivano quando arrivano.
  const montato = useIsMounted();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await TaskFiles.listForTask(taskId);
    if (!montato()) return;
    if (!e) setFiles(data || []);
    setLoading(false);
  }, [taskId, montato]);

  useEffect(() => { load(); }, [load]);

  const handleFiles = async (fileList) => {
    const arr = Array.from(fileList || []);
    if (!arr.length) return;
    setError("");
    for (const f of arr) {
      if (!isWithinSizeLimit(f.size)) {
        setError(`"${f.name}" supera il limite di ${formatFileSize(MAX_TASK_FILE_SIZE)}`);
        continue;
      }
      setUploading(true);
      const { data, error: e } = await TaskFiles.upload(f, taskId, { uploadedBy: currentUserId });
      if (!montato()) return;
      setUploading(false);
      if (e) { setError(`Upload di "${f.name}" fallito: ${e.message || "errore"}`); continue; }
      if (data) setFiles(prev => [data, ...prev]);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDownload = async (file) => {
    const { url, error: e } = await TaskFiles.getFileUrl(file.file_url);
    if (url) window.open(url, "_blank", "noopener");
    else if (e) setError("Impossibile aprire il file");
  };

  const handleRemove = async (file) => {
    const ok = await conferma({
      title: "Eliminare l'allegato?",
      body: `"${file.file_name}" verrà rimosso definitivamente dallo storage.`,
      cta: "Elimina", danger: true,
    });
    if (!ok) return;
    const { error: e } = await TaskFiles.remove(file.id, file.file_url);
    if (e) setError("Eliminazione fallita");
    else {
      setFiles(prev => prev.filter(x => x.id !== file.id));
      if (previewId === file.id) setPreviewId(null);
    }
  };

  // Apre/chiude l'anteprima inline (immagine/audio/video). La signed URL viene
  // recuperata solo al primo click e poi riusata (anche dalla cache in api.js).
  const togglePreview = async (file) => {
    if (previewId === file.id) { setPreviewId(null); return; }
    setError("");
    if (!previewUrls[file.id]) {
      const { url, error: e } = await TaskFiles.getFileUrl(file.file_url);
      if (!url) { setError(e ? "Impossibile caricare l'anteprima" : ""); return; }
      setPreviewUrls(prev => ({ ...prev, [file.id]: url }));
    }
    setPreviewId(file.id);
  };

  return (
    <div>
      <div style={txtF11Bold}>
        ALLEGATI {files.length > 0 && `(${files.length})`}
      </div>

      {/* Lista allegati */}
      {loading ? (
        <div style={txtF13Muted}>Caricamento…</div>
      ) : files.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: editable ? 10 : 0 }}>
          {files.map(file => {
            const badge = sourceBadge(file.source);
            const kind = mediaKind(file.file_type || file.file_name);
            const isOpen = previewId === file.id;
            const url = previewUrls[file.id];
            return (
              <div key={file.id} style={colR8}>
                <div style={rowCenterGap10}>
                  <span style={txtF18}>{fileIcon(file.file_type || file.file_name)}</span>
                  <div className="vd-flex-1-min0">
                    <div style={txtF13Bold}>{file.file_name}</div>
                    <div style={rowGap6F11}>
                      {file.file_size != null && <span>{formatFileSize(file.file_size)}</span>}
                      {file.users?.name && <span>· {file.users.name.split(" ")[0]}</span>}
                      {badge && <span>· {badge}</span>}
                    </div>
                  </div>
                  {kind && (
                    <button onClick={() => togglePreview(file)} title={isOpen ? "Chiudi anteprima" : "Anteprima"} style={{
                      background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 4,
                      color: isOpen ? "var(--gold-dark)" : "var(--navy)",
                    }}>{isOpen ? "🔽" : "👁️"}</button>
                  )}
                  <button onClick={() => handleDownload(file)} title="Apri / scarica" style={boxF15Navy}>⬇️</button>
                  {editable && (
                    <button onClick={() => handleRemove(file)} title="Elimina allegato" style={boxF13Muted}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                    >🗑️</button>
                  )}
                </div>

                {/* Anteprima inline media (immagine / audio / video) */}
                {isOpen && url && (
                  <div style={rowMiddle}>
                    {kind === "image" && (
                      <img src={url} alt={file.file_name} style={boxMaxWFullR6} />
                    )}
                    {kind === "video" && (
                      <video src={url} controls style={boxMaxWFullR62} />
                    )}
                    {kind === "audio" && (
                      <audio src={url} controls style={wFull} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !editable && <div style={txtF13Muted}>Nessun allegato.</div>
      )}

      {/* Dropzone / upload (solo se può editare) */}
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={stiliComuni.hidden}
            onChange={e => handleFiles(e.target.files)}
          />
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragOver ? "var(--navy)" : "var(--border)"}`,
              borderRadius: 8, padding: "16px", textAlign: "center",
              color: dragOver ? "var(--navy)" : "var(--text-muted)", fontSize: 13,
              cursor: uploading ? "default" : "pointer",
              background: dragOver ? "var(--surface2)" : "transparent",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            {uploading ? "⏳ Caricamento in corso…" : "📎 Trascina file qui o clicca per caricare"}
          </div>
          <div style={txtF11Light}>
            Immagini, video, audio e documenti · max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
          </div>
        </>
      )}

      {error && (
        <div style={txtF12Danger}>{error}</div>
      )}
    </div>
  );
}
