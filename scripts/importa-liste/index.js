#!/usr/bin/env node
// scripts/importa-liste/index.js
//
// Converte una cartella di liste viaggio storiche (.odt/.docx/.txt/.rtf) nel
// file JSON che il modulo "Liste viaggio" sa già caricare da
// Strumenti dati → Carica backup (RPC `importa_backup`).
//
// Non tocca il database: produce file su disco. Il caricamento resta un gesto
// esplicito dell'utente dentro l'app, con il conteggio mostrato prima di
// scrivere. Vedi docs/IMPORT_LISTE_VIAGGIO.md per la procedura completa.
//
//   node scripts/importa-liste/index.js <cartella> [opzioni]
//
//   --out <cartella>       dove scrivere i risultati (default: ./import-liste)
//   --clienti <file.json>  backup scaricato dall'app: i clienti già presenti
//                          vengono riusati invece di crearne di nuovi
//   --dividi <n>           massimo n liste per file JSON (default: 250)
//   --titolo-da-file       usa sempre il nome del file come titolo della lista
//   --solo-report          analizza e scrive i report, senza generare il JSON
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, basename, resolve } from 'node:path';
import { estraiTesto } from './estrattore.js';
import { analizzaLista, costruisciBackup, chiaveCliente } from './parser.js';

const ESTENSIONI = /\.(odt|ott|fodt|docx|dotx|txt|rtf|doc)$/i;

function argomenti(argv) {
  const o = { cartella: null, out: 'import-liste', clienti: null, dividi: 250, titoloDaFile: false, soloReport: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--clienti') o.clienti = argv[++i];
    else if (a === '--dividi') o.dividi = Number(argv[++i]) || 0;
    else if (a === '--titolo-da-file') o.titoloDaFile = true;
    else if (a === '--solo-report') o.soloReport = true;
    else if (!a.startsWith('--') && !o.cartella) o.cartella = a;
  }
  return o;
}

function elencaFile(radice) {
  const out = [];
  const scendi = (dir) => {
    for (const voce of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, voce.name);
      // I file temporanei di Word/Writer (~$..., .~lock...) sono frammenti,
      // non liste: vanno saltati o produrrebbero righe fantasma.
      if (voce.name.startsWith('~$') || voce.name.startsWith('.~lock')) continue;
      if (voce.isDirectory()) scendi(p);
      else if (ESTENSIONI.test(voce.name)) out.push(p);
    }
  };
  scendi(radice);
  return out.sort();
}

// I clienti già in anagrafica arrivano dal backup scaricato dall'app
// ("Strumenti dati → Scarica backup"): senza questo passaggio l'import
// creerebbe un secondo cliente con lo stesso nome accanto a quello esistente.
function caricaClientiEsistenti(percorso) {
  const dati = JSON.parse(readFileSync(percorso, 'utf8'));
  const elenco = Array.isArray(dati) ? dati : (dati.clients || []);
  const mappa = new Map();
  const ambigui = [];
  for (const c of elenco) {
    if (!c?.id || !c?.name) continue;
    const k = chiaveCliente(c.name);
    if (!k) continue;
    if (mappa.has(k) && mappa.get(k) !== c.id) ambigui.push(c.name);
    else mappa.set(k, c.id);
  }
  return { mappa, ambigui };
}

const csvCampo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function scriviReport(dir, analisi, illeggibili) {
  const righe = [['file', 'cliente', 'stato', 'movimenti', 'saldo', 'righe_non_importate', 'avvisi'].join(';')];
  for (const a of analisi) {
    righe.push([
      csvCampo(a.percorso),
      csvCampo(a.cliente),
      csvCampo(a.esaurita ? 'esaurita' : 'attiva'),
      a.movimenti.length,
      csvCampo(a.saldo.toFixed(2).replace('.', ',')),
      a.righeNonRiconosciute.length,
      csvCampo(a.avvisi.join(' | ')),
    ].join(';'));
  }
  for (const f of illeggibili) {
    righe.push([csvCampo(f.percorso), '', csvCampo('NON LETTO'), 0, '', '', csvCampo(f.errore)].join(';'));
  }
  // BOM: senza, Excel in italiano apre il CSV in ANSI e storpia gli accenti.
  writeFileSync(join(dir, 'report.csv'), `\uFEFF${righe.join('\n')}\n`);

  const dettaglio = [];
  for (const a of analisi) {
    if (!a.righeNonRiconosciute.length) continue;
    dettaglio.push(`── ${a.percorso}  (cliente: ${a.cliente})`);
    for (const r of a.righeNonRiconosciute) dettaglio.push(`   riga ${r.n} [${r.motivo}]: ${r.riga}`);
    dettaglio.push('');
  }
  writeFileSync(
    join(dir, 'righe-non-importate.txt'),
    dettaglio.length
      ? `Righe presenti nei documenti che il parser non ha saputo leggere.\nSono comunque ricopiate nelle note interne della lista corrispondente.\n\n${dettaglio.join('\n')}`
      : 'Nessuna riga non riconosciuta: tutti i documenti sono stati letti per intero.\n',
  );
}

function main() {
  const opt = argomenti(process.argv.slice(2));
  if (!opt.cartella) {
    console.error('Uso: node scripts/importa-liste/index.js <cartella-liste> [--out <dir>] [--clienti <backup.json>] [--dividi <n>] [--titolo-da-file] [--solo-report]');
    process.exit(1);
  }
  const radice = resolve(opt.cartella);
  if (!statSync(radice).isDirectory()) {
    console.error(`Non è una cartella: ${radice}`);
    process.exit(1);
  }

  let clientiEsistenti = new Map();
  if (opt.clienti) {
    const { mappa, ambigui } = caricaClientiEsistenti(resolve(opt.clienti));
    clientiEsistenti = mappa;
    console.log(`Anagrafica esistente: ${mappa.size} clienti caricati da ${opt.clienti}`);
    if (ambigui.length) {
      console.log(`  ! ${ambigui.length} nomi duplicati in anagrafica (usato il primo id): ${[...new Set(ambigui)].slice(0, 5).join(', ')}${ambigui.length > 5 ? '…' : ''}`);
    }
  } else {
    console.log('! Nessun --clienti indicato: ogni intestatario verrà creato come cliente nuovo.');
    console.log('  Se in app esistono già delle anagrafiche, scarica prima il backup e ripassalo con --clienti.');
  }

  const file = elencaFile(radice);
  console.log(`Trovati ${file.length} file in ${radice}`);

  const analisi = [];
  const illeggibili = [];
  for (const p of file) {
    const percorso = relative(radice, p);
    const { testo, errore } = estraiTesto(p, readFileSync(p));
    if (errore) {
      illeggibili.push({ percorso, errore });
      continue;
    }
    analisi.push({ percorso, nomeFile: basename(p), ...analizzaLista(basename(p), testo) });
  }

  mkdirSync(resolve(opt.out), { recursive: true });
  const out = resolve(opt.out);
  scriviReport(out, analisi, illeggibili);

  const nMovimenti = analisi.reduce((s, a) => s + a.movimenti.length, 0);
  const conAvvisi = analisi.filter((a) => a.avvisi.length).length;
  const nNonImportate = analisi.reduce((s, a) => s + a.righeNonRiconosciute.length, 0);
  const totale = analisi.reduce((s, a) => s + a.saldo, 0);

  if (!opt.soloReport) {
    // I blocchi condividono la stessa anagrafica: i clienti nuovi vengono
    // calcolati una volta sola sull'intero insieme e poi distribuiti, così un
    // cliente con liste in due blocchi diversi non viene creato due volte.
    const completo = costruisciBackup(analisi, clientiEsistenti, { titoloDaFile: opt.titoloDaFile });
    const dim = opt.dividi > 0 ? opt.dividi : completo.liste.length || 1;
    const blocchi = [];
    for (let i = 0; i < completo.liste.length; i += dim) {
      const liste = completo.liste.slice(i, i + dim);
      const ids = new Set(liste.map((l) => l.id));
      const clientiUsati = new Set(liste.map((l) => l.client_id));
      blocchi.push({
        app: completo.app,
        versione: completo.versione,
        esportato_il: completo.esportato_il,
        origine: completo.origine,
        clients: completo.clients.filter((c) => clientiUsati.has(c.id)),
        liste,
        movimenti: completo.movimenti.filter((m) => ids.has(m.lista_id)),
      });
    }
    blocchi.forEach((b, i) => {
      const nome = blocchi.length === 1 ? 'liste-da-importare.json' : `liste-da-importare-${String(i + 1).padStart(2, '0')}.json`;
      writeFileSync(join(out, nome), JSON.stringify(b, null, 2));
      console.log(`  → ${nome}: ${b.liste.length} liste, ${b.movimenti.length} movimenti, ${b.clients.length} clienti nuovi`);
    });
    console.log(`Clienti: ${completo._riepilogo.clienti_nuovi} nuovi, ${completo._riepilogo.clienti_riusati} riusati dall'anagrafica esistente`);
  }

  console.log('');
  console.log(`Liste analizzate      : ${analisi.length}`);
  console.log(`Movimenti riconosciuti: ${nMovimenti}`);
  console.log(`Saldo complessivo     : ${totale.toFixed(2)} €`);
  console.log(`File non leggibili    : ${illeggibili.length}`);
  console.log(`Righe non importate   : ${nNonImportate} (ricopiate nelle note interne delle liste)`);
  console.log(`Liste con avvisi      : ${conAvvisi} — vedi ${join(opt.out, 'report.csv')}`);
}

main();
