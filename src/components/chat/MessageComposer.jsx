// src/components/chat/MessageComposer.jsx
// La barra di composizione: anteprima della risposta, allegati, template,
// registrazione vocale, invio.
//
// Estratta da ConversationView perché è l'unico blocco con concerns propri
// (upload, template, microfono) e perché nessuno di quei percorsi era
// raggiungibile da un test senza montare l'intera conversazione. Riceve lo
// stato locale `cv` per intero invece di otto prop separate: sono i campi di
// un solo reducer (convViewReducer), spacchettarli qui non aggiungerebbe
// niente se non punti in cui disallinearsi.
import { useAppData } from "../../state/AppDataContext.jsx";
import { useChatContext } from "./chatContext.js";
import { VoiceRecorder } from "./message/VoiceRecorder.jsx";
import { Z } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import { conTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap10 = {
  padding: "8px 14px", background: "var(--card)", borderTop: "1px solid var(--border)",
  display: "flex", alignItems: "center", gap: 10,
};
const boxW3R2 = { width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 2 };
const txtF11Bold = { fontSize: 11, fontWeight: 600, color: "var(--gold-dark)" };
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
// A-5 · la barra che dice perché il testo è tornato nel composer: senza,
// ricomparirebbe indistinguibile da una bozza qualsiasi, e l'unico segnale
// del fallimento sarebbe il toast già scaduto.
const rowInvioFallito = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "6px 14px", background: "var(--danger)", color: "#fff",
  fontSize: 12, fontWeight: 600,
};
const rowCenterRelative = {
  padding: "10px 12px", background: "var(--card)", borderTop: "1px solid var(--border)",
  // safe-area in basso: il composer resta sopra l'home-indicator/toolbar iOS.
  paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
  display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
  position: "stiliComuni.relative",
};
const rowCenterGap102 = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "8px 12px", border: "none", background: "transparent",
  borderRadius: 8, cursor: "pointer", fontSize: 13, textAlign: "left",
};
const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, padding: "6px 10px 4px" };
const boxWFullR8 = {
  display: "block", textAlign: "left", width: "100%",
  padding: "8px 10px", border: "none", background: "transparent",
  borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
};
const txtF12Bold = { fontSize: 12, fontWeight: 700, color: "var(--heading)" };
const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const boxFlex1F135 = {
  flex: 1, border: "1px solid var(--border)", borderRadius: 22,
  padding: "10px 16px", fontSize: 13.5, fontFamily: "inherit",
  outline: "none", background: "var(--surface)",
};
const boxF14Bold = {
  background: "var(--navy)", color: "#fff", border: "none",
  borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
  fontSize: 14, fontWeight: 700, flexShrink: 0,
};
const boxF16Navy = {
  background: "var(--gold)", color: "var(--navy)", border: "none",
  borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
  fontSize: 16, flexShrink: 0,
};

export const MessageComposer = ({ cv, cvd, fileInputRef, sendText, sendVoice, sendFile, notifyTyping }) => {
  const { input, recording, replyingTo, showAttach, showTemplates, uploading, invioFallito } = cv;
  const { messageTemplates: templates = [] } = useChatContext();
  const { getMember } = useAppData();

  // Il picker nativo viene aperto con un `accept` diverso per tipo; l'upload
  // vero (bucket privato 'chat-files') è responsabilità di sendFile.
  const pickFile = (accept) => {
    cvd({ type: "CLOSE_ATTACH" });
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  return (
    <>
    {/* Reply preview */}
    {replyingTo && (
      <div style={rowCenterGap10}>
        <div style={boxW3R2} />
        <div className="vd-flex-1-min0">
          <div style={txtF11Bold}>
            Rispondi a {getMember(replyingTo.sender)?.name}
          </div>
          <div style={txtF12Muted}>
            {replyingTo.type === "voice" ? "🎙️ Vocale" : replyingTo.type === "file" ? `📎 ${replyingTo.fileName}` : replyingTo.text}
          </div>
        </div>
        <button onClick={() => cvd({ type: "REPLYING", v: null })} style={stiliComuni.btnChiudi}>✕</button>
      </div>
    )}

    {/* A-5 · il testo è tornato nel composer perché l'invio precedente è
        fallito: senza questa riga sarebbe indistinguibile da una bozza. */}
    {invioFallito && (
      <div role="status" style={rowInvioFallito}>
        <span aria-hidden="true">⚠</span>
        <span>Non inviato — riprova</span>
      </div>
    )}

    {/* Input */}
    <div style={rowCenterRelative}>
      {recording ? (
        <VoiceRecorder onSend={sendVoice} onCancel={() => cvd({ type: "RECORDING", v: false })} />
      ) : (
        <>
          <div style={stiliComuni.relative}>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={e => {
                const f = e.target.files?.[0];
                e.target.value = "";
                sendFile(f);
              }}
            />
            <button onClick={() => cvd({ type: "TOGGLE_ATTACH" })} disabled={uploading} style={{
              background: "var(--surface2)", border: "none", borderRadius: "50%",
              width: 36, height: 36, cursor: uploading ? "wait" : "pointer", fontSize: 18, flexShrink: 0,
            }}>{uploading ? "⏳" : "📎"}</button>
            {showAttach && (
              <div className="slide-up" style={{
                position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                background: "var(--card)", borderRadius: 12, padding: 8,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
                display: "flex", flexDirection: "column", gap: 4, minWidth: 160, zIndex: Z.dropdown,
              }}>
                {[
                  { kind: "pdf", icon: "📄", label: "Documento PDF", accept: "application/pdf" },
                  { kind: "img", icon: "🖼️", label: "Immagine", accept: "image/*" },
                  { kind: "doc", icon: "📝", label: "Word/Excel", accept: ".doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.odt" },
                ].map(opt => (
                  <button key={opt.kind} onClick={() => pickFile(opt.accept)} style={rowCenterGap102}
                    {...conTastiera(
                      e => e.currentTarget.style.background = "var(--surface2)",
                      e => e.currentTarget.style.background = "transparent",
                    )}
                  >
                    <span style={stiliComuni.txtF18}>{opt.icon}</span> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Template messaggi (v2.8) */}
          {templates.length > 0 && (
            <div style={stiliComuni.relative}>
              <button
                onClick={() => cvd({ type: "TOGGLE_TMPL" })}
                title="Inserisci template"
                style={{
                  background: showTemplates ? "var(--navy)" : "var(--surface2)",
                  color: showTemplates ? "#fff" : "var(--text)",
                  border: "none", borderRadius: "50%",
                  width: 36, height: 36, cursor: "pointer", fontSize: 16, flexShrink: 0,
                }}
              >📋</button>
              {showTemplates && (
                <div className="slide-up" style={{
                  position: "absolute", bottom: "calc(100% + 8px)", left: 0,
                  background: "var(--card)", borderRadius: 12, padding: 6,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
                  display: "flex", flexDirection: "column", gap: 2,
                  minWidth: 260, maxWidth: 340, maxHeight: 320, overflowY: "auto", zIndex: Z.dropdown,
                }}>
                  <div style={txtF10Bold}>
                    Template messaggi
                  </div>
                  {templates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        // Inserisce alla posizione corrente (append con separatore o overwrite se vuoto)
                        cvd({ type: "APPEND_INPUT", v: t.text });
                        cvd({ type: "CLOSE_TMPL" });
                      }}
                      style={boxWFullR8}
                      {...conTastiera(
                        e => e.currentTarget.style.background = "var(--surface2)",
                        e => e.currentTarget.style.background = "transparent",
                      )}
                    >
                      <div style={txtF12Bold}>{t.label}</div>
                      <div style={txtF11Muted}>
                        {t.text}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <input
            value={input}
            onChange={e => { cvd({ type: "INPUT", v: e.target.value }); notifyTyping(); }}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
            placeholder="Scrivi un messaggio..."
            style={boxFlex1F135}
          />

          {input.trim() ? (
            <button onClick={sendText} style={boxF14Bold}>↑</button>
          ) : (
            <button onClick={() => cvd({ type: "RECORDING", v: true })} style={boxF16Navy}>🎙️</button>
          )}
        </>
      )}
    </div>
    </>
  );
};
