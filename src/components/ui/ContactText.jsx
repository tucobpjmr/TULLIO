// ─── CONTACT TEXT ──────────────────────────────────────────────────────────
// Estratto da ContactActions.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { firstPhoneIn } from "../../lib/phoneUtils.js";
import { ContactActions } from "./ContactActions.jsx";

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
