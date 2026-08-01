// ─── ADD TEAM MEMBER MODAL ───────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Stili condivisi importati da admin/adminStyles.js (consolidati in Phase 2f).
// Block 3: aggiunto invito reale via email (Edge Function invite-user). Se il
// campo email è valorizzato, l'utente viene invitato davvero (account auth +
// profilo pending); altrimenti resta il vecchio comportamento "agente locale".
import { useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Users } from "../../lib/api.js";
import { isValidEmail } from "../../lib/validators.js";

// Ruolo UI (label) → ruolo DB/Auth ammesso dall'enum (admin|manager|agent|driver).
const ROLE_TO_DB = {
  "Manager": "manager",
  "Senior Agent": "agent",
  "Junior Agent": "agent",
  "Driver": "driver",
  "Admin": "admin",
};

export const AddTeamMemberModal = ({ onClose, dispatch, existingIds, onInvited }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Junior Agent");
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!name.trim()) { setErr("Il nome è obbligatorio."); return; }
    setErr(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) { setErr("Email non valida."); return; }

    // Con email → invito reale via Edge Function (account auth + profilo pending).
    if (trimmedEmail) {
      setBusy(true);
      const { error } = await Users.invite({
        email: trimmedEmail,
        name: name.trim(),
        role: ROLE_TO_DB[role] || "agent",
        color,
      });
      setBusy(false);
      if (error) { setErr(error.message || "Invito non riuscito."); return; }
      dispatch({
        type: "SHOW_TOAST",
        payload: { type: "success", message: `Invito inviato a ${trimmedEmail}.` },
      });
      onInvited?.();
      onClose();
      return;
    }

    // Senza email → vecchio comportamento: agente locale (no account auth).
    const parts = name.trim().split(/\s+/);
    const avatar = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
    let id = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    let suffix = 0;
    while (existingIds.includes(suffix ? `${id}${suffix}` : id)) suffix++;
    if (suffix) id = `${id}${suffix}`;
    dispatch({
      type: "ADD_TEAM_MEMBER",
      payload: { id, name: name.trim(), role, avatar, color, capacity: 999, active: !pending, pending }
    });
    onClose();
  };

  // Portale: AdminTeamTab vive dentro il wrapper .fade-in di AdminView (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
          <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--heading)" }}>Aggiungi nuovo agente</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Email (per invitare via email)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="anna@agenzia.it" style={fieldStyle} />
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
                Con email: invio un invito reale (l'utente crea la password e resta in attesa di approvazione). Senza email: aggiungo solo un agente locale.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Ruolo</label>
              <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
                <option>Manager</option>
                <option>Senior Agent</option>
                <option>Junior Agent</option>
                <option>Driver</option>
                <option>Admin</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
            {!email.trim() && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
                <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
                Crea come "in attesa di approvazione" (simula iscrizione)
              </label>
            )}
            {err && (
              <div style={{ fontSize: 12.5, color: "var(--danger)", background: "rgba(192,57,43,0.08)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 10px" }}>
                {typeof err === "string" ? err : (err?.message || "Errore imprevisto.")}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={onClose} style={btnGhost} disabled={busy}>Annulla</button>
            <button onClick={submit} style={btnPrimary} disabled={busy}>
              {busy ? "Invio…" : (email.trim() ? "Invia invito" : "Crea agente")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
