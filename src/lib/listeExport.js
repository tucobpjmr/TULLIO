// src/lib/listeExport.js
// Documenti del modulo Liste viaggio: la copia agente (Word), il riepilogo per
// il cliente (testo condivisibile) e il file di backup.
//
// Stanno qui, fuori dai componenti, perché sono funzioni pure su dati già
// caricati: si verificano senza montare nulla. Le sole che toccano il DOM sono
// i due download in fondo al file, isolati apposta.
//
// I due documenti hanno destinatari diversi e NON vanno confusi:
//  · copia agente  → uso interno: metodi di pagamento + storico delle modifiche;
//  · riepilogo cliente → si consegna al cliente: niente metodi, niente storico.
import { actionLabel, eur, fmtDate } from './listeApi.js';

// Il documento Word è una stringa HTML: ogni valore che arriva dal database va
// scappato, altrimenti una descrizione che contiene "<" o "&" produce un file
// malformato (i nomi delle agenzie con "&" sono frequenti).
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const saldoOf = (movs) => (movs || []).reduce((s, m) => s + Number(m.importo), 0);

// Importo per i documenti Word: segno esplicito e separatori italiani.
// Non riusa eur() perché Word rende male lo spazio unificatore che Intl
// inserisce prima del simbolo di valuta.
const impDoc = (v) => `${Number(v) < 0 ? '-' : ''}€ ${Math.abs(Number(v)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`;

// Nome file del documento: il nome cliente diventa la parte parlante, con gli
// spazi in underscore. Senza sanificazione un "/" nel nome cliente (es. "ROSSI
// E/O BIANCHI") troncherebbe il percorso di download.
export const nomeFileDoc = (lista, suffisso = '') => {
  const cliente = (lista?.clients?.name || 'CLIENTE')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, '_');
  return `LISTA_${cliente}${suffisso}.doc`;
};

// ─── copia agente (Word, uso interno) ─────────────────────────────────────
// `storico` e `usersById` sono opzionali: l'export massivo non li carica, per
// non moltiplicare le query su centinaia di liste.
export function docHtml(lista, movs, storico = null, usersById = {}) {
  const righe = (movs || []).map((m) => `
    <tr>
      <td style="width:90px">${fmtDate(m.data_movimento)}</td>
      <td>${esc(m.descrizione)}</td>
      <td style="width:110px;text-align:right">${impDoc(m.importo)}</td>
      <td style="width:80px">${m.metodo ? esc(m.metodo.toUpperCase()) : ''}</td>
    </tr>`).join('');

  const storicoHtml = storico && storico.length ? `
    <h2 style="font-size:12pt;margin-top:18pt">Storico modifiche</h2>
    <table>${storico.map((h) => `
      <tr>
        <td style="width:120px;font-size:9pt">${new Date(h.created_at).toLocaleString('it-IT')}</td>
        <td style="width:110px;font-size:9pt">${esc(usersById[h.actor_id] || '—')}</td>
        <td style="font-size:9pt">${esc(actionLabel(h.action))}${h.old_value ? ` — da: ${esc(h.old_value)}` : ''}${h.new_value ? ` — a: ${esc(h.new_value)}` : ''}</td>
      </tr>`).join('')}</table>` : '';

  return `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
    <style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt}table{border-collapse:collapse;width:100%}td{padding:4pt 6pt;border-bottom:0.5pt solid #ccc}h1{font-size:14pt}</style>
    </head><body>
    <h1>LISTA ${esc(lista?.clients?.name || '')}</h1>
    ${lista?.titolo ? `<p><i>${esc(lista.titolo)}</i></p>` : ''}
    <p style="font-size:9pt;color:#B23A2E;letter-spacing:.06em"><b>COPIA AGENTE — USO INTERNO</b></p>
    <table>${righe}</table>
    <p style="margin-top:14pt"><b>SALDO: ${impDoc(saldoOf(movs))}</b></p>
    ${lista?.stato === 'esaurita' ? '<p style="color:#C0392B"><b>LISTA ESAURITA</b></p>' : ''}
    ${storicoHtml}
    <p style="font-size:9pt;color:#888">Esportato il ${new Date().toLocaleDateString('it-IT')} — Gestione Liste Viaggio</p>
    </body></html>`;
}

// ─── riepilogo cliente (testo per WhatsApp / email) ───────────────────────
// La versione stampabile è JSX (RiepilogoClienteModal); questa è la stessa
// informazione in testo semplice, per la condivisione.
export function riepilogoTesto(lista, movs) {
  const righe = (movs || [])
    .map((m) => `${fmtDate(m.data_movimento)}  ${m.descrizione}  ${eur(m.importo)}`)
    .join('\n');
  return `RIEPILOGO BUONO VIAGGIO\n${lista?.clients?.name || ''}${lista?.titolo ? ` — ${lista.titolo}` : ''}\n\n`
    + (righe || 'Nessun movimento registrato.')
    + `\n\nSALDO: ${eur(saldoOf(movs))}`
    + (lista?.stato === 'esaurita' ? '\n\nLISTA ESAURITA' : '');
}

// ─── backup ───────────────────────────────────────────────────────────────
// Formato letto da importa_backup(): le tre tabelle così come stanno, con gli
// id originali, così ricaricare lo stesso file non duplica nulla.
export const BACKUP_APP = 'liste-viaggio';

export const buildBackup = (clients, liste, movimenti) => ({
  app: BACKUP_APP,
  versione: 1,
  esportato_il: new Date().toISOString(),
  clients: clients || [],
  liste: liste || [],
  movimenti: movimenti || [],
});

// Validazione del file caricato. Non rifiuta i file "estranei" da sola: torna
// `sospetto` e lascia decidere all'interfaccia con una conferma esplicita,
// perché un backup prodotto da una versione futura resta comunque caricabile.
export function leggiBackup(testo) {
  let data;
  try {
    data = JSON.parse(testo);
  } catch {
    return { ok: false, errore: 'File non valido: JSON non leggibile' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, errore: 'File non valido: contenuto non riconosciuto' };
  }
  const liste = Array.isArray(data.liste) ? data.liste : [];
  const movimenti = Array.isArray(data.movimenti) ? data.movimenti : [];
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const sospetto = data.app !== BACKUP_APP || !Array.isArray(data.liste);
  return { ok: true, sospetto, payload: { clients, liste, movimenti } };
}

// ─── download (unico punto che tocca il DOM) ─────────────────────────────
export function downloadBlob(nomeFile, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeFile;
  a.click();
  URL.revokeObjectURL(url);
}

// Il BOM iniziale serve a Word per riconoscere il file come UTF-8: senza, le
// lettere accentate arrivano illeggibili.
export const downloadDoc = (nomeFile, html) =>
  downloadBlob(nomeFile, new Blob(['\uFEFF', html], { type: 'application/msword' }));

export const downloadJson = (nomeFile, obj) =>
  downloadBlob(nomeFile, new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
