// ─── BULK INVITE MODAL (sessione 29) ─────────────────────────────────────────
// Invita più utenti in un colpo solo via Edge Function invite-user. Riusa lo
// stesso path di AddTeamMemberModal (Users.invite), ma cicla sequenzialmente
// sulle righe inserite per evitare burst sul rate-limit Auth.
//
// Input atteso (textarea, una per riga):
//   email
//   email,Nome Cognome
//   email,Nome Cognome,Ruolo
// Ruolo opzionale → fallback al ruolo di default scelto via select.
// Se manca il nome → derivato dalla parte locale dell'email (anna.bianchi → "Anna Bianchi").
//
// Niente upload CSV: per gli SMB target del prodotto il copia-incolla da
// Excel/Notes copre il 95% dei casi; un parser file aggiunge superficie
// senza valore proporzionato.
import { useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Users } from "../../lib/api.js";
import { EMAIL_RX } from "../../lib/validators.js";

const ROLE_TO_DB = {
  "Manager": "manager",
  "Senior Agent": "agent",
  "Junior Agent": "agent",
  "Driver": "driver",
  "Admin": "admin",
};

// "anna.bianchi" → "Anna Bianchi". Spezza su . _ - e capitalizza.
const guessNameFromLocal = (local) => {
  if (!local) return "Agente";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
};

// Parsa una riga: "email[,nome[,ruolo]]". Ritorna { email, name, roleLabel } o
// { error: '...' } se la riga è inutilizzabile (email mancante/invalida).
const parseLine = (raw, defaultRoleLabel) => {
  const line = raw.trim();
  if (!line) return null;
  const parts = line.split(",").map(s => s.trim());
  const email = (parts[0] || "").toLowerCase();
  if (!EMAIL_RX.test(email)) return { error: `Email non valida: "${parts[0] || raw}"` };
  const name = parts[1] || guessNameFromLocal(email.split("@")[0]);
  const roleLabel = parts[2] && ROLE_TO_DB[parts[2]] ? parts[2] : defaultRoleLabel;
  return { email, name, roleLabel };
};

export const BulkInviteModal = ({ onClose, onInvited }) => {
  const [text, setText] = useState("");
  const [defaultRole, setDefaultRole] = useState("Junior Agent");
  const [color, setColor] = useState("#3B82F6");
  const [busy, setBusy] = useState(false);
  // results: per ogni email tentata, { email, status: 'ok'|'err', message?: '...' }
  const [results, setResults] = useState(null);
  // total: numero di righe valide totali → ci serve per mostrare X/Y mentre
  // results cresce in modo incrementale durante il loop sequenziale.
  const [total, setTotal] = useState(0);
  const [parseErrors, setParseErrors] = useState([]);

  const submit = async () => {
    setParseErrors([]);
    setResults(null);
    const lines = text.split(/\r?\n/);
    const parsed = [];
    const errs = [];
    const seen = new Set();
    for (const raw of lines) {
      const p = parseLine(raw, defaultRole);
      if (!p) continue;
      if (p.error) { errs.push(p.error); continue; }
      if (seen.has(p.email)) { errs.push(`Duplicato ignorato: ${p.email}`); continue; }
      seen.add(p.email);
      parsed.push(p);
    }
    if (errs.length) setParseErrors(errs);
    if (parsed.length === 0) return;

    setTotal(parsed.length);
    setBusy(true);
    // Sequenziale, non parallelo: l'EF invoca auth.admin.inviteUserByEmail,
    // che ha rate-limit lato Supabase. Una raffica concorrente fa fallire
    // metà delle email senza un beneficio percepibile (decine di inviti
    // restano sotto al secondo a una a una).
    const out = [];
    for (const p of parsed) {
      const { error } = await Users.invite({
        email: p.email,
        name: p.name,
        role: ROLE_TO_DB[p.roleLabel] || "agent",
        color,
      });
      out.push(error
        ? { email: p.email, status: "err", message: error.message || "Errore" }
        : { email: p.email, status: "ok" });
      // Aggiorno la lista a ogni step così l'admin vede il progresso live.
      setResults([...out]);
    }
    setBusy(false);
    if (out.some(r => r.status === "ok")) onInvited?.();
  };

  const okCount = (results || []).filter(r => r.status === "ok").length;
  const errCount = (results || []).filter(r => r.status === "err").length;
  const allDone = results && !busy && results.length > 0;

  // Portale: AdminTeamTab vive dentro il wrapper .fade-in di AdminView (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={busy ? undefined : onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 560 }}>
          <h3 className="playfair" style={{ margin: 0, marginBottom: 8, color: "var(--heading)" }}>
            Invito multiplo
          </h3>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
            Una riga per invito. Formati supportati:<br />
            <code style={codeStyle}>anna@agenzia.it</code><br />
            <code style={codeStyle}>anna@agenzia.it, Anna Bianchi</code><br />
            <code style={codeStyle}>anna@agenzia.it, Anna Bianchi, Senior Agent</code>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Inviti</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={busy}
                rows={8}
                placeholder={"anna@agenzia.it\nmarco@agenzia.it, Marco Rossi\nluca@agenzia.it, Luca Verdi, Driver"}
                style={{ ...fieldStyle, fontFamily: "monospace", fontSize: 12.5, resize: "vertical" }}
                autoFocus
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 }}>
              <div>
                <label style={labelStyle}>Ruolo default</label>
                <select value={defaultRole} onChange={e => setDefaultRole(e.target.value)} disabled={busy} style={fieldStyle}>
                  <option>Manager</option>
                  <option>Senior Agent</option>
                  <option>Junior Agent</option>
                  <option>Driver</option>
                  <option>Admin</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Colore</label>
                <input type="color" value={color} disabled={busy} onChange={e => setColor(e.target.value)}
                  style={{ ...fieldStyle, height: 38, padding: 2 }} />
              </div>
            </div>

            {parseErrors.length > 0 && (
              <div style={warnBoxStyle}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Righe ignorate ({parseErrors.length})</div>
                {parseErrors.slice(0, 6).map((e, i) => <div key={i}>• {e}</div>)}
                {parseErrors.length > 6 && <div>…e altre {parseErrors.length - 6}</div>}
              </div>
            )}

            {results && (
              <div style={resultBoxStyle}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text)" }}>
                  {busy
                    ? `Invio… ${results.length}/${total}`
                    : `Riepilogo — ✅ ${okCount} inviati${errCount ? ` · ❌ ${errCount} falliti` : ""}`}
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 12.5 }}>
                  {results.map((r, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0", color: r.status === "ok" ? "var(--success)" : "var(--danger)" }}>
                      <span>{r.status === "ok" ? "✅" : "❌"}</span>
                      <span style={{ flex: 1, wordBreak: "break-all" }}>{r.email}</span>
                      {r.message && <span style={{ color: "var(--text-muted)" }}>{r.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button onClick={onClose} disabled={busy} style={btnGhost}>
              {allDone ? "Chiudi" : "Annulla"}
            </button>
            {!allDone && (
              <button onClick={submit} disabled={busy || !text.trim()} style={btnPrimary}>
                {busy ? "Invio…" : "Invia inviti"}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

const codeStyle = {
  background: "var(--surface2)", padding: "1px 6px", borderRadius: 4,
  fontSize: 12, fontFamily: "monospace", color: "var(--text)",
};

const warnBoxStyle = {
  fontSize: 12, color: "var(--warning)", background: "rgba(200,131,42,0.10)",
  border: "1px solid var(--warning)", borderRadius: 8, padding: "8px 10px",
};

const resultBoxStyle = {
  fontSize: 13, color: "var(--text-muted)", background: "var(--surface2)",
  border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px",
};
