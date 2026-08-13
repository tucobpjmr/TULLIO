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
import {
  DB_ROLES, ROLE_LABELS, SENIORITY_LEVELS, SENIORITY_LABELS,
} from "../../lib/taskConstants.js";
import { gridGap12, rowGap8Mt20, txtHeadingMb16 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF115Muted = { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 };
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 };
const boxF125Danger = { fontSize: 12.5, color: "var(--danger)", background: "rgba(192,57,43,0.08)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 10px" };

// La mappa label→enum che stava qui (e, identica, in BulkInviteModal) è
// diventata DB_ROLES/ROLE_LABELS in lib/taskConstants.js: erano due copie della
// stessa conversione, e una terza mancava del tutto in AdminTeamTab — che
// infatti scriveva le label dentro users.role.

export const AddTeamMemberModal = ({ onClose, dispatch, existingIds, onInvited }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [seniority, setSeniority] = useState("junior");
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
        role,
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
      payload: { id, name: name.trim(), role, seniority, avatar, color, capacity: 999, active: !pending, pending }
    });
    onClose();
  };

  // Portale: AdminTeamTab vive dentro il wrapper .fade-in di AdminView (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
          <h3 className="playfair" style={txtHeadingMb16}>Aggiungi nuovo agente</h3>
          <div style={gridGap12}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Email (per invitare via email)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="anna@agenzia.it" style={fieldStyle} />
              <div style={txtF115Muted}>
                Con email: invio un invito reale (l'utente crea la password e resta in attesa di approvazione). Senza email: aggiungo solo un agente locale.
              </div>
            </div>
            <div>
              <label style={labelStyle}>Ruolo</label>
              <select value={role} onChange={e => setRole(e.target.value)} aria-label="Ruolo" style={fieldStyle}>
                {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {role === "agent" && (
                <select value={seniority} onChange={e => setSeniority(e.target.value)}
                  aria-label="Livello" style={{ ...fieldStyle, marginTop: 8 }}>
                  {SENIORITY_LEVELS.map(sv => <option key={sv} value={sv}>{SENIORITY_LABELS[sv]} Agent</option>)}
                </select>
              )}
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
            {!email.trim() && (
              <label style={rowCenterGap8}>
                <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
                Crea come "in attesa di approvazione" (simula iscrizione)
              </label>
            )}
            {err && (
              <div style={boxF125Danger}>
                {typeof err === "string" ? err : (err?.message || "Errore imprevisto.")}
              </div>
            )}
          </div>
          <div style={rowGap8Mt20}>
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
