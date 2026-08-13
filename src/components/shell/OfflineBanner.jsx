// src/components/shell/OfflineBanner.jsx
// ─── OFFLINE BANNER (criticità #7) ────────────────────────────────────────
// Striscia PERSISTENTE sotto la topbar quando il browser è senza rete.
//
// Perché un banner e non un toast: un toast dice "è successo qualcosa" e
// sparisce; qui la condizione dura finché dura, e per tutto quel tempo ogni
// numero a schermo è un dato fermo. La persistenza è il messaggio. Per la
// stessa ragione non è chiudibile: chiuderlo non riporta la rete, toglie solo
// l'unica cosa a schermo che dice all'utente perché i suoi salvataggi
// falliscono.
//
// Il colore è quello di --danger e non del --warning delle sessioni admin: non
// è un avviso da leggere, è una condizione che invalida ciò che si sta
// guardando.
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";
import { txtF15 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap10 = {
  background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 500,
  padding: "7px 16px", display: "flex", alignItems: "center", gap: 10,
  flexWrap: "wrap", boxShadow: "0 2px 8px rgba(192,57,43,0.35)",
};

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="assertive"
      style={rowCenterGap10}
    >
      <span style={txtF15} aria-hidden="true">📡</span>
      <span>
        <strong>Sei offline.</strong>{" "}
        I dati a schermo sono fermi all&#39;ultimo aggiornamento e le modifiche
        non verranno salvate finché la connessione non torna.
      </span>
    </div>
  );
}
