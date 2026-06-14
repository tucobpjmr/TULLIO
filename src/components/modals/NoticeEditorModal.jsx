// ─── NOTICE EDITOR MODAL ─────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef, useEffect } from "react";
import { NOTICE_COLORS } from "../../lib/taskConstants.js";

export const NoticeEditorModal = ({ notice, onClose, onSave }) => {
  const [text, setText] = useState(notice?.text || "");
  const [color, setColor] = useState(notice?.color || NOTICE_COLORS[0]);
  const [pinned, setPinned] = useState(notice?.pinned || false);
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const submit = () => {
    if (!text.trim()) return;
    onSave({ text: text.trim(), color, pinned });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 12, padding: 24,
        width: "90%", maxWidth: 520,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>
          {notice ? "✏️ Modifica avviso" : "📌 Nuovo avviso"}
        </h3>

        {/* Preview live */}
        <div style={{
          background: color, padding: "12px 14px", borderRadius: 4,
          marginBottom: 16, minHeight: 80,
          boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
          fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {text || <span style={{ color: "#8b6f3a", fontStyle: "italic" }}>Anteprima dell'avviso...</span>}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Scrivi qui il tuo avviso..."
          rows={4}
          maxLength={500}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--border)", fontSize: 13,
            outline: "none", fontFamily: "inherit", resize: "vertical",
            boxSizing: "border-box", lineHeight: 1.45,
          }}
          onFocus={e => e.target.style.borderColor = "var(--gold)"}
          onBlur={e => e.target.style.borderColor = "var(--border)"}
        />
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "right", marginTop: 4 }}>
          {text.length}/500
        </div>

        {/* Colore */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Colore post-it
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {NOTICE_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 34, height: 34, borderRadius: 6, background: c,
                  cursor: "pointer", border: color === c ? "2px solid var(--navy)" : "2px solid transparent",
                  transition: "transform 0.15s",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  transform: color === c ? "scale(1.1)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Pin */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, cursor: "pointer", color: "var(--text)" }}>
          <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
          📌 Fissa questo avviso in cima alla bacheca
        </label>

        {/* Footer buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)",
            background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>Annulla</button>
          <button onClick={submit} disabled={!text.trim()} style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: text.trim() ? "var(--navy)" : "var(--text-light)",
            color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: text.trim() ? "pointer" : "not-allowed", fontFamily: "inherit",
          }}>{notice ? "💾 Salva modifiche" : "📌 Pubblica avviso"}</button>
        </div>
      </div>
    </div>
  );
};
