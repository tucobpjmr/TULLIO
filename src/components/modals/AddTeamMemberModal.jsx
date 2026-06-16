// ─── ADD / INVITE TEAM MEMBER MODAL ──────────────────────────────────────────
// Invia un invito email reale via Edge Function invite-user (Supabase Auth).
// Il nuovo utente riceve una mail con un link per impostare la password.
// Dopo il click il profilo appare come "in attesa di approvazione" in AdminView.
import { useState } from "react";
import { Users as UsersAPI } from "../../lib/api.js";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";

const ROLE_OPTIONS = [
  { value: "agent",   label: "Agente" },
  { value: "manager", label: "Manager" },
  { value: "driver",  label: "Driver" },
  { value: "admin",   label: "Admin" },
];

export const AddTeamMemberModal = ({ onClose, dispatch }) => {
  const [email, setEmail]       = useState("");
  const [name, setName]         = useState("");
  const [role, setRole]         = useState("agent");
  const [capacity, setCapacity] = useState(8);
  const [color, setColor]       = useState("#3B82F6");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName  = name.trim();
    if (!cleanEmail) { setError("L'indirizzo email è obbligatorio."); return; }
    if (!cleanName)  { setError("Il nome è obbligatorio."); return; }

    setLoading(true);
    setError(null);
    try {
      const { data, error: apiErr } = await UsersAPI.invite(cleanEmail, cleanName, role, capacity, color);
      if (apiErr) throw apiErr;

      // Aggiunge il nuovo utente allo state locale come pending
      const parts  = cleanName.split(/\s+/);
      const avatar = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
      dispatch({
        type: "ADD_TEAM_MEMBER",
        payload: {
          id: data?.userId ?? `inv-${Date.now()}`,
          name: cleanName, role, avatar, color,
          capacity, active: false, pending: true,
        },
      });
      dispatch({
        type: "SHOW_TOAST",
        payload: { type: "success", message: `Invito inviato a ${cleanEmail}` },
      });
      onClose();
    } catch (err) {
      const msg = err?.message || err?.toString() || "Invio fallito. Riprova.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 8, color: "var(--navy)" }}>
          Invita nuovo agente
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          Riceverà un'email con il link per accettare l'invito e impostare la password.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Email *</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nome@agenzia.it" style={fieldStyle} autoFocus
            />
          </div>
          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Es. Anna Bianchi" style={fieldStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Capacità task</label>
              <input
                type="number" min="1" max="50" value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Colore avatar</label>
              <input
                type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ ...fieldStyle, height: 38, padding: 2 }}
              />
            </div>
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: "10px 12px", borderRadius: 8,
            background: "#fef2f2", color: "var(--danger)", fontSize: 13,
            border: "1px solid #fecaca",
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost} disabled={loading}>Annulla</button>
          <button onClick={submit} style={btnPrimary} disabled={loading}>
            {loading ? "Invio in corso…" : "✉️ Invia invito"}
          </button>
        </div>
      </div>
    </div>
  );
};
