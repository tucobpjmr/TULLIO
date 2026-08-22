#!/usr/bin/env node
// scripts/verifica-volumi/index.js
//
// Fa fallire la CI quando una decisione di scalabilità presa «finché la
// tabella è piccola» smette di valere.
//
//   npm run verifica:volumi
//
// PERCHÉ ESISTE (M-2 dell'audit del 23 agosto). Le soglie di questo progetto
// sono dichiarate, motivate e corrette — e vivono in documenti. La più
// esplicita è ST-4 passo 2: `Messages.listForConversation` è scritta, testata
// dal contratto di paginazione, e porta il commento «non chiamata da nessuna
// parte, DI PROPOSITO […] quando `messages` supererà la soglia scritta lì
// (~1500) — oggi 13». Quel «quando» non ha un soggetto: nessuno lo misura.
//
// È la stessa famiglia di A-2 (il test di RLS che non girava) e del residuo di
// A-3 (i controlli che non escalano): presidi giusti, non collegati. La
// differenza è dove sta la condizione — non nel repository ma nei dati, ed è
// per questo che nessuno degli altri script poteva vederla: `verifica:convenzioni`
// misura questo repo, `verifica:rpc` e `verifica:migrazioni` misurano
// l'esistenza di funzioni e migrazioni.
//
// ── COME LEGGE, E PERCHÉ NON DALLA CHIAVE ANON ──────────────────────────────
// Dalla Management API (`/v1/projects/<ref>/database/query`), con lo STESSO
// `SUPABASE_ACCESS_TOKEN` che `verifica-advisor` usa già: nessun segreto nuovo
// da creare. L'alternativa era una RPC `get_volumi()` concessa ad `anon` sul
// modello di `get_migrazioni_applicate()`, ed è stata scartata: quella espone
// nomi di file già pubblici nel repository, questa esporrebbe quante pratiche,
// quanti clienti e quanti movimenti contabili ha l'agenzia — a chiunque, senza
// autenticarsi. Un controllo interno non deve allargare la superficie pubblica
// per potersi eseguire.
//
// Le query sono `count(*)` su tabelle nominate in un elenco chiuso (SOGLIE):
// nessun input esterno raggiunge l'SQL, e non si legge una sola riga di dati.
//
// Uscite: 0 tutto sotto soglia (o inconcludente), 1 almeno una superata,
// 2 errore imprevisto.
import { appendFileSync } from 'node:fs';
import { SOGLIE, valutaVolumi } from './volumi.js';

const PROJECT_REF_DEFAULT = 'vmxvnxsqfisucugcpqlc';

/** Annotazione GitHub + riga nel riepilogo del job, quando ci sono. */
function annota(livello, titolo, testo) {
  console.log(`::${livello} title=${titolo}::${testo}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const icona = livello === 'error' ? '❌' : '⚠️';
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${icona} ${titolo}\n\n${testo}\n\n`);
  }
}

async function leggiConteggi(ref, token, tabelle) {
  // `union all` in una richiesta sola: quattro round-trip per quattro numeri
  // sarebbero quattro occasioni di fallire a metà, con un esito parziale che
  // valutaVolumi dovrebbe poi distinguere da uno completo.
  const query = tabelle
    .map((t) => `select '${t}' as tabella, count(*)::bigint as righe from public.${t}`)
    .join('\nunion all\n');

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) {
    throw new Error(`database/query ha risposto HTTP ${r.status}: ${await r.text().catch(() => '')}`);
  }
  const righe = await r.json();
  return Object.fromEntries((righe || []).map((x) => [x.tabella, Number(x.righe)]));
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || PROJECT_REF_DEFAULT;

  if (!token) {
    console.log('⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo volumi saltato.');
    console.log('   È lo stesso token di verifica:advisor — vedi il commento in cima a quel file.');
    annota('warning', 'Volumi non verificati',
      'SUPABASE_ACCESS_TOKEN assente: le soglie di scalabilità non sono state controllate. ' +
      'Due esecuzioni inconcludenti di fila vanno trattate come un guasto del controllo.');
    process.exit(0);
  }

  console.log(`verifica:volumi — soglie di scalabilità su ${ref}\n`);

  const conteggi = await leggiConteggi(ref, token, SOGLIE.map((s) => s.tabella));
  const { superate, ok, mancanti, fallisce } = valutaVolumi(conteggi);

  for (const v of ok) {
    console.log(`  ✓ ${v.tabella.padEnd(16)} ${String(v.righe).padStart(7)} / ${v.max}  (${v.percentuale}%)`);
  }
  for (const v of superate) {
    console.log(`  ✗ ${v.tabella.padEnd(16)} ${String(v.righe).padStart(7)} / ${v.max}  SOGLIA SUPERATA`);
    console.log(`      perché:  ${v.perche}`);
    console.log(`      rimedio: ${v.rimedio}`);
  }

  if (mancanti.length) {
    // Una tabella attesa e non misurata non è «zero»: è una misura mancata.
    console.log(`\n⚠ non misurate: ${mancanti.join(', ')}`);
    annota('warning', 'Volumi misurati solo in parte',
      `Nessun conteggio per: ${mancanti.join(', ')}. Il controllo non è concludente su quelle tabelle.`);
  }

  console.log(`\n${superate.length} soglie superate, ${ok.length} sotto soglia` +
    (mancanti.length ? `, ${mancanti.length} non misurate.` : '.'));

  if (fallisce) {
    // ⚠️ Rosso NON significa «qualcosa è rotto»: significa che una decisione
    // dichiarata quando la tabella era piccola è arrivata al punto in cui era
    // previsto rivederla. Il rimedio è nell'elenco, accanto al numero.
    annota('error', 'Una soglia di scalabilità è stata superata',
      superate.map((v) => `**${v.tabella}**: ${v.righe} righe (soglia ${v.max}). ${v.rimedio}`).join('\n\n'));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica volumi: ${e.stack || e.message}`);
  process.exit(2);
});
