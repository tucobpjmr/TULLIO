// ─── TASK SLIDE OVER ─────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { STATUSES, STATUS_LABELS, PRIORITIES, roleLabel } from "../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue, clientContact } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useClients } from "../../state/ClientsContext.jsx";
import { MentionText } from "../ui/MentionText.jsx";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";
import { ContactText } from "../ui/ContactText.jsx";
import { useClientSuggestions, ClientSuggestions } from "../ui/ClientAutocomplete.jsx";
import { Z } from "../../styles/tokens.js";

import { TaskAttachments } from "./TaskAttachments.jsx";
import { HISTORY_ICONS, historyDescribe } from "./taskHistory.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import {
  btnChiudiSuScuro, colGap10, flex1, grid2ColGap12, relative, rowGap6, txtF10Muted, txtF11Muted,
  txtF12Muted2, txtF13Muted, txtMuted,
} from "../../styles/common.js";
import {
  boxF11Bold, boxF12Muted, boxF13R8, boxF13Text, boxF13White, boxF13White2, boxF18Bold,
  boxFlex1F12, colFlex1Gap20, colGap8, rowCenterGap5, rowCenterGap6, rowCenterGap8,
  rowCenterMiddle, rowCenterMiddle2, rowFlex1Gap6, rowGap10, rowGap8, rowGap82, rowGap8Mb8,
  rowGap8Mt6, rowStartBetween, rowStartGap10, txtF11Bold, txtF11Bold2, txtF12, txtF12Bold,
  txtF12Light, txtF13Text, txtF14TxtCenter, txtF18Bold,
} from "./taskSlideOverStyles.js";

export const TaskSlideOver = ({ task, dispatch }) => {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const {
    categories, currentUserId, getMember, getAssignableTeam,
    canEditTask, getAvailableCategories,
  } = useAppData();
  // L'anagrafica arriva dal contesto, non come prop (ST-11): era `state.clients
  // || []` sul call site, cioè un array NUOVO a ogni render quando l'anagrafica
  // è vuota — bastava a disinnescare il `memo` di un componente lazy e pesante
  // come questo. Il default vive nel provider, una volta sola.
  const clients = useClients();
  const [newComment, setNewComment] = useState("");
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
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

  // Calcolati PRIMA dell'early return: `useClientSuggestions` è un hook, e un
  // hook dopo un return condizionale cambierebbe l'ordine delle chiamate fra i
  // render (react-hooks/rules-of-hooks). `editable` gli serve come argomento,
  // quindi sale con lui.
  const editable = !!task && canEditTask(task, currentUserId);
  const cli = useClientSuggestions(clients, draft.client, { enabled: editable });

  if (!task) return null;

  const currentAssignees = task.assignees || [];
  const availableMembers = editable
    ? getAssignableTeam().filter(m => !currentAssignees.includes(m.id))
    : [];

  // Categorie selezionabili = quelle disponibili al ruolo; includo sempre quella
  // corrente del task così resta visibile anche se fuori dallo scope dell'utente.
  const availableCats = getAvailableCategories(currentUserId);
  const catOptions = task.category && !availableCats[task.category]
    ? { [task.category]: categories[task.category] || { label: task.category, icon: "" }, ...availableCats }
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

  const pickClient = (c) => {
    const name = c.name;
    cli.close();
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
    const authorName = getMember(currentUserId)?.name || "Utente";
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

  const handleDelete = async () => {
    const ok = await conferma({
      title: "Spostare nel cestino?",
      body: `"${task.title}" resterà recuperabile dal Cestino.`,
      cta: "Sposta nel cestino", danger: true,
    });
    if (ok) dispatch({ type: "DELETE_TASK", payload: task.id });
  };

  const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 };
  const fieldStyle = {
    width: "100%", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 10px", fontSize: 13, fontFamily: "inherit", background: "var(--card)",
  };
  const myInitials = (getMember(currentUserId)?.name || "")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <>
      <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })}
        style={{ position: "fixed", inset: 0, background: "rgba(15,32,68,0.4)", zIndex: Z.slideOverBackdrop }} />
      <div className="slide-right vd-sheet-full" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 480,
        background: "var(--card)", zIndex: Z.slideOver, boxShadow: "-20px 0 60px rgba(0,0,0,0.15)",
        // overflow:hidden sul guscio + scroll SOLO sul corpo (vedi sotto): su iOS
        // scrollare l'intero elemento fixed alto 100dvh lascia il fondo (box
        // commento) dietro la toolbar del browser e irraggiungibile. Header fisso,
        // corpo scrollabile = pattern già usato da ChatPanel.
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header — pannello fixed a top:0: su iPhone il padding-top include
            l'inset della status bar, altrimenti chip e pulsante di chiusura
            finiscono sotto ora/batteria. */}
        <div style={rowStartBetween}>
          <div>
            <div style={rowGap8Mb8}>
              <CategoryChip category={task.category} />
              <PriorityBadge priority={task.priority} />
              {isOverdue(task) && <span style={boxF11Bold}>⚠️ Scaduto</span>}
            </div>
            {editable ? (
              <input
                className="playfair"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                onBlur={() => commitText("title")}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="Titolo del task"
                style={boxF18Bold}
              />
            ) : (
              <div className="playfair" style={txtF18Bold}>{task.title}</div>
            )}
          </div>
          <div style={rowGap6}>
            <button onClick={handleDelete} title="Sposta nel cestino" style={boxF13White}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(220,38,38,0.4)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(220,38,38,0.15)"}
            >🗑️</button>
            <button onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: null })} style={btnChiudiSuScuro}>✕</button>
          </div>
        </div>

        <div style={colFlex1Gap20}>
          {/* Status + Scadenza */}
          <div style={grid2ColGap12}>
            <div>
              <div style={labelStyle}>STATO</div>
              {editable ? (
                <select value={task.status} onChange={handleStatusChange} style={{ ...fieldStyle, cursor: "pointer" }}>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
              ) : (
                <div style={boxF13R8}>
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
            <div style={grid2ColGap12}>
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
          <div style={grid2ColGap12}>
            <div style={relative}>
              <div style={txtF11Bold}>ASSEGNATI</div>
              <div style={rowCenterGap6}>
                {currentAssignees.map(id => {
                  const m = getMember(id);
                  return m ? (
                    <div key={id} style={rowCenterGap5}>
                      <Avatar memberId={id} size={20} />
                      <span style={txtF12}>{m.name.split(" ")[0]}</span>
                      {editable && (
                        <button
                          onClick={() => removeAssignee(id)}
                          title="Rimuovi assegnatario"
                          style={boxF12Muted}
                          onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                          onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                        >✕</button>
                      )}
                    </div>
                  ) : null;
                })}
                {!currentAssignees.length && (
                  <span style={txtF13Muted}>Non assegnato</span>
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
                  position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: Z.local,
                  background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 6,
                  minWidth: 180, maxHeight: 220, overflowY: "auto",
                }}>
                  {availableMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => addAssignee(m.id)}
                      style={rowCenterGap8}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Avatar memberId={m.id} size={22} />
                      <span style={flex1}>{m.name}</span>
                      <span style={txtF10Muted}>{roleLabel(m)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={relative}>
              <div style={labelStyle}>CLIENTE</div>
              {editable ? (
                <>
                  <input
                    value={draft.client}
                    onChange={e => setDraft(d => ({ ...d, client: e.target.value }))}
                    {...cli.inputProps}
                    // L'onBlur del suggeritore va CHIAMATO, non sostituito:
                    // qui serve anche persistere il campo.
                    onBlur={() => { cli.inputProps.onBlur(); commitText("client", { nullable: true }); }}
                    placeholder={clients.length ? "Cerca o scrivi un nome…" : "Es. Famiglia Rossi…"}
                    style={fieldStyle}
                  />
                  <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} />
                </>
              ) : (
                <div style={boxF13R8}>
                  {task.client || <span style={txtMuted}>—</span>}
                </div>
              )}
            </div>
          </div>

          {/* Pratica (n° libero) + Contatti */}
          <div style={grid2ColGap12}>
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
                <div style={boxF13R8}>
                  {task.praticaRef || <span style={txtMuted}>—</span>}
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
                <div style={boxF13R8}>
                  {task.contact
                    ? <ContactText text={task.contact} />
                    : <span style={txtMuted}>—</span>}
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
              <div style={boxF13Text}>
                {task.description || <span style={txtMuted}>Nessuna descrizione.</span>}
              </div>
            )}
          </div>

          {/* Attachments (Block 5 — allegati reali) */}
          <TaskAttachments taskId={task.id} editable={editable} />

          {/* Comments */}
          <div>
            <div style={txtF11Bold2}>
              ATTIVITÀ & COMMENTI ({task.comments?.length || 0})
            </div>
            <div style={colGap10}>
              {(task.comments || []).map((c, i) => (
                <div key={i} style={rowGap10}>
                  <div style={rowCenterMiddle}>
                    {c.user.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={flex1}>
                    <div style={rowGap8}>
                      <span style={txtF12Bold}>{c.user}</span>
                      <span style={txtF11Muted}>{formatDate(c.time)}</span>
                    </div>
                    <div style={txtF13Text}><MentionText text={c.text} /></div>
                  </div>
                </div>
              ))}

              {/* New comment */}
              <div style={rowGap8Mt6}>
                <div style={rowCenterMiddle2}>{myInitials}</div>
                <div style={rowFlex1Gap6}>
                  <input
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleComment()}
                    placeholder="Aggiungi un commento..."
                    style={boxFlex1F12} />
                  <button onClick={handleComment} style={boxF13White2}>↑</button>
                </div>
              </div>
            </div>
          </div>

          {/* Cronologia (sessione 42): chi ha creato + modifiche di stato, priorità,
              assegnatari, scadenza, cestino/ripristino. Sola lettura. */}
          <div>
            <div style={txtF11Bold2}>
              CRONOLOGIA ({task.history?.length || 0})
            </div>
            <div style={colGap8}>
              {[...(task.history || [])]
                .sort((a, b) => new Date(a.time) - new Date(b.time))
                .map(h => (
                  <div key={h.id} style={rowStartGap10}>
                    <div style={txtF14TxtCenter}>
                      {HISTORY_ICONS[h.action] || "•"}
                    </div>
                    <div style={flex1}>
                      <div style={rowGap82}>
                        <span style={txtF12Bold}>{h.actor || "Sistema"}</span>
                        <span style={txtF11Muted}>{formatDate(h.time)}</span>
                      </div>
                      <div style={txtF12Muted2}>{historyDescribe(h, getMember)}</div>
                    </div>
                  </div>
                ))}
              {(!task.history || task.history.length === 0) && (
                <div style={txtF12Light}>Nessuna cronologia disponibile.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
