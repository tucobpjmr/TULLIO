// scripts/importa-liste/estrattore.js
// Estrazione del testo grezzo dai file delle liste storiche (.odt, .docx,
// .txt, .rtf). Zero dipendenze esterne: .odt e .docx sono archivi ZIP che
// contengono un XML, e per leggerli bastano `zlib` e un lettore ZIP minimale.
//
// Non è un convertitore generico: serve solo a ottenere, da ognuno dei ~600
// file, le righe nell'ordine in cui appaiono nel documento. Tutto il resto
// (che cosa sia una riga di movimento) è compito di parser.js.
import { inflateRawSync } from 'node:zlib';

// ─── ZIP ───────────────────────────────────────────────────────────────────
// Legge l'archivio partendo dal "central directory": è l'unico indice
// affidabile (i local header possono avere le dimensioni a zero quando il
// file è stato scritto in streaming, con i valori veri nel data descriptor).
export function leggiZip(buf) {
  const FINE_CD = 0x06054b50;
  const VOCE_CD = 0x02014b50;

  // L'EOCD sta in fondo, ma può essere seguito da un commento (max 64 KiB):
  // si cerca all'indietro la sua firma.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65535; i--) {
    if (buf.readUInt32LE(i) === FINE_CD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('archivio ZIP non valido (EOCD non trovato)');

  const nVoci = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const voci = new Map();

  for (let i = 0; i < nVoci; i++) {
    if (buf.readUInt32LE(p) !== VOCE_CD) throw new Error('archivio ZIP non valido (voce corrotta)');
    const metodo = buf.readUInt16LE(p + 10);
    const dimCompressa = buf.readUInt32LE(p + 20);
    const lunNome = buf.readUInt16LE(p + 28);
    const lunExtra = buf.readUInt16LE(p + 30);
    const lunCommento = buf.readUInt16LE(p + 32);
    const offsetLocale = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lunNome);
    voci.set(nome, { metodo, dimCompressa, offsetLocale });
    p += 46 + lunNome + lunExtra + lunCommento;
  }

  return {
    nomi: () => [...voci.keys()],
    file: (nome) => {
      const v = voci.get(nome);
      if (!v) return null;
      // Le lunghezze di nome/extra del local header possono differire da
      // quelle del central directory: vanno rilette qui.
      const lunNome = buf.readUInt16LE(v.offsetLocale + 26);
      const lunExtra = buf.readUInt16LE(v.offsetLocale + 28);
      const inizio = v.offsetLocale + 30 + lunNome + lunExtra;
      const dati = buf.subarray(inizio, inizio + v.dimCompressa);
      if (v.metodo === 0) return Buffer.from(dati);
      if (v.metodo === 8) return inflateRawSync(dati);
      throw new Error(`metodo di compressione ZIP non supportato: ${v.metodo}`);
    },
  };
}

// ─── XML → righe ───────────────────────────────────────────────────────────
const deEntity = (s) => s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

const ripulisci = (testo) => testo
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((r) => r.replace(/[\t\u00A0\u2007\u202F ]+/g, ' ').replace(/ {2,}/g, ' ').trim())
  .join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

// Le righe di tabella vanno tenute su una riga sola: se una lista è scritta
// in tabella (data | descrizione | importo), spezzarla per cella produrrebbe
// tre righe monche invece di un movimento. Per questo, dentro un blocco
// tabella, il fine-paragrafo diventa uno spazio e solo il fine-riga va a capo.
function xmlARighe(xml, tag) {
  const perBlocco = (frammento, dentroTabella) => {
    let s = frammento;
    s = s.replace(tag.aCapo, '\n');
    s = s.replace(tag.fineCella, ' ');
    s = s.replace(tag.fineRiga, '\n');
    s = s.replace(tag.fineParagrafo, dentroTabella ? ' ' : '\n');
    s = s.replace(tag.tab, ' ');
    s = s.replace(/<[^>]*>/g, '');
    return s;
  };

  // Si alterna tra testo fuori tabella e blocchi <table>: `split` con gruppo
  // di cattura tiene i separatori nell'array, così l'ordine è preservato.
  const pezzi = xml.split(tag.tabella);
  const out = pezzi.map((pezzo, i) => perBlocco(pezzo, i % 2 === 1)).join('\n');
  return ripulisci(deEntity(out));
}

const TAG_DOCX = {
  tabella: /(<w:tbl[ >][\s\S]*?<\/w:tbl>)/g,
  fineParagrafo: /<\/w:p>/g,
  fineRiga: /<\/w:tr>/g,
  fineCella: /<\/w:tc>/g,
  aCapo: /<w:br\b[^>]*\/?>/g,
  tab: /<w:tab\b[^>]*\/?>/g,
};

const TAG_ODT = {
  tabella: /(<table:table[ >][\s\S]*?<\/table:table>)/g,
  fineParagrafo: /<\/text:(?:p|h)>/g,
  fineRiga: /<\/table:table-row>/g,
  fineCella: /<\/table:table-cell>/g,
  aCapo: /<text:line-break\b[^>]*\/?>/g,
  tab: /<text:tab\b[^>]*\/?>/g,
};

// ─── testo semplice ────────────────────────────────────────────────────────
// I file storici possono essere stati salvati in ANSI (Windows-1252): se la
// decodifica UTF-8 produce caratteri di sostituzione si ripiega su latin1,
// altrimenti "€" e le lettere accentate arriverebbero corrotte al parser.
function decodificaTesto(buf) {
  const utf8 = buf.toString('utf8').replace(/^\uFEFF/, '');
  if (!utf8.includes('�')) return utf8;
  return buf.toString('latin1');
}

// RTF: si tengono solo \par/\line (a capo), \tab e gli escape \'xx; i gruppi
// di servizio ({\*\...}, font table, stylesheet) vengono scartati.
function rtfATesto(rtf) {
  let s = rtf.replace(/\{\\\*[\s\S]*?\}/g, '');
  s = s.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info)[\s\S]*?\}/g, '');
  s = s.replace(/\\(?:par|line|pard)\b/g, '\n');
  s = s.replace(/\\tab\b/g, ' ');
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, h) => Buffer.from(h, 'hex').toString('latin1'));
  s = s.replace(/\\u(-?\d+)\s?\??/g, (_, n) => String.fromCharCode(((Number(n) % 65536) + 65536) % 65536));
  s = s.replace(/\\[a-z]+-?\d*\s?/gi, '');
  s = s.replace(/[{}]/g, '');
  return ripulisci(s);
}

/**
 * Estrae il testo di un file lista.
 * @returns {{ testo: string|null, errore: string|null }}
 * `errore` valorizzato = formato non leggibile: il file va segnalato nel
 * report, mai saltato in silenzio.
 */
export function estraiTesto(nomeFile, buf) {
  const est = (nomeFile.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

  // I .doc legacy sono contenitori OLE2 (firma D0CF11E0), non ZIP: qui non si
  // aprono. Vanno convertiti in blocco con LibreOffice (vedi documentazione).
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    return { testo: null, errore: 'formato .doc legacy (Word 97-2003): convertire in .docx prima dell\'import' };
  }

  try {
    if (est === 'docx' || est === 'dotx') {
      const xml = leggiZip(buf).file('word/document.xml');
      if (!xml) return { testo: null, errore: 'docx senza word/document.xml' };
      return { testo: xmlARighe(xml.toString('utf8'), TAG_DOCX), errore: null };
    }
    if (est === 'odt' || est === 'ott' || est === 'fodt') {
      const xml = leggiZip(buf).file('content.xml');
      if (!xml) return { testo: null, errore: 'odt senza content.xml' };
      return { testo: xmlARighe(xml.toString('utf8'), TAG_ODT), errore: null };
    }
    if (est === 'rtf') return { testo: rtfATesto(decodificaTesto(buf)), errore: null };
    if (est === 'txt' || est === 'csv' || est === 'md') {
      return { testo: ripulisci(decodificaTesto(buf)), errore: null };
    }
  } catch (e) {
    return { testo: null, errore: `lettura fallita: ${e.message}` };
  }

  return { testo: null, errore: `estensione non gestita: .${est || '(nessuna)'}` };
}

export const _interni = { rtfATesto, decodificaTesto, xmlARighe, TAG_DOCX, TAG_ODT };
