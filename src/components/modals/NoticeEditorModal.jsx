// ─── NOTICE EDITOR MODAL ─────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef, useEffect } from "react";
import { NOTICE_COLORS } from "../../lib/taskConstants.js";
import { MentionText } from "../ui/MentionText.jsx";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Z } from "../../styles/tokens.js";

export const NoticeEditorModal = ({ notice, onClose, onSave }) => {
  const [text, setText] = useState(notice?.text || "");
  const [color, setColor] = useState(notice?.color || NOTICE_COLORS[0]);
  const [pinned, setPinned] = useState(notice?.pinned || false);
  // v2.8: tag/categorie sui post-it (free-form, max 20 char ciascuno, max 5).
  // Persistono come array di stringhe normalizzate (lowercase, trim).
  const [tags, setTags] = useState(Array.isArray(notice?.tags) ? notice.tags : []);
  const [tagDraft, setTagDraft] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const addTag = (raw) => {
    const t = String(raw || "").trim().toLowerCase().slice(0, 20);
    if (!t || tags.includes(t) || tags.length >= 5) return;
    setTags([...tags, t]);
  };
  const onTagKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const submit = () => {
    if (!text.trim()) return;
    onSave({ text: text.trim(), color, pinned, tags });
  };

  // Portale: NoticeBoard è dentro il wrapper .fade-in della Dashboard (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.slideOver,
      }}>
        <div onClick={e => e.stopPropagation()} className="vd-modal-mh" style={{
          background: "var(--card)", borderRadius: 12, padding: 24,
          width: "90%", maxWidth: 520, overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}>
          <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--heading)" }}>
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
            {text
              ? <MentionText text={text} />
              : <span style={{ color: "#8b6f3a", fontStyle: "italic" }}>Anteprima dell'avviso...</span>}
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Scrivi qui il tuo avviso... usa @nome per menzionare un membro del team"
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
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              💡 Scrivi <b>@nome</b> per notificare un collega
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{text.length}/500</span>
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

          {/* Tag (v2.8): chip + input. Enter o virgola conferma; Backspace su input vuoto rimuove ultimo */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Tag <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opzionali, max 5 — premi Invio per aggiungere)</span>
            </div>
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
              padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)",
              minHeight: 38,
            }}>
              {tags.map(t => (
                <span key={t} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "var(--surface2)", color: "var(--heading)",
                  padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                }}>
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter(x => x !== t))}
                    aria-label={`Rimuovi tag ${t}`}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, lineHeight: 1, padding: 0 }}
                  >×</button>
                </span>
              ))}
              {tags.length < 5 && (
                <input
                  value={tagDraft}
                  onChange={e => setTagDraft(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={() => { if (tagDraft) { addTag(tagDraft); setTagDraft(""); } }}
                  placeholder={tags.length === 0 ? "es. urgente, partenza, fornitori…" : ""}
                  maxLength={20}
                  style={{
                    flex: 1, minWidth: 100, border: "none", outline: "none",
                    fontSize: 12, fontFamily: "inherit", padding: "3px 2px",
                    background: "transparent", color: "var(--text)",
                  }}
                />
              )}
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
              background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 500,
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
    </ModalPortal>
  );
};
