// ─── ADD TEAM MEMBER MODAL ───────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Stili condivisi importati da admin/adminStyles.js (consolidati in Phase 2f).
// Block 3: aggiunto invito reale via email (Edge Function invite-user). Se il
// campo email è valorizzato, l'utente viene invitato davvero (account auth +
// profilo pending); altrimenti resta il vecchio comportamento "agente locale".
import { useRef, useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Users } from "../../lib/api.js";
import { emailValida, obbligatorio, primoCampoInvalido, validaCampi } from "../../lib/validators.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import {
  DB_ROLES, ROLE_LABELS, SENIORITY_LEVELS, SENIORITY_LABELS,
} from "../../lib/taskConstants.js";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF115Muted = { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 };
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 };
const boxF125Danger = { fontSize: 12.5, color: "var(--danger)", background: "rgba(192,57,43,0.08)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 10px" };

// La mappa label→enum che stava qui (e, identica, in BulkInviteModal) è
// diventata DB_ROLES/ROLE_LABELS in lib/taskConstants.js: erano due copie della
// stessa conversione, e una terza mancava del tutto in AdminTeamTab — che
// infatti scriveva le label dentro users.role.

// ─── B-2 · l'ultimo form fuori dalle due convenzioni (audit del 19 agosto) ──
// Validava con `if (!name.trim())` e mostrava il messaggio in un `div` rosso:
// nessun `role="alert"` (uno screen reader non lo annuncia), nessun
// `aria-describedby` (non è associato al campo che descrive), nessun focus
// riportato — e uno slot SOLO per due campi, quindi un nome vuoto E una mail
// sbagliata mostravano un problema per volta. È lo stesso difetto che M-3 del
// 16 agosto ha chiuso in `MessageTemplatesSection` («due campi obbligatori e
// nessuno dei due indicato — l'utente doveva indovinare quale mancasse»),
// rimasto qui perché questo form ha un percorso suo (l'invito via Edge
// Function) e nessuno lo aveva riletto insieme agli altri.
//
// ⚠️ `email` è VALIDA-SE-VALORIZZATA e non obbligatoria: senza email il form
// crea un agente locale, che è metà del suo mestiere. La regola lo dice
// (`v ? emailValida(...) : null`) invece di lasciarlo dedurre dal fatto che il
// campo non ha l'asterisco.
const REGOLE = {
  name: obbligatorio("Il nome dell'agente è obbligatorio."),
  email: (v) => (v ? emailValida("Email non valida: controlla l'indirizzo.")(v) : null),
};
// L'ordine VISIVO dei campi, che è quello in cui il focus deve tornare.
const ORDINE = ["name", "email"];

export const AddTeamMemberModal = ({ onClose, dispatch, existingIds, onInvited }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [seniority, setSeniority] = useState("junior");
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);
  const [busy, setBusy] = useState(false);
  // `err` resta, ma per ciò che è davvero: l'esito del SERVER (l'invito
  // rifiutato dalla Edge Function). Non è più anche il canale della
  // validazione, che ora sta sotto i campi.
  const [err, setErr] = useState(null);
  const [errori, setErrori] = useState({});
  const rifNome = useRef(null);
  const rifEmail = useRef(null);

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    // B-2 · Entrambi i campi valutati INSIEME: chi sbaglia il nome e la mail
    // li vede segnati entrambi, e il focus va sul primo in ordine visivo.
    const trovati = validaCampi({ name, email: trimmedEmail }, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      (primo === "name" ? rifNome : rifEmail).current?.focus();
      return;
    }
    setErrori({});
    setErr(null);

    // Con email → invito reale via Edge Function (account auth + profilo pending).
    if (trimmedEmail) {
      setBusy(true);
      const { data, error } = await Users.invite({
        email: trimmedEmail,
        name: name.trim(),
        role,
        color,
      });
      setBusy(false);
      if (error) { setErr(error.message || "Invito non riuscito."); return; }
      // M-2 dell'audit del 14 agosto: l'invito è comunque partito, ma la
      // pre-creazione di profilo o contatto può essere fallita lato server
      // (nessun trigger di riserva per user_contacts). Un avviso invece del
      // solito successo, così il vuoto non passa per inosservato.
      dispatch({
        type: "SHOW_TOAST",
        payload: data?.warning
          ? { type: "warning", message: data.warning }
          : { type: "success", message: `Invito inviato a ${trimmedEmail}.` },
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
          <h3 className="playfair" style={stiliComuni.txtHeadingMb16}>Aggiungi nuovo agente</h3>
          <div style={stiliComuni.gridGap12}>
            <div>
              <label style={labelStyle}>Nome completo *</label>
              <input
                ref={rifNome}
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setErrori(prec => (prec.name ? { ...prec, name: undefined } : prec));
                }}
                placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus
                {...ariaCampo("vd-membro-nome-err", errori.name)}
              />
              <FieldError id="vd-membro-nome-err">{errori.name}</FieldError>
            </div>
            <div>
              <label style={labelStyle}>Email (per invitare via email)</label>
              {/* `type="text" inputMode="email"` e non `type="email"`: la
                  validazione nativa bloccherebbe il submit prima del nostro
                  handler, mostrando la propria bolla non traducibile al posto
                  del messaggio inline (docs/CLAUDE.md). */}
              <input
                ref={rifEmail}
                type="text" inputMode="email" autoComplete="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setErrori(prec => (prec.email ? { ...prec, email: undefined } : prec));
                }}
                placeholder="anna@agenzia.it" style={fieldStyle}
                {...ariaCampo("vd-membro-email-err", errori.email)}
              />
              <FieldError id="vd-membro-email-err">{errori.email}</FieldError>
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
            {/* L'esito del SERVER (invito rifiutato): `role="alert"` perché
                compare dopo un'attesa, quando l'utente può aver già distolto
                lo sguardo dal bottone. */}
            {err && (
              <div role="alert" style={boxF125Danger}>
                {typeof err === "string" ? err : (err?.message || "Errore imprevisto.")}
              </div>
            )}
          </div>
          <div style={stiliComuni.rowGap8Mt20}>
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
