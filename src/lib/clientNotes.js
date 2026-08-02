// src/lib/clientNotes.js
// Le note dell'anagrafica clienti contengono due cose diverse finite nello
// stesso campo `notes`:
//
//   1. note vere, scritte da una persona ("preferisce volo diretto");
//   2. dati anagrafici ereditati dall'import Excel del gestionale legacy —
//      ClientImportModal ripiega nelle note le colonne senza un campo
//      dedicato ("Codice Fiscale: …", "Cap: …", "Provincia: …"), una per riga.
//
// Sul database sono 189 clienti su 816, tutti dall'import del 21/07: la card
// li mostrava come un blocco di testo tagliato a 80 caratteri ("Codice
// Fiscale: … Cap: … Provincia: … Nazion…"), che è la "descrizione ereditata"
// che si vede in elenco.
//
// Qui il testo viene SOLO letto e separato: nessuna scrittura, nessuna
// migrazione dei dati. Chi mostra le note decide poi come rendere le due
// parti (scheda per i campi, testo per le note vere).

// Etichetta plausibile: al massimo 40 caratteri e 4 parole, niente altri due
// punti dentro. Il limite sulle parole evita che una frase con i due punti
// ("Nota importante per il cliente: richiamare lunedì") diventi un campo.
const RE_CAMPO = /^\s*([^:]{2,40}?)\s*:\s*(\S.*?)\s*$/;
const MAX_PAROLE_ETICHETTA = 4;

/**
 * Separa le note in campi strutturati e testo libero.
 * @param {string|null|undefined} notes
 * @returns {{ fields: {label: string, value: string}[], text: string }}
 */
export function parseClientNotes(notes) {
  const fields = [];
  const righe = [];
  for (const riga of String(notes ?? '').split('\n')) {
    const m = riga.match(RE_CAMPO);
    if (m && m[1].trim().split(/\s+/).length <= MAX_PAROLE_ETICHETTA) {
      fields.push({ label: m[1].trim(), value: m[2].trim() });
    } else if (riga.trim()) {
      righe.push(riga.trim());
    }
  }
  return { fields, text: righe.join('\n') };
}

/**
 * Anteprima per la card in elenco: solo le note vere, troncate. I dati
 * anagrafici ereditati non ci finiscono — si contano a parte (vedi `fields`)
 * e si leggono per intero nel pannello del cliente.
 */
export function notesPreview(notes, max = 80) {
  const { text } = parseClientNotes(notes);
  if (!text) return '';
  const unaRiga = text.replace(/\s*\n\s*/g, ' · ');
  return unaRiga.length > max ? `${unaRiga.slice(0, max)}…` : unaRiga;
}

// ─── nome cliente: chiave di confronto ────────────────────────────────────
// Gemella di `chiaveCliente` in scripts/importa-liste/parser.js e di
// `normName` in ClientImportModal: maiuscole, accenti e spazi doppi non
// distinguono due clienti. NON riordina le parole ("ROSSI MARIO" resta
// diverso da "MARIO ROSSI"): fonderli d'ufficio unirebbe le liste di due
// persone diverse in caso di omonimia parziale.
export const chiaveNome = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Task collegati a un cliente PER NOME. `tasks.client_id` è testo libero, non
 * una foreign key: il legame regge finché le due stringhe coincidono, quindi
 * rinominare il cliente lo spezza in silenzio. Chi rinomina deve saperlo, e
 * il rename deve poter portarsi dietro i task.
 */
export const tasksDelCliente = (tasks, name) => {
  const k = chiaveNome(name);
  if (!k) return [];
  return (tasks || []).filter((t) => chiaveNome(t.client) === k);
};
