// ─── CONTACT ACTIONS ────────────────────────────────────────────────────────
// Rende un numero di telefono cliccabile: al click apre un piccolo menu con
// Chiama (tel:), SMS (sms:) e WhatsApp (wa.me). Sostituisce il vecchio link
// <a href="tel:"> che, oltre a offrire solo la chiamata, su desktop non fa
// nulla di visibile e — quando annidato in una card cliccabile — veniva
// "mangiato" dall'onClick del genitore (stopPropagation qui risolve).
import { useState, useRef, useEffect } from "react";
import { sanitizePhone, toWhatsAppNumber, firstPhoneIn } from "../../lib/phoneUtils.js";

export function ContactActions({ phone, label, style }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tel = sanitizePhone(phone);
  const wa = toWhatsAppNumber(phone);

  useEffect(() => {
    if (!open) return;
    const onDocClick = e => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!tel) return <span style={style}>{label ?? phone}</span>;

  // stopPropagation ovunque: il contatto vive spesso dentro una card cliccabile
  // (es. scheda cliente) — il tap sul telefono non deve selezionarla.
  const toggle = e => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); };
  const choose = e => { e.stopPropagation(); setOpen(false); };

  return (
    <span ref={rootRef} onClick={e => e.stopPropagation()} style={{ position: "relative", display: "inline-flex", ...style }}>
      <button
        type="button"
        onClick={toggle}
        title="Chiama, SMS o WhatsApp"
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          font: "inherit", color: "var(--navy-light)", display: "inline-flex",
          alignItems: "center", gap: 6,
        }}
      >📞 {label ?? phone}</button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.15)", padding: 4, minWidth: 170,
        }}>
          <ContactMenuItem href={`tel:${tel}`} onClick={choose} icon="📞" label="Chiama" />
          <ContactMenuItem href={`sms:${tel}`} onClick={choose} icon="💬" label="SMS" />
          <ContactMenuItem
            href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
            onClick={choose} icon="🟢" label="WhatsApp"
          />
        </div>
      )}
    </span>
  );
}

const ContactMenuItem = ({ href, onClick, icon, label, target, rel }) => (
  <a
    href={href}
    target={target}
    rel={rel}
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      borderRadius: 7, textDecoration: "none", color: "var(--text)", fontSize: 13,
      fontFamily: "inherit", whiteSpace: "nowrap",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
  >
    <span style={{ fontSize: 15 }}>{icon}</span>{label}
  </a>
);

// Rende un testo libero (es. tasks.contact = "Mario 340 123 4567 / mail@x.it")
// individuando la prima porzione telefonica e rendendola cliccabile. Il resto
// del testo resta invariato. Se non trova un numero, ritorna il testo semplice.
export function ContactText({ text, style }) {
  const phone = firstPhoneIn(text);
  if (!phone) return <span style={style}>{text}</span>;
  const idx = text.indexOf(phone);
  const before = text.slice(0, idx);
  const after = text.slice(idx + phone.length);
  return (
    <span style={style}>
      {before}
      <ContactActions phone={phone} label={phone} />
      {after}
    </span>
  );
}
