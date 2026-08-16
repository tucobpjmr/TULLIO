// src/components/admin/tabs/MessageTemplatesSection.jsx
// Le risposte rapide riutilizzabili in chat, gestite dall'admin.
import { useRef, useState } from "react";
import { cardStyle, cardH } from "../adminStyles.js";
import { useConfirm } from "../../../state/ConfirmContext.jsx";
import { FieldError, ariaCampo } from "../../ui/FieldError.jsx";
import { obbligatorio, primoCampoInvalido, validaCampi } from "../../../lib/validators.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 };
const boxF12Bold = {
  padding: "6px 12px", borderRadius: 6, border: "none",
  background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 12 };
const colGap8Mb12 = {
  padding: 12, background: "var(--surface2)", borderRadius: 8, marginBottom: 12,
  display: "flex", flexDirection: "column", gap: 8,
};
const boxF13R6 = { padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none" };
const boxF13R62 = { padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" };
const rowGap8 = { display: "flex", gap: 8, justifyContent: "flex-end" };
const boxF12R6 = { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const txtF13Muted = { padding: "14px 0", color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center" };
const gridGap8 = { display: "grid", gap: 8 };
const rowStartGap10 = {
  padding: 12, background: "var(--surface2)", borderRadius: 8,
  display: "flex", alignItems: "flex-start", gap: 10,
};
const txtF13Bold = { fontSize: 13, fontWeight: 700, color: "var(--heading)", marginBottom: 3 };
const txtF12Muted2 = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const rowGap4 = { display: "flex", gap: 4, flexShrink: 0 };
const boxF12Salva = {
  padding: "6px 14px", borderRadius: 6, border: "none",
  background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};

// Etichetta e testo sono entrambi obbligatori, e `ORDINE` è quello VISIVO:
// il focus va sul primo campo sbagliato dall'alto, non sul primo dichiarato.
const REGOLE = {
  label: obbligatorio("L'etichetta è obbligatoria."),
  text: obbligatorio("Il testo del template non può essere vuoto."),
};
const ORDINE = ["label", "text"];
const boxF12W28 = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 };
const boxF12Danger = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12, color: "var(--danger)" };

// ─── TEMPLATE MESSAGGI CHAT (v2.8) ─────────────────────────────────────────
export const MessageTemplatesSection = ({ templates = [], dispatch }) => {
  const conferma = useConfirm();
  const [editingId, setEditingId] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftText, setDraftText] = useState("");
  const [creating, setCreating] = useState(false);
  const [errori, setErrori] = useState({});
  const rifLabel = useRef(null);
  const rifText = useRef(null);

  const startEdit = (t) => {
    setEditingId(t.id);
    setDraftLabel(t.label);
    setDraftText(t.text);
    setCreating(false);
  };
  const cancel = () => { setEditingId(null); setCreating(false); setDraftLabel(""); setDraftText(""); setErrori({}); };
  const save = () => {
    // M-3 dell'audit del 16 agosto: bottone spento + `return` muto. Due campi
    // obbligatori e nessuno dei due indicato — l'utente doveva indovinare
    // quale mancasse.
    const trovati = validaCampi({ label: draftLabel, text: draftText }, REGOLE);
    const primo = primoCampoInvalido(trovati, ORDINE);
    if (primo) {
      setErrori(trovati);
      (primo === "label" ? rifLabel : rifText).current?.focus();
      return;
    }
    setErrori({});
    if (creating) dispatch({ type: "ADD_MESSAGE_TEMPLATE", payload: { label: draftLabel, text: draftText } });
    else dispatch({ type: "UPDATE_MESSAGE_TEMPLATE", payload: { id: editingId, label: draftLabel.trim(), text: draftText.trim() } });
    cancel();
  };

  return (
    <div style={cardStyle}>
      <div style={rowCenterBetween}>
        <h3 style={{ ...cardH, margin: 0 }}>💬 Template messaggi chat</h3>
        {!creating && !editingId && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setDraftLabel(""); setDraftText(""); }}
            style={boxF12Bold}
          >+ Nuovo</button>
        )}
      </div>
      <p style={txtF12Muted}>
        Frasi ricorrenti riutilizzabili dal composer chat (pulsante 📋). Solo Admin può gestire.
      </p>

      {(creating || editingId) && (
        <div style={colGap8Mb12}>
          <div>
            <input
              ref={rifLabel}
              value={draftLabel}
              onChange={e => {
                setDraftLabel(e.target.value);
                setErrori(prec => (prec.label ? { ...prec, label: undefined } : prec));
              }}
              placeholder="Etichetta (es. Sollecito acconto)"
              maxLength={40}
              style={boxF13R6}
              {...ariaCampo("vd-tpl-label-err", errori.label)}
            />
            <FieldError id="vd-tpl-label-err">{errori.label}</FieldError>
          </div>
          <div>
            <textarea
              ref={rifText}
              value={draftText}
              onChange={e => {
                setDraftText(e.target.value);
                setErrori(prec => (prec.text ? { ...prec, text: undefined } : prec));
              }}
              placeholder="Testo completo del messaggio…"
              rows={3}
              maxLength={500}
              style={boxF13R62}
              {...ariaCampo("vd-tpl-text-err", errori.text)}
            />
            <FieldError id="vd-tpl-text-err">{errori.text}</FieldError>
          </div>
          <div style={rowGap8}>
            <button onClick={cancel} style={boxF12R6}>Annulla</button>
            <button onClick={save} style={boxF12Salva}>{creating ? "Crea" : "Salva"}</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={txtF13Muted}>
          Nessun template. Crea il primo per velocizzare le risposte ricorrenti.
        </div>
      ) : (
        <div style={gridGap8}>
          {templates.map(t => (
            <div key={t.id} style={rowStartGap10}>
              <div className="vd-flex-1-min0">
                <div style={txtF13Bold}>{t.label}</div>
                <div style={txtF12Muted2}>{t.text}</div>
              </div>
              <div style={rowGap4}>
                <button onClick={() => startEdit(t)} title="Modifica" style={boxF12W28}>✏️</button>
                <button
                  onClick={async () => {
                    const ok = await conferma({ title: `Rimuovere il template "${t.label}"?`, cta: "Rimuovi", danger: true });
                    if (ok) dispatch({ type: "DELETE_MESSAGE_TEMPLATE", payload: t.id });
                  }}
                  title="Elimina"
                  style={boxF12Danger}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
