// ─── NOTICE EDITOR MODAL ─────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState, useRef, useEffect } from "react";
import { NOTICE_COLORS } from "../../lib/taskConstants.js";
import { MentionText } from "../ui/MentionText.jsx";
import { Modal } from "../ui/Modal.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../lib/validators.js";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txt = { color: "#8b6f3a", fontStyle: "italic" };
const boxF13WFull = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid var(--border)", fontSize: 13,
  outline: "none", fontFamily: "inherit", resize: "vertical",
  boxSizing: "border-box", lineHeight: 1.45,
};
const rowBetweenMt4 = { display: "flex", justifyContent: "space-between", marginTop: 4 };
const mt14 = { marginTop: 14 };
const txtF11Bold = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 };
const txt2 = { fontWeight: 400, textTransform: "none", letterSpacing: 0 };
const rowCenterGap6 = {
  display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
  padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border)",
  minHeight: 38,
};
const rowCenterGap4 = {
  display: "inline-flex", alignItems: "center", gap: 4,
  background: "var(--surface2)", color: "var(--heading)",
  padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
};
const boxF12Muted = { background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 12, lineHeight: 1, padding: 0 };
const boxFlex1F12 = {
  flex: 1, minWidth: 100, border: "none", outline: "none",
  fontSize: 12, fontFamily: "inherit", padding: "3px 2px",
  background: "transparent", color: "var(--text)",
};
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13, cursor: "pointer", color: "var(--text)" };
const boxF12Pubblica = {
  padding: "8px 16px", borderRadius: 6, border: "none",
  background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
};
const boxF12Text = {
  padding: "8px 14px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--card)", color: "var(--text)", fontSize: 12, fontWeight: 500,
  cursor: "pointer", fontFamily: "inherit",
};

// M-3 dell'audit del 16 agosto. Un avviso senza testo non si pubblica, e va
// DETTO: il bottone spento più il `return` muto lasciavano l'utente davanti a
// un comando che non rispondeva e non spiegava perché (docs/CLAUDE.md,
// «Validazione dei form: inline, non via toast» — ⛔ niente bottone
// disabilitato al posto del messaggio).
const REGOLE = { text: obbligatorio("L'avviso non può essere vuoto.") };

export const NoticeEditorModal = ({ notice, onClose, onSave }) => {
  const [text, setText] = useState(notice?.text || "");
  const [color, setColor] = useState(notice?.color || NOTICE_COLORS[0]);
  const [pinned, setPinned] = useState(notice?.pinned || false);
  // v2.8: tag/categorie sui post-it (free-form, max 20 char ciascuno, max 5).
  // Persistono come array di stringhe normalizzate (lowercase, trim).
  const [tags, setTags] = useState(Array.isArray(notice?.tags) ? notice.tags : []);
  const [tagDraft, setTagDraft] = useState("");
  const [errori, setErrori] = useState({});
  const textareaRef = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const addTag = (raw) => {
    const t = String(raw || "").trim().toLowerCase().slice(0, 20);
    if (!t || tags.includes(t) || tags.length >= 5) return;
    setTags([...tags, t]);
  };
  const onTagKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
      setTagDraft("");
    } else if (e.key === "Backspace" && !tagDraft && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  // ─── A-4 · l'esito PRIMA della chiusura (audit del 19 agosto) ────────────
  // `onSave` era chiamata e basta, e NoticeBoard chiudeva la modale nello
  // stesso turno: su una scrittura rifiutata — la RLS nega a chi non è
  // l'autore (`canEditNotice`), o la rete cade — l'avviso appariva, spariva
  // con il rollback, e il testo digitato non esisteva più. È lo stesso difetto
  // che M-1 del 16 agosto ha chiuso in `ClientiView.handleSave`, e questa è la
  // stessa correzione: chi chiude è la modale, a esito noto.
  const { salva, inVolo, errore: erroreSalvataggio } = useSalvataggio(onSave, {
    alSuccesso: onClose,
    messaggioErrore: "Avviso non salvato. Il testo è ancora qui, riprova.",
  });

  const submit = () => {
    const trovati = validaCampi({ text }, REGOLE);
    if (trovati.text) {
      setErrori(trovati);
      textareaRef.current?.focus();
      return;
    }
    setErrori({});
    salva({ text: text.trim(), color, pinned, tags });
  };

  // Il portale (NoticeBoard è dentro il wrapper .fade-in della Dashboard, il cui
  // transform diventa containing block per i fixed) arriva da ui/Modal.jsx
  // insieme a Esc, blocco dello scroll di fondo e role="dialog".
  // `closeOnOverlay={false}`: si è appena scritto un avviso, un click a lato non
  // deve buttarlo via.
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="vd-notice-title"
      width={520}
      closeOnOverlay={false}
      cardStyle={{ borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
    >
      <h3 id="vd-notice-title" className="playfair" style={stiliComuni.txtHeadingMb16}>
        {notice ? "✏️ Modifica avviso" : "📌 Nuovo avviso"}
      </h3>

      {/* Preview live */}
      <div style={{
        background: color, padding: "12px 14px", borderRadius: 4,
        marginBottom: 16, minHeight: 80,
        boxShadow: "0 3px 8px rgba(0,0,0,0.12)",
        fontSize: 13, lineHeight: 1.45, color: "#3d2f10",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {text
          ? <MentionText text={text} />
          : <span style={txt}>Anteprima dell'avviso...</span>}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setErrori(prec => (prec.text ? {} : prec));
        }}
        {...ariaCampo("vd-notice-text-err", errori.text)}
        placeholder="Scrivi qui il tuo avviso... usa @nome per menzionare un membro del team"
        rows={4}
        maxLength={500}
        style={boxF13WFull}
        onFocus={e => e.target.style.borderColor = "var(--gold)"}
        onBlur={e => e.target.style.borderColor = "var(--border)"}
      />
      <FieldError id="vd-notice-text-err">{errori.text}</FieldError>
      <div style={rowBetweenMt4}>
        <span style={stiliComuni.txtF11Muted}>
          💡 Scrivi <b>@nome</b> per notificare un collega
        </span>
        <span style={stiliComuni.txtF11Muted}>{text.length}/500</span>
      </div>

      {/* Colore */}
      <div style={mt14}>
        <div style={txtF11Bold}>
          Colore post-it
        </div>
        <div style={stiliComuni.rowGap8}>
          {NOTICE_COLORS.map(c => (
            <div
              key={c}
              role="button"
              tabIndex={0}
              aria-pressed={color === c}
              aria-label={`Colore post-it ${c}`}
              onClick={() => setColor(c)}
              onKeyDown={attivaConTastiera(() => setColor(c))}
              style={{
                width: 34, height: 34, borderRadius: 6, background: c,
                cursor: "pointer", border: color === c ? "2px solid var(--navy)" : "2px solid transparent",
                transition: "transform 0.15s",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                transform: color === c ? "scale(1.1)" : "scale(1)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Tag (v2.8): chip + input. Enter o virgola conferma; Backspace su input vuoto rimuove ultimo */}
      <div style={mt14}>
        <div style={txtF11Bold}>
          Tag <span style={txt2}>(opzionali, max 5 — premi Invio per aggiungere)</span>
        </div>
        <div style={rowCenterGap6}>
          {tags.map(t => (
            <span key={t} style={rowCenterGap4}>
              #{t}
              <button
                type="button"
                onClick={() => setTags(tags.filter(x => x !== t))}
                aria-label={`Rimuovi tag ${t}`}
                style={boxF12Muted}
              >×</button>
            </span>
          ))}
          {tags.length < 5 && (
            <input
              value={tagDraft}
              onChange={e => setTagDraft(e.target.value)}
              onKeyDown={onTagKey}
              onBlur={() => { if (tagDraft) { addTag(tagDraft); setTagDraft(""); } }}
              placeholder={tags.length === 0 ? "es. urgente, partenza, fornitori…" : ""}
              maxLength={20}
              style={boxFlex1F12}
            />
          )}
        </div>
      </div>

      {/* Pin */}
      <label style={rowCenterGap8}>
        <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} />
        📌 Fissa questo avviso in cima alla bacheca
      </label>

      {/* A-4 · Il fallimento si dice QUI, accanto ai dati che sono rimasti.
          Il toast col messaggio del database lo mostra già il registry di
          persistenza: questo dice l'unica cosa che il toast non dice. */}
      <FieldError id="vd-notice-save-err">{erroreSalvataggio}</FieldError>

      {/* Footer buttons */}
      <div style={stiliComuni.rowGap8Mt20}>
        <button onClick={onClose} style={boxF12Text}>Annulla</button>
        {/* Il bottone resta PREMIBILE anche a testo vuoto: è premendolo che si
            ottiene il messaggio sotto il campo e il focus dentro l'area di
            testo. Spento non diceva cosa mancasse. `disabled` mentre la
            scrittura è in volo è un'altra cosa — è il freno al doppio invio, e
            la sua ragione è a schermo nell'etichetta. */}
        <button onClick={submit} disabled={inVolo} style={boxF12Pubblica}>
          {inVolo ? "Salvataggio…" : (notice ? "💾 Salva modifiche" : "📌 Pubblica avviso")}
        </button>
      </div>
    </Modal>
  );
};
