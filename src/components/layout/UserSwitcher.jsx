import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthContext.jsx";
import { Users as UsersAPI } from "../../lib/api.js";
import { getMember } from "../../state/permissions.js";
import { ProfileEditor } from "../team/ProfileEditor.jsx";

export const UserSwitcher = ({ state, dispatch }) => {
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
    try { await UsersAPI.setPresence(state.currentUserId, "offline"); } catch { /* best effort */ }
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Logout fallito: ${error.message}` } });
    }
  };
  const curr = getMember(state.currentUserId, state.team) || { name: "—", role: "—", avatar: "??", color: "#999" };
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

  // Tutti i membri non-pending, ordinati per ruolo (Admin, Manager, Senior, Junior, Driver)
  const order = { admin: 0, manager: 1, "senior agent": 2, "junior agent": 3, driver: 4 };
  const candidates = state.team
    .filter(m => !m.pending)
    .slice()
    .sort((a, b) => (order[(a.role || "").toLowerCase()] ?? 99) - (order[(b.role || "").toLowerCase()] ?? 99));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Cambia utente"
        aria-label="Cambia utente loggato"
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "3px 8px 3px 4px", fontFamily: "inherit",
        }}
      >
        {curr.photoUrl ? (
          <img src={curr.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: curr.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#fff",
          }}>{curr.avatar}</div>
        )}
        <div className="vd-hide-mobile" style={{ textAlign: "left" }}>
          <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{curr.name}</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>{curr.role}</div>
        </div>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.2)", zIndex: 200,
          minWidth: 240, padding: 6,
        }}>
          {/* Profilo personale */}
          <button
            onClick={() => { setShowProfile(true); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 10px", background: "transparent",
              border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: "var(--navy)", textAlign: "left", borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <span style={{ fontWeight: 600 }}>Modifica profilo</span>
          </button>

          {SHOW_DEMO_SWITCH && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "8px 10px 4px", letterSpacing: 1 }}>
                ACCEDI COME (DEMO MULTI-RUOLO)
              </div>
              {candidates.map(m => {
                const active = m.id === state.currentUserId;
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
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface2)"; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                  >
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", background: m.color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>{m.avatar}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.role}</div>
                    </div>
                    {active && <span style={{ color: "var(--success)", fontSize: 14 }}>✓</span>}
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
            onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>🚪</span>
            <span style={{ fontWeight: 600 }}>{signingOut ? "Uscita…" : "Esci"}</span>
          </button>
        </div>
      )}

      {/* Profile Editor Modal */}
      {showProfile && <ProfileEditor member={curr} dispatch={dispatch} onClose={() => setShowProfile(false)} />}
    </div>
  );
};
