// src/components/chat/message/VoicePlayer.jsx
// Riproduttore dei messaggi vocali, con waveform e progressione.
import { useState, useEffect, useRef } from "react";
import { Messages as MessagesAPI } from "../../../lib/api.js";
import { formatDuration } from "../chatFormat.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap10 = { display: "flex", alignItems: "center", gap: 10, minWidth: 200 };
const rowCenterFlex1 = { display: "flex", alignItems: "center", gap: 2, flex: 1, height: 28 };

// simulati senza audio) si ricade sulla progressione finta a timer.
export const VoicePlayer = ({ duration, waveform, isMine, fileUrl }) => {
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
    <div style={rowCenterGap10}>
      <button onClick={onToggle} disabled={loadingAudio} style={{
        width: 32, height: 32, borderRadius: "50%",
        background: isMine ? "rgba(255,255,255,0.2)" : "var(--gold)",
        border: "none", cursor: loadingAudio ? "wait" : "pointer", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: isMine ? "#fff" : "var(--navy)", fontSize: 12,
        flexShrink: 0,
      }}>{loadingAudio ? "…" : playing ? "⏸" : "▶"}</button>

      <div style={rowCenterFlex1}>
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
