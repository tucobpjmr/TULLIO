// src/components/shell/UserSwitcher.jsx
// Il menù dell'utente in Topbar: profilo, logout e — solo dietro env var in
// dev — lo switch demo fra ruoli.
import { useState, useRef, useEffect, lazy } from "react";
import { Users as UsersAPI } from "../../lib/api.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useAppData } from "../../state/AppDataContext.jsx";
import { AvatarImg } from "../ui/AvatarImg.jsx";
import { LazyPanel } from "../ui/LazyPanel.jsx";
import { Z } from "../../styles/tokens.js";
import { roleLabel, toDbRole, toSeniority } from "../../lib/taskConstants.js";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import { conTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap8 = {
  display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
  background: "#fff", border: "1px solid rgba(15,32,68,0.15)",
  borderRadius: 8, padding: "3px 8px 3px 4px", fontFamily: "inherit",
};
const boxW30H30 = { width: 30, height: 30, borderRadius: "50%", objectFit: "cover" };
const textAlign2 = { textAlign: "left" };
const txtF12Bold = { color: "var(--navy)", fontSize: 12, fontWeight: 600, lineHeight: 1.2 };
const txtF10 = { color: "rgba(15,32,68,0.75)", fontSize: 10 };
const txtF102 = { color: "rgba(15,32,68,0.7)", fontSize: 10, marginLeft: 2 };
const rowCenterGap10 = {
  width: "100%", display: "flex", alignItems: "center", gap: 10,
  padding: "10px 10px", background: "transparent",
  border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
  color: "var(--navy)", textAlign: "left", borderBottom: "1px solid var(--border)", marginBottom: 4,
};
const txtF16 = { fontSize: 16 };
const txtBold = { fontWeight: 600 };
const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "8px 10px 4px", letterSpacing: 1 };
const boxW30H302 = { width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 };
const rowCenterGap5 = { fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 5 };
const boxF9Bold = {
  background: "#FFF3CD", color: "#856404", fontSize: 9, fontWeight: 700,
  padding: "1px 5px", borderRadius: 4, letterSpacing: 0.3,
};
const txtF14Success = { color: "var(--success)", fontSize: 14 };

// Chunk async: porta con sé CropModal.jsx — 14.2 kB insieme, aperti solo da
// "Modifica profilo" nel menù utente, non dal primo render della Topbar.
const ProfileEditor = lazy(() =>
  import("./ProfileEditor.jsx").then(m => ({ default: m.ProfileEditor }))
);

// ─── USER SWITCHER (v0.8) ──────────────────────────────────────────────────
// Dropdown nella Topbar per cambiare l'utente loggato (mock multi-utente).
// ProfileEditor (+ AVATAR_EMOJIS/AVATAR_COLORS) → src/components/shell/ProfileEditor.jsx (Step P Phase 2f)

// ST-2: `currentUserId` arriva da AppDataContext e non da una prop `state`.
// Era l'unico campo che questo componente leggeva dallo state del reducer, e
// riceverlo intero legava il menù utente a ogni azione dell'app.
export const UserSwitcher = () => {
  const dispatch = useDispatch();
  const { team, currentUserId, getMember, per } = useAppData();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { signOut } = useAuth();
  const ref = useRef(null);

  // Step O (caveat #16): logout reale. Prima marca l'utente offline (best
  // effort: dopo signOut le RLS bloccherebbero l'update), poi chiude la
  // sessione — l'AuthGate in main.jsx ri-renderizza LoginScreen da solo.
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await UsersAPI.setPresence(currentUserId, "offline"); } catch { /* best effort */ }
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Logout fallito: ${error.message}` } });
    }
  };
  const curr = getMember(currentUserId) || { name: "—", role: "—", avatar: "??", color: "#999" };
  // Fix #14: demo switch gate-ato dietro env var (default off in prod e in dev)
  // Cambia solo currentUser lato UI; auth.uid() server-side resta l'utente reale → confonde RLS.
  // Attivare con VITE_DEMO_SWITCH=true in .env.local solo per test multi-ruolo.
  const SHOW_DEMO_SWITCH = import.meta.env.DEV && import.meta.env.VITE_DEMO_SWITCH === 'true';

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("touchstart", h, { passive: true });
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h); };
  }, [open]);

  // Tutti i membri non-pending, ordinati per ruolo (Admin, Manager, Senior,
  // Junior, Driver). Le chiavi seguono l'enum del database, non più le label:
  // con "senior agent"/"junior agent" nessuna riga combaciava più e tutti
  // finivano nel ramo di default (99), cioè in ordine arbitrario.
  const rank = (m) => {
    const r = toDbRole(m.role);
    if (r === "admin") return 0;
    if (r === "manager") return 1;
    if (r === "agent") return toSeniority(m) === "junior" ? 3 : 2;
    if (r === "driver") return 4;
    return 99;
  };
  const candidates = team
    .filter(m => !m.pending)
    .slice()
    .sort((a, b) => rank(a) - rank(b));

  return (
    <div ref={ref} style={stiliComuni.relative}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Cambia utente"
        aria-label="Cambia utente loggato"
        style={rowCenterGap8}
      >
        {curr.photoUrl ? (
          <AvatarImg photo={curr.photoUrl} style={boxW30H30} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: curr.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>{curr.avatar}</div>
        )}
        <div className="vd-hide-mobile" style={textAlign2}>
          <div style={txtF12Bold}>{curr.name}</div>
          <div style={txtF10}>{roleLabel(curr)}</div>
        </div>
        <span style={txtF102}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)", zIndex: Z.panel,
          minWidth: 240, padding: 6,
        }}>
          {/* Profilo personale */}
          <button
            onClick={() => { setShowProfile(true); setOpen(false); }}
            style={rowCenterGap10}
            {...conTastiera(
              e => e.currentTarget.style.background = "var(--surface2)",
              e => e.currentTarget.style.background = "transparent",
            )}
          >
            <span style={txtF16}>👤</span>
            <span style={txtBold}>Modifica profilo</span>
          </button>

          {SHOW_DEMO_SWITCH && (
            <>
              <div style={txtF10Bold}>
                ACCEDI COME (DEMO MULTI-RUOLO)
              </div>
              {candidates.map(m => {
                const active = m.id === currentUserId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { dispatch({ type: "SET_CURRENT_USER", payload: m.id }); setOpen(false); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 10px", background: active ? "var(--surface2)" : "transparent",
                      border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                      color: "var(--text)", textAlign: "left",
                    }}
                    {...conTastiera(
                      e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; },
                      e => { if (!active) e.currentTarget.style.background = "transparent"; },
                    )}
                  >
                    {m.photoUrl ? (
                      <AvatarImg photo={m.photoUrl} style={boxW30H302} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", background: m.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>{m.avatar}</div>
                    )}
                    <div className="vd-flex-1-min0">
                      <div style={stiliComuni.nomeTroncato}>{m.name}</div>
                      <div style={rowCenterGap5}>
                        {roleLabel(m)}
                        {per(m.id).isJuniorAgent() && (
                          <span style={boxF9Bold}>JUNIOR</span>
                        )}
                      </div>
                    </div>
                    {active && <span style={txtF14Success}>✓</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* Step O: logout reale (caveat #16) */}
          <button
            onClick={handleLogout}
            disabled={signingOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: signingOut ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 13,
              color: "var(--danger)", textAlign: "left",
              borderTop: "1px solid var(--border)", marginTop: 4,
            }}
            {...conTastiera(
              e => e.currentTarget.style.background = "var(--surface2)",
              e => e.currentTarget.style.background = "transparent",
            )}
          >
            <span style={txtF16}>🚪</span>
            <span style={txtBold}>{signingOut ? "Uscita…" : "Esci"}</span>
          </button>
        </div>
      )}

      {/* Profile Editor Modal */}
      {showProfile && (
        <LazyPanel resetKey="profilo" onReset={() => setShowProfile(false)} overlay>
          <ProfileEditor member={curr} onClose={() => setShowProfile(false)} />
        </LazyPanel>
      )}
    </div>
  );
};
