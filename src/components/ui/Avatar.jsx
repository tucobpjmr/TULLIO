// ─── AVATAR ────────────────────────────────────────────────────────────────
import React from "react";
import { getMember } from "../../utils/helpers.js";

const Avatar = ({ memberId, size = 28 }) => {
  const m = getMember(memberId);
  if (!m) return null;
  if (m.photoUrl) {
    return (
      <img src={m.photoUrl} alt={m.name} title={m.name} style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, border: "2px solid white",
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: m.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, color: "#fff",
      flexShrink: 0, border: "2px solid white",
    }} title={m.name}>{m.avatar}</div>
  );
};

export default Avatar;
