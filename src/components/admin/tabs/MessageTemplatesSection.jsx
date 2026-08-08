// src/components/admin/tabs/MessageTemplatesSection.jsx
// Le risposte rapide riutilizzabili in chat, gestite dall'admin.
import { useState } from "react";
import { cardStyle, cardH } from "../adminStyles.js";

// ─── TEMPLATE MESSAGGI CHAT (v2.8) ─────────────────────────────────────────
export const MessageTemplatesSection = ({ templates = [], dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftText, setDraftText] = useState("");
  const [creating, setCreating] = useState(false);

  const startEdit = (t) => {
    setEditingId(t.id);
    setDraftLabel(t.label);
    setDraftText(t.text);
    setCreating(false);
  };
  const cancel = () => { setEditingId(null); setCreating(false); setDraftLabel(""); setDraftText(""); };
  const save = () => {
    if (!draftLabel.trim() || !draftText.trim()) return;
    if (creating) dispatch({ type: "ADD_MESSAGE_TEMPLATE", payload: { label: draftLabel, text: draftText } });
    else dispatch({ type: "UPDATE_MESSAGE_TEMPLATE", payload: { id: editingId, label: draftLabel.trim(), text: draftText.trim() } });
    cancel();
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ ...cardH, margin: 0 }}>💬 Template messaggi chat</h3>
        {!creating && !editingId && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setDraftLabel(""); setDraftText(""); }}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >+ Nuovo</button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 12 }}>
        Frasi ricorrenti riutilizzabili dal composer chat (pulsante 📋). Solo Admin può gestire.
      </p>

      {(creating || editingId) && (
        <div style={{
          padding: 12, background: "var(--surface2)", borderRadius: 8, marginBottom: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <input
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            placeholder="Etichetta (es. Sollecito acconto)"
            maxLength={40}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
          />
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            placeholder="Testo completo del messaggio…"
            rows={3}
            maxLength={500}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={cancel} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annulla</button>
            <button onClick={save} disabled={!draftLabel.trim() || !draftText.trim()} style={{
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: draftLabel.trim() && draftText.trim() ? "var(--navy)" : "var(--text-light)",
              color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: draftLabel.trim() && draftText.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}>{creating ? "Crea" : "Salva"}</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ padding: "14px 0", color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
          Nessun template. Crea il primo per velocizzare le risposte ricorrenti.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--heading)", marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.text}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => startEdit(t)} title="Modifica" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 }}>✏️</button>
                <button
                  onClick={() => { if (window.confirm(`Rimuovere il template "${t.label}"?`)) dispatch({ type: "DELETE_MESSAGE_TEMPLATE", payload: t.id }); }}
                  title="Elimina"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12, color: "var(--danger)" }}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
