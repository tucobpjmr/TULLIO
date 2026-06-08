// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

export const ReactionPicker = ({ onPick, onClose }) => (
  <div onClick={e => e.stopPropagation()} style={{
    position: "absolute", bottom: "calc(100% + 4px)", left: 0,
    background: "#fff", borderRadius: 20, padding: "6px 8px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
    display: "flex", gap: 2, zIndex: 100,
  }}>
    {EMOJI_REACTIONS.map(e => (
      <button key={e} onClick={() => { onPick(e); onClose(); }} style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 18, padding: 4, borderRadius: 6, transition: "background 0.15s",
      }}
        onMouseEnter={ev => ev.currentTarget.style.background = "var(--surface2)"}
        onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}
      >{e}</button>
    ))}
  </div>
);

export default ReactionPicker;
