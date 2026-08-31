// src/components/shell/OfflineBanner.jsx
// ─── STRISCE DI CONDIZIONE (criticità #7 + A-1 del 31 agosto) ─────────────
// Strisce PERSISTENTI sotto la topbar per le condizioni che invalidano ciò che
// si sta guardando.
//
// Perché una striscia e non un toast: un toast dice "è successo qualcosa" e
// sparisce; queste condizioni durano finché durano, e per tutto quel tempo ogni
// numero a schermo è un dato fermo. La persistenza è il messaggio. Per la
// stessa ragione non sono chiudibili: chiuderle non riporta i dati, toglie solo
// l'unica cosa a schermo che dice all'utente perché quello che vede è vecchio.
//
// ─── A-1 · LA SECONDA SORGENTE ────────────────────────────────────────────
// Fino all'audit del 31 agosto la sorgente era una sola, `navigator.onLine`, e
// il limite era già scritto in hooks/useOnlineStatus.js: `true` significa
// «esiste una connessione», non «Supabase risponde». Il websocket realtime può
// morire con l'HTTP ancora perfettamente vivo — portatile che esce dalla
// sospensione, proxy aziendale che chiude le connessioni idle, passaggio
// Wi-Fi→LTE — e in quel caso si verificava ESATTAMENTE la condizione che
// questo file esiste per annunciare, senza che nulla la annunciasse.
//
// Peggio del caso offline, non uguale: lì le scritture falliscono e almeno
// producono un toast; qui le scritture continuano a funzionare e l'app sembra
// viva mentre due agenti guardano la stessa lista e vedono saldi diversi.
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";
import { useFreschezzaRealtime } from "../../hooks/useFreschezzaRealtime.js";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap10 = {
  background: "var(--danger)", color: "#fff", fontSize: 13, fontWeight: 500,
  padding: "7px 16px", display: "flex", alignItems: "center", gap: 10,
  flexWrap: "wrap", boxShadow: "0 2px 8px rgba(192,57,43,0.35)",
};

// Oro e non rosso, ed è la differenza fra le due condizioni e non una
// sfumatura estetica: offline le SCRITTURE falliscono, qui passano tutte —
// è la lettura automatica a essere ferma. Dare a entrambe lo stesso rosso
// significherebbe che chi vede la striscia non sa quale delle due sta
// leggendo, cioè non sa se può continuare a lavorare.
const rowCenterGap10Avviso = {
  ...rowCenterGap10,
  background: "var(--warning)",
  boxShadow: "0 2px 8px rgba(200,131,42,0.35)",
};

const btnStriscia = {
  background: "rgba(255,255,255,0.18)", color: "#fff",
  border: "1px solid rgba(255,255,255,0.5)", borderRadius: 6,
  padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "inherit", flexShrink: 0,
};

export function OfflineBanner() {
  const online = useOnlineStatus();
  const freschezzaDegradata = useFreschezzaRealtime();

  // L'offline VINCE, e l'ordine non è arbitrario: quando la rete è giù i canali
  // sono giù per conseguenza, quindi le due condizioni sono vere insieme.
  // Mostrarle entrambe direbbe due volte la stessa cosa con due rimedi diversi,
  // di cui uno — «Ricarica» — inapplicabile senza rete.
  if (!online) {
    return (
      <div role="status" aria-live="assertive" style={rowCenterGap10}>
        <span style={stiliComuni.txtF15} aria-hidden="true">📡</span>
        <span>
          <strong>Sei offline.</strong>{" "}
          I dati a schermo sono fermi all&#39;ultimo aggiornamento e le modifiche
          non verranno salvate finché la connessione non torna.
        </span>
      </div>
    );
  }

  if (!freschezzaDegradata) return null;

  // `polite` e non `assertive`: qui non c'è niente di urgente da interrompere —
  // l'utente può continuare a lavorare, e le sue scritture arrivano. Ciò che
  // non arriva è il lavoro DEGLI ALTRI.
  return (
    <div role="status" aria-live="polite" style={rowCenterGap10Avviso}>
      <span style={stiliComuni.txtF15} aria-hidden="true">🔄</span>
      <span>
        <strong>Aggiornamenti automatici interrotti.</strong>{" "}
        Quello che modificano gli altri non compare più da solo: ricarica per
        rivedere i dati aggiornati. Le tue modifiche vengono salvate normalmente.
      </span>
      <button onClick={() => window.location.reload()} style={btnStriscia}>
        Ricarica
      </button>
    </div>
  );
}
