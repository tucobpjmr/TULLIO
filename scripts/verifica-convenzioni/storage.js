// scripts/verifica-convenzioni/storage.js
// Il gate «utente attivo» su Storage non deve tornare a essere un elenco di
// bucket.
//
// ─── PERCHÉ ESISTE ──────────────────────────────────────────────────────────
// `storage_active_only` è la policy RESTRICTIVE che vale su TUTTO
// `storage.objects`. Per un anno è stata scritta come lista di ESCLUSIONI:
//
//   using ( bucket_id not in ('task-files','chat-files','avatars') or … )
//
// forma in cui un bucket non nominato risulta FUORI dal gate. M-1 dell'audit
// sicurezza del 26 agosto (20260827075128) ha dichiarato di aver invertito
// quella forma — «un quarto bucket creato domani nasce sotto il gate» — e ha
// invece aggiunto una voce all'elenco, lasciando la forma identica. La prova
// che la promessa non reggeva è arrivata tre settimane dopo: aggiungendo il
// bucket `documenti-identita` si è dovuto nominarlo a mano, cosa che con la
// forma promessa non sarebbe servita.
//
// Il difetto non era l'elenco corto: era che NESSUNO misurava la forma.
// Questo controllo la misura. È lo stesso ruolo che `coloriInDuro` ha per i
// token del tema — una regola scritta in un commento è una speranza, la
// stessa regola con un numero accanto è un controllo.
//
// ⛔ NON vieta ogni menzione di `bucket_id`. Un elenco di ECCEZIONI
// affermativo — `bucket_id in ('un-bucket-davvero-pubblico') or …` — è la
// forma legittima con cui si esenta un bucket, e deve restare scrivibile:
// allunga l'elenco solo per una decisione esplicita, che è esattamente il
// comportamento voluto. Ciò che viene rifiutato è il test NEGATO, cioè «tutti
// i bucket tranne questi sono esenti», che è il bug.

import { readFile, readdir } from 'node:fs/promises';

const DIR = 'supabase/migrations';
const NOME_POLICY = 'storage_active_only';

// Le forme con cui si scrive «bucket_id non è fra questi», che è il test da
// cui nasce il difetto. `<> all(array[…])` e `not in (…)` sono le due usate
// nella storia di questo progetto; le altre due sono i modi equivalenti di
// scrivere la stessa cosa, inclusi perché il punto è chiudere la CATEGORIA e
// non i due casi già visti.
const NEGAZIONI = [
  /\bbucket_id\s+not\s+in\b/i,
  /\bbucket_id\s*<>\s*all\b/i,
  /\bbucket_id\s*!=\s*all\b/i,
  /\bnot\s*\(\s*bucket_id\s+in\b/i,
];

/** Toglie i commenti `--` di riga: il preambolo di una migrazione CITA il
 *  difetto per spiegarlo, e citarlo non è commetterlo. */
const senzaCommenti = (sql) => sql.replace(/--[^\n]*/g, '');

/** La versione a 14 cifre in testa al nome del file, per ordinare. */
const versione = (nomeFile) => (nomeFile.match(/^(\d+)_/)?.[1] ?? '');

/**
 * Il corpo dell'ULTIMA definizione della policy dentro un file: dal
 * `create policy "<nome>"` al `;` che la chiude. Un file può contenerne più
 * d'una (drop + create, o due revisioni), e conta l'ultima.
 *
 * @param {string} sql
 * @param {string} nome
 * @returns {string|null} il corpo, o null se il file non la definisce
 */
export function corpoPolicy(sql, nome = NOME_POLICY) {
  const testo = senzaCommenti(sql);
  const apertura = new RegExp(`create\\s+policy\\s+"?${nome}"?`, 'gi');
  let ultimo = null;
  for (const m of testo.matchAll(apertura)) {
    const da = m.index;
    const fine = testo.indexOf(';', da);
    ultimo = fine === -1 ? testo.slice(da) : testo.slice(da, fine + 1);
  }
  return ultimo;
}

/**
 * Verifica la forma del gate come risulta dalle migrazioni del repo.
 *
 * Legge TUTTE le migrazioni e tiene la definizione con la versione più alta:
 * le precedenti sono storia, e contengono di proposito la forma vecchia —
 * riscriverle sarebbe riscrivere il passato, che su questo progetto non si fa
 * (vedi docs/MIGRAZIONI_SUPABASE.md).
 *
 * @param {string} [dir]
 * @returns {Promise<{ file: string|null, negazioni: string[] }>}
 *   `file: null` significa che la policy non è definita da NESSUNA migrazione:
 *   è inconcludenza, non un via libera, e il chiamante la tratta come una
 *   divergenza — un controllo che ha smesso di trovare il proprio oggetto non
 *   deve passare in silenzio.
 */
export async function gateStorageSenzaElenco(dir = DIR) {
  const file = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let ultimo = null;
  // In ordine di versione crescente: l'ultimo che la definisce vince.
  for (const nome of file.sort((a, b) => versione(a).localeCompare(versione(b)))) {
    const corpo = corpoPolicy(await readFile(`${dir}/${nome}`, 'utf8'));
    if (corpo) ultimo = { file: nome, corpo };
  }
  if (!ultimo) return { file: null, negazioni: [] };

  const negazioni = NEGAZIONI
    .filter((r) => r.test(ultimo.corpo))
    .map((r) => String(r));
  return { file: ultimo.file, negazioni };
}
