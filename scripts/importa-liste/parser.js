// scripts/importa-liste/parser.js
// Da testo libero di una lista viaggio storica a righe pronte per
// `movimenti_lista`. Funzioni pure, senza I/O: la CLI (index.js) le usa sui
// file, i test (src/test/importaListe.test.js) sulle stringhe.
//
// Principio di fondo: MEGLIO SEGNALARE CHE INDOVINARE. Una riga che non
// corrisponde a un formato riconosciuto non viene interpretata a naso: finisce
// in `righeNonRiconosciute`, viene riportata nel report e ricopiata nelle note
// interne della lista, così l'informazione resta visibile in app anche se non
// è diventata un movimento.
import { createHash } from 'node:crypto';
import { chiaveCliente } from '../../src/lib/chiaveCliente.js';
import { aNumero } from '../../src/lib/importi.js';

// ─── UUID v5 deterministici ────────────────────────────────────────────────
// Gli id non sono casuali: derivano dal percorso del file (per liste e
// movimenti) e dal nome normalizzato (per i clienti). Conseguenza pratica:
// rigenerare il JSON dopo aver corretto due file e ricaricarlo NON duplica
// nulla, perché `importa_backup` fa ON CONFLICT (id) DO NOTHING — reimporta
// solo ciò che manca davvero.
export const NAMESPACE_IMPORT = '6f1d6b3e-9a1f-5e2c-8b47-1f5c0d2a7e10';

export function uuidv5(nome, namespace = NAMESPACE_IMPORT) {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const h = createHash('sha1').update(ns).update(Buffer.from(nome, 'utf8')).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // versione 5
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const x = b.toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ─── normalizzazione ───────────────────────────────────────────────────────
// I documenti Word/Writer sono pieni di spazi unificatori e di trattini
// tipografici: senza questa normalizzazione "–" (en dash) non verrebbe letto
// come segno meno e un'uscita entrerebbe come entrata.
export const normalizza = (riga) => String(riga ?? '')
  .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
  .replace(/[\u2010-\u2015\u2212]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

// ─── righe che NON sono movimenti ──────────────────────────────────────────
// `SALDO`, `TOTALE`, `RESIDUO`... hanno un importo ma sono totali già scritti
// a mano nel documento: importarli come movimenti raddoppierebbe il saldo.
// Sono la trappola principale di questo import, per questo stanno in cima.
// L'elenco è volutamente stretto e ancorato a inizio riga: parole come
// "VERSATO" o "SPESO" da sole non bastano, perché compaiono anche in
// descrizioni legittime ("VERSATO DA MARIA ROSSI").
const RE_TOTALI = /^(SALDO|TOTALE|TOT\.|RESIDUO|RIMANENZA|RIMANENTE|AVANZO|DIFFERENZA|PARZIALE|RIEPILOGO|DA VERSARE|DA PAGARE|DA SALDARE)\b/i;
const RE_ESAURITA = /^\W*(?:LISTA|BUONO)?\s*(?:ESAURIT[AO]|CHIUS[AO])\b/i;
const RE_INTESTAZIONE = /^(LISTA|LISTE|BUONO|BUONI|CLIENTE|SIG\.?R?A?\b|SPETT\.?|FAMIGLIA|FAM\.)\b/i;
const RE_DECORAZIONE = /^[-_=*.·•\s]+$/;

// ─── data ──────────────────────────────────────────────────────────────────
const RE_DATA = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})\b/;

export function estraiData(testo) {
  const m = RE_DATA.exec(testo);
  if (!m) return null;
  const g = Number(m[1]);
  const mm = Number(m[2]);
  let a = Number(m[3]);
  // Anno a due cifre: sempre 20xx. Queste liste sono documenti recenti, un
  // "24" è il 2024, mai il 1924.
  if (a < 100) a += 2000;
  if (mm < 1 || mm > 12 || g < 1 || g > 31 || a < 1990 || a > 2100) return null;
  const d = new Date(Date.UTC(a, mm - 1, g));
  if (d.getUTCDate() !== g || d.getUTCMonth() !== mm - 1) return null; // es. 31/02
  const p = (n) => String(n).padStart(2, '0');
  return { iso: `${a}-${p(mm)}-${p(g)}`, resto: testo.slice(m[0].length).trim() };
}

// ─── importo ───────────────────────────────────────────────────────────────
// "1.250,00" → 1250 ; "1250,5" → 1250.5 ; "1.25" → 1.25 ; "1.250" → 1250.
//
// La regola viveva QUI ed era giusta; la copia che il form dell'operatore
// usava — `parseImporto` in `components/liste/listeFormato.js` — era sbagliata
// e leggeva 1,25 al posto di 1.250,00 (C-1 e M-1 dell'audit di codebase del
// 31 agosto). Ora l'implementazione è una sola, in `src/lib/importi.js`, e
// questo script la importa come già importa `chiaveCliente` dalla stessa
// cartella. Il ragionamento sul punto sta là.
export { aNumero };

const RE_CIFRE = '\\d[\\d. ]*(?:,\\d{1,2})?';
const RE_PAROLA_VALUTA = /\b(?:EURO|EUR)\b\.?/gi;

// Tolto l'importo dal mezzo della riga resta un doppio spazio: va richiuso,
// altrimenti finisce nella descrizione salvata a database.
const ripulisciSpazi = (s) => s.replace(/\s+/g, ' ').trim();

const normalizzaValuta = (testo) => testo.replace(RE_PAROLA_VALUTA, '€');

// Quanti simboli di valuta compaiono nella riga (EURO/EUR contano come €).
// Serve a scoprire le righe con PIÙ movimenti scritti di fila sulla stessa
// riga ("TIZIO € 200,00 CAIO € 150,00"): `estraiImporto` prende solo
// l'ultimo importo e lascerebbe il resto — testo E importo — incollato nella
// descrizione, perdendo un movimento senza dirlo. Va intercettato PRIMA di
// chiamare estraiImporto, non dopo.
export const contaSimboliValuta = (testo) => (normalizzaValuta(testo).match(/€/g) || []).length;

/**
 * Cerca l'importo nella riga (senza la data iniziale).
 * @returns {{ valore:number, testoRipulito:string, conSimbolo:boolean }|null}
 * `testoRipulito` è la riga privata dell'importo: da lì si ricava la
 * descrizione.
 */
export function estraiImporto(testo) {
  const t = normalizzaValuta(testo);
  const idx = t.lastIndexOf('€');

  if (idx >= 0) {
    const prima = t.slice(0, idx);
    const dopo = t.slice(idx + 1);
    // Il segno può stare prima del simbolo ("- € 400,00") o dopo ("€ -400,00").
    const negPrima = /-\s*$/.test(prima);

    const mDopo = new RegExp(`^\\s*(-?)\\s*(${RE_CIFRE})`).exec(dopo);
    if (mDopo) {
      const n = aNumero(mDopo[2]);
      if (n !== null) {
        const segno = negPrima || mDopo[1] === '-' ? -1 : 1;
        const testoRipulito = ripulisciSpazi(`${prima.replace(/-\s*$/, '')} ${dopo.slice(mDopo[0].length)}`);
        return { valore: segno * Math.abs(n), testoRipulito, conSimbolo: true };
      }
    }

    // Formato "400,00 €": le cifre precedono il simbolo.
    const mPrima = new RegExp(`(-?)\\s*(${RE_CIFRE})\\s*$`).exec(prima);
    if (mPrima) {
      const n = aNumero(mPrima[2]);
      if (n !== null) {
        const segno = mPrima[1] === '-' ? -1 : 1;
        const testoRipulito = ripulisciSpazi(`${prima.slice(0, mPrima.index)} ${dopo}`);
        return { valore: segno * Math.abs(n), testoRipulito, conSimbolo: true };
      }
    }
  }

  // Nessun simbolo di valuta: si accetta solo un numero con i centesimi a fine
  // riga ("MARIO ROSSI 200,00"). Chi lo usa viene segnalato nel report, perché
  // qui il rischio di scambiare un importo con un altro numero è reale.
  const mCoda = new RegExp(`(^|\\s)(-?)\\s*(\\d{1,3}(?:[. ]\\d{3})*,\\d{2}|\\d+,\\d{2})\\s*$`).exec(testo);
  if (mCoda) {
    const n = aNumero(mCoda[3]);
    if (n !== null) {
      return {
        valore: (mCoda[2] === '-' ? -1 : 1) * Math.abs(n),
        testoRipulito: testo.slice(0, mCoda.index),
        conSimbolo: false,
      };
    }
  }

  return null;
}

// ─── metodo di pagamento ───────────────────────────────────────────────────
// I valori ammessi da `movimenti_lista.metodo` sono cinque: pos, bonifico,
// contanti, assegno, altro. Qui si mappano le diciture usate a mano.
const METODI = [
  { re: /\bBONIFIC[OI]\b|\bBB\b|\bIBAN\b/i, valore: 'bonifico' },
  { re: /\bPOS\b|\bBANCOMAT\b|\bCARTA\b|\bPAGOBANCOMAT\b/i, valore: 'pos' },
  { re: /\bCONTANT[EI]\b|\bCASH\b|\bCONTANTI\b/i, valore: 'contanti' },
  { re: /\bASSEGN[OI]\b/i, valore: 'assegno' },
];

// Il token si toglie dalla descrizione solo se è l'ultima parola: "CARRIERO
// MICHELE POS" diventa "CARRIERO MICHELE", mentre "BONIFICO IN BNL DA MARIO
// ROSSI" resta intero perché lì "BONIFICO" è parte della descrizione.
const RE_METODO_IN_CODA = /\s+(POS|BANCOMAT|PAGOBANCOMAT|CONTANTI|CONTANTE|ASSEGNO|BONIFICO|CASH)\s*$/i;

export function estraiMetodo(testo) {
  const trovato = METODI.find((m) => m.re.test(testo));
  const descrizione = testo.replace(RE_METODO_IN_CODA, '').trim();
  return { metodo: trovato ? trovato.valore : null, descrizione };
}

// ─── nome cliente dal nome del file ────────────────────────────────────────
// Il contenuto dei documenti non riporta l'intestatario: sta nel nome del
// file (LISTA_ANGELO_BELMONTE.odt → ANGELO BELMONTE). I prefissi di servizio
// e i suffissi di versione ("copia", "2", "rev") vengono tolti.
export function clienteDaNomeFile(nomeFile) {
  let s = nomeFile.replace(/\.[a-z0-9]+$/i, '');
  s = s.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:LISTA|LISTE|BUONO|BUONI)\s+(?:VIAGGIO\s+)?(?:DI\s+|DEL\s+|DELLA\s+)?/i, '');
  s = s.replace(/\s+(?:COPIA|REV|VERS?|BIS|AGG(?:IORNATA)?)\.?\s*\d*$/i, '');
  s = s.replace(/\s*\(\s*\d+\s*\)\s*$/, '');
  // Anno o progressivo in coda ("ROSSI MARIO 2025", "ROSSI MARIO 2"): è la
  // versione della lista, non parte del nome. Le liste restano distinte lo
  // stesso, perché a quel punto prendono il nome del file come titolo.
  s = s.replace(/\s+(?:19|20)\d{2}$/, '');
  s = s.replace(/\s+\d{1,2}$/, '');
  return s.trim().toUpperCase() || nomeFile.replace(/\.[a-z0-9]+$/i, '').toUpperCase();
}

// Chiave di deduplica: "ROSSI  MARIO" e "Rossi, Mario" sono lo stesso cliente.
//
// M-4 dell'audit del 25 agosto: era scritta QUI, ed era una delle quattro
// implementazioni della stessa domanda. Contava, perché questo script fa
// combaciare i clienti dei documenti con quelli del backup dell'app: con due
// definizioni diverse ai due lati, "FAM. SCURO TEODORO" era lo stesso cliente
// per lo script e due clienti diversi per l'app, e l'import riusava un id che
// l'app non avrebbe mai collegato. Ora è la stessa funzione — quella
// dell'app — e la ri-esportiamo perché `costruisciBackup` e index.js la
// nominano da sempre così.
//
// L'import da `src/` non è un'eccezione per questo script: `misura-render`
// importa già `calendarLayout.js` per la stessa ragione — misurare o
// convertire i dati dell'app con la logica dell'app, non con una copia.
export { chiaveCliente };

// ─── analisi di un singolo file ────────────────────────────────────────────
/**
 * @param {string} nomeFile  nome del file (serve per il cliente)
 * @param {string} testo     testo estratto dal documento
 */
export function analizzaLista(nomeFile, testo) {
  const cliente = clienteDaNomeFile(nomeFile);
  const movimenti = [];
  const righeNonRiconosciute = [];
  const righeIgnorate = [];
  const avvisi = [];
  let esaurita = false;
  let ultimaData = null;

  const righe = String(testo ?? '').split('\n');

  righe.forEach((grezza, i) => {
    const n = i + 1;
    const riga = normalizza(grezza);
    if (!riga || RE_DECORAZIONE.test(riga)) return;

    const conData = estraiData(riga);
    const resto = conData ? conData.resto : riga;
    const nSimboli = contaSimboliValuta(resto);
    // Con 2+ simboli di valuta sulla riga c'è più di un importo: estraiImporto
    // prenderebbe solo l'ultimo, lasciando il primo (testo E cifre) incollato
    // nella descrizione — un movimento perso senza nessun avviso. Meglio non
    // provarci nemmeno: null forza la riga sui rami "non riconosciuta" più in
    // basso, che segnalano invece di indovinare.
    const imp = nSimboli <= 1 ? estraiImporto(resto) : null;

    // L'ordine dei controlli conta. Marcatori e intestazioni si riconoscono
    // solo su righe SENZA data e SENZA importo: una riga datata con un
    // importo è un movimento anche se comincia con una parola che altrove è
    // un marcatore, e non deve mai finire scartata per un falso positivo.
    if (!conData && (!imp || imp.valore === 0)) {
      if (RE_ESAURITA.test(riga)) {
        esaurita = true;
        righeIgnorate.push({ n, riga, motivo: 'marcatore lista esaurita' });
        return;
      }
      if (RE_INTESTAZIONE.test(riga)) {
        righeIgnorate.push({ n, riga, motivo: 'intestazione' });
        return;
      }
    }

    // Totali scritti a mano nel documento: si ignorano, il saldo lo ricalcola
    // l'app sommando i movimenti. Se la riga ignorata portava un importo lo si
    // segnala, così chi rilegge il report può accertarsi che fosse un totale
    // e non un movimento. Il controllo riconosce la riga dalla parola iniziale
    // (RE_TOTALI), non da `imp`: resta valido anche per un doppio totale tipo
    // "PARZIALE € 50,00 TOTALE € 100,00", che ha due simboli ma è comunque un
    // riepilogo da ignorare, non due movimenti.
    if (!conData && RE_TOTALI.test(riga)) {
      righeIgnorate.push({ n, riga, motivo: 'totale/saldo riepilogativo' });
      if (nSimboli >= 1) avvisi.push(`riga ${n} ignorata come totale/riepilogo: "${riga}"`);
      return;
    }

    if (nSimboli >= 2) {
      righeNonRiconosciute.push({
        n, riga,
        motivo: `${nSimboli} importi sulla stessa riga: probabili più movimenti scritti insieme, da separare a mano`,
      });
      return;
    }

    if (!imp) {
      righeNonRiconosciute.push({ n, riga, motivo: 'importo non trovato' });
      return;
    }

    let data = conData?.iso ?? null;
    const avvisiRiga = [];
    if (!data) {
      if (!ultimaData) {
        righeNonRiconosciute.push({ n, riga, motivo: 'data non trovata (e nessuna data precedente da ereditare)' });
        return;
      }
      data = ultimaData;
      avvisiRiga.push(`riga ${n}: data assente, ereditata dal movimento precedente (${data})`);
    }

    const { metodo, descrizione } = estraiMetodo(imp.testoRipulito);
    const desc = descrizione.replace(/^[\s\-:;,.]+|[\s\-:;,.]+$/g, '').replace(/\s+/g, ' ').toUpperCase();

    if (!desc) {
      righeNonRiconosciute.push({ n, riga, motivo: 'descrizione vuota dopo l\'estrazione di data e importo' });
      return;
    }
    if (imp.valore === 0) {
      righeNonRiconosciute.push({ n, riga, motivo: 'importo pari a zero (non ammesso dal modulo liste)' });
      return;
    }
    if (!imp.conSimbolo) {
      avvisiRiga.push(`riga ${n}: importo senza simbolo € (${imp.valore}), da verificare`);
    }

    ultimaData = data;
    movimenti.push({ n, data, descrizione: desc, importo: Number(imp.valore.toFixed(2)), metodo });
    avvisi.push(...avvisiRiga);
  });

  const saldo = Number(movimenti.reduce((s, m) => s + m.importo, 0).toFixed(2));

  // Controlli di coerenza. Nessuno blocca l'import: servono a produrre la
  // lista corta di file da guardare a occhio dopo il caricamento.
  if (!movimenti.length) avvisi.push('nessun movimento riconosciuto nel file');
  if (esaurita && Math.abs(saldo) > 0.004) {
    avvisi.push(`lista marcata ESAURITA ma il saldo calcolato è ${saldo.toFixed(2)} € (segni da verificare)`);
  }
  if (saldo < -0.004) {
    avvisi.push(`saldo negativo (${saldo.toFixed(2)} €): probabile uscita registrata senza il segno meno o entrata mancante`);
  }
  if (movimenti.length && movimenti.every((m) => m.importo > 0) && movimenti.length > 1) {
    avvisi.push('tutti i movimenti sono positivi: se il documento conteneva delle uscite, il segno meno non è stato riconosciuto');
  }
  if (righeNonRiconosciute.length) {
    avvisi.push(`${righeNonRiconosciute.length} riga/e non riconosciuta/e (ricopiate nelle note interne della lista)`);
  }

  return { cliente, esaurita, saldo, movimenti, righeNonRiconosciute, righeIgnorate, avvisi };
}

// ─── costruzione del backup JSON ───────────────────────────────────────────
const NOTA_MAX = 4000;

// Le righe che il parser non ha saputo leggere finiscono nelle note interne
// della lista: sono visibili solo al team (il riepilogo cliente non le legge)
// e garantiscono che nessuna informazione presente nei documenti vada persa.
function componiNote(nomeFile, righeNonRiconosciute) {
  const testa = `Importato da: ${nomeFile}`;
  if (!righeNonRiconosciute.length) return testa;
  const corpo = righeNonRiconosciute.map((r) => `  riga ${r.n}: ${r.riga}`).join('\n');
  const nota = `${testa}\n\nRIGHE NON IMPORTATE AUTOMATICAMENTE (da inserire o correggere a mano):\n${corpo}`;
  return nota.length > NOTA_MAX ? `${nota.slice(0, NOTA_MAX - 3)}...` : nota;
}

/**
 * Trasforma i risultati di `analizzaLista` nel payload accettato da
 * "Strumenti dati → Carica backup" (RPC `importa_backup`).
 *
 * @param {Array} analisi         [{ percorso, nomeFile, ...risultato }]
 * @param {Map}   clientiEsistenti Map(chiaveCliente → id) dal backup dell'app:
 *   se il cliente c'è già si riusa il suo id, così l'import non crea doppioni
 *   in anagrafica.
 * @param {{ titoloDaFile?: boolean }} opzioni
 */
export function costruisciBackup(analisi, clientiEsistenti = new Map(), opzioni = {}) {
  const clientiNuovi = new Map(); // chiave → { id, name }
  const liste = [];
  const movimenti = [];
  const riusati = new Set();

  // Un cliente con più file avrà più liste: senza titolo sarebbero
  // indistinguibili nell'elenco, quindi in quel caso il titolo diventa il
  // nome del file di origine.
  const conteggio = new Map();
  analisi.forEach((a) => conteggio.set(chiaveCliente(a.cliente), (conteggio.get(chiaveCliente(a.cliente)) || 0) + 1));

  for (const a of analisi) {
    const chiave = chiaveCliente(a.cliente);
    let clientId = clientiEsistenti.get(chiave);
    if (clientId) {
      riusati.add(chiave);
    } else if (clientiNuovi.has(chiave)) {
      clientId = clientiNuovi.get(chiave).id;
    } else {
      clientId = uuidv5(`cliente:${chiave}`);
      clientiNuovi.set(chiave, { id: clientId, name: a.cliente });
    }

    const date = a.movimenti.map((m) => m.data).sort();
    const primo = date[0] ? `${date[0]}T09:00:00.000Z` : new Date().toISOString();
    const ultimo = date[date.length - 1] ? `${date[date.length - 1]}T09:00:00.000Z` : primo;
    const listaId = uuidv5(`lista:${a.percorso}`);
    const piuListe = (conteggio.get(chiave) || 0) > 1;

    liste.push({
      id: listaId,
      client_id: clientId,
      titolo: (opzioni.titoloDaFile || piuListe) ? a.nomeFile.replace(/\.[a-z0-9]+$/i, '') : null,
      stato: a.esaurita ? 'esaurita' : 'attiva',
      note: componiNote(a.nomeFile, a.righeNonRiconosciute),
      created_at: primo,
      updated_at: ultimo,
      closed_at: a.esaurita ? ultimo : null,
      deleted_at: null,
    });

    a.movimenti.forEach((m, i) => {
      movimenti.push({
        id: uuidv5(`movimento:${a.percorso}#${i}`),
        lista_id: listaId,
        data_movimento: m.data,
        descrizione: m.descrizione,
        importo: m.importo,
        metodo: m.metodo,
        created_at: `${m.data}T09:00:00.000Z`,
        updated_at: `${m.data}T09:00:00.000Z`,
        deleted_at: null,
      });
    });
  }

  return {
    // `app` e `liste` sono i due campi che la UI controlla prima di accettare
    // il file (vedi onBackupFile in ListeViaggio.jsx).
    app: 'liste-viaggio',
    versione: 1,
    esportato_il: new Date().toISOString(),
    origine: 'import-liste-storiche',
    clients: [...clientiNuovi.values()].map((c) => ({ id: c.id, name: c.name })),
    liste,
    movimenti,
    _riepilogo: {
      clienti_nuovi: clientiNuovi.size,
      clienti_riusati: riusati.size,
      liste: liste.length,
      movimenti: movimenti.length,
    },
  };
}
