// ─── TASK SLIDE OVER ─────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useEffect, useRef, useCallback } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { STATUSES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue } from "../../lib/taskUtils.js";
import { CURRENT_USER, getMember, getAssignableTeam, canEditTask } from "../../state/appGlobals.js";
import { MentionText } from "../ui/MentionText.jsx";
import { TaskFiles } from "../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon, isWithinSizeLimit, sourceBadge } from "../../lib/fileUtils.js";

// ─── Allegati task (Block 5) ─────────────────────────────────────────────────
// Sub-componente module-local: gestisce il proprio stato (lista/loading/upload)
// e parla direttamente con l'API TaskFiles. Non passa dal reducer perché gli
// allegati vivono nello storage, non nello stato applicativo.
function TaskAttachments({ taskId, editable }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await TaskFiles.listForTask(taskId);
    if (!e) setFiles(data || []);
    setLoading(false);
  }, [taskId]);

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
      const { data, error: e } = await TaskFiles.upload(f, taskId, { uploadedBy: CURRENT_USER });
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
    if (!window.confirm(`Eliminare "${file.file_name}"?`)) return;
    const { error: e } = await TaskFiles.remove(file.id, file.file_url);
    if (e) setError("Eliminazione fallita");
    else setFiles(prev => prev.filter(x => x.id !== file.id));
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
            return (
              <div key={file.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                background: "var(--surface2)", borderRadius: 8,
              }}>
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
            Max {formatFileSize(MAX_TASK_FILE_SIZE)} per file.
          </div>
        </>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>{error}</div>
      )}
    </div>
  );
}

export const TaskSlideOver = ({ task, dispatch }) => {
  const { isMobile } = useViewport();
  const [newComment, setNewComment] = useState("");
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);

  if (!task) return null;

  const editable = canEditTask(task, CURRENT_USER);
  const currentAssignees = task.assignees || [];
  const availableMembers = editable
    ? getAssignableTeam().filter(m => !currentAssignees.includes(m.id))
    : [];

  const updateAssignees = (next) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, assignees: next } });
  };
  const addAssignee = (memberId) => {
    if (!memberId || currentAssignees.includes(memberId)) return;
    updateAssignees([...currentAssignees, memberId]);
    setShowAssigneePicker(false);
  };
  const removeAssignee = (memberId) => {
    updateAssignees(currentAssignees.filter(id => id !== memberId));
  };

  const handleComment = () => {
    if (!newComment.trim()) return;
    const authorName = getMember(CURRENT_USER)?.name || "Utente";
    dispatch({
      type: "ADD_COMMENT", payload: {
        taskId: task.id,
        comment: { user: authorName, text: newComment, time: new Date().toISOString() }
      }
    });
    setNewComment("");
  };

  const handleStatusChange = (e) => {
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: e.target.value } });
  };

  const handleDelete = () => {
    if (window.confirm(`Spostare nel cestino "${task.title}"?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
  };

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 500 }} />
      <div className="slide-right" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480, height: "100vh",
        background: "var(--card)", zIndex: 600, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "var(--navy)", padding: "18px 22px",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0
        }}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <CategoryChip category={task.category} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", background: "#FEE2E2", padding: "2px 8px", borderRadius: 99 }}>⚠️ Scaduto</span>}
            </div>
            <div className="playfair" style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={handleDelete} title="Sposta nel cestino" style={{
              background: "rgba(220,38,38,0.15)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
              transition: "background 0.2s"
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.4)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(220,38,38,0.15)"}
            >🗑️</button>
            <button onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Status select */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>STATO</div>
              <select value={task.status} onChange={handleStatusChange} style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                background: "var(--card)", cursor: "pointer"
              }}>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isOverdue(task) ? "var(--danger)" : "var(--text-muted)", marginBottom: 6 }}>
                SCADENZA {isOverdue(task) && "⚠️"}
              </div>
              <input
                type="datetime-local"
                value={task.dueDate ? task.dueDate.slice(0, 16) : ""}
                onChange={e => dispatch({ type: "UPDATE_TASK", payload: { id: task.id, dueDate: e.target.value ? new Date(e.target.value).toISOString() : null } })}
                style={{
                  width: "100%", border: `1px solid ${isOverdue(task) ? "var(--danger)" : "var(--border)"}`,
                  borderRadius: 8, padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                  background: isOverdue(task) ? "#FFF5F5" : "var(--card)", cursor: "pointer",
                  color: isOverdue(task) ? "var(--danger)" : "var(--text)", fontWeight: isOverdue(task) ? 600 : 400,
                }}
              />
            </div>
          </div>

          {/* Meta */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>ASSEGNATI</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {currentAssignees.map(id => {
                  const m = getMember(id);
                  return m ? (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface2)", padding: "4px 8px", borderRadius: 99 }}>
                      <Avatar memberId={id} size={20} />
                      <span style={{ fontSize: 12 }}>{m.name.split(" ")[0]}</span>
                      {editable && (
                        <button
                          onClick={() => removeAssignee(id)}
                          title="Rimuovi assegnatario"
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "var(--text-muted)", fontSize: 12, lineHeight: 1, padding: 0,
                            marginLeft: 2,
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                        >✕</button>
                      )}
                    </div>
                  ) : null;
                })}
                {!currentAssignees.length && (
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Non assegnato</span>
                )}
                {editable && availableMembers.length > 0 && (
                  <button
                    onClick={() => setShowAssigneePicker(v => !v)}
                    title="Aggiungi assegnatario"
                    style={{
                      background: showAssigneePicker ? "var(--navy)" : "var(--surface2)",
                      color: showAssigneePicker ? "#fff" : "var(--navy)",
                      border: "1px dashed var(--border)", borderRadius: 99,
                      padding: "4px 10px", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >＋ Aggiungi</button>
                )}
              </div>
              {editable && showAssigneePicker && availableMembers.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 10,
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 6,
                  minWidth: 180, maxHeight: 220, overflowY: "auto",
                }}>
                  {availableMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addAssignee(m.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "6px 8px", borderRadius: 6, border: "none",
                        background: "transparent", cursor: "pointer", fontSize: 13,
                        fontFamily: "inherit", color: "var(--text)", textAlign: "left",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Avatar memberId={m.id} size={22} />
                      <span style={{ flex: 1 }}>{m.name}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{m.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>CLIENTE</div>
              <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
              </div>
            </div>
          </div>

          {/* Pratica (n° libero) */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>N° PRATICA</div>
            <input
              value={task.praticaRef || ""}
              onChange={e => dispatch({ type: "UPDATE_TASK", payload: { id: task.id, praticaRef: e.target.value || null } })}
              placeholder="es. PR-2026-001"
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "7px 10px", fontSize: 13, fontFamily: "inherit",
                background: "var(--card)",
              }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>DESCRIZIONE</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 }}>
              {task.description || <span style={{ color: "var(--text-muted)" }}>Nessuna descrizione.</span>}
            </div>
          </div>

          {/* Attachments (Block 5 — allegati reali) */}
          <TaskAttachments taskId={task.id} editable={editable} />

          {/* Comments */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
              ATTIVITÀ & COMMENTI ({task.comments?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(task.comments || []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", background: "var(--navy)",
                    fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                    justifyContent: "center", color: "#fff", flexShrink: 0
                  }}>
                    {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.user}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(c.time)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text)", marginTop: 2, lineHeight: 1.5 }}><MentionText text={c.text} /></div>
                  </div>
                </div>
              ))}

              {/* New comment */}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: "var(--gold)",
                  fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center",
                  justifyContent: "center", color: "var(--navy)", flexShrink: 0
                }}>MF</div>
                <div style={{ flex: 1, display: "flex", gap: 6 }}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="Aggiungi un commento..."
                    style={{
                      flex: 1, border: "1px solid var(--border)", borderRadius: 8,
                      padding: "7px 10px", fontSize: 12, fontFamily: "inherit"
                    }} />
                  <button onClick={handleComment} style={{
                    background: "var(--navy)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "0 12px", cursor: "pointer", fontSize: 13
                  }}>↑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
