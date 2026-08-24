// src/lib/api/clienti.js
// Anagrafica clienti.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';
import { fetchAllRows, WITH_COUNT } from '../pagination.js';
import { withOrigin } from '../realtime.js';
import { CONTA_RIGHE } from './comuni.js';

// ----------------- CLIENTS -----------------
// `clients` è in realtime dalla 20260807215625 e ha origin_client dalla
// 20260808120000 (S-1). Prima di quest'ultima erano le uniche mutazioni del
// data layer a non passare da withOrigin: chi salvava una scheda in anagrafica
// riceveva l'eco della propria scrittura e si riscaricava le 818 righe
// dell'elenco, che aveva già aggiornato in ottimistico.
export const Clients = {
  // Paginata (ST-3). La tabella è a 818 righe e PostgREST tronca ogni select a
  // `db-max-rows` (1000 di default) rispondendo 200 SENZA errore: sarebbe
  // bastata la crescita normale dell'anagrafica — che si alimenta a blocchi
  // via ClientImportModal, non una riga alla volta — perché i clienti in fondo
  // all'ordinamento smettessero di esistere per l'app. Con `.order('name')` le
  // prime a sparire sarebbero le ultime dell'alfabeto, e il sintomo ("non
  // trovo più il cliente Z") non assomiglia a un problema di paginazione.
  // Cadono in silenzio con essa anche l'autocomplete cliente sui task, il
  // conteggio liste per cliente e la ricerca globale.
  //
  // `order('name', ...).order('id')`: fetchAllRows richiede un ordinamento
  // deterministico, e `name` non è unico (due schede omonime esistono e sono
  // legittime — cliente e cointestatario con lo stesso nome). Senza la seconda
  // chiave, due pagine consecutive potrebbero ripetere o saltare una riga.
  //
  // Non è più l'unica: dal 12 agosto (C-1) passano da `fetchAllRows` anche
  // `Tasks.list` e le due tabelle figlie `TaskThreads.comments/history`. Il
  // costo di `count: 'exact'` sulla select annidata dei task — l'unica ragione
  // per cui la correzione era rimasta indietro — è stato misurato: 11 ms, vedi
  // il commento su Tasks.list. Con quelle tre, ogni lettura del data layer che
  // deve arrivare INTERA è paginata.
  list: () =>
    fetchAllRows(() => supabase.from('clients')
      .select('*', WITH_COUNT).order('name').order('id')),
  // ─── M-1 (passo 2) · la ricerca cliente si fa sul SERVER ────────────────
  // (audit performance/UX del 19 agosto)
  //
  // PERCHÉ ESISTE. `list()` qui sopra scarica l'anagrafica INTERA, e finché la
  // tendina di suggerimento cliente (`ui/ClientAutocomplete.jsx`) filtrava un
  // array in memoria, quel download era obbligatorio a ogni sessione: la
  // tendina si apre da `QuickAddTask` — il FAB su ogni vista, la scorciatoia
  // `K` — quindi «quasi ogni sessione» non è un'esagerazione. È il consumatore
  // che rendeva inutile qualunque finestra sull'idratazione, e per questo va
  // per primo.
  //
  // Un autocomplete è comunque il caso in cui la ricerca lato server è la forma
  // giusta e non un ripiego: si guardano le prime righe che corrispondono a ciò
  // che si sta digitando, non tutte.
  //
  // I TERMINI IN AND, non la stringa intera. `ilike '%mario rossi%'` non trova
  // «ROSSI MARIO», e in questa anagrafica l'ordine cognome/nome non è una
  // regola (vedi il commento in testa a lib/searchUtils.js): convivono
  // «COLUCCI GIANNICOLA» e «ELENA GIANCIPPOLI». Spezzando la query e
  // richiedendo ogni termine si ottiene l'indipendenza dall'ordine, che è la
  // proprietà che l'utente si aspetta perché è quella delle altre ricerche
  // dell'app.
  //
  // ⚠️ COSA QUESTA RICERCA NON FA, e va saputo: `ilike` confronta i caratteri
  // così come sono, quindi NON normalizza accenti e apostrofi come
  // `lib/searchUtils.js` — «d amato» non trova «D'AMATO» qui, mentre lo trova
  // nell'anagrafica (`ClientiView`, che lavora sul corpus in memoria con
  // l'indice). Coprire anche quello lato server richiede `unaccent`/`pg_trgm`,
  // che su questo progetto non sono installate: abilitare un'estensione è una
  // decisione a sé, non un effetto collaterale di un autocomplete. Chi cerca
  // una scheda con la punteggiatura la trova dall'anagrafica; qui si
  // suggerisce mentre si digita.
  //
  // Nessuna paginazione e nessun `count`: qui il tetto è VOLUTO — sono i primi
  // `limit` suggerimenti, non un insieme che deve arrivare intero (è la
  // distinzione fra `fetchRowsUpTo` e `fetchAllRows` in lib/pagination.js, e
  // `limit` è ben sotto `db-max-rows`).
  cerca: (q, { limit = 20 } = {}) => {
    const termini = String(q ?? '').trim().split(/\s+/).filter(Boolean);
    if (termini.length === 0) return Promise.resolve({ data: [], error: null });
    let query = supabase.from('clients').select('*');
    for (const t of termini) query = query.ilike('name', `%${t}%`);
    return query.order('name').limit(limit);
  },
  create: (client) =>
    supabase.from('clients').insert(withOrigin(client)).select().single(),
  update: (id, patch) =>
    supabase.from('clients').update(withOrigin(patch)).eq('id', id).select().single(),
  // Niente withOrigin qui: .delete() non accetta un payload (stesso limite di
  // Notifications.remove e Categories.remove), quindi l'eco della DELETE non è
  // filtrabile e ogni client ricarica l'elenco. È il comportamento corretto,
  // non una lacuna: l'unico modo per rendere leggibile un'origine su una
  // DELETE sarebbe la REPLICA IDENTITY FULL, che però esporrebbe l'origine
  // dell'ULTIMA SCRITTURA — quella di chi ha modificato la scheda per ultimo,
  // non di chi la sta cancellando — e farebbe scartare a QUELL'utente la
  // cancellazione altrui, lasciandogli in lista un cliente che non esiste più.
  // Vedi il blocco (a) in fondo alla migrazione 20260808120000.
  remove: (id) =>
    supabase.from('clients').delete(CONTA_RIGHE).eq('id', id),
  // Import anagrafica (A-2): insert multi-riga a BLOCCHI invece di N
  // `create()` in Promise.all. Ogni blocco è atomico — o entra tutto o
  // niente — quindi un fallimento a metà lascia uno stato NOTO (i blocchi già
  // scritti) invece di un insieme casuale di righe passate e righe respinte,
  // scoperto solo al reload successivo. 200 è il compromesso fra numero di
  // round-trip e dimensione del payload: oltre, PostgREST inizia a rifiutare
  // per lunghezza della richiesta. `scritti` dice al rollback quante righe
  // NON togliere dalla UI.
  createMany: async (clients, { chunk = 200 } = {}) => {
    let scritti = 0;
    for (let i = 0; i < clients.length; i += chunk) {
      const blocco = clients.slice(i, i + chunk).map(withOrigin);
      const { error } = await supabase.from('clients').insert(blocco);
      if (error) return { error, scritti };
      scritti += blocco.length;
    }
    return { error: null, scritti };
  },
};
