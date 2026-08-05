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

export const MessageComposer = ({ cv, cvd, fileInputRef, sendText, sendVoice, sendFile, notifyTyping }) => {
  const { input, recording, replyingTo, showAttach, showTemplates, uploading } = cv;
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
      <div style={{
        padding: "8px 14px", background: "var(--card)", borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ width: 3, alignSelf: "stretch", background: "var(--gold)", borderRadius: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-dark)" }}>
            Rispondi a {getMember(replyingTo.sender)?.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {replyingTo.type === "voice" ? "🎙️ Vocale" : replyingTo.type === "file" ? `📎 ${replyingTo.fileName}` : replyingTo.text}
          </div>
        </div>
        <button onClick={() => cvd({ type: "REPLYING", v: null })} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: "var(--text-muted)",
        }}>✕</button>
      </div>
    )}

    {/* Input */}
    <div style={{
      padding: "10px 12px", background: "var(--card)", borderTop: "1px solid var(--border)",
      // safe-area in basso: il composer resta sopra l'home-indicator/toolbar iOS.
      paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
      display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      position: "relative",
    }}>
      {recording ? (
        <VoiceRecorder onSend={sendVoice} onCancel={() => cvd({ type: "RECORDING", v: false })} />
      ) : (
        <>
          <div style={{ position: "relative" }}>
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
                  <button key={opt.kind} onClick={() => pickFile(opt.accept)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", border: "none", background: "transparent",
                    borderRadius: 8, cursor: "pointer", fontSize: 13, textAlign: "left",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ fontSize: 18 }}>{opt.icon}</span> {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Template messaggi (v2.8) */}
          {templates.length > 0 && (
            <div style={{ position: "relative" }}>
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
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, padding: "6px 10px 4px" }}>
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
                      style={{
                        display: "block", textAlign: "left", width: "100%",
                        padding: "8px 10px", border: "none", background: "transparent",
                        borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--heading)" }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
            style={{
              flex: 1, border: "1px solid var(--border)", borderRadius: 22,
              padding: "10px 16px", fontSize: 13.5, fontFamily: "inherit",
              outline: "none", background: "var(--surface)",
            }}
          />

          {input.trim() ? (
            <button onClick={sendText} style={{
              background: "var(--navy)", color: "#fff", border: "none",
              borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>↑</button>
          ) : (
            <button onClick={() => cvd({ type: "RECORDING", v: true })} style={{
              background: "var(--gold)", color: "var(--navy)", border: "none",
              borderRadius: "50%", width: 36, height: 36, cursor: "pointer",
              fontSize: 16, flexShrink: 0,
            }}>🎙️</button>
          )}
        </>
      )}
    </div>
    </>
  );
};
