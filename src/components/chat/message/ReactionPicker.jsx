// src/components/chat/message/ReactionPicker.jsx
// Popover per reagire a un messaggio: preferite, recenti, elenco esteso.
import { useState } from "react";
import { useChatContext } from "../chatContext.js";
import {
  EMOJI_REACTIONS, EMOJI_EXPANDED, loadRecentReactions, pushRecentReaction,
} from "../chatReactions.js";
import { Z } from "../../../styles/tokens.js";
import { conTastiera } from "../../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF11Bold = { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 };
const rowGap2Mb8 = { display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 8 };
const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 };
const txtF11Bold2 = { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5 };
const boxF11Muted = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-muted)", fontSize: 11, padding: "2px 6px",
};
const gridGap2 = {
  display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2,
  maxHeight: 200, overflowY: "auto",
};
const boxF14Bold = {
  background: "var(--surface2)", border: "none", cursor: "pointer",
  fontSize: 14, padding: "4px 8px", borderRadius: 6,
  color: "var(--text-muted)", fontWeight: 700,
};


export const ReactionPicker = ({ onPick, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const { currentUserId } = useChatContext();
  // Snapshot dei recenti all'apertura del picker (lettura sincrona da storage,
  // già allineata col server allo open della chat — vedi syncRecentReactions).
  const [recents] = useState(loadRecentReactions);
  // Registra l'emoji nei recenti (locale + server), applica la reazione e chiude.
  const pick = (e) => { pushRecentReaction(e, currentUserId); onPick(e); onClose(); };

  const emojiBtn = {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 18, padding: 4, borderRadius: 6, transition: "background 0.15s",
  };
  const hoverOn = ev => ev.currentTarget.style.background = "var(--surface2)";
  const hoverOff = ev => ev.currentTarget.style.background = "transparent";

  return (
    // `role="group"`: il div non è lui stesso un controllo — l'onClick esiste
    // solo per fermare la propagazione (non richiude il picker quando si
    // clicca dentro) — le azioni vere sono i <button> di emoji qui sotto, già
    // nativamente raggiungibili da tastiera. L'onKeyDown rispecchia lo stesso
    // scopo dell'onClick (fermare la propagazione, non "attivare" nulla): non
    // è un caso per `attivaConTastiera`, che serve ad attivare un'azione.
    <div
      role="group"
      aria-label="Scegli una reazione"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      style={{
      position: "absolute", bottom: "calc(100% + 4px)", left: 0,
      background: "var(--card)", borderRadius: expanded ? 12 : 20,
      padding: expanded ? "8px 10px" : "6px 8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
      display: expanded ? "block" : "flex",
      gap: 2, zIndex: Z.dropdown, maxWidth: expanded ? 280 : "auto",
    }}>
      {expanded ? (
        <>
          {recents.length > 0 && (
            <>
              <div style={txtF11Bold}>
                RECENTI
              </div>
              <div style={rowGap2Mb8}>
                {recents.map(e => (
                  <button key={"r" + e} onClick={() => pick(e)} style={emojiBtn}
                    {...conTastiera(hoverOn, hoverOff)}>{e}</button>
                ))}
              </div>
            </>
          )}
          <div style={rowCenterBetween}>
            <span style={txtF11Bold2}>
              EMOJI ESTESE
            </span>
            <button onClick={() => setExpanded(false)} style={boxF11Muted}>← Indietro</button>
          </div>
          <div style={gridGap2}>
            {EMOJI_EXPANDED.map(e => (
              <button key={e} onClick={() => pick(e)} style={emojiBtn}
                {...conTastiera(hoverOn, hoverOff)}>{e}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          {EMOJI_REACTIONS.map(e => (
            <button key={e} onClick={() => pick(e)} style={emojiBtn}
              {...conTastiera(hoverOn, hoverOff)}>{e}</button>
          ))}
          <button
            onClick={() => setExpanded(true)}
            title="Altre emoji"
            style={boxF14Bold}
          >+</button>
        </>
      )}
    </div>
  );
};

// ─── CHAT: VOICE PLAYER ────────────────────────────────────────────────────
// Se il messaggio ha fileUrl (audio reale su storage) la riproduzione usa un
// elemento <audio> alimentato da una signed URL; in mancanza (vocali legacy/
