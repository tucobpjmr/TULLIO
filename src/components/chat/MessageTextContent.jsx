import { useContext } from "react";

import { ChatContext } from "./ChatContext.js";
import { parseTaskLink } from "./helpers.js";

// Renderizza testo del messaggio con eventuale pill task cliccabile.
// Step K: lookup preferito per `taskRef` (UUID) se presente sul messaggio;
// fallback per titolo (compat messaggi vecchi senza taskRef).
export const MessageTextContent = ({ text, isMine, taskRef }) => {
  const { tasks, dispatch } = useContext(ChatContext);
  const link = parseTaskLink(text);
  if (!link) {
    return <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>{text}</div>;
  }
  // Step K: prima cerca per UUID, poi fallback al match titolo.
  const tByRef = taskRef ? (tasks || []).find(x => x.id === taskRef && !x.deletedAt) : null;
  const t = tByRef || (tasks || []).find(x => x.title === link.taskTitle && !x.deletedAt);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!t) return;
    dispatch?.({ type: "SET_SELECTED_TASK", payload: t });
  };
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
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
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 0.5 }}>
          🔗 RIFERIMENTO TASK
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
          {link.taskTitle}
        </div>
        {link.taskDue && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            📅 {link.taskDue}
          </div>
        )}
      </button>
      {link.rest && <div>{link.rest}</div>}
    </div>
  );
};
