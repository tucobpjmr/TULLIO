// src/components/admin/tabs/AdminTeamTab.jsx
// Gestione del team: invito, approvazione dei pending, ruoli, attivazione.
import { useState, useEffect } from "react";
import { useViewport } from "../../ui/Viewport.jsx";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useTasks } from "../../../state/TasksContext.jsx";
import { sectionH, fieldStyle, btnPrimary, btnGold, btnGhost, btnDanger, btnWarning } from "../adminStyles.js";
import {
  DB_ROLES, ROLE_LABELS, SENIORITY_LEVELS, SENIORITY_LABELS, roleLabel, toSeniority,
} from "../../../lib/taskConstants.js";
import { Users } from "../../../lib/api.js";
import {
  computePresence, PRESENCE_COLORS, PRESENCE_LABELS, TICK_PRESENZA_MS,
} from "../../../lib/presenza.js";
import { useTickLento } from "../../../hooks/useTickLento.js";
import { useSalvataggio } from "../../../hooks/useSalvataggio.js";
import { AddTeamMemberModal } from "../AddTeamMemberModal.jsx";
import { BulkInviteModal } from "../BulkInviteModal.jsx";
import { ContactActions } from "../../ui/ContactActions.jsx";
import { useConfirm } from "../../../state/ConfirmContext.jsx";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../../lib/validators.js";
import * as stiliComuni from "../../../styles/common.js";
import { useDispatch } from "../../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterFlex1 = { display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 };
const relative2 = { position: "relative", flexShrink: 0 };
const txtF15Bold = { fontSize: 15, fontWeight: 600, color: "var(--text)" };
const rowGap12F12 = { display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4, fontSize: 12 };
const txtNavy = { color: "var(--navy)", textDecoration: "none" };
const rowGap16F13 = { display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" };
const txtGoldDark = { color: "var(--gold-dark)" };
const mb24 = { marginBottom: 24 };

const REGOLE_MEMBRO = { name: obbligatorio("Il nome del membro non può essere vuoto.") };

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
export const AdminTeamTab = () => {
  const dispatch = useDispatch();
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { team } = useAppData();
  const tasks = useTasks();
  // A-3 · I pallini invecchiano col tempo, non con i dati: `computePresence`
  // legge `Date.now()`, quindi senza un tick un «Online» resterebbe verde
  // finché qualcosa d'altro non ri-renderizza questa tab. Stessa regola e
  // stesso intervallo dei due call site della chat (docs/CLAUDE.md: il tick
  // vive dove la cosa si mostra, così esiste solo mentre è a schermo).
  useTickLento(TICK_PRESENZA_MS);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  // M-3 dell'audit del 16 agosto: la modifica in linea di un membro usciva in
  // silenzio a nome vuoto, e il nome è l'unico campo obbligatorio della riga.
  const [errori, setErrori] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  // resendMap: { [memberId]: 'loading' | 'ok' | 'err' | string(errMsg) }
  const [resendMap, setResendMap] = useState({});
  // Rubrica contatti: { [userId]: { email, phone } }. Caricata una volta sola;
  // l'admin ha accesso RLS a tutte le righe di user_contacts.
  const [contactsMap, setContactsMap] = useState({});
  // C-1 dell'audit del 15 agosto: il ruolo con cui approvare è una scelta
  // esplicita dell'admin, non un'eredità della riga pending — che per un
  // account auto-registrato porta il ruolo scelto dal registrante stesso.
  // { [memberId]: role }, inizializzato dal ruolo della riga (già affidabile
  // per gli inviti, validato lato server) ma sempre modificabile qui.
  const [approveRoleMap, setApproveRoleMap] = useState({});

  useEffect(() => {
    let alive = true;
    Users.listContacts().then(({ data }) => {
      if (!alive || !data) return;
      const map = {};
      for (const c of data) map[c.user_id] = { email: c.email, phone: c.phone };
      setContactsMap(map);
    });
    return () => { alive = false; };
  }, []);

  const resendInvite = async (m) => {
    setResendMap(prev => ({ ...prev, [m.id]: 'loading' }));
    const { data: contacts, error: cErr } = await Users.getContacts(m.id);
    const email = contacts?.email;
    if (cErr || !email) {
      setResendMap(prev => ({ ...prev, [m.id]: 'Email non trovata' }));
      setTimeout(() => setResendMap(prev => { const n = {...prev}; delete n[m.id]; return n; }), 3000);
      return;
    }
    const { error } = await Users.invite({ email, name: m.name, role: m.role, capacity: m.capacity, color: m.color, resend: true });
    if (error) {
      setResendMap(prev => ({ ...prev, [m.id]: error.message || 'Errore' }));
    } else {
      setResendMap(prev => ({ ...prev, [m.id]: 'ok' }));
    }
    setTimeout(() => setResendMap(prev => { const n = {...prev}; delete n[m.id]; return n; }), 3500);
  };

  const pending = team.filter(m => m.pending);
  const active = team.filter(m => !m.pending && m.active);
  const disabled = team.filter(m => !m.pending && !m.active);

  const taskCount = (id) => tasks.filter(t => !t.deletedAt && (t.assignees || []).includes(id)).length;

  // seniority normalizzata già nel draft: il <select> qui sotto è controllato e
  // con un valore undefined React lo renderebbe non controllato.
  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m, seniority: toSeniority(m) }); setErrori({}); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); setErrori({}); };
  // ─── A-4 · l'esito prima della chiusura, e qui più che altrove ───────────
  // (audit performance/UX del 19 agosto)
  //
  // Era `dispatch(...)` senza `await` seguito da `cancelEdit()`, che azzera
  // `draft` e chiude l'editor nello stesso turno. Su questa card il costo non
  // si misura in caratteri persi: `state/persistence.js` dice a cosa serve
  // questa azione — «il cambio di ruolo, cioè il modo con cui un admin REVOCA
  // i privilegi di un account compromesso o di chi cambia mansione». L'editor
  // si richiudeva mostrando il ruolo nuovo (ottimistico), poi il rollback lo
  // riportava indietro e un toast passava. Su una card fra sette, in un
  // pannello dove si stava facendo altro, «il toast è passato» e «il
  // declassamento non c'è stato» sono lo stesso fotogramma.
  //
  // M-5 del 13 agosto ha irrobustito il GUARD di questa azione; questo è
  // l'altro lato — che l'esito sia VISTO.
  const { salva, inVolo, errore: erroreSalvataggio } = useSalvataggio(
    (payload) => dispatch({ type: "UPDATE_TEAM_MEMBER", payload }),
    {
      alSuccesso: () => { setEditingId(null); setDraft(null); setErrori({}); },
      messaggioErrore: "Membro non salvato: il ruolo sul database è ancora quello di prima. Le modifiche sono qui, riprova.",
    },
  );

  const saveEdit = () => {
    const trovati = validaCampi({ name: draft.name }, REGOLE_MEMBRO);
    if (trovati.name) { setErrori(trovati); return; }
    setErrori({});
    salva(draft);
  };

  // A-3 · Il pallino si calcola con `computePresence`, non leggendo `m.status`
  // grezzo.
  //
  // Da quando la presenza LIVE vive nel canale Realtime (hooks/usePresence.js),
  // `users.status` non è più «lo stato adesso»: è l'ultimo stato SCRITTO —
  // all'apertura della sessione, al toggle «Occupato», alla chiusura. Letto
  // così com'è mostrerebbe «Online» per chi ha chiuso il browser stamattina
  // senza che `beforeunload` sia partito (su mobile è la norma).
  //
  // `computePresence` è la stessa funzione con cui la chat disegna gli stessi
  // pallini, e applica le soglie: sotto il minuto vale ciò che dice `status`,
  // fino a cinque minuti «assente», oltre «offline». Cioè questa card diventa
  // più onesta di prima, non meno: fin qui l'unico modo di accorgersi che un
  // «Online» era vecchio era leggere il «3h fa» scritto accanto.
  //
  // La mappa locale a tre colori è sparita con esso: era la quarta definizione
  // degli stessi stati e non aveva 'away', che ora esiste davvero.
  const fmtLastSeen = (ts) => {
    if (!ts) return null;
    const ms = Date.now() - new Date(ts).getTime();
    const min = Math.round(ms / 60000);
    if (min < 2) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h fa`;
    return `${Math.round(h / 24)}g fa`;
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    const stato = computePresence(m);
    const dotColor = PRESENCE_COLORS[stato];
    const seenLabel = fmtLastSeen(m.last_seen_at);
    return (
      <div key={m.id} style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 10 : 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        {/* Avatar + Info — sempre su una riga */}
        <div style={rowCenterFlex1}>
          <div style={relative2}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: m.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700, fontSize: 16,
            }}>{m.avatar}</div>
            {m.status && (
              <div style={{
                position: "absolute", bottom: 1, right: 1,
                width: 11, height: 11, borderRadius: "50%",
                background: dotColor, border: "2px solid var(--card)",
              }} title={PRESENCE_LABELS[stato]} />
            )}
          </div>
          <div className="vd-flex-1-min0">
            {isEditing ? (
              <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: draft.role === "agent" ? "1fr 1fr 1fr 100px" : "1fr 1fr 100px", gap: 8 }}>
                <div>
                <input value={draft.name}
                  onChange={e => {
                    setDraft({ ...draft, name: e.target.value });
                    setErrori(prec => (prec.name ? {} : prec));
                  }}
                  {...ariaCampo(`vd-team-name-err-${editingId}`, errori.name)}
                  placeholder="Nome" style={fieldStyle} />
                <FieldError id={`vd-team-name-err-${editingId}`}>{errori.name}</FieldError>
                </div>
                {/* I valori sono quelli dell'enum del database (DB_ROLES), non
                    le etichette: prima il select scriveva "Senior Agent"/"Admin"
                    in una colonna che gli helper RLS confrontano con 'agent' e
                    'admin'. Le label restano solo presentazione. */}
                <select value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                  aria-label="Ruolo" style={fieldStyle}>
                  {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                {draft.role === "agent" && (
                  <select value={draft.seniority} onChange={e => setDraft({...draft, seniority: e.target.value})}
                    aria-label="Livello" style={fieldStyle}>
                    {SENIORITY_LEVELS.map(s => <option key={s} value={s}>{SENIORITY_LABELS[s]}</option>)}
                  </select>
                )}
                <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                  style={{ ...fieldStyle, padding: 2, height: 32 }} />
                {/* A-4 · Il fallimento accanto alle modifiche rimaste. Su
                    questa card la frase dice anche COSA non è cambiato: il
                    ruolo sul database, che è la cosa per cui si apre questo
                    editor. */}
                <FieldError id={`vd-team-save-err-${editingId}`}>{erroreSalvataggio}</FieldError>
              </div>
            ) : (
              <>
                <div style={txtF15Bold}>{m.name}</div>
                <div style={stiliComuni.txtF12Muted2}>
                  {roleLabel(m)} • {count} task assegnati
                  {seenLabel && <span> • ultimo accesso {seenLabel}</span>}
                </div>
                {(() => {
                  const c = contactsMap[m.id];
                  if (!c || (!c.email && !c.phone)) return null;
                  return (
                    <div style={rowGap12F12}>
                      {c.email && (
                        <a href={`mailto:${c.email}`} style={txtNavy}>✉️ {c.email}</a>
                      )}
                      {c.phone && (
                        <ContactActions phone={c.phone} />
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
        {/* Bottoni — a destra su desktop, allineati a destra in seconda riga su mobile */}
        <div style={{ display: "flex", gap: 6, ...(isMobile ? { justifyContent: "flex-end" } : {}) }}>
          {isEditing ? (
            <>
              <button onClick={saveEdit} disabled={inVolo} style={btnPrimary}>
                {inVolo ? "Salvataggio…" : "💾 Salva"}
              </button>
              <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
            </>
          ) : (
            <>
              {opts.canApprove && m.invited_by && (() => {
                const rs = resendMap[m.id];
                return (
                  <button
                    onClick={() => { if (!rs) resendInvite(m); }}
                    disabled={rs === 'loading'}
                    style={{
                      ...btnGhost,
                      fontSize: 12,
                      color: rs === 'ok' ? "var(--success)" : rs && rs !== 'loading' ? "var(--danger)" : "var(--navy)",
                      opacity: rs === 'loading' ? 0.6 : 1,
                    }}
                    title="Reinvia email di invito"
                  >
                    {rs === 'loading' ? '⏳' : rs === 'ok' ? '✅ Inviata' : rs && rs !== 'loading' ? `❌ ${rs}` : '📧 Reinvia'}
                  </button>
                );
              })()}
              {opts.canApprove && (
                <>
                  {/* C-1 dell'audit del 15 agosto: il ruolo si sceglie QUI,
                      prima di concederlo — non dopo, quando è già attivo.
                      Default al ruolo già sulla riga (per un invito è già
                      quello scelto dall'admin in fase di invito, validato
                      lato server; per un self-signup è ormai sempre 'agent',
                      vedi la migrazione handle_new_auth_user_stop_trusting_role_metadata). */}
                  <select
                    value={approveRoleMap[m.id] ?? m.role ?? "agent"}
                    onChange={e => setApproveRoleMap(prev => ({ ...prev, [m.id]: e.target.value }))}
                    aria-label={`Ruolo da assegnare a ${m.name}`}
                    style={{ ...fieldStyle, width: "auto", fontSize: 12, padding: "4px 8px" }}
                  >
                    {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button
                    onClick={() => dispatch({
                      type: "APPROVE_TEAM_MEMBER",
                      payload: { id: m.id, role: approveRoleMap[m.id] ?? m.role ?? "agent" },
                    })}
                    style={btnGold}
                  >
                    ✓ Approva
                  </button>
                </>
              )}
              {!m.pending && (
                <>
                  <button onClick={() => startEdit(m)} style={btnGhost} title="Modifica">✏️</button>
                  <button onClick={async () => {
                    // Disattivare ora REVOCA davvero l'accesso (ban lato auth,
                    // suggerimento strategico n. 3 dell'audit dell'11 agosto):
                    // non è più solo un'etichetta che la RLS applica al giro
                    // successivo, è la sessione dell'utente che finisce nello
                    // stesso istante. Merita una conferma, come le altre azioni
                    // che tolgono qualcosa a qualcuno — riattivare no: espande
                    // l'accesso, non lo toglie.
                    if (m.active) {
                      const ok = await conferma({
                        title: `Disattivare "${m.name}"?`,
                        body: "L'utente perde l'accesso immediatamente, sessione già aperta compresa. Potrai riattivarlo in qualsiasi momento.",
                        cta: "Disattiva", danger: true,
                      });
                      if (!ok) return;
                    }
                    dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: m.id });
                  }} style={m.active ? btnWarning : btnPrimary} title={m.active ? "Disattiva" : "Riattiva"}>
                    {m.active ? "⏸️ Disattiva" : "▶️ Riattiva"}
                  </button>
                </>
              )}
              <button onClick={async () => {
                // Criticità #8: era `alert()` — un errore vero, quindi va nel
                // canale degli errori veri, non in un modale del browser.
                if (count > 0) {
                  dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Impossibile rimuovere ${m.name}: ha ${count} task assegnati. Riassegnali prima di procedere.` } });
                  return;
                }
                const ok = await conferma({
                  title: `Rimuovere "${m.name}"?`,
                  body: "Il membro perde l'accesso a Tullio. L'operazione non è reversibile.",
                  cta: "Rimuovi", danger: true,
                });
                if (ok) dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header con pulsante aggiungi */}
      <div style={stiliComuni.rowCenterBetween}>
        <div style={rowGap16F13}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={txtGoldDark}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <div style={stiliComuni.rowGap8}>
          <button onClick={() => setShowBulk(true)} style={btnGhost} title="Invita più utenti in un colpo solo">
            ✉️ Invito multiplo
          </button>
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={mb24}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={stiliComuni.gridGap10}>
            {pending.map(m => card(m, { canApprove: true, dim: true }))}
          </div>
        </div>
      )}

      {/* Attivi */}
      <div style={mb24}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={stiliComuni.gridGap10}>
          {active.map(m => card(m))}
        </div>
      </div>

      {/* Disabilitati */}
      {disabled.length > 0 && (
        <div style={mb24}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={stiliComuni.gridGap10}>
            {disabled.map(m => card(m, { dim: true }))}
          </div>
        </div>
      )}

      {showAdd && <AddTeamMemberModal onClose={() => setShowAdd(false)} existingIds={team.map(m => m.id)} />}
      {showBulk && (
        <BulkInviteModal
          onClose={() => setShowBulk(false)}
          onInvited={() => dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Inviti inviati. I nuovi utenti appariranno nella lista dopo aver accettato." } })}
        />
      )}
    </div>
  );
};

// AddTeamMemberModal → src/components/admin/AddTeamMemberModal.jsx (Step P Phase 2f)
