import { useState, useEffect } from "react";

import { formatDuration } from "./formatters.js";

// ─── CHAT: VOICE RECORDER ──────────────────────────────────────────────────
export const VoiceRecorder = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const i = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      background: "var(--surface)", borderRadius: 24, border: "1px solid var(--border)",
      flex: 1,
    }}>
      <div className="record-pulse" style={{
        width: 10, height: 10, borderRadius: "50%", background: "var(--danger)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center", height: 20 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{
            flex: 1, background: "var(--navy)",
            height: `${30 + Math.random() * 70}%`, minHeight: 3,
            borderRadius: 1,
            animation: `wave 0.${4 + (i % 5)}s ease infinite`,
            animationDelay: `${i * 0.05}s`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", fontVariantNumeric: "tabular-nums" }}>
        {formatDuration(seconds)}
      </span>
      <button onClick={onCancel} style={{
        background: "var(--surface2)", border: "none", borderRadius: "50%",
        width: 30, height: 30, cursor: "pointer", fontSize: 14,
      }}>✕</button>
      <button onClick={() => onSend(seconds)} style={{
        background: "var(--gold)", color: "var(--navy)", border: "none",
        borderRadius: "50%", width: 30, height: 30, cursor: "pointer",
        fontSize: 14, fontWeight: 700,
      }}>↑</button>
    </div>
  );
};
