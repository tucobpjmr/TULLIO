// ─── ADD TEAM MEMBER MODAL ───────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Stili condivisi importati da admin/adminStyles.js (consolidati in Phase 2f).
// Fase 3: in modalità Supabase invia un invito reale (Edge Function invite-user);
// in modalità mock mantiene la creazione solo-locale.
import { useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";
import { Users } from "../../lib/api.js";

// Ruoli reali del DB (CHECK users.role) con etichette leggibili.
const ROLE_OPTIONS = [
  { value: "manager", label: "Manager" },
  { value: "agent", label: "Agente" },
  { value: "driver", label: "Driver" },
  { value: "admin", label: "Admin" },
];

export const AddTeamMemberModal = ({ onClose, dispatch, existingIds, useSupabase = false }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [capacity, setCapacity] = useState(8);
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const avatarFrom = (full) => {
    const parts = full.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
  };

  const submit = async () => {
    if (submitting) return;
    if (!name.trim()) { setError("Il nome è obbligatorio."); return; }
    const avatar = avatarFrom(name);

    if (useSupabase) {
      // ── Invito reale ──
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !cleanEmail.includes("@")) { setError("Inserisci un'email valida."); return; }
      setError(null); setSubmitting(true);
      const res = await Users.invite({ email: cleanEmail, name: name.trim(), role, color, avatar, capacity });
      setSubmitting(false);
      if (res?.error) { setError(res.error); return; }
      // Riflette subito il nuovo membro (pending) nello stato locale.
      if (res?.userId) {
        dispatch({
          type: "ADD_TEAM_MEMBER",
          payload: { id: res.userId, name: name.trim(), role, avatar, color, capacity, active: false, pending: true },
        });
      }
      dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: `Invito inviato a ${cleanEmail}` } });
      onClose();
      return;
    }

    // ── Modalità mock: creazione solo-locale (id derivato dal nome) ──
    const parts = name.trim().split(/\s+/);
    let id = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    let suffix = 0;
    while (existingIds.includes(suffix ? `${id}${suffix}` : id)) suffix++;
    if (suffix) id = `${id}${suffix}`;
    dispatch({
      type: "ADD_TEAM_MEMBER",
      payload: { id, name: name.trim(), role, avatar, color, capacity, active: !pending, pending },
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 4, color: "var(--heading)" }}>
          {useSupabase ? "Invita un membro del team" : "Aggiungi nuovo agente"}
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-muted)" }}>
          {useSupabase
            ? "Riceverà un'email d'invito per impostare la password. Entrerà come \"in attesa\" finché non lo approvi."
            : "Creazione locale di prova (modalità demo, senza login reale)."}
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input value={name} onChange={e => { setName(e.target.value); setError(null); }} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
          </div>
          {useSupabase && (
            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(null); }} placeholder="anna.bianchi@agenzia.it" style={fieldStyle} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Capacità task</label>
              <input type="number" min="1" max="50" value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
          </div>
          {!useSupabase && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
              <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
              Crea come "in attesa di approvazione" (simula iscrizione)
            </label>
          )}
          {error && (
            <div style={{ fontSize: 12.5, color: "var(--danger)", background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)", borderRadius: 8, padding: "8px 10px" }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost} disabled={submitting}>Annulla</button>
          <button onClick={submit} style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }} disabled={submitting}>
            {submitting ? "Invio…" : useSupabase ? "Invia invito" : "Crea agente"}
          </button>
        </div>
      </div>
    </div>
  );
};
