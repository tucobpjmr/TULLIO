// src/lib/validators.js
// Helper di validazione condivisi, senza side-effect (facilmente testabili).

// Regex email pragmatica (non RFC-completa): richiede una parte locale senza
// spazi/@/virgole, una @, un dominio e almeno un punto. Estratta da
// BulkInviteModal (era duplicata solo lì) per essere riusata ovunque si
// validi un'email inserita manualmente (ProfileEditor, AddTeamMemberModal).
export const EMAIL_RX = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

// Valida un indirizzo email. Una stringa vuota/whitespace-only NON è valida:
// i chiamanti che considerano l'email opzionale devono controllare prima se
// il campo è vuoto e saltare la validazione in quel caso.
export function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RX.test(email.trim());
}
