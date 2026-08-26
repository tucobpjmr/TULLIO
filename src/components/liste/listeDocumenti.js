// src/components/liste/listeDocumenti.js
//
// ─── B-1 (audit del 26 agosto) · I DOCUMENTI CHE ESCONO DAL SISTEMA ───────
//
// La copia Word per l'agente e il riepilogo testuale per il cliente. Stavano
// in coda a `listeApi.js`: un generatore di documenti dentro il modulo che
// parla al database, e le due cose non cambiano mai insieme.
//
// ⚠️ QUI L'ESCAPING È A CARICO DI CHI SCRIVE, ed è la ragione per cui questo
// file esiste come file e non come coda di un altro. Si costruisce HTML come
// STRINGA, non JSX: non c'è escaping automatico, quindi `escHtml` va applicato
// a mano a ogni punto di testo libero (descrizione, nome cliente, valori dello
// storico). Sono cinque, e l'appendice di sicurezza dell'audit del 26 agosto
// li ha verificati uno per uno. Un sesto punto aggiunto senza `escHtml`
// sarebbe l'unico sink di HTML grezzo dell'app.
import { dataNumerica } from "../../lib/dates.js";
import { actionLabel, eur, fmtDate, intestazioneLista } from "./listeFormato.js";

// Qui si costruisce HTML come stringa (non JSX): a differenza del rendering
// React, non c'è escaping automatico, quindi va fatto a mano prima di
// interpolare testo libero (descrizione, nome cliente...) nel markup.
const escHtml = (s) => (s ?? '').toString().replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Documento a uso interno (Word/.doc via HTML con namespace `w:`): include
// metodo di pagamento e, se passato lo storico, il registro di chi ha
// modificato cosa e quando. Il riepilogo per il cliente è un'altra cosa
// (niente metodi di pagamento, niente storico): vedi riepilogoTesto.
// `saldoEsatto`, se passato, è il saldo già calcolato dal database
// (`liste_saldi.saldo`, numeric(12,2) — B-1 dell'audit del 23 agosto): questo
// documento ESCE dal sistema (copia Word per l'agente), quindi è proprio qui
// che una cifra ricalcolata in float64 è più difficile da smentire. Il
// ricalcolo locale resta come fallback per chi non ha ancora il saldo esatto
// a disposizione (es. i test di questo modulo).
export const docHtml = (lista, movimenti, storico, usersById = {}, saldoEsatto) => {
  const rows = movimenti.map((m) => `
    <tr>
      <td style="width:90px">${fmtDate(m.data_movimento)}</td>
      <td>${escHtml(m.descrizione)}</td>
      <td style="width:110px;text-align:right">${Number(m.importo) < 0 ? '-' : ''}€ ${Math.abs(Number(m.importo)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
      <td style="width:80px">${m.metodo ? escHtml(m.metodo.toUpperCase()) : ''}</td>
    </tr>`).join('');
  const saldo = saldoEsatto !== undefined ? saldoEsatto : movimenti.reduce((s, m) => s + Number(m.importo), 0);
  const storicoHtml = storico && storico.length ? `
    <h2 style="font-size:12pt;margin-top:18pt">Storico modifiche</h2>
    <table>${storico.map((h) => `
      <tr>
        <td style="width:120px;font-size:9pt">${new Date(h.created_at).toLocaleString('it-IT')}</td>
        <td style="width:110px;font-size:9pt">${escHtml(usersById[h.actor_id] || '—')}</td>
        <td style="font-size:9pt">${escHtml(actionLabel(h.action))}${h.old_value ? ` — da: ${escHtml(h.old_value)}` : ''}${h.new_value ? ` — a: ${escHtml(h.new_value)}` : ''}</td>
      </tr>`).join('')}</table>` : '';
  return `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
    <style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt}table{border-collapse:collapse;width:100%}td{padding:4pt 6pt;border-bottom:0.5pt solid #ccc}h1{font-size:14pt}</style>
    </head><body>
    <h1>LISTA ${escHtml(intestazioneLista(lista))}</h1>
    ${lista.titolo ? `<p><i>${escHtml(lista.titolo)}</i></p>` : ''}
    <p style="font-size:9pt;color:#B23A2E;letter-spacing:.06em"><b>COPIA AGENTE — USO INTERNO</b></p>
    <table>${rows}</table>
    <p style="margin-top:14pt"><b>SALDO: € ${saldo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</b></p>
    ${lista.stato === 'esaurita' ? '<p style="color:#C0392B"><b>LISTA ESAURITA</b></p>' : ''}
    ${storicoHtml}
    <p style="font-size:9pt;color:#888">Esportato il ${dataNumerica(new Date())} — Gestione Liste Viaggio</p>
    </body></html>`;
};

// Testo semplice per il riepilogo cliente (condivisione via navigator.share o
// clipboard): niente metodi di pagamento, niente storico.
export const riepilogoTesto = (lista, movimenti, saldoEsatto) => {
  const righe = movimenti.map((m) => `${fmtDate(m.data_movimento)}  ${m.descrizione}  ${eur(m.importo)}`).join('\n');
  const saldo = saldoEsatto !== undefined ? saldoEsatto : movimenti.reduce((s, m) => s + Number(m.importo), 0);
  return `RIEPILOGO BUONO VIAGGIO\n${intestazioneLista(lista)}${lista.titolo ? ' — ' + lista.titolo : ''}\n\n`
    + (righe || 'Nessun movimento registrato.')
    + `\n\nSALDO: ${eur(saldo)}`
    + (lista.stato === 'esaurita' ? '\n\nLISTA ESAURITA' : '');
};
// Innesca il download lato client di un Blob già pronto (doc Word, JSON di
// backup...). M-3 dell'audit del 14 agosto (secondo passaggio): era una di
// TRE copie identiche dello stesso corpo (con adminExport.js e
// calendar/calendarIcs.js) — l'implementazione unica è `scaricaBlob`. Resta
// qui come alias di una riga per non toccare i call site di questo modulo.
export { scaricaBlob as downloadBlob } from "../../lib/fileUtils.js";