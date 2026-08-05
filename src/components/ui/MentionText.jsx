// Caveat #2 — rende un testo evidenziando le @menzioni come chip.
// Usato in chat (ChatPanel) e nei commenti task (TaskSlideOver). Legge il team
// live dal contesto app e marca diversamente la menzione dell'utente corrente.
import { useAppData } from "../../state/AppDataContext.jsx";
import { findMentions } from "../../lib/mentions.js";

export const MentionText = ({ text }) => {
  // L'hook va chiamato incondizionatamente (regole degli hook): il early-return
  // sul testo vuoto viene dopo.
  const { team, currentUserId } = useAppData();
  if (typeof text !== "string" || !text) return text ?? null;
  const mentions = findMentions(text, team);
  if (!mentions.length) return text;

  const nodes = [];
  let last = 0;
  mentions.forEach((m, idx) => {
    if (m.start > last) nodes.push(text.slice(last, m.start));
    const isMe = m.id === currentUserId;
    nodes.push(
      <span
        key={idx}
        style={{
          color: isMe ? "var(--navy)" : "var(--gold-dark)",
          background: isMe ? "rgba(212,168,67,0.28)" : "rgba(212,168,67,0.14)",
          fontWeight: 600,
          borderRadius: 4,
          padding: "0 3px",
          whiteSpace: "nowrap",
        }}
      >
        {text.slice(m.start, m.end)}
      </span>
    );
    last = m.end;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
};
