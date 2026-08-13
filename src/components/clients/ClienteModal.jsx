// src/components/clients/ClienteModal.jsx
// Creazione e modifica di un cliente. In modifica mostra anche cosa è collegato
// (task e liste viaggio): serve PRIMA di salvare o eliminare, non dopo — è la
// differenza fra sapere cosa si sta toccando e scoprirlo da un errore di FK.
import { useRef, useState } from "react";
import { useIsMounted } from "../../hooks/useIsMounted.js";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { validaCampi, obbligatorio, emailValida, primoCampoInvalido } from "../../lib/validators.js";
import { chiaveNome } from "../../lib/clientNotes.js";
import { EMPTY_FORM, fieldStyle, labelStyle, noticeStyle } from "./clientStyles.js";
import { Modal } from "../ui/Modal.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 };
const txtF20Heading = { fontSize: 20, color: "var(--heading)" };
const boxF20Muted = { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" };
const txtBoldMb4 = { fontWeight: 700, marginBottom: 4 };
const rowStartGap7 = { display: "flex", alignItems: "flex-start", gap: 7, marginTop: 8, cursor: "pointer", fontWeight: 600 };
const mt2 = { marginTop: 2, cursor: "pointer" };
const grid2ColGap14 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 };
const gridColumn2 = { gridColumn: "1 / -1" };
const rowGap10Mt20 = { display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 };
const boxF14Muted = {
  padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--card)", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
};

// Criticità #10 — l'email è opzionale, il nome no. Prima il form NON diceva
// nulla di nessuno dei due: `if (!form.name.trim()) return;` usciva in
// silenzio, e l'unico segnale era il bottone disabilitato — che a form
// appena aperto sembra un'app rotta più che un campo mancante.
const REGOLE = {
  name: obbligatorio("Il nome è obbligatorio: è con questo che il cliente compare in liste e task."),
  email: emailValida(),
};
const ORDINE = ["name", "email"];

export function ClienteModal({ cliente, onSave, onClose, liste = null, tasksCollegati = [] }) {
  const [form, setForm] = useState(cliente
    ? { name: cliente.name, email: cliente.email || "", phone: cliente.phone || "", address: cliente.address || "", city: cliente.city || "", notes: cliente.notes || "" }
    : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [renameTasks, setRenameTasks] = useState(true);
  // Criticità #11: `onSave` è ClientiView.handleSave, che termina con
  // setModal(null) — cioè smonta QUESTO componente. Lo smontaggio è l'esito
  // normale del salvataggio riuscito, non un caso limite.
  const montato = useIsMounted();
  const [errori, setErrori] = useState({});
  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const rifCampo = { name: nameRef, email: emailRef };

  // L'errore di un campo si spegne appena lo si tocca (vedi AddMovBox).
  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrori(prec => (prec[k] ? { ...prec, [k]: undefined } : prec));
  };

  // Il nome è l'unico campo condiviso con altri moduli: le liste viaggio lo
  // mostrano come intestazione (join su client_id) e i task ne conservano una
  // copia testuale in `client`. Gli altri campi (email, città, note…) vivono
  // solo qui e si possono correggere senza conseguenze altrove.
  const nomeCambiato = !!cliente && chiaveNome(form.name) !== chiaveNome(cliente.name);
  const nListe = liste?.totali || 0;
  const nAttive = liste?.attive || 0;
  const nTask = tasksCollegati.length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trovati = validaCampi(form, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      rifCampo[primo]?.current?.focus();
      return;
    }
    setErrori({});
    setSaving(true);
    await onSave(
      { ...form, name: form.name.trim() },
      { renameTasks: nomeCambiato && renameTasks ? tasksCollegati : [] },
    );
    if (!montato()) return;
    setSaving(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="vd-cliente-title"
      width="min(540px, 96vw)"
      closeOnOverlay={false}
      cardStyle={{
        borderRadius: 14, padding: 28,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}
    >
      <div style={rowCenterBetween}>
        <h2 id="vd-cliente-title" className="playfair" style={txtF20Heading}>
          {cliente ? "Modifica Cliente" : "Nuovo Cliente"}
        </h2>
        <button onClick={onClose} style={boxF20Muted}>✕</button>
      </div>
      <form onSubmit={handleSubmit}>
        {cliente && (nListe > 0 || nTask > 0) && (
          <div style={{ ...noticeStyle, marginBottom: 14, background: nomeCambiato ? "#FEF3C7" : "var(--surface2)", borderColor: nomeCambiato ? "rgba(200,131,42,0.35)" : "var(--border)" }}>
            <div style={txtBoldMb4}>
              {nomeCambiato ? "⚠️ Stai cambiando un nome condiviso" : "Questa scheda è collegata"}
            </div>
            {nListe > 0 && (
              <div>
                {nListe === 1 ? "1 lista viaggio usa" : `${nListe} liste viaggio usano`} questo nome come intestazione
                {nListe > nAttive && ` (${nListe - nAttive} nel cestino)`}.
                {nomeCambiato && " Cambiandolo cambia l'intestazione di tutte, compresi i riepiloghi e i documenti generati da qui in avanti."}
              </div>
            )}
            {nTask > 0 && (
              <div style={{ marginTop: nListe > 0 ? 4 : 0 }}>
                {nTask === 1 ? "1 task riporta" : `${nTask} task riportano`} questo nome nel campo Cliente, che è testo libero e non un collegamento:
                {nomeCambiato ? " rinominando qui, senza aggiornarli, resterebbero legati al vecchio nome." : " restano allineati finché i due nomi coincidono."}
              </div>
            )}
            {nomeCambiato && nTask > 0 && (
              <label style={rowStartGap7}>
                <input type="checkbox" checked={renameTasks} onChange={e => setRenameTasks(e.target.checked)} style={mt2} />
                <span>Aggiorna anche {nTask === 1 ? "il task collegato" : `i ${nTask} task collegati`}</span>
              </label>
            )}
          </div>
        )}
        <div style={grid2ColGap14}>
          <div style={gridColumn2}>
            <label style={labelStyle} htmlFor="cli-name">Nome *</label>
            <input
              id="cli-name" ref={nameRef} style={fieldStyle} value={form.name}
              onChange={e => set("name", e.target.value)}
              placeholder="Nome completo o ragione sociale"
              {...ariaCampo("cli-name-err", errori.name)}
            />
            <FieldError id="cli-name-err">{errori.name}</FieldError>
          </div>
          <div>
            <label style={labelStyle} htmlFor="cli-email">Email</label>
            <input
              /* `type="text" inputMode="email"` e non `type="email"`: la
                 validazione nativa del browser bloccherebbe il submit PRIMA
                 del nostro handler, mostrando la sua bolla al posto del
                 messaggio inline — due meccanismi di validazione sullo stesso
                 campo, di cui uno non traducibile e non collegabile all'input
                 via aria-describedby. `inputMode` conserva la tastiera giusta
                 su mobile, che è l'altra ragione per cui `type="email"` era lì. */
              id="cli-email" ref={emailRef} style={fieldStyle} type="text" inputMode="email" value={form.email}
              onChange={e => set("email", e.target.value)} placeholder="email@esempio.it"
              {...ariaCampo("cli-email-err", errori.email)}
            />
            <FieldError id="cli-email-err">{errori.email}</FieldError>
          </div>
          <div>
            <label style={labelStyle}>Telefono</label>
            <input style={fieldStyle} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+39 000 000 0000" />
          </div>
          <div>
            <label style={labelStyle}>Indirizzo</label>
            <input style={fieldStyle} value={form.address} onChange={e => set("address", e.target.value)} placeholder="Via, numero civico" />
          </div>
          <div>
            <label style={labelStyle}>Città</label>
            <input style={fieldStyle} value={form.city} onChange={e => set("city", e.target.value)} placeholder="Città" />
          </div>
          <div style={gridColumn2}>
            <label style={labelStyle}>Note</label>
            <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Preferenze, note speciali..." />
          </div>
        </div>
        <div style={rowGap10Mt20}>
          <button type="button" onClick={onClose} style={boxF14Muted}>Annulla</button>
          {/* Criticità #10: il bottone NON è più disabilitato dal nome
              mancante. Un bottone spento non dice cosa manca — e a form
              appena aperto si legge come un'app rotta; premuto, ora il form
              dice quale campo e sposta il focus lì. */}
          <button type="submit" disabled={saving} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
            opacity: saving ? 0.5 : 1,
          }}>{saving ? "Salvataggio..." : (cliente ? "Salva" : "Aggiungi")}</button>
        </div>
      </form>
    </Modal>
  );
}

// Chip "N liste viaggio". È il segnale che distingue le due popolazioni finite
// nella stessa tabella: le anagrafiche del CRM (importate dal gestionale, con
// contatti e dati fiscali) e gli intestatari dei buoni viaggio, nati
// dall'import dei documenti Word — dove il "nome" è spesso l'etichetta di un
// evento ("50° RICCARDO SCAMARCIO", "ANGELA RICCI E MARCHETTI UMBERTO 50°
// COMPLEANNO"). Senza il chip sembrano schede sporche; con il chip si capisce
// a colpo d'occhio quali appartengono anche all'altro modulo.
