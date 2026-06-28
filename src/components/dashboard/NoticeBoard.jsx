// ─── NOTICE BOARD ────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { getMember, CURRENT_USER } from "../../state/appGlobals.js";
import { NoticeEditorModal } from "../modals/NoticeEditorModal.jsx";
import { MentionText } from "../ui/MentionText.jsx";

// v2.8: emoji disponibili per le reazioni rapide sui post-it.
// Tenuto basso (6) per non rompere il layout del post-it. Stesso shape della chat.
const NOTICE_REACTION_EMOJI = ["👍", "❤️", "🎉", "👀", "🔥", "✅"];

export const NoticeBoard = ({ notices, dispatch }) => {
  const [editing, setEditing] = useState(null); // null | { id?, text, color }
  const [creating, setCreating] = useState(false);
  // v2.8: filtro per tag (Set di tag attivi; vuoto = mostra tutto).
  // Modalità OR: un post-it visibile se ha almeno un tag tra quelli attivi.
  const [activeTags, setActiveTags] = useState(new Set());
  // v2.8: id del post-it con picker reazioni aperto (null = nessuno).
  const [reactingId, setReactingId] = useState(null);
  const { isMobile } = useViewport();

  // Tutti i tag in uso (dedup), ordinati per frequenza decrescente.
  const allTags = (() => {
    const count = new Map();
    for (const n of notices) {
      for (const t of (n.tags || [])) count.set(t, (count.get(t) || 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  })();

  const toggleTag = (t) => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  // Filtro + ordinamento (pinned in alto, poi per data)
  const sorted = [...notices]
    .filter(n => activeTags.size === 0 || (n.tags || []).some(t => activeTags.has(t)))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} g fa`;
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
  };

  return (
    <div style={{
      background: "linear-gradient(180deg, #faf5e6 0%, #f5efd9 100%)",
      backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 23px, rgba(139,90,43,0.04) 23px, rgba(139,90,43,0.04) 24px), repeating-linear-gradient(0deg, transparent 0, transparent 23px, rgba(139,90,43,0.03) 23px, rgba(139,90,43,0.03) 24px)",
      backgroundColor: "#faf5e6",
      border: "1px solid #d4c08a",
      borderRadius: 12, padding: isMobile ? "14px 12px 16px" : "18px 22px 22px",
      boxShadow: "inset 0 2px 6px rgba(139,90,43,0.1), 0 2px 10px rgba(0,0,0,0.05)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "var(--navy)", color: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📌</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Bacheca avvisi
            </div>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "8px 14px", borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: "0 2px 8px rgba(15,32,68,0.3)",
          }}
        >
          + Nuovo avviso
        </button>
      </div>

      {/* Filtro tag (v2.8): visibile solo se ci sono tag in uso */}
      {allTags.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6,
          marginBottom: 14, padding: "0 2px",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#8b6f3a", textTransform: "uppercase", letterSpacing: 1, marginRight: 2 }}>
            Tag:
          </span>
          {allTags.map(t => {
            const on = activeTags.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                style={{
                  border: `1px solid ${on ? "var(--navy)" : "rgba(139,90,43,0.3)"}`,
                  background: on ? "var(--navy)" : "rgba(255,255,255,0.5)",
                  color: on ? "#fff" : "#5d4920",
                  padding: "3px 10px", borderRadius: 999,
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  cursor: "pointer", transition: "background 0.15s, color 0.15s",
                }}
              >#{t}</button>
            );
          })}
          {activeTags.size > 0 && (
            <button
              type="button"
              onClick={() => setActiveTags(new Set())}
              style={{
                background: "none", border: "none", color: "#8b6f3a",
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                marginLeft: 4, textDecoration: "underline",
              }}
            >azzera</button>
          )}
        </div>
      )}

      {/* Board */}
      {sorted.length === 0 ? (
        <div style={{
          padding: "30px 20px", textAlign: "center", color: "#8b6f3a",
          fontSize: 13, fontStyle: "italic",
        }}>
          ✨ Nessun avviso in bacheca. Clicca "+ Nuovo avviso" per pubblicarne uno.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16, padding: "6px 4px",
        }}>
          {sorted.map((n, idx) => {
            const author = getMember(n.author);
            const rotation = ((n.id.charCodeAt(n.id.length - 1) % 5) - 2) * 0.7; // -1.4 a +1.4 deg
            return (
              <div
                key={n.id}
                style={{
                  background: n.color,
                  padding: "14px 14px 12px",
                  borderRadius: 4,
                  position: "relative",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.2s, box-shadow 0.2s",
                  minHeight: 130,
                  display: "flex", flexDirection: "column",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "rotate(0deg) scale(1.02)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.15), 0 2px 5px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                  e.currentTarget.style.boxShadow = "0 3px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)";
                }}
              >
                {/* Pin in alto */}
                {n.pinned && (
                  <div style={{
                    position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
                    fontSize: 18, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
                  }}>📌</div>
                )}

                {/* Toolbar actions */}
                <div style={{
                  position: "absolute", top: 6, right: 6,
                  display: "flex", gap: 2, opacity: 0.6,
                }}>
                  <button
                    onClick={() => setReactingId(reactingId === n.id ? null : n.id)}
                    title="Reagisci"
                    style={noticeBtnStyle}
                  >😀</button>
                  <button
                    onClick={() => dispatch({ type: "TOGGLE_PIN_NOTICE", payload: n.id })}
                    title={n.pinned ? "Rimuovi pin" : "Fissa in alto"}
                    style={noticeBtnStyle}
                  >{n.pinned ? "📍" : "📌"}</button>
                  <button
                    onClick={() => setEditing({ id: n.id, text: n.text, color: n.color, pinned: n.pinned, tags: n.tags })}
                    title="Modifica"
                    style={noticeBtnStyle}
                  >✏️</button>
                  <button
                    onClick={() => {
                      if (window.confirm("Eliminare questo avviso?")) {
                        dispatch({ type: "DELETE_NOTICE", payload: n.id });
                      }
                    }}
                    title="Elimina"
                    style={noticeBtnStyle}
                  >✕</button>
                </div>

                {/* Picker reazioni (v2.8): si apre cliccando 😀 */}
                {reactingId === n.id && (
                  <div
                    style={{
                      position: "absolute", top: 32, right: 6,
                      display: "flex", gap: 2,
                      background: "rgba(255,255,255,0.95)",
                      border: "1px solid rgba(139,90,43,0.3)",
                      borderRadius: 999, padding: "3px 6px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                      zIndex: 5,
                    }}
                  >
                    {NOTICE_REACTION_EMOJI.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          dispatch({ type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: n.id, emoji: em } });
                          setReactingId(null);
                        }}
                        style={{
                          background: "none", border: "none", padding: "2px 4px",
                          cursor: "pointer", fontSize: 16, lineHeight: 1,
                          borderRadius: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(15,32,68,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >{em}</button>
                    ))}
                  </div>
                )}

                {/* Testo avviso (con @menzioni evidenziate) */}
                <div style={{
                  fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  flex: 1, marginTop: 10, marginRight: 50,
                }}>
                  <MentionText text={n.text} />
                </div>

                {/* Chip riassuntive reazioni (v2.8): click toggla la mia reazione */}
                {n.reactions && Object.keys(n.reactions).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    {Object.entries(n.reactions).map(([em, users]) => {
                      if (!Array.isArray(users) || users.length === 0) return null;
                      const mine = users.includes(CURRENT_USER);
                      return (
                        <button
                          key={em}
                          type="button"
                          onClick={() => dispatch({ type: "TOGGLE_NOTICE_REACTION", payload: { noticeId: n.id, emoji: em } })}
                          title={users.map(u => getMember(u)?.name || u).join(", ")}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            background: mine ? "rgba(15,32,68,0.85)" : "rgba(255,255,255,0.6)",
                            color: mine ? "#fff" : "#3d2f10",
                            border: `1px solid ${mine ? "var(--navy)" : "rgba(139,90,43,0.3)"}`,
                            padding: "1px 7px", borderRadius: 999,
                            fontSize: 11, fontWeight: 600,
                            cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4,
                          }}
                        >
                          <span>{em}</span>
                          <span>{users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tag chips (v2.8) */}
                {Array.isArray(n.tags) && n.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    {n.tags.map(t => (
                      <span
                        key={t}
                        onClick={(e) => { e.stopPropagation(); toggleTag(t); }}
                        style={{
                          fontSize: 10, fontWeight: 600,
                          color: activeTags.has(t) ? "#fff" : "#5d4920",
                          background: activeTags.has(t) ? "rgba(15,32,68,0.85)" : "rgba(255,255,255,0.55)",
                          padding: "1px 7px", borderRadius: 999, cursor: "pointer",
                          border: "1px solid rgba(139,90,43,0.25)",
                        }}
                        title={`Filtra per #${t}`}
                      >#{t}</span>
                    ))}
                  </div>
                )}

                {/* Footer: autore + data */}
                <div style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: "1px dashed rgba(61,47,16,0.2)",
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 10, color: "#5d4920",
                }}>
                  {author && (
                    <>
                      <div style={{
                        width: 18, height: 18, borderRadius: "50%", background: author.color,
                        color: "#fff", fontSize: 8, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{author.avatar}</div>
                      <span style={{ fontWeight: 600 }}>{author.name.split(" ")[0]}</span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto" }}>{formatRel(n.updatedAt || n.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <NoticeEditorModal
          notice={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (editing) {
              dispatch({ type: "UPDATE_NOTICE", payload: { id: editing.id, ...data } });
            } else {
              dispatch({
                type: "ADD_NOTICE",
                payload: {
                  id: "n" + Date.now(),
                  ...data,
                  author: CURRENT_USER,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              });
            }
            setCreating(false); setEditing(null);
          }}
        />
      )}
    </div>
  );
};

const noticeBtnStyle = {
  background: "rgba(255,255,255,0.6)", border: "none", borderRadius: 4,
  width: 22, height: 22, cursor: "pointer", fontSize: 11,
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1,
};
