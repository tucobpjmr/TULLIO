// src/components/chat/message/VoiceRecorder.jsx
// Registrazione di un messaggio vocale. `randomWaveform` è esportato: la
// composer lo usa per la waveform di anteprima prima che l'audio esista.
import { useState, useEffect, useRef } from "react";
import { formatDuration } from "../chatFormat.js";

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
const VOICE_BARS = 30;

export const randomWaveform = () => Array.from({ length: VOICE_BARS }, () => 0.3 + Math.random() * 0.6);

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
export const VoiceRecorder = ({ onSend, onCancel }) => {
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
