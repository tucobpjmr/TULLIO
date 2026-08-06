// src/components/clients/ClienteModal.jsx
// Creazione e modifica di un cliente. In modifica mostra anche cosa è collegato
// (task e liste viaggio): serve PRIMA di salvare o eliminare, non dopo — è la
// differenza fra sapere cosa si sta toccando e scoprirlo da un errore di FK.
import { useState } from "react";
import { chiaveNome } from "../../lib/clientNotes.js";
import { EMPTY_FORM, fieldStyle, labelStyle, noticeStyle } from "./clientStyles.js";
import { Z } from "../../styles/tokens.js";

export function ClienteModal({ cliente, onSave, onClose, liste = null, tasksCollegati = [] }) {
  const [form, setForm] = useState(cliente
    ? { name: cliente.name, email: cliente.email || "", phone: cliente.phone || "", address: cliente.address || "", city: cliente.city || "", notes: cliente.notes || "" }
    : { ...EMPTY_FORM }
  );
  const [saving, setSaving] = useState(false);
  const [renameTasks, setRenameTasks] = useState(true);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(
      { ...form, name: form.name.trim() },
      { renameTasks: nomeCambiato && renameTasks ? tasksCollegati : [] },
    );
    setSaving(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z.slideOver,
      background: "rgba(8,21,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="vd-modal-mh" style={{
        background: "var(--card)", borderRadius: 14, padding: 28, width: "min(540px, 96vw)",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 className="playfair" style={{ fontSize: 20, color: "var(--heading)" }}>
            {cliente ? "Modifica Cliente" : "Nuovo Cliente"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          {cliente && (nListe > 0 || nTask > 0) && (
            <div style={{ ...noticeStyle, marginBottom: 14, background: nomeCambiato ? "#FEF3C7" : "var(--surface2)", borderColor: nomeCambiato ? "rgba(200,131,42,0.35)" : "var(--border)" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 8, cursor: "pointer", fontWeight: 600 }}>
                  <input type="checkbox" checked={renameTasks} onChange={e => setRenameTasks(e.target.checked)} style={{ marginTop: 2, cursor: "pointer" }} />
                  <span>Aggiorna anche {nTask === 1 ? "il task collegato" : `i ${nTask} task collegati`}</span>
                </label>
              )}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Nome *</label>
              <input style={fieldStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo o ragione sociale" required />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={fieldStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@esempio.it" />
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
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Note</label>
              <textarea style={{ ...fieldStyle, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Preferenze, note speciali..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--card)", cursor: "pointer", fontSize: 14, color: "var(--text-muted)",
            }}>Annulla</button>
            <button type="submit" disabled={saving || !form.name.trim()} style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600,
              opacity: (!form.name.trim() || saving) ? 0.5 : 1,
            }}>{saving ? "Salvataggio..." : (cliente ? "Salva" : "Aggiungi")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Chip "N liste viaggio". È il segnale che distingue le due popolazioni finite
// nella stessa tabella: le anagrafiche del CRM (importate dal gestionale, con
// contatti e dati fiscali) e gli intestatari dei buoni viaggio, nati
// dall'import dei documenti Word — dove il "nome" è spesso l'etichetta di un
// evento ("50° RICCARDO SCAMARCIO", "ANGELA RICCI E MARCHETTI UMBERTO 50°
// COMPLEANNO"). Senza il chip sembrano schede sporche; con il chip si capisce
// a colpo d'occhio quali appartengono anche all'altro modulo.
