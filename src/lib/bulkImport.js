// src/lib/bulkImport.js
// Normalizzazione dei valori che arrivano da un CSV/Excel importato.
//
// PERCHÉ QUI. Queste funzioni vivevano dentro ImportTab, ricreate a ogni
// render e — soprattutto — irraggiungibili da un test senza montare la modale,
// caricare un file finto e ispezionare il DOM. Sono invece pure: stringa in,
// valore canonico out. `normDate` in particolare incorpora una regola che è
// costata un bug silenzioso (vedi il commento sotto) e merita di essere
// verificabile direttamente.
//
// Le tabelle che dipendono dai dati dell'agenzia (categorie, team) arrivano
// come argomento esplicito, non lette da una globale di modulo: stessa
// convenzione di lib/permissions.js. Priorità e stati sono invece costanti
// dello schema, importate qui.

import { PRIORITIES, STATUSES, STATUS_LABELS } from "./taskConstants.js";

const chiave = (v) => String(v).toLowerCase().trim();

// ─── CATEGORIA ───────────────────────────────────────────────────────────────
// Accetta sia la chiave ("booking") sia l'etichetta mostrata ("Prenotazioni").
const trovaCategoria = (categories, v) => {
  const s = chiave(v);
  return Object.keys(categories || {})
    .find(k => k === s || (categories[k]?.label || "").toLowerCase() === s);
};

export const normCat = (categories, v) => (v ? trovaCategoria(categories, v) || "admin" : "admin");
// "Riconosciuto" ≠ "valido": una cella vuota è legittima (si applica il
// default), una cella piena ma non mappabile va segnalata all'operatore.
export const isRecognizedCat = (categories, v) => (!v ? true : !!trovaCategoria(categories, v));

// ─── PRIORITÀ ────────────────────────────────────────────────────────────────
const trovaPriorita = (v) => {
  const s = chiave(v);
  return Object.keys(PRIORITIES).find(k => k === s || PRIORITIES[k].label.toLowerCase() === s);
};

export const normPrio = (v) => (v ? trovaPriorita(v) || "medium" : "medium");
export const isRecognizedPrio = (v) => (!v ? true : !!trovaPriorita(v));

// ─── STATO ───────────────────────────────────────────────────────────────────
const trovaStato = (v) => {
  const s = chiave(v);
  return STATUSES.find(k => k === s || STATUS_LABELS[k].toLowerCase() === s);
};

export const normStat = (v) => (v ? trovaStato(v) || "todo" : "todo");
export const isRecognizedStat = (v) => (!v ? true : !!trovaStato(v));

// ─── ASSEGNATARIO ────────────────────────────────────────────────────────────
// Match generoso: id esatto, nome che contiene il valore, o valore che contiene
// il nome di battesimo (il file esterno scrive "Marco", il team ha "Marco Neri").
export const normAssignee = (team, v) => {
  if (!v) return null;
  const s = chiave(v);
  const m = (team || []).find(mm =>
    mm.id === s ||
    mm.name.toLowerCase().includes(s) ||
    s.includes(mm.name.toLowerCase().split(" ")[0]));
  return m?.id || null;
};

// ─── SCADENZA ────────────────────────────────────────────────────────────────
// Formato italiano gg/mm/aaaa (o gg-mm-aaaa): il costruttore Date nativo
// interpreta "31/12/2026" come Invalid Date (prova mm/dd/yyyy, 31 non è un
// mese valido) → veniva scartata senza avviso; per date ambigue come
// "05/03/2026" la interpretava invece come 3 maggio anziché 5 marzo,
// invertendo silenziosamente giorno e mese. L'app è italiana: per questo
// pattern trattiamo sempre giorno-mese-anno, con validazione esplicita
// (rifiuta es. 31/02 invece di farlo scivolare al 3 marzo).
export const normDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  const s = String(v).trim();
  const itMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (itMatch) {
    const dd = Number(itMatch[1]);
    const mm = Number(itMatch[2]);
    let yyyy = Number(itMatch[3]);
    if (itMatch[3].length === 2) yyyy += yyyy < 70 ? 2000 : 1900;
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    const valid = d.getUTCFullYear() === yyyy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
    return valid ? d.toISOString() : null;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// ─── AUTO-MAPPATURA DELLE COLONNE ────────────────────────────────────────────
// Parole chiave cercate in sottostringa nell'intestazione: i file reali
// arrivano con "Data scadenza", "DUE DATE", "Scadenze previste"…
const COLUMN_KEYWORDS = {
  title:          ["titolo", "title", "nome", "task"],
  category:       ["categoria", "category", "tipo"],
  priority:       ["priorit", "priority"],
  status:         ["stato", "status"],
  client:         ["cliente", "client"],
  dueDate:        ["scadenz", "due", "data"],
  assignee:       ["assegn", "assign", "owner", "responsab"],
  estimatedHours: ["ore", "hours"],
  description:    ["descriz", "descr", "note"],
  contact:        ["contatt", "contact", "telefono", "phone", "cellulare"],
};

/** @returns {Record<string,string>} campo → nome colonna ("" se non trovata) */
export const detectColumns = (cols) => {
  const find = (kws) => (cols || []).find(c => kws.some(kw => c.toLowerCase().includes(kw)));
  return Object.fromEntries(
    Object.entries(COLUMN_KEYWORDS).map(([campo, kws]) => [campo, find(kws) || ""]),
  );
};
