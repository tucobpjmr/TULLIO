// src/components/shell/AdminRollbackBanner.jsx
import { useState, useEffect, useRef } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = {
  background: "#C8832A", color: "#fff", fontSize: 13, fontWeight: 500,
  padding: "6px 16px", display: "flex", alignItems: "center", gap: 10,
  justifyContent: "space-between", flexWrap: "wrap",
  boxShadow: "0 2px 8px rgba(200,131,42,0.35)",
};
const boxF12Bold = {
  background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.5)",
  color: "#fff", borderRadius: 6, padding: "3px 10px", cursor: "pointer",
  fontSize: 12, fontWeight: 600,
};
const boxF12Bold2 = {
  background: "#fff", border: "none",
  color: "#C8832A", borderRadius: 6, padding: "3px 10px", cursor: "pointer",
  fontSize: 12, fontWeight: 700,
};

// ─── ADMIN ROLLBACK BANNER ────────────────────────────────────────────────
// Mostrato quando si passa come Admin: countdown 60s → auto-ripristino utente.
// La logica tick è locale al componente; non inquina lo state globale con date.
const ROLLBACK_SECS = 60;

export function AdminRollbackBanner({ rollbackTo, switchedAt, dispatch }) {
  const { getMember } = useAppData();
  const [secs, setSecs] = useState(() => {
    if (!switchedAt) return ROLLBACK_SECS;
    const elapsed = Math.floor((Date.now() - new Date(switchedAt).getTime()) / 1000);
    return Math.max(0, ROLLBACK_SECS - elapsed);
  });
  const secsRef = useRef(secs);
  secsRef.current = secs;

  useEffect(() => {
    if (!switchedAt || !rollbackTo) return;
    const iv = setInterval(() => {
      setSecs(prev => {
        if (prev <= 1) {
          clearInterval(iv);
          dispatch({ type: "SET_CURRENT_USER", payload: rollbackTo });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [switchedAt, rollbackTo, dispatch]);

  const rollbackMember = rollbackTo ? getMember(rollbackTo) : null;

  return (
    <div style={rowCenterBetween}>
      <span>
        ⏱ Sessione Admin attiva — ripristino automatico
        {rollbackMember ? ` a ${rollbackMember.name}` : ""} tra{" "}
        <strong>{secs}s</strong>
      </span>
      <div style={stiliComuni.rowGap8}>
        <button
          onClick={() => dispatch({ type: "CANCEL_ADMIN_ROLLBACK" })}
          style={boxF12Bold}
        >
          Rimani come Admin
        </button>
        {rollbackTo && (
          <button
            onClick={() => dispatch({ type: "SET_CURRENT_USER", payload: rollbackTo })}
            style={boxF12Bold2}
          >
            Torna ora →
          </button>
        )}
      </div>
    </div>
  );
}
