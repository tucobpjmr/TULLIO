// src/components/chat/message/MessageTextContent.jsx
// Corpo testuale di un messaggio: menzioni e, se presente, la card del task
// citato. `parseTaskLink` è esportato perché serve anche alla composer, che
// deve riconoscere un riferimento task già presente nella bozza.
import { MentionText } from "../../ui/MentionText.jsx";
import { useChatContext } from "../chatContext.js";
import { useDispatch } from "../../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF135 = { fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" };
const txtF11Bold = { fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 0.5 };
const txtF13Bold = { fontSize: 13, fontWeight: 600, marginTop: 2 };
const txtF11Mt2 = { fontSize: 11, opacity: 0.7, marginTop: 2 };

// Ritorna { taskTitle, taskDue, rest } o null se non match.
const TASK_LINK_RE = /^🔗 Riferimento task: "([^"]+)"\n📅 Scadenza:([^\n]*)\n\n([\s\S]*)$/;
export function parseTaskLink(text) {
  if (typeof text !== "string") return null;
  const m = TASK_LINK_RE.exec(text);
  if (!m) return null;
  return { taskTitle: m[1], taskDue: m[2].trim(), rest: m[3] };
}


// Renderizza testo del messaggio con eventuale pill task cliccabile.
// Step K: lookup preferito per `taskRef` (UUID) se presente sul messaggio;
// fallback per titolo (compat messaggi vecchi senza taskRef).
export const MessageTextContent = ({ text, isMine, taskRef }) => {
  const { tasks } = useChatContext();
  const dispatch = useDispatch();
  const link = parseTaskLink(text);
  if (!link) {
    return <div style={txtF135}><MentionText text={text} /></div>;
  }
  // Step K: prima cerca per UUID, poi fallback al match titolo.
  const tByRef = taskRef ? (tasks || []).find(x => x.id === taskRef && !x.deletedAt) : null;
  const t = tByRef || (tasks || []).find(x => x.title === link.taskTitle && !x.deletedAt);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!t) return;
    dispatch({ type: "SET_SELECTED_TASK", payload: t });
  };
  return (
    <div style={txtF135}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!t}
        title={t ? "Apri task" : "Task non disponibile"}
        style={{
          display: "block", textAlign: "left", width: "100%",
          background: isMine ? "rgba(255,255,255,0.12)" : "var(--surface2)",
          border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--border)",
          color: "inherit",
          padding: "6px 10px", borderRadius: 8, marginBottom: link.rest ? 6 : 0,
          cursor: t ? "pointer" : "not-allowed", opacity: t ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        <div style={txtF11Bold}>
          🔗 RIFERIMENTO TASK
        </div>
        <div style={txtF13Bold}>
          {link.taskTitle}
        </div>
        {link.taskDue && (
          <div style={txtF11Mt2}>
            📅 {link.taskDue}
          </div>
        )}
      </button>
      {link.rest && <div><MentionText text={link.rest} /></div>}
    </div>
  );
};

// ─── CHAT: FILE HELPERS (Step M) ───────────────────────────────────────────
// Limite bucket 'chat-files' (vedi migration 20260611_chat_files_storage.sql).
