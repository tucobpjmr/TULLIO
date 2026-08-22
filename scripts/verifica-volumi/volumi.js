// scripts/verifica-volumi/volumi.js
//
// La metà PURA di verifica:volumi — le soglie e il verdetto, senza rete.
// Separata come `redirect.js` e `advisor.js` per la stessa ragione: la parte
// che decide dev'essere testabile senza credenziali e senza produzione.

/**
 * Le soglie di scalabilità di questo progetto, quelle che finora vivevano
 * come frasi dentro documenti d'audit.
 *
 * PERCHÉ ESISTE (M-2, audit del 23 agosto). Il progetto prende decisioni di
 * scalabilità DICHIARATE e corrette — «`Messages.listAll()` va bene finché
 * `messages` non supera ~1500, poi si passa a `listForConversation`» (ST-4,
 * passo 2) — e le scrive dove nessuno le rilegge. `listForConversation`
 * esiste, è scritta, è commentata «non chiamata da nessuna parte, DI
 * PROPOSITO», e ciò che dovrebbe collegarla è che qualcuno si ricordi di un
 * documento del 10 agosto.
 *
 * È la stessa forma di A-2 e del residuo di A-3: un presidio che esiste, è
 * giusto, e non è collegato a niente che lo esegua. Qui la differenza è che la
 * condizione non vive nel repository — è un numero di righe in produzione — e
 * nessuno dei sei script esistenti guarda i dati: `verifica:convenzioni` misura
 * QUESTO repository, `verifica:rpc` e `verifica:migrazioni` misurano
 * l'ESISTENZA di funzioni e migrazioni, non i volumi.
 *
 * ⛔ Una soglia qui NON è «la tabella è troppo grande»: è «la decisione presa
 * quando era piccola va rivista». Il rimedio va scritto insieme al numero,
 * perché fra sei mesi chi legge l'errore non avrà letto l'audit che lo ha
 * generato — ed è esattamente il modo in cui la soglia di ST-4 è arrivata
 * fin qui senza che nessuno la controllasse.
 *
 * @typedef {object} Soglia
 * @property {string} tabella
 * @property {number} max      oltre questo valore il controllo fallisce
 * @property {string} perche   che cosa cambia quando la soglia è superata
 * @property {string} rimedio  che cosa fare, con il file e il riferimento
 */

/** @type {Soglia[]} */
export const SOGLIE = [
  {
    tabella: 'messages',
    max: 1500,
    perche:
      'Messages.listAll(2000) rilegge il corpus intero di TUTTE le conversazioni ' +
      'visibili a ogni evento realtime della chat (debounced). Il costo cresce ' +
      'con lo storico, la frequenza con il numero di persone che scrivono.',
    rimedio:
      'Collega Messages.listForConversation (src/lib/api.js) al posto di listAll ' +
      'in hooks/useChatData.js — è già scritta e mai chiamata di proposito. ' +
      'Vedi ST-4 passo 2 in docs/AUDIT_STRUTTURA_2026-08-10.md.',
  },
  {
    tabella: 'task_history',
    max: 5000,
    perche:
      "È l'unica tabella dell'app che cresce e non si pota mai: una riga per ogni " +
      'cambio di stato, priorità, scadenza, assegnatario o cestinamento.',
    rimedio:
      'La lettura è già per-task da A-3 passo 3 (TaskHistoryPanel + historyForTask), ' +
      "quindi la soglia non riguarda l'idratazione ma la CRESCITA: se è superata, " +
      'valuta una potatura o un archivio storico. Nessun percorso caldo la legge intera.',
  },
  {
    tabella: 'clients',
    max: 3000,
    perche:
      "L'anagrafica non ha una finestra — un cliente non ha ciclo di vita, quindi " +
      'nessuna soglia temporale la può ridurre (M-1 passo 2, audit del 19 agosto). ' +
      'Chi apre ClientiView la scarica intera.',
    rimedio:
      'Passa ClientiView a una lettura paginata lato server, come già fa la tendina ' +
      'di suggerimento (hooks/useRicercaClienti.js). Serve anche unaccent/pg_trgm ' +
      'per non perdere la normalizzazione di searchUtils.',
  },
  {
    tabella: 'movimenti_lista',
    max: 50000,
    perche:
      'La lettura per lista è filtrata (.eq lista_id) ed è quindi al sicuro dal cap ' +
      'di PostgREST; il backup invece la scarica intera, paginata.',
    rimedio:
      'Se superata, il backup del modulo Liste diventa una richiesta lunga: valuta un ' +
      'export incrementale in ListeAPI.backupData (src/components/liste/listeApi.js).',
  },
];

/**
 * Confronta i conteggi misurati con le soglie.
 *
 * ⛔ Una tabella attesa e ASSENTE dai conteggi non è «zero righe»: è una misura
 * che non è arrivata, e trattarla come zero farebbe passare il controllo
 * proprio quando ha smesso di guardare. Diventa `mancanti`, che il chiamante
 * tratta come inconcludenza — non come un via libera.
 *
 * @param {Record<string, number>} conteggi  tabella → righe
 * @param {Soglia[]} soglie
 */
export function valutaVolumi(conteggi, soglie = SOGLIE) {
  const superate = [];
  const ok = [];
  const mancanti = [];

  for (const s of soglie) {
    const n = conteggi[s.tabella];
    if (typeof n !== 'number' || Number.isNaN(n)) { mancanti.push(s.tabella); continue; }
    // La percentuale serve a chi legge il log: «1.487 su 1.500» è un preavviso,
    // «13 su 1.500» è rumore, e senza il rapporto sono la stessa riga.
    const voce = { ...s, righe: n, percentuale: Math.round((n / s.max) * 100) };
    (n > s.max ? superate : ok).push(voce);
  }
  return { superate, ok, mancanti, fallisce: superate.length > 0 };
}
