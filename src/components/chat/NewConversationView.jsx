// src/components/chat/NewConversationView.jsx
// Creazione di una conversazione: diretta o di gruppo.
import { useRef, useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { roleLabel } from "../../lib/taskConstants.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { obbligatorio, primoCampoInvalido, validaCampi } from "../../lib/validators.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera, conTastiera } from "../../lib/a11y.js";

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
// B-3 · Il comando di creazione. Era uno `style={{…}}` inline con opacità e
// cursore legati alle due condizioni, sopra un `disabled` che le nascondeva
// entrambe: il comando era spento e non diceva QUALE delle due mancasse.
const boxFlex2Crea = {
  flex: 2, padding: "10px", background: "var(--navy)", color: "#fff",
  border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const p14SenzaBordo = { padding: 14 };

// Le due condizioni del gruppo, come regole pure e con un messaggio ciascuna.
// `ORDINE` è quello VISIVO: il nome sta sopra l'elenco dei membri, quindi con
// entrambi mancanti il messaggio (e il focus) vanno al nome.
const REGOLE_GRUPPO = {
  groupName: obbligatorio("Dai un nome al gruppo: è quello che vedranno i partecipanti."),
  selected: (v) => (v.length >= 2 ? null : "Scegli almeno due membri: per parlare con una persona sola c'è la conversazione diretta."),
};
const ORDINE_GRUPPO = ["groupName", "selected"];

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
export const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const { team, currentUserId } = useAppData();
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [errori, setErrori] = useState({});
  const rifNome = useRef(null);
  const rifMembri = useRef(null);

  const available = team.filter(m => m.id !== currentUserId);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
    setErrori(prec => (prec.selected ? { ...prec, selected: undefined } : prec));
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
    // B-3 · Era `disabled={!groupName.trim() || selected.length < 2}` più un
    // `return` muto: due condizioni riassunte in un comando spento, e nessun
    // modo di sapere quale delle due mancasse.
    const trovati = validaCampi({ groupName, selected }, REGOLE_GRUPPO);
    const primo = primoCampoInvalido(trovati, ORDINE_GRUPPO);
    if (primo) {
      setErrori(trovati);
      (primo === "groupName" ? rifNome : rifMembri).current?.focus();
      return;
    }
    setErrori({});
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
        <button onClick={onCancel} style={stiliComuni.btnChiudiSuScuro}>←</button>
        <div className="playfair" style={txtF15Bold}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={p14}>
            <button onClick={() => setMode("group")} style={rowCenterGap102}>
              <span style={stiliComuni.txtF18}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={stiliComuni.areaScorrevole}>
            <div style={txtF10Bold}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => createDirect(m.id)}
                onKeyDown={attivaConTastiera(() => createDirect(m.id))}
                style={rowCenterGap103}
                {...conTastiera(
                  e => e.currentTarget.style.background = "var(--surface2)",
                  e => e.currentTarget.style.background = "transparent",
                )}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={stiliComuni.flex1}>
                  <div style={txtF135Bold}>{m.name}</div>
                  <div style={stiliComuni.txtF11Muted}>{roleLabel(m)}</div>
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
              ref={rifNome}
              value={groupName}
              onChange={e => {
                setGroupName(e.target.value);
                setErrori(prec => (prec.groupName ? { ...prec, groupName: undefined } : prec));
              }}
              placeholder="Nome del gruppo..."
              style={boxF13WFull}
              aria-label="Nome del gruppo"
              {...ariaCampo("vd-chat-gruppo-nome-err", errori.groupName)}
            />
            <FieldError id="vd-chat-gruppo-nome-err">{errori.groupName}</FieldError>
          </div>
          <div style={stiliComuni.areaScorrevole}>
            {/* `tabIndex={-1}`: l'elenco dei membri non è un campo di form —
                sono righe cliccabili — ma il focus deve poterci arrivare
                quando è LUI a mancare, altrimenti il messaggio comparirebbe
                fuori dalla vista di chi ha scrollato.
                Niente `ariaCampo` qui, a differenza del nome del gruppo:
                `aria-invalid` è un attributo dei CONTROLLI, e metterlo su
                un'intestazione sarebbe ARIA che descrive una cosa che non
                esiste. Il messaggio si annuncia da sé — `FieldError` ha
                `role="alert"` — e il focus lo porta sotto gli occhi. */}
            <div ref={rifMembri} tabIndex={-1} style={txtF10Bold}>
              SELEZIONA MEMBRI ({selected.length} selezionati)
            </div>
            {errori.selected && (
              <div style={p14SenzaBordo}>
                <FieldError id="vd-chat-gruppo-membri-err">{errori.selected}</FieldError>
              </div>
            )}
            {available.map(m => {
              const isSel = selected.includes(m.id);
              const toggleQuesto = () => toggle(m.id);
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  onClick={toggleQuesto}
                  onKeyDown={attivaConTastiera(toggleQuesto)}
                  style={{
                  padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                  cursor: "pointer", background: isSel ? "rgba(212,168,67,0.08)" : "transparent",
                  transition: "background 0.15s",
                }}>
                  <Avatar memberId={m.id} size={36} />
                  <div style={stiliComuni.flex1}>
                    <div style={stiliComuni.txtF13Bold}>{m.name}</div>
                    <div style={stiliComuni.txtF11Muted}>{roleLabel(m)}</div>
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
            <button onClick={createGroup} style={boxFlex2Crea}>Crea gruppo</button>
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
