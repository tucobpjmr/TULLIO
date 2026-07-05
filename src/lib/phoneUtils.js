// ─── PHONE UTILS ────────────────────────────────────────────────────────────
// Helper per le azioni di contatto (chiamata / SMS / WhatsApp). Il numero può
// arrivare da un campo dedicato (clienti.phone, users.phone) o annegato in un
// testo libero (tasks.contact = "Telefono, email…"), quindi serve sia
// normalizzare sia estrarre.

// Prefisso internazionale di default quando il numero è in formato nazionale
// (agenzia italiana). Usato SOLO per il link WhatsApp, che richiede il numero
// in formato internazionale senza "+". tel:/sms: funzionano già col nazionale.
const DEFAULT_COUNTRY = "39";

// Numero "pulito" per tel:/sms: — via spazi e separatori, mantiene un eventuale
// "+" iniziale (i dialer nativi lo accettano). Ritorna "" se non ci sono cifre.
export function sanitizePhone(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/[^\d]/g, "");
  return digits ? plus + digits : "";
}

// Numero in formato internazionale (solo cifre, senza "+") per https://wa.me/.
// - "+39 340 123..." / "0039 340..." → country code già presente, si usa
// - numero nazionale italiano (inizia con 0 o 3) → si antepone DEFAULT_COUNTRY
// - altrimenti si assume già internazionale e si passano le sole cifre
// Ritorna "" se non ci sono cifre utili.
export function toWhatsAppNumber(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d]/g, "");
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  // Formato nazionale italiano (mobile 3xx, fisso 0xx): manca il country code.
  if (/^[03]/.test(digits)) return DEFAULT_COUNTRY + digits;
  return digits;
}

// Estrae il primo numero di telefono plausibile da un testo libero.
// Cerca una sequenza di cifre (con eventuali +, spazi, punti, trattini,
// parentesi) di almeno ~8 cifre totali. Ritorna la stringa originale del match
// (così l'etichetta resta leggibile) o null.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/;
export function firstPhoneIn(text) {
  if (!text) return null;
  const m = PHONE_RE.exec(String(text));
  if (!m) return null;
  // Deve contenere almeno 8 cifre per non catturare, es., un n° pratica corto.
  const digits = m[0].replace(/[^\d]/g, "");
  return digits.length >= 8 ? m[0].trim() : null;
}
