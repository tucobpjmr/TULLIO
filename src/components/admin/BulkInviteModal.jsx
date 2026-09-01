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
import { useId, useRef, useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "./adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { Users } from "../../lib/api.js";
import { EMAIL_RX } from "../../lib/validators.js";
import { DB_ROLES, ROLE_LABELS, toDbRole } from "../../lib/taskConstants.js";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

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
  // ─── M-6 (audit del 26 agosto) · le tre garanzie, a mano ────────────────
  //
  // Questo form NON passa da `useSalvataggio`, e non è una dimenticanza: è un
  // batch SEQUENZIALE con esito PER RIGA (`ok` / `warn` / `err`) e progresso
  // dipinto a ogni iterazione. `useSalvataggio` ha un concetto solo per la
  // riuscita parziale — `avviso`, che blocca ogni tentativo successivo perché
  // «la cosa da fare non è riprovare, è chiudere» — e qui la riuscita parziale
  // è la normalità, non l'eccezione. Forzare l'una nell'altra vorrebbe dire
  // decidere di corsa che forma abbia il contratto per un batch, decisione che
  // vale anche per `ImportTab` del BulkTaskCreator e che non si prende dentro
  // una correzione altrui.
  //
  // Le tre garanzie però non dipendono da quel contratto, e qui mancavano
  // tutte e tre. Sono queste due righe più il `try/finally` sotto.
  //
  // Il freno è un REF e non `busy`: fra due click ravvicinati React può non
  // aver ancora ri-renderizzato, quindi entrambi i gestori leggerebbero
  // `busy === false` e partirebbero DUE batch sequenziali sulla stessa lista —
  // ogni indirizzo invitato due volte, e `results` dipinto da due cicli che si
  // sovrascrivono. `busy` resta, ma per ciò che serve davvero allo stato:
  // dipingere l'attesa e tenere chiusa la via d'uscita.
  const inVoloRif = useRef(false);
  const montato = useIsMounted();
  // results: per ogni email tentata, { email, status: 'ok'|'err', message?: '...' }
  const [results, setResults] = useState(null);
  // total: numero di righe valide totali → ci serve per mostrare X/Y mentre
  // results cresce in modo incrementale durante il loop sequenziale.
  const [total, setTotal] = useState(0);
  const [parseErrors, setParseErrors] = useState([]);
  const invitiId = useId();
  const ruoloId = useId();
  const coloreId = useId();

  const submit = async () => {
    if (inVoloRif.current) return;
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
    inVoloRif.current = true;
    setBusy(true);
    // Sequenziale, non parallelo: l'EF invoca auth.admin.inviteUserByEmail,
    // che ha rate-limit lato Supabase. Una raffica concorrente fa fallire
    // metà delle email senza un beneficio percepibile (decine di inviti
    // restano sotto al secondo a una a una).
    const out = [];
    try {
      for (const p of parsed) {
        // ⚠️ Un'ECCEZIONE è un esito di riga come gli altri, e non un'uscita.
        // `Users.invite` è una `fetch` verso una Edge Function: se la rete cade
        // non ritorna `{ error }`, SOLLEVA. Senza questo `catch` il rifiuto
        // usciva da `submit` — che nessuno attende, essendo chiamata da un
        // `onClick` — e diventava una unhandled rejection: in console un errore
        // che l'admin non vede, e a schermo un batch che si ferma a metà senza
        // dire di essersi fermato, indistinguibile da uno finito.
        // Ridotto qui alla stessa forma di `{ error }`, che il resto del ciclo
        // sa già dipingere.
        const { data, error } = await Users.invite({
          email: p.email,
          name: p.name,
          role: p.role,
          color,
        }).catch((e) => ({ data: null, error: e instanceof Error ? e : new Error(String(e)) }));
        // Smontati mentre il batch era in corso: si smette di scrivere lo
        // stato, ma NON si continua a invitare — ogni iterazione successiva
        // manderebbe email che nessuno vedrà arrivare in un elenco.
        if (!montato()) return;
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
    } finally {
      // In un `finally` e non dopo il ciclo. Con il `catch` per riga qui sopra
      // le eccezioni non arrivano più fin qui, ma il `finally` resta ed è la
      // rete di sicurezza vera: qualunque uscita anticipata da questo ciclo —
      // un `return` aggiunto domani, un throw da un punto che oggi non ne ha —
      // deve comunque riabbassare il freno. Il prezzo di sbagliarlo è più alto
      // che altrove: l'overlay è `onClick={busy ? undefined : onClose}`, quindi
      // un `busy` bloccato a `true` rende la modale IMPOSSIBILE da chiudere,
      // con gli esiti già ottenuti sotto gli occhi e nessun modo di leggerli.
      inVoloRif.current = false;
      if (montato()) setBusy(false);
    }
    if (out.some(r => r.status === "ok" || r.status === "warn")) onInvited?.();
  };

  const okCount = (results || []).filter(r => r.status === "ok").length;
  const warnCount = (results || []).filter(r => r.status === "warn").length;
  const errCount = (results || []).filter(r => r.status === "err").length;
  const allDone = results && !busy && results.length > 0;

  // A-2 dell'audit UX/errori del 1 settembre: il velo chiude solo se il click
  // parte DAL velo stesso (e.target === e.currentTarget), non se bubbla da un
  // figlio — lo stesso confronto usato in ui/Modal.jsx, così la card non ha
  // bisogno di un proprio onClick di stopPropagation. Questo modale non passa
  // da ui/Modal.jsx e non ha un equivalente da tastiera per Esc, quindi il
  // velo stesso resta nell'ordine di tabulazione (role/tabIndex/onKeyDown)
  // invece del disable-comment usato lì. Il freno `busy` (vedi sopra: la
  // modale non deve essere chiudibile a batch in corso) resta identico,
  // spostato dentro il gestore invece che sulla prop.
  const closeOnOverlay = (e) => {
    if (busy) return;
    if (e.target === e.currentTarget) onClose();
  };

  // Portale: AdminTeamTab vive dentro il wrapper .fade-in di AdminView (transform
  // → containing block per i fixed). Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div
        role="button"
        tabIndex={0}
        aria-label="Esci"
        aria-disabled={busy}
        onClick={closeOnOverlay}
        onKeyDown={attivaConTastiera(closeOnOverlay)}
        style={modalOverlay}
      >
        <div style={{ ...modalCard, maxWidth: 560 }}>
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
              <label htmlFor={invitiId} style={labelStyle}>Inviti</label>
              <textarea
                id={invitiId}
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
                <label htmlFor={ruoloId} style={labelStyle}>Ruolo default</label>
                <select id={ruoloId} value={defaultRole} onChange={e => setDefaultRole(e.target.value)} disabled={busy} style={fieldStyle}>
                  {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={coloreId} style={labelStyle}>Colore</label>
                <input id={coloreId} type="color" value={color} disabled={busy} onChange={e => setColor(e.target.value)}
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
