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
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>
        ALLEGATI {files.length > 0 && `(${files.length})`}
      </div>

      {/* Lista allegati */}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>Caricamento…</div>
      ) : files.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: editable ? 10 : 0 }}>
          {files.map(file => {
            const badge = sourceBadge(file.source);
            const kind = mediaKind(file.file_type || file.file_name);
            const isOpen = previewId === file.id;
            const url = previewUrls[file.id];
            return (
              <div key={file.id} style={{
                display: "flex", flexDirection: "column",
                background: "var(--surface2)", borderRadius: 8, overflow: "hidden",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(file.file_type || file.file_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{file.file_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                  <button onClick={() => handleDownload(file)} title="Apri / scarica" style={{
                    background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 4, color: "var(--navy)",
                  }}>⬇️</button>
                  {editable && (
                    <button onClick={() => handleRemove(file)} title="Elimina allegato" style={{
                      background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 4, color: "var(--text-muted)",
                    }}
                      onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                    >🗑️</button>
                  )}
                </div>

                {/* Anteprima inline media (immagine / audio / video) */}
                {isOpen && url && (
                  <div style={{ padding: "0 10px 10px", display: "flex", justifyContent: "center" }}>
                    {kind === "image" && (
                      <img src={url} alt={file.file_name} style={{
                        maxWidth: "100%", maxHeight: 360, borderRadius: 6, objectFit: "contain",
                      }} />
                    )}
                    {kind === "video" && (
                      <video src={url} controls style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 6 }} />
                    )}
                    {kind === "audio" && (
                      <audio src={url} controls style={{ width: "100%" }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        !editable && <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>Nessun allegato.</div>
      )}

      {/* Dropzone / upload (solo se può editare) */}
      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            style={{ display: "none" }}
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
          <div style={{ fontSize: 11, color: "var(--text-light)", marginTop: 4 }}>
            Immagini, video, audio e documenti · max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}
