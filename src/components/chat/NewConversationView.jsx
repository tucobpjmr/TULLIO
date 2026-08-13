// src/components/chat/NewConversationView.jsx
// Creazione di una conversazione: diretta o di gruppo.
import { useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { roleLabel } from "../../lib/taskConstants.js";
import { btnChiudiSuScuro, flex1, txtF11Muted, txtF13Bold, txtF18 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const colHFull = { display: "flex", flexDirection: "column", height: "100%" };
const rowCenterGap10 = {
  background: "var(--navy)", padding: "12px 16px", display: "flex",
  alignItems: "center", gap: 10, flexShrink: 0,
};
const txtF15Bold = { color: "#fff", fontSize: 15, fontWeight: 600 };
const p14 = { padding: 14, borderBottom: "1px solid var(--border)" };
const rowCenterGap102 = {
  width: "100%", padding: "10px 14px", background: "var(--surface2)",
  border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
};
const flex12 = { flex: 1, overflowY: "auto" };
const txtF10Bold = { padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 };
const rowCenterGap103 = {
  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
  cursor: "pointer", transition: "background 0.15s",
};
const txtF135Bold = { fontSize: 13.5, fontWeight: 600 };
const boxF13WFull = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
  padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
};
const rowGap8P14 = { padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 };
const boxFlex1F13 = {
  flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
  borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
};

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
export const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const { team, currentUserId } = useAppData();
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");

  const available = team.filter(m => m.id !== currentUserId);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const createDirect = (memberId) => {
    const found = existing.find(c => c.type === "direct" && c.participants.includes(memberId));
    if (found) { onCreate(found); return; }
    const newConv = {
      id: "c" + Date.now(), type: "direct",
      participants: [currentUserId, memberId], name: null,
    };
    onCreate(newConv, true);
  };

  const createGroup = () => {
    if (!groupName.trim() || selected.length < 2) return;
    const newConv = {
      id: "c" + Date.now(), type: "group",
      participants: [currentUserId, ...selected],
      name: groupName.trim(), icon: "👥",
    };
    onCreate(newConv, true);
  };

  return (
    <div style={colHFull}>
      <div style={rowCenterGap10}>
        <button onClick={onCancel} style={btnChiudiSuScuro}>←</button>
        <div className="playfair" style={txtF15Bold}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={p14}>
            <button onClick={() => setMode("group")} style={rowCenterGap102}>
              <span style={txtF18}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={flex12}>
            <div style={txtF10Bold}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div key={m.id} onClick={() => createDirect(m.id)} style={rowCenterGap103}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={flex1}>
                  <div style={txtF135Bold}>{m.name}</div>
                  <div style={txtF11Muted}>{roleLabel(m)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "group" && (
        <>
          <div style={p14}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome del gruppo..."
              style={boxF13WFull}
            />
          </div>
          <div style={flex12}>
            <div style={txtF10Bold}>
              SELEZIONA MEMBRI ({selected.length} selezionati)
            </div>
            {available.map(m => {
              const isSel = selected.includes(m.id);
              return (
                <div key={m.id} onClick={() => toggle(m.id)} style={{
                  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                  cursor: "pointer", background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <Avatar memberId={m.id} size={36} />
                  <div style={flex1}>
                    <div style={txtF13Bold}>{m.name}</div>
                    <div style={txtF11Muted}>{roleLabel(m)}</div>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${isSel ? "var(--gold)" : "var(--border)"}`,
                    background: isSel ? "var(--gold)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: "var(--heading)", fontWeight: 700,
                  }}>{isSel && "✓"}</div>
                </div>
              );
            })}
          </div>
          <div style={rowGap8P14}>
            <button onClick={() => setMode("select")} style={boxFlex1F13}>Indietro</button>
            <button onClick={createGroup} disabled={!groupName.trim() || selected.length < 2} style={{
              flex: 2, padding: "10px", background: "var(--navy)", color: "#fff",
              border: "none", borderRadius: 8,
              cursor: (!groupName.trim() || selected.length < 2) ? "not-allowed" : "pointer",
              fontSize: 13, fontWeight: 600,
              opacity: (!groupName.trim() || selected.length < 2) ? 0.5 : 1,
            }}>Crea gruppo</button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── CHAT: MAIN PANEL ──────────────────────────────────────────────────────
// ─── FORWARD PICKER (Fase 3) ───────────────────────────────────────────────
// Overlay che mostra la lista conversazioni e ritorna la convId scelta.
// Esclude la conversazione di origine (forward in-place non avrebbe senso) e
// le conversazioni mock (id non-uuid: niente persistenza, fuori scope).
// L'ordinamento riusa la stessa logica di ConversationList (pinned + ultimo
