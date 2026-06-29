// ─── CHAT ────────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f). Include ChatContext (module-local) e
// tutti i sotto-componenti chat; esporta solo ChatPanel.
import { useState, useReducer, useEffect, useRef, useContext, createContext } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { Messages as MessagesAPI, Users as UsersAPI } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";
import { formatDate, formatTime } from "../../lib/taskUtils.js";
import { TEAM, CURRENT_USER, getMember } from "../../state/appGlobals.js";
import { MentionText } from "../ui/MentionText.jsx";

// Helper presenza (computePresence/PRESENCE_COLORS) usati solo dalla chat,
// spostati qui dal monolite insieme al cluster (Step P Phase 2f).
function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) {
    // 'busy' è manuale (heartbeat lo rinnova ogni 30s finché attivo)
    if (user.status === 'busy') return 'busy';
    return user.status === 'away' ? 'away' : 'online';
  }
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}
const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  busy: '#C0392B',
  offline: '#94a3b8',
};
const PRESENCE_LABELS = {
  online: 'Online',
  away: 'Assente',
  busy: 'Occupato',
  offline: 'Offline',
};

// Context per condividere tasks/dispatch (per messaggi con taskLink — v0.8)
const ChatContext = createContext({ tasks: [], dispatch: () => {}, messageTemplates: [], onForward: () => {} });

// ─── CHAT: UTILS ───────────────────────────────────────────────────────────
const formatChatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

const formatMsgTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const getConversationName = (conv) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== CURRENT_USER);
  return getMember(other)?.name || "Sconosciuto";
};

const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

export const getUnreadCount = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)).length;
};

// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

// Fase 3 — set esteso di emoji per la modalità "+" del picker. Raggruppate
// per blocchi di senso (sentiment, gesti, oggetti, simboli, attività) così
// l'utente trova rapidamente quello che cerca senza dover scrollare un
// catalogo gigante. ~48 totali = compromesso ragionevole copertura/peso UI.
const EMOJI_EXPANDED = [
  // sentiment
  "😀", "😅", "😍", "🤔", "😎", "😭", "😡", "🥳",
  // gesti
  "👏", "🙏", "🤝", "💪", "👌", "✋", "👋", "🤙",
  // simboli ok/no
  "✔️", "❌", "⚠️", "❓", "❗", "💯", "🆗", "⭐",
  // oggetti/lavoro
  "📌", "📎", "📅", "📞", "📧", "💼", "🏝️", "✈️",
  // tempo/soldi
  "⏰", "⏳", "💰", "💸", "🧾", "📊", "📈", "📉",
  // varie
  "🚀", "🎯", "🛠️", "🆘", "☕", "🍽️", "🎊", "✨",
];

// Fase 3 — reazioni recenti: le ultime emoji usate (anche dal set esteso)
// sono ricordate in localStorage e riproposte in cima al pannello esteso, così
// le custom usate spesso non vanno ricercate nella griglia ogni volta.
const RECENT_REACTIONS_KEY = "tullio_recent_reactions";
const RECENT_REACTIONS_MAX = 8;

const loadRecentReactions = () => {
  try {
    const arr = JSON.parse(localStorage.getItem(RECENT_REACTIONS_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter(e => typeof e === "string").slice(0, RECENT_REACTIONS_MAX) : [];
  } catch { return []; }
};

// Aggiunge un'emoji ai recenti. localStorage resta la cache veloce (lettura
// sincrona allo mount del picker); se l'utente è loggato (uuid reale) la lista
// completa viene anche sincronizzata server-side (user_app_preferences) così i
// recenti seguono l'utente su tutti i dispositivi.
const pushRecentReaction = (emoji, userId) => {
  const next = [emoji, ...loadRecentReactions().filter(e => e !== emoji)].slice(0, RECENT_REACTIONS_MAX);
  try {
    localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(next));
  } catch { /* localStorage non disponibile: si prosegue col solo sync server */ }
  if (userId && isUuid(userId)) {
    UsersAPI.setRecentReactions(userId, next)
      .then(r => { if (r?.error) console.error("[chat] recent reactions sync", r.error); })
      .catch(err => console.error("[chat] recent reactions sync", err));
  }
};

// All'apertura della chat allinea la cache locale con il server: se il server
// ha già dei recenti (anche da un altro dispositivo) sono la fonte di verità e
// sovrascrivono la cache; se il server è vuoto ma localmente esistono recenti
// pregressi, li migra al server una volta. No-op per utenti non loggati (mock).
const syncRecentReactionsFromServer = async (userId) => {
  if (!userId || !isUuid(userId)) return;
  try {
    const { data, error } = await UsersAPI.getPreferences(userId);
    if (error) return;
    const server = Array.isArray(data?.recent_reactions)
      ? data.recent_reactions.filter(e => typeof e === "string").slice(0, RECENT_REACTIONS_MAX)
      : [];
    if (server.length > 0) {
      try { localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(server)); } catch { /* cache non scrivibile */ }
    } else {
      const local = loadRecentReactions();
      if (local.length > 0) await UsersAPI.setRecentReactions(userId, local);
    }
  } catch (err) {
    console.error("[chat] recent reactions load", err);
  }
};

const ReactionPicker = ({ onPick, onClose }) => {
  const [expanded, setExpanded] = useState(false);
  const { currentUserId } = useContext(ChatContext);
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
    <div onClick={e => e.stopPropagation()} style={{
      position: "absolute", bottom: "calc(100% + 4px)", left: 0,
      background: "var(--card)", borderRadius: expanded ? 12 : 20,
      padding: expanded ? "8px 10px" : "6px 8px",
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)", border: "1px solid var(--border)",
      display: expanded ? "block" : "flex",
      gap: 2, zIndex: 100, maxWidth: expanded ? 280 : "auto",
    }}>
      {expanded ? (
        <>
          {recents.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>
                RECENTI
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 8 }}>
                {recents.map(e => (
                  <button key={"r" + e} onClick={() => pick(e)} style={emojiBtn}
                    onMouseEnter={hoverOn} onMouseLeave={hoverOff}>{e}</button>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: 0.5 }}>
              EMOJI ESTESE
            </span>
            <button onClick={() => setExpanded(false)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 11, padding: "2px 6px",
            }}>← Indietro</button>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2,
            maxHeight: 200, overflowY: "auto",
          }}>
            {EMOJI_EXPANDED.map(e => (
              <button key={e} onClick={() => pick(e)} style={emojiBtn}
                onMouseEnter={hoverOn} onMouseLeave={hoverOff}>{e}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          {EMOJI_REACTIONS.map(e => (
            <button key={e} onClick={() => pick(e)} style={emojiBtn}
              onMouseEnter={hoverOn} onMouseLeave={hoverOff}>{e}</button>
          ))}
          <button
            onClick={() => setExpanded(true)}
            title="Altre emoji"
            style={{
              background: "var(--surface2)", border: "none", cursor: "pointer",
              fontSize: 14, padding: "4px 8px", borderRadius: 6,
              color: "var(--text-muted)", fontWeight: 700,
            }}
          >+</button>
        </>
      )}
    </div>
  );
};

// ─── CHAT: VOICE PLAYER ────────────────────────────────────────────────────
// Se il messaggio ha fileUrl (audio reale su storage) la riproduzione usa un
// elemento <audio> alimentato da una signed URL; in mancanza (vocali legacy/
// simulati senza audio) si ricade sulla progressione finta a timer.
const VoicePlayer = ({ duration, waveform, isMine, fileUrl }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const audioRef = useRef(null);

  const hasRealAudio = !!fileUrl;

  // Lazy: crea l'elemento audio (signed URL) solo al primo play.
  const ensureAudio = async () => {
    if (audioRef.current) return audioRef.current;
    const { url, error } = await MessagesAPI.getFileUrl(fileUrl);
    if (error || !url) { console.error("[chat] voice signed url", error); return null; }
    const a = new Audio(url);
    a.addEventListener("timeupdate", () => {
      if (a.duration && isFinite(a.duration)) setProgress((a.currentTime / a.duration) * 100);
    });
    a.addEventListener("ended", () => { setPlaying(false); setProgress(0); });
    a.addEventListener("pause", () => setPlaying(false));
    audioRef.current = a;
    return a;
  };

  const toggleReal = async () => {
    const a = audioRef.current;
    if (playing && a) { a.pause(); return; }
    setLoadingAudio(true);
    const el = await ensureAudio();
    setLoadingAudio(false);
    if (!el) return;
    try { await el.play(); setPlaying(true); } catch (err) { console.error("[chat] voice play", err); }
  };

  // Progressione simulata: solo per i vocali senza audio reale.
  useEffect(() => {
    if (hasRealAudio || !playing) return;
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { setPlaying(false); return 0; }
        return p + (100 / (duration * 10));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, duration, hasRealAudio]);

  // Cleanup: ferma l'audio se il messaggio si smonta mentre suona.
  useEffect(() => () => { try { audioRef.current?.pause(); } catch { /* noop */ } }, []);

  const color = isMine ? "rgba(255,255,255,0.9)" : "var(--navy)";
  const dimColor = isMine ? "rgba(255,255,255,0.35)" : "var(--text-light)";
  const onToggle = hasRealAudio ? toggleReal : () => setPlaying(p => !p);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
      <button onClick={onToggle} disabled={loadingAudio} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMine ? "rgba(255,255,255,0.2)" : "var(--gold)",
        border: "none", cursor: loadingAudio ? "wait" : "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: isMine ? "#fff" : "var(--navy)", fontSize: 12,
        flexShrink: 0,
      }}>{loadingAudio ? "…" : playing ? "⏸" : "▶"}</button>

      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, height: 28 }}>
        {waveform.map((h, i) => {
          const barProgress = (i / waveform.length) * 100;
          const filled = barProgress <= progress;
          return (
            <div key={i} style={{
              flex: 1, height: `${h * 100}%`, minHeight: 3,
              background: filled ? color : dimColor,
              borderRadius: 1, transition: "background 0.1s",
            }} />
          );
        })}
      </div>

      <span style={{ fontSize: 11, color: isMine ? "rgba(255,255,255,0.8)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 32 }}>
        {formatDuration(Math.floor((100 - progress) / 100 * duration))}
      </span>
    </div>
  );
};

// Parsing task link nel testo dei messaggi (Step H).
// Riconosce il pattern generato da openChatTo+intent.taskLink:
//   🔗 Riferimento task: "TITLE"\n📅 Scadenza: DATE TIME\n\nRESTO
// Ritorna { taskTitle, taskDue, rest } o null se non match.
const TASK_LINK_RE = /^🔗 Riferimento task: "([^"]+)"\n📅 Scadenza:([^\n]*)\n\n([\s\S]*)$/;
function parseTaskLink(text) {
  if (typeof text !== "string") return null;
  const m = TASK_LINK_RE.exec(text);
  if (!m) return null;
  return { taskTitle: m[1], taskDue: m[2].trim(), rest: m[3] };
}


// Renderizza testo del messaggio con eventuale pill task cliccabile.
// Step K: lookup preferito per `taskRef` (UUID) se presente sul messaggio;
// fallback per titolo (compat messaggi vecchi senza taskRef).
const MessageTextContent = ({ text, isMine, taskRef }) => {
  const { tasks, dispatch } = useContext(ChatContext);
  const link = parseTaskLink(text);
  if (!link) {
    return <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}><MentionText text={text} /></div>;
  }
  // Step K: prima cerca per UUID, poi fallback al match titolo.
  const tByRef = taskRef ? (tasks || []).find(x => x.id === taskRef && !x.deletedAt) : null;
  const t = tByRef || (tasks || []).find(x => x.title === link.taskTitle && !x.deletedAt);
  const handleOpen = (e) => {
    e.stopPropagation();
    if (!t) return;
    dispatch?.({ type: "SET_SELECTED_TASK", payload: t });
  };
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: "break-word" }}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!t}
        title={t ? "Apri task" : "Task non disponibile"}
        style={{
          display: "block", textAlign: "left", width: "100%",
          background: isMine ? "rgba(255,255,255,0.12)" : "var(--surface2)",
          border: isMine ? "1px solid rgba(255,255,255,0.18)" : "1px solid var(--border)",
          color: "inherit",
          padding: "6px 10px", borderRadius: 8, marginBottom: link.rest ? 6 : 0,
          cursor: t ? "pointer" : "not-allowed", opacity: t ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, letterSpacing: 0.5 }}>
          🔗 RIFERIMENTO TASK
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
          {link.taskTitle}
        </div>
        {link.taskDue && (
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
            📅 {link.taskDue}
          </div>
        )}
      </button>
      {link.rest && <div><MentionText text={link.rest} /></div>}
    </div>
  );
};

// ─── CHAT: FILE HELPERS (Step M) ───────────────────────────────────────────
// Limite bucket 'chat-files' (vedi migration 20260611_chat_files_storage.sql).
// Replicato qui per validazione client prima di iniziare l'upload.
const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Deduce il "kind" UI (icona) dall'estensione del file caricato.
const fileKindFromName = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "img";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "default";
};

// fileSize reale è in byte (bigint su DB); i vecchi mock usano stringhe
// già formattate ("245 KB") → passthrough.
const formatFileSize = (size) => {
  if (typeof size !== "number") return size || "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

// ─── CHAT: MESSAGE ─────────────────────────────────────────────────────────
const ChatMessage = ({ msg, prevMsg, conv, allMessages, onReact, onReply, onTogglePin, onContextMenu }) => {
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { onForward } = useContext(ChatContext);
  const isMine = msg.sender === CURRENT_USER;
  const sender = getMember(msg.sender);
  const showAvatar = !prevMsg || prevMsg.sender !== msg.sender;
  const showName = conv.type === "group" && !isMine && showAvatar;

  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replyAuthor = replyMsg ? getMember(replyMsg.sender) : null;
  // Fase 3 forward: se valorizzato, il messaggio è un inoltro e
  // originalSenderId tiene l'UID dell'autore originale (preservato anche
  // attraverso catene di forward A→B→C).
  const originalSender = msg.originalSenderId ? getMember(msg.originalSenderId) : null;
  // Forwardable: testo, file e vocali. Per i file l'allegato viene copiato
  // nello storage della conv destinazione (path scoped per RLS); i vocali
  // sono simulati (duration + waveform) → si copiano direttamente.
  const canForward = !!onForward && ["text", "file", "voice"].includes(msg.type);

  // Read indicator
  const otherParticipants = conv.participants.filter(p => p !== CURRENT_USER);
  const readByAll = isMine && otherParticipants.every(p => msg.readBy?.includes(p));
  const readBySome = isMine && otherParticipants.some(p => msg.readBy?.includes(p));

  const fileIcons = { pdf: "📄", doc: "📝", img: "🖼️", xls: "📊", default: "📎" };

  // Step M: apre l'allegato con una signed URL temporanea dal bucket privato.
  const [fileOpening, setFileOpening] = useState(false);
  const openFile = async () => {
    if (!msg.fileUrl || fileOpening) return;
    setFileOpening(true);
    const { url, error } = await MessagesAPI.getFileUrl(msg.fileUrl);
    setFileOpening(false);
    if (error || !url) { console.error("[chat] signed url", error); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReactions(false); }}
      style={{
        display: "flex", flexDirection: isMine ? "row-reverse" : "row",
        gap: 8, marginTop: showAvatar ? 12 : 2, alignItems: "flex-end",
        position: "relative",
      }}>
      {/* Avatar */}
      <div style={{ width: 28, flexShrink: 0 }}>
        {!isMine && showAvatar && <Avatar memberId={msg.sender} size={28} />}
      </div>

      {/* Message bubble */}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", position: "relative" }}>
        {showName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: sender?.color, marginBottom: 3, marginLeft: 12 }}>
            {sender?.name}
          </div>
        )}

        <div style={{
          background: isMine ? "var(--navy)" : "var(--card)",
          color: isMine ? "#fff" : "var(--text)",
          padding: msg.type === "voice" ? "8px 12px" : "8px 12px",
          borderRadius: 14,
          borderTopRightRadius: isMine && showAvatar ? 4 : 14,
          borderTopLeftRadius: !isMine && showAvatar ? 4 : 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}>
          {/* Pin indicator (Fase 3): chip dorata in alto-fuori dal bubble.
              Visibile sempre quando msg.pinned, anche senza hover, così l'utente
              sa subito quali messaggi sono fissati senza dover aprire il filtro. */}
          {msg.pinned && (() => {
            // Audit (Fase 3 metadata): tooltip "Fissato da {nome} · {data}".
            const pinner = msg.pinnedBy ? getMember(msg.pinnedBy) : null;
            const pinTitle = pinner
              ? `Fissato da ${pinner.name}${msg.pinnedAt ? ` · ${formatDate(msg.pinnedAt)}` : ""}`
              : "Messaggio fissato";
            return (
              <div title={pinTitle} style={{
                position: "absolute", top: -8, [isMine ? "right" : "left"]: 8,
                background: "var(--gold)", color: "var(--navy)",
                fontSize: 10, fontWeight: 700, borderRadius: 99,
                padding: "1px 6px", display: "flex", alignItems: "center", gap: 3,
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)", cursor: "default",
              }}>
                <span style={{ fontSize: 9 }}>📌</span>
                <span>FISSATO</span>
              </div>
            );
          })()}
          {/* Forwarded badge (Fase 3): se originalSenderId è valorizzato,
              mostra "Inoltrato da {nome}". Il lookup avviene su TEAM globale
              (non sui partecipanti del conv) → funziona anche se l'autore
              originale non è in questa conversazione. */}
          {originalSender && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
              fontSize: 10.5, fontStyle: "italic",
              color: isMine ? "rgba(255,255,255,0.65)" : "var(--text-muted)",
            }}>
              <span>↪</span>
              <span>Inoltrato da {originalSender.name}</span>
            </div>
          )}

          {/* Reply preview */}
          {replyMsg && (
            <div style={{
              borderLeft: `3px solid ${isMine ? "var(--gold)" : replyAuthor?.color || "var(--navy)"}`,
              padding: "4px 8px", marginBottom: 6, borderRadius: 4,
              background: isMine ? "rgba(255,255,255,0.1)" : "var(--surface2)",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: isMine ? "var(--gold)" : replyAuthor?.color }}>
                {replyAuthor?.name}
              </div>
              <div style={{ opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                {replyMsg.type === "voice" ? "🎙️ Vocale" : replyMsg.type === "file" ? `📎 ${replyMsg.fileName}` : replyMsg.text}
              </div>
            </div>
          )}

          {/* Content */}
          {msg.type === "text" && (
            <MessageTextContent text={msg.text} isMine={isMine} taskRef={msg.taskRef} />
          )}

          {msg.type === "voice" && (
            <VoicePlayer duration={msg.duration} waveform={msg.waveform} isMine={isMine} fileUrl={msg.fileUrl} />
          )}

          {msg.type === "file" && (
            <div
              onClick={openFile}
              title={msg.fileUrl ? "Scarica file" : "File di esempio (nessun contenuto)"}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                minWidth: 220, cursor: msg.fileUrl ? "pointer" : "default",
              }}>
              <div style={{
                width: 40, height: 40, background: isMine ? "rgba(255,255,255,0.15)" : "var(--surface2)",
                borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{fileIcons[msg.fileType] || fileIcons.default}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.fileName}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{formatFileSize(msg.fileSize)}</div>
              </div>
              {msg.fileUrl && <div style={{ fontSize: 16, opacity: 0.7 }}>{fileOpening ? "⏳" : "⬇"}</div>}
            </div>
          )}

          {/* Timestamp + read indicator inside bubble */}
          <div style={{
            display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end",
            marginTop: 3, fontSize: 10, opacity: 0.7,
          }}>
            <span>{formatMsgTime(msg.time)}</span>
            {isMine && (
              <span style={{ fontSize: 12, lineHeight: 1, color: readByAll ? "var(--gold-light)" : "currentColor" }}>
                {readByAll ? "✓✓" : readBySome ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: "flex", gap: 3, marginTop: 4,
            marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
          }}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <div key={emoji} style={{
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: 99, padding: "2px 7px", fontSize: 11,
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                display: "flex", alignItems: "center", gap: 3,
              }}>
                <span style={{ fontSize: 13 }}>{emoji}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{users.length}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons (hover) */}
        {hovered && (
          <div style={{
            position: "absolute", top: -8, [isMine ? "left" : "right"]: -8,
            display: "flex", gap: 2, background: "var(--card)",
            border: "1px solid var(--border)", borderRadius: 99,
            padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}>
            <button onClick={() => setShowReactions(s => !s)} style={iconBtn}>😊</button>
            <button onClick={() => onReply(msg)} style={iconBtn}>↩</button>
            {canForward && (
              <button
                onClick={() => onForward(msg)}
                style={iconBtn}
                title="Inoltra a un'altra conversazione"
              >↪</button>
            )}
            {onTogglePin && (
              <button
                onClick={() => onTogglePin(msg.id)}
                style={iconBtn}
                title={msg.pinned ? "Rimuovi fissaggio" : "Fissa nella conversazione"}
              >{msg.pinned ? "📍" : "📌"}</button>
            )}
          </div>
        )}

        {showReactions && (
          <ReactionPicker
            onPick={(e) => onReact(msg.id, e)}
            onClose={() => setShowReactions(false)}
          />
        )}
      </div>
    </div>
  );
};

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
const VOICE_BARS = 30;

const randomWaveform = () => Array.from({ length: VOICE_BARS }, () => 0.3 + Math.random() * 0.6);

// Sceglie un container/codec audio supportato dal browser per MediaRecorder.
const pickAudioMime = () => {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return cands.find(t => MediaRecorder.isTypeSupported(t)) || "";
};

// Estrae una waveform (VOICE_BARS campioni, valori 0..1) decodificando il blob
// audio registrato e prendendo il picco per bucket. Fallback random se il
// browser non sa decodificare quel codec (così il messaggio resta valido).
async function computeWaveform(blob) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !blob) throw new Error("AudioContext non disponibile");
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const data = audio.getChannelData(0);
    const block = Math.floor(data.length / VOICE_BARS) || 1;
    const bars = [];
    let max = 0.0001;
    for (let i = 0; i < VOICE_BARS; i++) {
      let peak = 0;
      for (let j = 0; j < block; j++) {
        const v = Math.abs(data[i * block + j] || 0);
        if (v > peak) peak = v;
      }
      bars.push(peak);
      if (peak > max) max = peak;
    }
    try { ctx.close(); } catch { /* noop */ }
    return bars.map(b => Math.max(0.12, b / max)); // normalizza, minimo visibile
  } catch {
    return randomWaveform();
  }
}

// Registrazione vocale reale via MediaRecorder. Se il microfono non è
// disponibile (permesso negato, contesto non sicuro, demo senza hardware) si
// degrada al comportamento simulato (waveform random, nessun audio) così la
// feature resta utilizzabile ovunque.
const VoiceRecorder = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef("");
  const simulatedRef = useRef(false);
  const sentRef = useRef(false);

  // Timer durata: si ferma quando parte l'invio.
  useEffect(() => {
    if (sending) return;
    const i = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [sending]);

  // Avvia la registrazione reale; in caso d'errore marca "simulato".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          throw new Error("MediaRecorder non disponibile");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const mime = pickAudioMime();
        mimeRef.current = mime;
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start();
        recorderRef.current = rec;
      } catch {
        simulatedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
      try { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); } catch { /* noop */ }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stopStream = () => streamRef.current?.getTracks().forEach(t => t.stop());

  const handleCancel = () => {
    try { if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop(); } catch { /* noop */ }
    stopStream();
    onCancel();
  };

  const handleSend = () => {
    if (sentRef.current) return;
    sentRef.current = true;
    setSending(true);
    const dur = Math.max(1, seconds);
    const rec = recorderRef.current;
    const sendSimulated = () => { stopStream(); onSend({ blob: null, duration: dur, waveform: randomWaveform(), mimeType: null }); };
    if (simulatedRef.current || !rec) { sendSimulated(); return; }
    rec.onstop = async () => {
      try {
        const type = mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const waveform = await computeWaveform(blob);
        stopStream();
        onSend({ blob, duration: dur, waveform, mimeType: type });
      } catch (err) {
        console.error("[chat] voice stop", err);
        sendSimulated();
      }
    };
    try { rec.stop(); } catch { sendSimulated(); }
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)",
      flex: 1,
    }}>
      <div className="record-pulse" style={{
        width: 10, height: 10, borderRadius: "50%",
        background: sending ? "var(--text-muted)" : "var(--danger)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center", height: 20 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, background: "var(--navy)",
            height: `${30 + Math.random() * 70}%`, minHeight: 3,
            borderRadius: 1,
            animation: sending ? "none" : `wave 0.${4 + (i % 5)}s ease infinite`,
            animationDelay: `${i * 0.05}s`,
            opacity: sending ? 0.4 : 1,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: sending ? "var(--text-muted)" : "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        {sending ? "Invio…" : formatDuration(seconds)}
      </span>
      <button onClick={handleCancel} disabled={sending} style={{
        background: "var(--surface2)", border: "none", borderRadius: "50%",
        width: 30, height: 30, cursor: sending ? "default" : "pointer", fontSize: 14,
        opacity: sending ? 0.5 : 1,
      }}>✕</button>
      <button onClick={handleSend} disabled={sending} style={{
        background: "var(--gold)", color: "var(--navy)", border: "none",
        borderRadius: "50%", width: 30, height: 30, cursor: sending ? "wait" : "pointer",
        fontSize: 14, fontWeight: 700,
      }}>↑</button>
    </div>
  );
};

// ─── CHAT: REDUCERS ────────────────────────────────────────────────────────
// convViewReducer: local UI state for an open conversation.
// Keeps related fields atomic: e.g. AFTER_SEND clears input+replyingTo+taskRef in one step.
const convViewInitial = {
  input: "", recording: false, replyingTo: null,
  showAttach: false, showTemplates: false,
  showMsgSearch: false, msgSearch: "", showPinnedOnly: false,
  typing: false, pendingTaskRef: null, uploading: false,
};
function convViewReducer(s, a) {
  switch (a.type) {
    case "INPUT":          return { ...s, input: a.v };
    case "APPEND_INPUT":   return { ...s, input: s.input ? `${s.input}\n${a.v}` : a.v };
    case "AFTER_SEND":     return { ...s, input: "", replyingTo: null, pendingTaskRef: null };
    case "RECORDING":      return { ...s, recording: a.v };
    case "REPLYING":       return { ...s, replyingTo: a.v };
    case "TOGGLE_ATTACH":  return { ...s, showAttach: !s.showAttach, showTemplates: false };
    case "CLOSE_ATTACH":   return { ...s, showAttach: false };
    case "TOGGLE_TMPL":    return { ...s, showTemplates: !s.showTemplates, showAttach: false };
    case "CLOSE_TMPL":     return { ...s, showTemplates: false };
    case "TOGGLE_SEARCH":  return { ...s, showMsgSearch: !s.showMsgSearch, msgSearch: "" };
    case "SEARCH":         return { ...s, msgSearch: a.v };
    case "CLOSE_SEARCH":   return { ...s, showMsgSearch: false, msgSearch: "" };
    case "TOGGLE_PINNED":  return { ...s, showPinnedOnly: !s.showPinnedOnly };
    case "TYPING":         return { ...s, typing: a.v };
    case "UPLOADING":      return { ...s, uploading: a.v };
    case "PREFILL":        return { ...s, input: a.text, pendingTaskRef: a.taskRef ?? null };
    default: return s;
  }
}

// chatPanelReducer: navigation state for the whole chat panel.
const chatPanelInitial = {
  activeConv: null, newMode: false,
  prefillText: "", prefillTaskRef: null, forwardingMsg: null,
};
function chatPanelReducer(s, a) {
  switch (a.type) {
    case "ACTIVATE":      return { ...s, activeConv: a.conv, newMode: false };
    case "BACK":          return { ...s, activeConv: null, prefillText: "", prefillTaskRef: null };
    case "NEW_MODE":      return { ...s, newMode: a.v };
    case "PREFILL":       return { ...s, prefillText: a.text, prefillTaskRef: a.taskRef ?? null };
    case "CLEAR_PREFILL": return { ...s, prefillText: "", prefillTaskRef: null };
    case "FWD_START":     return { ...s, forwardingMsg: a.payload };
    case "FWD_CLEAR":     return { ...s, forwardingMsg: null };
    default: return s;
  }
}

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
const ConversationView = ({ conv, messages, setMessages, markConversationRead, onBack, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const [cv, cvd] = useReducer(convViewReducer, convViewInitial);
  const { input, recording, replyingTo, showAttach, showTemplates,
          showMsgSearch, msgSearch, showPinnedOnly, typing,
          pendingTaskRef, uploading } = cv;
  const { messageTemplates: templates = [] } = useContext(ChatContext);
  const scrollRef = useRef(null);
  // Step M: upload allegati reale
  const fileInputRef = useRef(null);
  const { dispatch } = useContext(ChatContext);
  // Guardia unmount: setState dopo unmount (utente chiude la chat mid-upload)
  // genera un warning React e perde la callback di errore.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Se è arrivato un prefill (es. da "contatta agente" su urgenti altrui), popolalo
  useEffect(() => {
    if (initialInput) {
      cvd({ type: "PREFILL", text: initialInput, taskRef: initialTaskRef ?? null });
      if (onInitialInputConsumed) onInitialInputConsumed();
    }
  }, [initialInput, initialTaskRef]);

  const msgs = messages[conv.id] || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // Mark as read on open (Step Q.4: 1 RPC bulk invece di N UPDATE per msg)
  useEffect(() => {
    if (markConversationRead) {
      markConversationRead(conv.id);
      return;
    }
    // Fallback per i call site che non passano il callback (eg. test)
    setMessages(prev => ({
      ...prev,
      [conv.id]: (prev[conv.id] || []).map(m => {
        if (m.sender !== CURRENT_USER && !m.readBy?.includes(CURRENT_USER)) {
          return { ...m, readBy: [...(m.readBy || []), CURRENT_USER] };
        }
        return m;
      })
    }));
  }, [conv.id]);

  // Simulate someone typing
  useEffect(() => {
    if (msgs.length === 0) return;
    const last = msgs[msgs.length - 1];
    if (last.sender === CURRENT_USER) {
      const timer = setTimeout(() => cvd({ type: "TYPING", v: true }), 800);
      const stop = setTimeout(() => cvd({ type: "TYPING", v: false }), 3500);
      return () => { clearTimeout(timer); clearTimeout(stop); };
    }
  }, [msgs.length]);

  const sendText = () => {
    if (!input.trim()) return;
    // Step K: se il testo che sta partendo contiene un pattern "🔗 Riferimento task: ..."
    // (perché viene da prefill o l'utente l'ha mantenuto), allega taskRef UUID.
    const textOut = input.trim();
    const stillHasLink = parseTaskLink(textOut) !== null;
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "text",
      text: textOut, time: new Date().toISOString(),
      readBy: [CURRENT_USER],
      replyTo: replyingTo?.id,
      ...(stillHasLink && pendingTaskRef ? { taskRef: pendingTaskRef } : {}),
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    cvd({ type: "AFTER_SEND" });
  };

  // Riceve il payload dal VoiceRecorder: { blob, duration, waveform, mimeType }.
  // Carica l'audio reale solo su conversazioni vere (uuid); sui mock o quando il
  // microfono non era disponibile (blob null) resta un vocale simulato.
  const sendVoice = async ({ blob, duration, waveform, mimeType }) => {
    let fileUrl = null;
    let fileType = null;
    if (blob && isUuid(conv.id)) {
      const { path, error } = await MessagesAPI.uploadVoice(blob, conv.id, mimeType || "audio/webm");
      if (!mountedRef.current) return;
      if (error || !path) {
        console.error("[chat] voice upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Invio vocale fallito: ${error?.message || "errore sconosciuto"}` } });
        cvd({ type: "RECORDING", v: false });
        return;
      }
      fileUrl = path;
      fileType = mimeType || null;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "voice",
      duration, waveform: waveform || randomWaveform(), fileUrl, fileType,
      time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
    cvd({ type: "RECORDING", v: false });
  };

  // Step M: il picker nativo viene aperto con un accept diverso per tipo;
  // l'upload va sul bucket privato 'chat-files' e il messaggio porta il path.
  const pickFile = (accept) => {
    cvd({ type: "CLOSE_ATTACH" });
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = accept;
    fileInputRef.current.click();
  };

  const sendFile = async (file) => {
    if (!file || uploading) return;
    // Validazione client del limite del bucket (vedi migration
    // 20260611_chat_files_storage.sql): senza, l'utente vede l'errore
    // solo dopo aver caricato fino al rifiuto Storage.
    if (file.size > MAX_FILE_SIZE) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` } });
      return;
    }
    // Conv mock (id non-uuid, smoke-test senza login): nessuno storage,
    // il messaggio resta solo locale senza fileUrl.
    let fileUrl = null;
    if (isUuid(conv.id)) {
      cvd({ type: "UPLOADING", v: true });
      const { path, error } = await MessagesAPI.uploadFile(file, conv.id);
      if (!mountedRef.current) return;
      cvd({ type: "UPLOADING", v: false });
      if (error || !path) {
        console.error("[chat] upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Upload fallito: ${error?.message || "errore sconosciuto"}` } });
        return;
      }
      fileUrl = path;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: CURRENT_USER, type: "file",
      fileName: file.name, fileSize: file.size,
      fileType: fileKindFromName(file.name), fileUrl,
      time: new Date().toISOString(),
      readBy: [CURRENT_USER],
    };
    setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
  };

  const handleReact = (msgId, emoji) => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: prev[conv.id].map(m => {
        if (m.id !== msgId) return m;
        const reactions = { ...(m.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(CURRENT_USER)) {
          reactions[emoji] = users.filter(u => u !== CURRENT_USER);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, CURRENT_USER];
        }
        return { ...m, reactions };
      })
    }));
  };

  // Fase 3 pin: stato group-level. Toggle via wrapper setMessages → diff
  // pinned → MessagesAPI.setPinned. Niente API ottimistica diversa: il
  // wrapper persiste, l'UI si aggiorna dal local set immediatamente.
  // pinnedBy/pinnedAt: audit (chi/quando) valorizzato al pin, azzerato all'unpin.
  const handleTogglePin = (msgId) => {
    setMessages(prev => ({
      ...prev,
      [conv.id]: (prev[conv.id] || []).map(m => {
        if (m.id !== msgId) return m;
        const willPin = !m.pinned;
        return {
          ...m,
          pinned: willPin,
          pinnedBy: willPin ? CURRENT_USER : null,
          pinnedAt: willPin ? new Date().toISOString() : null,
        };
      }),
    }));
  };

  const otherTypingMember = conv.participants.find(p => p !== CURRENT_USER);
  const otherMember = conv.type === "direct" ? getMember(otherTypingMember) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface2)" }}>
      {/* Header */}
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
        borderBottom: "1px solid rgba(212,168,67,0.2)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>

        {conv.type === "direct" ? (
          <Avatar memberId={otherTypingMember} size={36} />
        ) : (
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "var(--gold)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>{conv.icon || "👥"}</div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {getConversationName(conv)}
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
            {typing ? (
              <span style={{ color: "var(--gold-light)" }}>
                {conv.type === "group" ? `${getMember(otherTypingMember)?.name.split(" ")[0]} sta scrivendo` : "sta scrivendo"}
                <span style={{ animation: "typing 1s infinite", animationDelay: "0s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.2s", display: "inline-block" }}>.</span>
                <span style={{ animation: "typing 1s infinite", animationDelay: "0.4s", display: "inline-block" }}>.</span>
              </span>
            ) : conv.type === "direct" ? (
              <>● Online</>
            ) : (
              `${conv.participants.length} membri`
            )}
          </div>
        </div>

        {/* Pill "📌 N fissati" — visibile solo se ci sono messaggi fissati.
            Click → toggle del filtro showPinnedOnly. Stato premuto evidenziato
            in oro per richiamare visivamente la modalità filtro attiva. */}
        {msgs.some(m => m.pinned) && (() => {
          const pinnedCount = msgs.filter(m => m.pinned).length;
          return (
            <button
              onClick={() => cvd({ type: "TOGGLE_PINNED" })}
              title={showPinnedOnly ? "Mostra tutti i messaggi" : "Mostra solo i messaggi fissati"}
              style={{
                background: showPinnedOnly ? "rgba(212,168,67,0.35)" : "rgba(255,255,255,0.1)",
                border: "none", color: "#fff",
                height: 30, padding: "0 10px", borderRadius: 6, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span>📌</span>
              <span>{pinnedCount}</span>
            </button>
          );
        })()}
        <button
          onClick={() => cvd({ type: "TOGGLE_SEARCH" })}
          title="Cerca nei messaggi"
          style={{
            background: showMsgSearch ? "rgba(212,168,67,0.25)" : "rgba(255,255,255,0.1)",
            border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>🔍</button>
      </div>

      {/* Search bar (v2.8 Round 13) */}
      {showMsgSearch && (
        <div style={{
          background: "var(--navy-dark)", padding: "8px 12px",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          borderBottom: "1px solid rgba(212,168,67,0.15)",
        }}>
          <input
            autoFocus
            value={msgSearch}
            onChange={e => cvd({ type: "SEARCH", v: e.target.value })}
            placeholder="Cerca nei messaggi…"
            style={{
              flex: 1, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#fff",
              outline: "none", fontFamily: "inherit",
            }}
          />
          {msgSearch && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>
              {msgs.filter(m => m.text?.toLowerCase().includes(msgSearch.toLowerCase())).length} risultati
            </span>
          )}
          <button onClick={() => cvd({ type: "CLOSE_SEARCH" })} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16,
          }}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        background: "var(--surface2)",
      }}>
        {(() => {
          const q = msgSearch.toLowerCase();
          // Filtro: pinned-only + ricerca testo (AND). Mantengo il riferimento
          // a `msgs` per `prevMsg`/`allMessages` (mostra reply/avatar coerenti
          // con la timeline intera, non solo il sottoinsieme filtrato).
          const visible = msgs.filter(m => {
            if (showPinnedOnly && !m.pinned) return false;
            if (msgSearch && !m.text?.toLowerCase().includes(q)) return false;
            return true;
          });
          return visible.map((m) => {
            const i = msgs.indexOf(m);
            return (
              <ChatMessage
                key={m.id}
                msg={m}
                prevMsg={msgs[i - 1]}
                conv={conv}
                allMessages={msgs}
                onReact={handleReact}
                onReply={(m) => cvd({ type: "REPLYING", v: m })}
                onTogglePin={handleTogglePin}
              />
            );
          });
        })()}
        {typing && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
            <Avatar memberId={otherTypingMember} size={28} />
            <div style={{
              background: "var(--card)", border: "1px solid var(--border)",
              borderRadius: 14, borderTopLeftRadius: 4, padding: "8px 12px",
              display: "flex", gap: 3, alignItems: "center",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.2s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)", animation: "typing 1s infinite", animationDelay: "0.4s" }} />
            </div>
          </div>
        )}
      </div>

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
                  display: "flex", flexDirection: "column", gap: 4, minWidth: 160, zIndex: 100,
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
                    minWidth: 260, maxWidth: 340, maxHeight: 320, overflowY: "auto", zIndex: 100,
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
              onChange={e => cvd({ type: "INPUT", v: e.target.value })}
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
    </div>
  );
};

// ─── CHAT: LIST OF CONVERSATIONS ───────────────────────────────────────────
const ConversationList = ({ conversations, messages, onSelect, onNew }) => {
  const { presenceMap } = useContext(ChatContext);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const sorted = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const lastA = getLastMessage(messages, a.id);
    const lastB = getLastMessage(messages, b.id);
    if (!lastA) return 1;
    if (!lastB) return -1;
    return new Date(lastB.time) - new Date(lastA.time);
  });

  const matchesSearch = (c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    // 1) nome conversazione
    if (getConversationName(c).toLowerCase().includes(q)) return true;
    // 2) nomi partecipanti
    const partNames = (c.participants || [])
      .map(id => getMember(id)?.name || "")
      .join(" ")
      .toLowerCase();
    if (partNames.includes(q)) return true;
    // 3) ultimi 30 messaggi della conversazione (testo)
    const msgs = (messages[c.id] || []).slice(-30);
    for (const m of msgs) {
      if (m.type === "text" && m.text && m.text.toLowerCase().includes(q)) return true;
      if (m.type === "file" && m.fileName && m.fileName.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  const filtered = sorted.filter(c => {
    if (filter === "direct" && c.type !== "direct") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && getUnreadCount(messages, c.id) === 0) return false;
    if (!matchesSearch(c)) return false;
    return true;
  });

  const totalUnread = conversations.reduce((acc, c) => acc + getUnreadCount(messages, c.id), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: 13 }}>🔍</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 8,
              padding: "8px 12px 8px 34px", fontSize: 13, fontFamily: "inherit",
              outline: "none", background: "var(--surface)",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {[
            { id: "all", label: "Tutti" },
            { id: "unread", label: `Non letti${totalUnread ? ` (${totalUnread})` : ""}` },
            { id: "direct", label: "Diretti" },
            { id: "group", label: "Gruppi" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              border: "1px solid var(--border)", borderRadius: 99,
              background: filter === f.id ? "var(--navy)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--text-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(c => {
          const last = getLastMessage(messages, c.id);
          const unread = getUnreadCount(messages, c.id);
          // Fase 3: quanti messaggi fissati ha questa conversazione → badge.
          const pinnedCount = (messages[c.id] || []).filter(m => m.pinned).length;
          const lastSender = last ? getMember(last.sender) : null;
          const otherUser = c.type === "direct" ? c.participants.find(p => p !== CURRENT_USER) : null;

          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              borderBottom: "1px solid var(--border)", cursor: "pointer",
              transition: "background 0.15s",
              background: unread > 0 ? "rgba(212,168,67,0.05)" : "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = unread > 0 ? "rgba(212,168,67,0.05)" : "transparent"}
            >
              {c.type === "direct" ? (
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar memberId={otherUser} size={42} />
                  {(() => {
                    const u = (presenceMap || {})[otherUser];
                    const p = u ? computePresence(u) : 'offline';
                    return (
                      <div title={PRESENCE_LABELS[p] || p} style={{
                        position: "absolute", bottom: 0, right: 0, width: 11, height: 11,
                        borderRadius: "50%", background: PRESENCE_COLORS[p],
                        border: "2px solid #fff",
                      }} />
                    );
                  })()}
                </div>
              ) : (
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", background: "var(--gold)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, flexShrink: 0,
                }}>{c.icon || "👥"}</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, flex: 1 }}>
                    {c.pinned && <span style={{ fontSize: 10, color: "var(--gold)" }}>📌</span>}
                    <span style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getConversationName(c)}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                    {last && formatChatTime(last.time)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <div style={{
                    fontSize: 12, color: unread > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: unread > 0 ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
                  }}>
                    {last ? (
                      <>
                        {last.sender === CURRENT_USER && <span style={{ color: "var(--text-muted)" }}>Tu: </span>}
                        {c.type === "group" && last.sender !== CURRENT_USER && (
                          <span style={{ color: lastSender?.color, fontWeight: 600 }}>
                            {lastSender?.name.split(" ")[0]}:{" "}
                          </span>
                        )}
                        {last.type === "voice" ? "🎙️ Messaggio vocale" :
                          last.type === "file" ? `📎 ${last.fileName}` :
                            last.text}
                      </>
                    ) : "Nessun messaggio"}
                  </div>
                  {pinnedCount > 0 && (
                    <div title={`${pinnedCount} ${pinnedCount === 1 ? "messaggio fissato" : "messaggi fissati"}`} style={{
                      display: "flex", alignItems: "center", gap: 1,
                      fontSize: 10, color: "var(--gold)", fontWeight: 700, flexShrink: 0,
                    }}>📌{pinnedCount}</div>
                  )}
                  {unread > 0 && (
                    <div style={{
                      background: "var(--gold)", color: "var(--navy)", fontSize: 10, fontWeight: 700,
                      borderRadius: 99, padding: "1px 6px", minWidth: 18, textAlign: "center", flexShrink: 0,
                    }}>{unread}</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13 }}>Nessuna conversazione trovata</div>
          </div>
        )}
      </div>

      <button onClick={onNew} style={{
        margin: 14, padding: "10px", background: "var(--navy)", color: "#fff",
        border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      }}>✏️ Nuova chat</button>
    </div>
  );
};

// ─── CHAT: NEW CONVERSATION ────────────────────────────────────────────────
const NewConversationView = ({ onCreate, onCancel, existing }) => {
  const [mode, setMode] = useState("select"); // select | group
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");

  const available = TEAM.filter(m => m.id !== CURRENT_USER);

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const createDirect = (memberId) => {
    const found = existing.find(c => c.type === "direct" && c.participants.includes(memberId));
    if (found) { onCreate(found); return; }
    const newConv = {
      id: "c" + Date.now(), type: "direct",
      participants: [CURRENT_USER, memberId], name: null,
    };
    onCreate(newConv, true);
  };

  const createGroup = () => {
    if (!groupName.trim() || selected.length < 2) return;
    const newConv = {
      id: "c" + Date.now(), type: "group",
      participants: [CURRENT_USER, ...selected],
      name: groupName.trim(), icon: "👥",
    };
    onCreate(newConv, true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        background: "var(--navy)", padding: "12px 16px", display: "flex",
        alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
          width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
        }}>←</button>
        <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>
          {mode === "select" ? "Nuova conversazione" : "Nuovo gruppo"}
        </div>
      </div>

      {mode === "select" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <button onClick={() => setMode("group")} style={{
              width: "100%", padding: "10px 14px", background: "var(--surface2)",
              border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer",
              fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>👥</span> Crea nuovo gruppo
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
              MEMBRI DEL TEAM
            </div>
            {available.map(m => (
              <div key={m.id} onClick={() => createDirect(m.id)} style={{
                padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
                cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Avatar memberId={m.id} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "group" && (
        <>
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Nome del gruppo..."
              style={{
                width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                padding: "9px 12px", fontSize: 13, fontFamily: "inherit", outline: "none",
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div style={{ padding: "10px 14px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1 }}>
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
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
          <div style={{ padding: 14, borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
            <button onClick={() => setMode("select")} style={{
              flex: 1, padding: "10px", background: "transparent", border: "1px solid var(--border)",
              borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500,
            }}>Indietro</button>
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
// messaggio decrescente) → l'admin trova subito chi ha contattato per ultimo.
const ForwardPicker = ({ msg, conversations, messages, onPick, onClose }) => {
  const [search, setSearch] = useState("");
  const sorted = [...conversations]
    .filter(c => c.id !== msg.__sourceConvId && isUuid(c.id))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      const lastA = getLastMessage(messages, a.id);
      const lastB = getLastMessage(messages, b.id);
      if (!lastA) return 1;
      if (!lastB) return -1;
      return new Date(lastB.time) - new Date(lastA.time);
    });
  const q = search.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(c => {
        if (getConversationName(c).toLowerCase().includes(q)) return true;
        const partNames = (c.participants || [])
          .map(id => getMember(id)?.name || "")
          .join(" ")
          .toLowerCase();
        return partNames.includes(q);
      })
    : sorted;

  // Preview del messaggio da inoltrare: etichetta dedicata per file/voice,
  // testo troncato altrimenti.
  const preview = msg.type === "file"
    ? `📎 ${msg.fileName || "Allegato"}`
    : msg.type === "voice"
      ? "🎙️ Messaggio vocale"
      : (msg.text?.length > 120 ? msg.text.slice(0, 117) + "…" : (msg.text || ""));

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,21,45,0.45)", zIndex: 900,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(420px, 96vw)", maxHeight: "78dvh",
        background: "var(--card)", borderRadius: 14, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 700, color: "var(--heading)", marginBottom: 6 }}>
            ↪ Inoltra a…
          </div>
          {preview && (
            <div style={{
              fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)",
              padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid var(--gold)",
              maxHeight: 56, overflow: "hidden", lineHeight: 1.4,
            }}>{preview}</div>
          )}
        </div>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione…"
            autoFocus
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Nessuna conversazione disponibile.
            </div>
          ) : filtered.map(c => {
            const otherUid = c.type === "direct"
              ? (c.participants || []).find(p => p !== CURRENT_USER)
              : null;
            const last = getLastMessage(messages, c.id);
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", background: "none", border: "none",
                  borderBottom: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {c.type === "direct" && otherUid ? (
                  <Avatar memberId={otherUid} size={32} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "var(--gold)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>{c.icon || "👥"}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {getConversationName(c)}
                  </div>
                  {last && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                      {last.type === "text" ? last.text : last.type === "file" ? `📎 ${last.fileName}` : "🎙️ Vocale"}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--border)",
            padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12.5,
            color: "var(--text)", fontFamily: "inherit",
          }}>Annulla</button>
        </div>
      </div>
    </div>
  );
};

export const ChatPanel = ({ open, onClose, conversations, setConversations, messages, setMessages, markConversationRead, intent, tasks, currentUserId, dispatch, presenceMap, messageTemplates = [], loading = false, myBusy = false, onToggleBusy }) => {
  const { isMobile } = useViewport();
  const [ps, pd] = useReducer(chatPanelReducer, chatPanelInitial);
  const { activeConv, newMode, prefillText, prefillTaskRef, forwardingMsg } = ps;

  const handleForwardStart = (msg) => {
    pd({ type: "FWD_START", payload: { ...msg, __sourceConvId: activeConv?.id ?? null } });
  };

  const handleForwardPick = async (destConvId) => {
    const src = forwardingMsg;
    pd({ type: "FWD_CLEAR" });
    if (!src || !destConvId) return;
    const me = currentUserId || CURRENT_USER;
    // Preserva l'autore originale anche su forward chain (A→B→C): se src è
    // già un forward, ereditiamo il suo originalSenderId; altrimenti è src.sender.
    const originalSenderId = src.originalSenderId || src.sender;
    const base = {
      // id provvisorio: il wrapper setMessages in VoyageDesk normalizza in UUID
      // se non lo è (vedi caveat newId).
      id: "m" + Date.now(),
      sender: me,
      time: new Date().toISOString(),
      readBy: [me],
      originalSenderId,
    };

    let newMsg;
    if (src.type === "voice") {
      // Vocale: copia metadata (duration/waveform). Se ha audio reale su storage
      // lo si copia server-side nella conv destinazione (come gli allegati file);
      // i vocali legacy/simulati (senza fileUrl) restano solo metadata.
      newMsg = { ...base, type: "voice", duration: src.duration, waveform: src.waveform, fileType: src.fileType ?? null, fileUrl: null };
      if (src.fileUrl && isUuid(destConvId)) {
        const voiceName = `voice.${(src.fileUrl.split(".").pop() || "webm").toLowerCase()}`;
        const { path, error } = await MessagesAPI.copyFile(src.fileUrl, destConvId, voiceName);
        if (error || !path) {
          console.error("[chat] forward voice copyFile", error);
          if (dispatch) dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Inoltro vocale fallito: ${error?.message || "errore sconosciuto"}` } });
          return;
        }
        newMsg.fileUrl = path;
      }
    } else if (src.type === "file") {
      newMsg = {
        ...base, type: "file",
        fileName: src.fileName, fileSize: src.fileSize, fileType: src.fileType,
        fileUrl: null,
      };
      // Copia l'allegato nello storage della conv destinazione (solo se la
      // sorgente ha un path reale e la dest è una conv vera, non mock).
      if (src.fileUrl && isUuid(destConvId)) {
        const { path, error } = await MessagesAPI.copyFile(src.fileUrl, destConvId, src.fileName);
        if (error || !path) {
          console.error("[chat] forward copyFile", error);
          if (dispatch) dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Inoltro allegato fallito: ${error?.message || "errore sconosciuto"}` } });
          return;
        }
        newMsg.fileUrl = path;
      }
    } else {
      newMsg = { ...base, type: "text", text: src.text || "" };
    }

    setMessages(prev => ({
      ...prev,
      [destConvId]: [...(prev[destConvId] || []), newMsg],
    }));
    // Se sto inoltrando verso una conv diversa da quella aperta, aprila per
    // mostrare visivamente il messaggio appena inoltrato.
    if (destConvId !== activeConv?.id) {
      const target = conversations.find(c => c.id === destConvId);
      if (target) pd({ type: "ACTIVATE", conv: target });
    }
    if (dispatch) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Messaggio inoltrato" } });
    }
  };

  // Fase 3 — reazioni recenti cross-device: all'apertura della chat allinea la
  // cache locale col server (no-op per utenti non loggati / id mock).
  useEffect(() => {
    if (!open) return;
    syncRecentReactionsFromServer(currentUserId || CURRENT_USER);
  }, [open, currentUserId]);

  // Gestione intent: apertura chat verso utente specifico con link a task
  useEffect(() => {
    if (!open || !intent || !intent.toUser) return;
    const me = currentUserId || CURRENT_USER;
    // Cerca conversazione diretta esistente
    let direct = conversations.find(c =>
      c.type === "direct" &&
      c.participants.includes(me) &&
      c.participants.includes(intent.toUser)
    );
    if (!direct) {
      direct = {
        id: "c" + Date.now(),
        type: "direct",
        participants: [me, intent.toUser],
        name: null,
      };
      setConversations(prev => [direct, ...prev]);
    }
    pd({ type: "ACTIVATE", conv: direct });
    // Precompila il messaggio con riferimento al task
    if (intent.taskLink) {
      const t = (tasks || []).find(x => x.id === intent.taskLink);
      if (t) {
        const text = `🔗 Riferimento task: "${t.title}"\n📅 Scadenza: ${formatDate(t.dueDate)} ${formatTime(t.dueDate)}\n\n`;
        pd({ type: "PREFILL", text, taskRef: t.id });
      }
    }
  }, [open, intent, currentUserId]);

  if (!open) return null;

  const handleCreate = (conv, addNew = false) => {
    if (addNew) setConversations(c => [conv, ...c]);
    pd({ type: "ACTIVATE", conv });
  };

  return (
    <ChatContext.Provider value={{ tasks: tasks || [], currentUserId: currentUserId || CURRENT_USER, dispatch: dispatch || (() => {}), presenceMap: presenceMap || {}, messageTemplates: messageTemplates || [], onForward: handleForwardStart }}>
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.3)", zIndex: 700,
      }} />
      <div className="slide-right vd-sheet-full" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 420,
        background: "var(--card)", zIndex: 800, boxShadow: "-20px 0 60px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>💬</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                Messaggi
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onToggleBusy && (
              <button
                onClick={onToggleBusy}
                title={myBusy ? "Sei Occupato — clicca per tornare Online" : "Imposta il tuo stato su Occupato"}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff", height: 28, padding: "0 10px", borderRadius: 14,
                  cursor: "pointer", fontSize: 11, fontWeight: 600,
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: myBusy ? PRESENCE_COLORS.busy : PRESENCE_COLORS.online,
                }} />
                {myBusy ? "Occupato" : "Online"}
              </button>
            )}
            {!loading && (
              <button
                onClick={() => pd({ type: "NEW_MODE", v: true })}
                title="Nuova chat — scrivi a un membro del team"
                style={{
                  background: newMode ? "var(--gold)" : "rgba(255,255,255,0.1)",
                  border: "none", color: newMode ? "var(--navy)" : "#fff",
                  width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 15,
                }}>✏️</button>
            )}
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12, color: "var(--heading)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "3px solid rgba(15,32,68,0.15)", borderTopColor: "var(--gold)",
                animation: "spin 0.8s linear infinite",
              }} />
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>
                Caricamento chat…
              </div>
            </div>
          ) : newMode ? (
            <NewConversationView
              onCreate={handleCreate}
              onCancel={() => pd({ type: "NEW_MODE", v: false })}
              existing={conversations}
            />
          ) : activeConv ? (
            <ConversationView
              conv={activeConv}
              messages={messages}
              setMessages={setMessages}
              markConversationRead={markConversationRead}
              onBack={() => pd({ type: "BACK" })}
              initialInput={prefillText}
              initialTaskRef={prefillTaskRef}
              onInitialInputConsumed={() => pd({ type: "CLEAR_PREFILL" })}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              messages={messages}
              onSelect={(c) => pd({ type: "ACTIVATE", conv: c })}
              onNew={() => pd({ type: "NEW_MODE", v: true })}
            />
          )}
        </div>
      </div>

      {/* Forward picker overlay (Fase 3): sopra il pannello chat (z-index 900
          > pannello 800). Si chiude su click outside o tasto Annulla. */}
      {forwardingMsg && (
        <ForwardPicker
          msg={forwardingMsg}
          conversations={conversations}
          messages={messages}
          onPick={handleForwardPick}
          onClose={() => pd({ type: "FWD_CLEAR" })}
        />
      )}
    </>
    </ChatContext.Provider>
  );
};
