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
} from "./adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Users } from "../../lib/api.js";
import { EMAIL_RX } from "../../lib/validators.js";
import { DB_ROLES, ROLE_LABELS, toDbRole } from "../../lib/taskConstants.js";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtHeadingMb8 = { margin: 0, marginBottom: 8, color: "var(--heading)" };
const txtF125Muted = { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 };
const gridGap10 = { display: "grid", gridTemplateColumns: "1fr 80px", gap: 10 };
const txtBoldMb4 = { fontWeight: 600, marginBottom: 4 };
const txtBoldText = { fontWeight: 600, marginBottom: 6, color: "var(--text)" };
const txtF125 = { maxHeight: 140, overflowY: "auto", fontSize: 12.5 };
const flex1 = { flex: 1, wordBreak: "break-all" };

// "anna.bianchi" → "Anna Bianchi". Spezza su . _ - e capitalizza.
const guessNameFromLocal = (local) => {
  if (!local) return "Agente";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
};

// Parsa una riga: "email[,nome[,ruolo]]". Ritorna { email, name, role } o
// { error: '...' } se la riga è inutilizzabile (email mancante/invalida).
// Il ruolo è normalizzato all'enum DB da toDbRole, che accetta anche le vecchie
// label ("Senior Agent") già circolate negli elenchi incollati qui.
const parseLine = (raw, defaultRole) => {
  const line = raw.trim();
  if (!line) return null;
  const parts = line.split(",").map(s => s.trim());
  const email = (parts[0] || "").toLowerCase();
  if (!EMAIL_RX.test(email)) return { error: `Email non valida: "${parts[0] || raw}"` };
  const name = parts[1] || guessNameFromLocal(email.split("@")[0]);
  const role = toDbRole(parts[2]) ?? defaultRole;
  return { email, name, role };
};

export const BulkInviteModal = ({ onClose, onInvited }) => {
  const [text, setText] = useState("");
  const [defaultRole, setDefaultRole] = useState("agent");
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
      const { data, error } = await Users.invite({
        email: p.email,
        name: p.name,
        role: p.role,
        color,
      });
      // M-2 dell'audit del 14 agosto: l'invito può essere partito (l'email è
      // uscita) mentre la pre-creazione di profilo o contatto è fallita lato
      // server. Un terzo stato, distinto da "ok" ed "err": non è un
      // fallimento dell'invito, ma non è nemmeno un successo pulito.
      out.push(error
        ? { email: p.email, status: "err", message: error.message || "Errore" }
        : data?.warning
          ? { email: p.email, status: "warn", message: data.warning }
          : { email: p.email, status: "ok" });
      // Aggiorno la lista a ogni step così l'admin vede il progresso live.
      setResults([...out]);
    }
    setBusy(false);
    if (out.some(r => r.status === "ok" || r.status === "warn")) onInvited?.();
  };

  const okCount = (results || []).filter(r => r.status === "ok").length;
  const warnCount = (results || []).filter(r => r.status === "warn").length;
  const errCount = (results || []).filter(r => r.status === "err").length;
  const allDone = results && !busy && results.length > 0;

  // Portale: AdminTeamTab vive dentro il wrapper .fade-in di AdminView (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={busy ? undefined : onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 560 }}>
          <h3 className="playfair" style={txtHeadingMb8}>
            Invito multiplo
          </h3>
          <div style={txtF125Muted}>
            Una riga per invito. Formati supportati:<br />
            <code style={codeStyle}>anna@agenzia.it</code><br />
            <code style={codeStyle}>anna@agenzia.it, Anna Bianchi</code><br />
            <code style={codeStyle}>anna@agenzia.it, Anna Bianchi, Senior Agent</code>
          </div>

          <div style={stiliComuni.gridGap12}>
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

            <div style={gridGap10}>
              <div>
                <label style={labelStyle}>Ruolo default</label>
                <select value={defaultRole} onChange={e => setDefaultRole(e.target.value)} disabled={busy} style={fieldStyle}>
                  {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
                <div style={txtBoldMb4}>Righe ignorate ({parseErrors.length})</div>
                {parseErrors.slice(0, 6).map((e, i) => <div key={i}>• {e}</div>)}
                {parseErrors.length > 6 && <div>…e altre {parseErrors.length - 6}</div>}
              </div>
            )}

            {results && (
              <div style={resultBoxStyle}>
                <div style={txtBoldText}>
                  {busy
                    ? `Invio… ${results.length}/${total}`
                    : `Riepilogo — ✅ ${okCount} inviati`
                      + `${warnCount ? ` · ⚠️ ${warnCount} con avviso` : ""}`
                      + `${errCount ? ` · ❌ ${errCount} falliti` : ""}`}
                </div>
                <div style={txtF125}>
                  {results.map((r, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", gap: 8, padding: "2px 0",
                        color: r.status === "ok" ? "var(--success)" : r.status === "warn" ? "var(--warning)" : "var(--danger)",
                      }}
                    >
                      <span>{r.status === "ok" ? "✅" : r.status === "warn" ? "⚠️" : "❌"}</span>
                      <span style={flex1}>{r.email}</span>
                      {r.message && <span style={stiliComuni.txtMuted}>{r.message}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={stiliComuni.rowGap8Mt20}>
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
