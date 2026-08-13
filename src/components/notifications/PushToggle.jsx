// Estratto da NotificationsPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// ─── PUSH TOGGLE ───────────────────────────────────────────────────────────
// Opt-in Web Push per dispositivo (handoff v44): footer del NotificationsPanel.
// Stati: loading | unsupported | needs-install (iOS Safari fuori PWA) |
// denied (permesso negato a livello browser/OS) | off | on | busy.
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { getPushSupport, getPushState, enablePush, disablePush, syncPushSubscription, sendTestPush } from "../../lib/push.js";
import { txtF13Bold, txtF16 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowStartGap10 = {
  padding: "12px 16px", borderTop: "1px solid var(--border)",
  background: "var(--surface2)", display: "flex", gap: 10, alignItems: "flex-start",
  flexShrink: 0,
};
const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 };
const txtF11Danger = { fontSize: 11, color: "var(--danger)", marginTop: 6, lineHeight: 1.4 };
const rowGap8Mt8 = { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" };
const boxF11Bold = {
  background: "var(--navy)", color: "#fff", border: "none", borderRadius: 6,
  padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};
const boxW18H18 = { width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" };

const PUSH_HINTS = {
  "needs-install": "Su iPhone: apri da Safari → Condividi → \"Aggiungi alla schermata Home\" (richiede iOS 16.4+), poi riapri l'app installata dalla Home.",
  unsupported: "Questo browser non supporta le notifiche push.",
  denied: "Permesso negato: riattivalo dalle impostazioni del browser o del sistema (iPhone: Impostazioni → Notifiche → VoyageDesk).",
  off: "Ricevi le notifiche anche ad app chiusa.",
  on: "Attive su questo dispositivo.",
};

export const PushToggle = ({ dispatch }) => {
  const { profile } = useAuth();
  const [status, setStatus] = useState("loading");
  // Sottoscrizione presente nel browser ma assente dal DB: il server non sa
  // più dove inviare (tipico su iPhone dopo un aggiornamento della PWA) e senza
  // questo avviso il toggle resterebbe verde a fronte di zero notifiche.
  const [outOfSync, setOutOfSync] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    const support = getPushSupport();
    if (!support.supported) {
      setStatus(support.needsInstall ? "needs-install" : "unsupported");
      return;
    }
    const s = await getPushState(profile?.id);
    setStatus(s.enabled ? "on" : (s.permission === "denied" ? "denied" : "off"));
    setOutOfSync(s.enabled && !s.synced);
  }, [profile?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = async () => {
    if (status === "off") {
      setStatus("busy");
      const { error } = await enablePush(profile?.id);
      if (!error) { setStatus("on"); setOutOfSync(false); return; }
      if (error === "denied") { setStatus("denied"); return; }
      setStatus("off");
      if (error !== "dismissed") {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    } else if (status === "on") {
      setStatus("busy");
      const { error } = await disablePush();
      setStatus(error ? "on" : "off");
      setOutOfSync(false);
      if (error) {
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche push: ${error}` } });
      }
    }
  };

  // Ripristina la registrazione di questo dispositivo sul server senza che
  // l'utente debba spegnere e riaccendere il toggle.
  const repair = async () => {
    setStatus("busy");
    const { error } = await syncPushSubscription(profile?.id);
    await refresh();
    dispatch({
      type: "SHOW_TOAST",
      payload: error
        ? { type: "error", message: `Notifiche push: ${error}` }
        : { type: "success", message: "Dispositivo ricollegato alle notifiche push" },
    });
  };

  // Prova end-to-end: se la notifica di sistema non compare entro pochi
  // secondi il problema è nel percorso server → dispositivo, non nell'app.
  const test = async () => {
    setTesting(true);
    const { error } = await sendTestPush();
    setTesting(false);
    dispatch({
      type: "SHOW_TOAST",
      payload: error
        ? { type: "error", message: `Notifica di prova: ${error}` }
        : { type: "success", message: "Notifica di prova inviata: controlla il telefono" },
    });
  };

  if (status === "loading") return null;
  const enabled = status === "on";
  const interactive = status === "on" || status === "off";

  return (
    <div style={rowStartGap10}>
      <span style={txtF16}>📲</span>
      <div className="vd-flex-1-min0">
        <div style={txtF13Bold}>Notifiche push</div>
        <div style={txtF11Muted}>
          {status === "busy" ? "Attendere…" : PUSH_HINTS[status]}
        </div>
        {enabled && outOfSync && (
          <div style={txtF11Danger}>
            ⚠️ Questo dispositivo non risulta registrato sul server: le notifiche
            non arrivano finché non lo ricolleghi.
          </div>
        )}
        {enabled && (
          <div style={rowGap8Mt8}>
            {outOfSync && (
              <button onClick={repair} style={boxF11Bold}>Ricollega dispositivo</button>
            )}
            <button onClick={test} disabled={testing} style={{
              background: "transparent", color: "var(--text-muted)",
              border: "1px solid var(--border)", borderRadius: 6,
              padding: "5px 10px", fontSize: 11, fontWeight: 600,
              cursor: testing ? "default" : "pointer", fontFamily: "inherit", opacity: testing ? 0.6 : 1,
            }}>{testing ? "Invio…" : "Invia notifica di prova"}</button>
          </div>
        )}
      </div>
      {(interactive || status === "busy") && (
        <button
          onClick={toggle}
          disabled={status === "busy"}
          role="switch"
          aria-checked={enabled}
          aria-label="Attiva notifiche push su questo dispositivo"
          style={{
            width: 40, height: 22, borderRadius: 99, border: "none", padding: 2,
            background: enabled ? "var(--success)" : "var(--border)",
            cursor: status === "busy" ? "default" : "pointer",
            display: "flex", justifyContent: enabled ? "flex-end" : "flex-start",
            alignItems: "center", transition: "background 0.2s", flexShrink: 0, marginTop: 2,
            opacity: status === "busy" ? 0.6 : 1,
          }}
        >
          <span style={boxW18H18} />
        </button>
      )}
    </div>
  );
};
