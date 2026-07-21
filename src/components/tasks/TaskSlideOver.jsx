// ─── TASK SLIDE OVER ─────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useEffect, useRef, useCallback } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { STATUSES, STATUS_LABELS, PRIORITIES } from "../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue, clientContact } from "../../lib/taskUtils.js";
import { CURRENT_USER, getMember, getAssignableTeam, canEditTask, getAvailableCategories, CATEGORIES } from "../../state/appGlobals.js";
import { MentionText } from "../ui/MentionText.jsx";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";
import { ContactText } from "../ui/ContactActions.jsx";
import { TaskFiles } from "../../lib/api.js";
import { MAX_TASK_FILE_SIZE, formatFileSize, fileIcon, isWithinSizeLimit, sourceBadge, mediaKind } from "../../lib/fileUtils.js";

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
  // Anteprima inline: id allegato espanso → signed URL caricata on-demand.
  const [previewId, setPreviewId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
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

// ─── Cronologia task (sessione 42) ────────────────────────────────────────
// Le entry arrivano dal trigger DB log_task_history (sola lettura, mai
// scritte dal client). Formattazione human-readable riusando le stesse
// label di STATUS_LABELS/PRIORITIES usate altrove nell'app.
const HISTORY_ICONS = {
  created: "📝", status: "🔄", priority: "🚦", assignees: "👤",
  due_date: "📅", trashed: "🗑️", restored: "↩️",
};

function resolveAssigneeNames(csv) {
  if (!csv) return "Nessuno";
  return csv.split(",").filter(Boolean).map(id => getMember(id)?.name || id).join(", ");
}

function historyDescribe(h) {
  switch (h.action) {
    case "created":
      return "Task creata";
    case "status":
      return `Stato: ${STATUS_LABELS[h.oldValue] ?? h.oldValue ?? "—"} → ${STATUS_LABELS[h.newValue] ?? h.newValue ?? "—"}`;
    case "priority":
      return `Priorità: ${PRIORITIES[h.oldValue]?.label ?? h.oldValue ?? "—"} → ${PRIORITIES[h.newValue]?.label ?? h.newValue ?? "—"}`;
    case "assignees":
      return `Assegnatari: ${resolveAssigneeNames(h.oldValue)} → ${resolveAssigneeNames(h.newValue)}`;
    case "due_date":
      return `Scadenza: ${h.oldValue ? formatDate(h.oldValue) : "—"} → ${h.newValue ? formatDate(h.newValue) : "—"}`;
    case "trashed":
      return "Spostata nel cestino";
    case "restored":
      return "Ripristinata dal cestino";
    default:
      return h.action;
  }
}

export const TaskSlideOver = ({ task, dispatch, clients = [] }) => {
  const { isMobile } = useViewport();
  const [newComment, setNewComment] = useState("");
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [clientFocus, setClientFocus] = useState(false);
  // Bozza locale dei campi testo: si scrive in locale e si persiste al blur
  // (un solo UPDATE_TASK per modifica, non a ogni tasto → niente toast a raffica
  // né un round-trip DB per carattere). I select/data persistono subito.
  const [draft, setDraft] = useState({ title: "", client: "", praticaRef: "", contact: "", description: "" });

  // Risincronizza la bozza quando si apre un task diverso. NON dipende dall'intero
  // `task` per non sovrascrivere quanto si sta digitando dopo un dispatch (es. il
  // cambio di status aggiorna `task` ma deve lasciare intatto il testo in corso).
  useEffect(() => {
    setDraft({
      title: task?.title || "",
      client: task?.client || "",
      praticaRef: task?.praticaRef || "",
      contact: task?.contact || "",
      description: task?.description || "",
    });
    // Volutamente solo task?.id: ri-sincronizzare a ogni cambio dei campi
    // sovrascriverebbe il testo che l'utente sta digitando dopo un dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  if (!task) return null;

  const editable = canEditTask(task, CURRENT_USER);
  const currentAssignees = task.assignees || [];
  const availableMembers = editable
    ? getAssignableTeam().filter(m => !currentAssignees.includes(m.id))
    : [];

  // Categorie selezionabili = quelle disponibili al ruolo; includo sempre quella
  // corrente del task così resta visibile anche se fuori dallo scope dell'utente.
  const availableCats = getAvailableCategories(CURRENT_USER);
  const catOptions = task.category && !availableCats[task.category]
    ? { [task.category]: CATEGORIES[task.category] || { label: task.category, icon: "" }, ...availableCats }
    : availableCats;

  const updateField = (field, value) =>
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, [field]: value } });

  // Persiste un campo testo dalla bozza, solo se cambiato. `nullable` → stringa
  // vuota diventa null (client/praticaRef). Il titolo è obbligatorio: se svuotato
  // si ripristina il valore corrente.
  const commitText = (field, { nullable = false } = {}) => {
    const trimmed = (draft[field] || "").trim();
    if (field === "title" && !trimmed) { setDraft(d => ({ ...d, title: task.title || "" })); return; }
    const next = nullable ? (trimmed || null) : trimmed;
    const curr = task[field] ?? (nullable ? null : "");
    if (next === curr) return;
    updateField(field, next);
  };

  const clientQuery = draft.client.trim().toLowerCase();
  const clientMatches = (clientQuery
    ? clients.filter(c => c.name?.toLowerCase().includes(clientQuery))
    : clients
  ).slice(0, 6);
  const showClientList = editable && clientFocus && clientMatches.length > 0 &&
    !(clientMatches.length === 1 && clientMatches[0].name?.toLowerCase() === clientQuery);
  const pickClient = (c) => {
    const name = c.name;
    setClientFocus(false);
    if (name !== (task.client ?? null)) updateField("client", name);
    // Eredita i contatti dall'anagrafica solo se il campo è ancora vuoto: non
    // sovrascrive un contatto già digitato a mano o già presente sul task.
    const contact = clientContact(c);
    const shouldFillContact = contact && !draft.contact.trim() && !task.contact;
    setDraft(d => ({ ...d, client: name, contact: shouldFillContact ? contact : d.contact }));
    if (shouldFillContact) updateField("contact", contact);
  };

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

  const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 };
  const fieldStyle = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, fontFamily: "inherit", background: "var(--card)",
  };
  const myInitials = (getMember(CURRENT_USER)?.name || "")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: 500 }} />
      <div className="slide-right vd-sheet-full" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480,
        background: "var(--card)", zIndex: 600, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        // overflow:hidden sul guscio + scroll SOLO sul corpo (vedi sotto): su iOS
        // scrollare l'intero elemento fixed alto 100dvh lascia il fondo (box
        // commento) dietro la toolbar del browser e irraggiungibile. Header fisso,
        // corpo scrollabile = pattern già usato da ChatPanel.
        display: "flex", flexDirection: "column", overflow: "hidden",
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
            {editable ? (
              <input
                className="playfair"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                onBlur={() => commitText("title")}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="Titolo del task"
                style={{
                  color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
                  borderRadius: 6, padding: "4px 8px", width: "100%", fontFamily: "inherit", outline: "none",
                }}
              />
            ) : (
              <div className="playfair" style={{ color: "#fff", fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{task.title}</div>
            )}
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

        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          // padding-bottom con safe-area: l'ultimo elemento (box commento) resta
          // sopra l'home-indicator / la toolbar inferiore di Safari/Chrome iOS.
          padding: "20px 22px",
          paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          {/* Status + Scadenza */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={labelStyle}>STATO</div>
              {editable ? (
                <select value={task.status} onChange={handleStatusChange} style={{ ...fieldStyle, cursor: "pointer" }}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                  {STATUS_LABELS[task.status] || task.status}
                </div>
              )}
            </div>
            <div>
              <div style={{ ...labelStyle, color: isOverdue(task) ? "var(--danger)" : "var(--text-muted)" }}>
                SCADENZA {isOverdue(task) && "⚠️"}
              </div>
              {editable ? (
                <DateTimePicker
                  value={task.dueDate}
                  onChange={iso => updateField("dueDate", iso)}
                  hasError={isOverdue(task)}
                />
              ) : (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block", color: isOverdue(task) ? "var(--danger)" : "var(--text)" }}>
                  {task.dueDate ? `${formatDate(task.dueDate)} ${formatTime(task.dueDate)}` : "—"}
                </div>
              )}
            </div>
          </div>

          {/* Categoria + Priorità (modificabili) */}
          {editable && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={labelStyle}>CATEGORIA</div>
                <select value={task.category || ""} onChange={e => updateField("category", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
                  {Object.entries(catOptions).map(([k, v]) => <option key={k} value={k}>{v?.icon ? `${v.icon} ` : ""}{v?.label || k}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>PRIORITÀ</div>
                <select value={task.priority || ""} onChange={e => updateField("priority", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
                  {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
          )}

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
            <div style={{ position: "relative" }}>
              <div style={labelStyle}>CLIENTE</div>
              {editable ? (
                <>
                  <input
                    value={draft.client}
                    onChange={e => setDraft(d => ({ ...d, client: e.target.value }))}
                    onFocus={() => setClientFocus(true)}
                    onBlur={() => { setTimeout(() => setClientFocus(false), 150); commitText("client", { nullable: true }); }}
                    placeholder={clients.length ? "Cerca o scrivi un nome…" : "Es. Famiglia Rossi…"}
                    autoComplete="off"
                    style={fieldStyle}
                  />
                  {showClientList && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                      marginTop: 4, background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      maxHeight: 200, overflowY: "auto",
                    }}>
                      {clientMatches.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => pickClient(c)}
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                            width: "100%", textAlign: "left", padding: "8px 10px", border: "none",
                            borderBottom: "1px solid var(--border)", background: "transparent",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.name}</span>
                          {(c.city || c.email) && (
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {[c.city, c.email].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                  {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
                </div>
              )}
            </div>
          </div>

          {/* Pratica (n° libero) + Contatti */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={labelStyle}>N° PRATICA</div>
              {editable ? (
                <input
                  value={draft.praticaRef}
                  onChange={e => setDraft(d => ({ ...d, praticaRef: e.target.value }))}
                  onBlur={() => commitText("praticaRef", { nullable: true })}
                  placeholder="es. PR-2026-001"
                  style={fieldStyle}
                />
              ) : (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                  {task.praticaRef || <span style={{ color: "var(--text-muted)" }}>—</span>}
                </div>
              )}
            </div>
            <div>
              <div style={labelStyle}>CONTATTI</div>
              {editable ? (
                <input
                  value={draft.contact}
                  onChange={e => setDraft(d => ({ ...d, contact: e.target.value }))}
                  onBlur={() => commitText("contact", { nullable: true })}
                  placeholder="Telefono, email…"
                  style={fieldStyle}
                />
              ) : (
                <div style={{ fontSize: 13, padding: "4px 8px", background: "var(--surface2)", borderRadius: 8, display: "inline-block" }}>
                  {task.contact
                    ? <ContactText text={task.contact} />
                    : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <div style={labelStyle}>DESCRIZIONE</div>
            {editable ? (
              <textarea
                value={draft.description}
                onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                onBlur={() => commitText("description")}
                rows={4}
                placeholder="Dettagli del task…"
                style={{ ...fieldStyle, lineHeight: 1.6, resize: "vertical" }}
              />
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text)", background: "var(--surface2)", padding: 12, borderRadius: 8 }}>
                {task.description || <span style={{ color: "var(--text-muted)" }}>Nessuna descrizione.</span>}
              </div>
            )}
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
                }}>{myInitials}</div>
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

          {/* Cronologia (sessione 42): chi ha creato + modifiche di stato, priorità,
              assegnatari, scadenza, cestino/ripristino. Sola lettura. */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
              CRONOLOGIA ({task.history?.length || 0})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...(task.history || [])]
                .sort((a, b) => new Date(a.time) - new Date(b.time))
                .map(h => (
                  <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 28, textAlign: "center", fontSize: 14, flexShrink: 0 }}>
                      {HISTORY_ICONS[h.action] || "•"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{h.actor || "Sistema"}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDate(h.time)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{historyDescribe(h)}</div>
                    </div>
                  </div>
                ))}
              {(!task.history || task.history.length === 0) && (
                <div style={{ fontSize: 12, color: "var(--text-light)" }}>Nessuna cronologia disponibile.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
