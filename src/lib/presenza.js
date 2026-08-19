// src/lib/presenza.js
// Dalla presenza grezza — una riga `users` o lo stato di un canale Realtime —
// al pallino colorato. Logica PURA: nessun hook, nessuna rete.
//
// ─── PERCHÉ VIVE IN lib/ E NON PIÙ IN components/chat/ (A-3, audit del 19
//     agosto) ────────────────────────────────────────────────────────────────
// Era `components/chat/chatPresence.js`, e finché la presenza si leggeva SOLO
// dalla riga `users` era la collocazione giusta: la chat era l'unico posto in
// cui quella riga diventava un colore. Con la presenza live spostata su un
// canale Realtime, il pannello Admin non può più leggere `users.status` come
// verità corrente — deve applicare le stesse soglie di invecchiamento della
// chat, altrimenti mostra «online» per chi ha chiuso il browser stamattina.
// Due lettori in due moduli diversi: la regola sale in `lib/`, dove le altre
// funzioni pure dell'app già vivono, invece di essere importata da `chat/` o
// riscritta una seconda volta.

// B-6 · Ogni quanto i componenti che mostrano la presenza si ri-renderizzano
// per farla invecchiare. Sta QUI e non nei call site perché è determinato
// dalle soglie di `computePresence` qui sotto — 60 s per «online», 5 minuti per
// «assente»: 30 secondi è la metà della soglia più stretta, cioè il pallino non
// resta mai sbagliato per più di mezzo passo. Cambiare le soglie senza guardare
// questo numero è il modo in cui l'ageing smette di funzionare in silenzio.
export const TICK_PRESENZA_MS = 30 * 1000;

// A-3 · Ogni quanto la sessione RINFRESCA la propria presenza sul canale.
//
// ⚠️ Non è il vecchio heartbeat sotto altro nome, e la differenza è ciò che
// chiude il rilievo: `track()` scrive nello stato del CANALE, non in una riga
// di `public.users`, quindi non produce un evento `postgres_changes` da
// consegnare a tutti i sottoscrittori della tabella — il costo che cresceva
// col QUADRATO delle sessioni collegate. Serve solo a tenere fresco il
// `last_seen_at` sintetico che `computePresence` legge qui sotto: senza, dopo
// 60 secondi il proprio pallino sbiadirebbe da solo pur essendo connessi.
// Allineato a TICK_PRESENZA_MS per la stessa ragione (metà della soglia).
export const REFRESH_PRESENZA_MS = 30 * 1000;

/**
 * Dalla riga di un utente (o dalla voce sintetica del canale) allo stato da
 * disegnare. `last_seen_at` è il timestamp dell'ultimo segno di vita noto: il
 * canale lo rinnova ogni REFRESH_PRESENZA_MS finché la sessione è aperta, il
 * database porta quello dell'ultima apertura per chi non è collegato ora.
 */
export function computePresence(user) {
  if (!user || !user.last_seen_at) return 'offline';
  if (user.status === 'offline') return 'offline';
  const age = Date.now() - new Date(user.last_seen_at).getTime();
  if (age < 60 * 1000) {
    // 'busy' è manuale (il canale lo rinnova finché la sessione è aperta)
    if (user.status === 'busy') return 'busy';
    return user.status === 'away' ? 'away' : 'online';
  }
  if (age < 5 * 60 * 1000) return 'away';
  return 'offline';
}

export const PRESENCE_COLORS = {
  online: '#2D7A4F',
  away: '#E0A800',
  busy: '#C0392B',
  offline: '#94a3b8',
};

export const PRESENCE_LABELS = {
  online: 'Online',
  away: 'Assente',
  busy: 'Occupato',
  offline: 'Offline',
};

/**
 * A-3 · Lo stato del canale Realtime → la stessa forma che `computePresence`
 * legge dalla riga `users`.
 *
 * `presenceState()` indicizza per CHIAVE (qui l'id utente) un ARRAY di voci,
 * una per connessione: la stessa persona con l'app aperta sul telefono e sul
 * desktop compare due volte, e le due possono dire cose diverse — una scheda
 * in primo piano ('online') e una in background ('away'), o il toggle
 * «Occupato» premuto solo su una.
 *
 * Vince la voce con `at` più RECENTE, e non una precedenza fra stati. Le due
 * alternative sono peggiori entrambe: «online vince su away» direbbe online di
 * chi ha appena messo giù il telefono con una scheda dimenticata aperta, e
 * «busy vince su tutto» renderebbe impossibile togliersi l'Occupato da una
 * seconda scheda. L'ultima cosa che l'utente ha FATTO è l'unica regola che non
 * ha bisogno di essere spiegata a chi guarda il pallino.
 *
 * Funzione pura: prende l'oggetto, non il canale.
 *
 * @param {Record<string, Array<{status?: string, at?: number}>>} stato
 * @returns {Record<string, {status: string, last_seen_at: string}>}
 */
export function daStatoCanale(stato) {
  /** @type {Record<string, {status: string, last_seen_at: string}>} */
  const out = {};
  for (const [userId, voci] of Object.entries(stato || {})) {
    let migliore = null;
    for (const v of voci || []) {
      if (!v) continue;
      if (!migliore || (v.at || 0) > (migliore.at || 0)) migliore = v;
    }
    if (!migliore) continue;
    // `at` assente (una voce scritta da una versione più vecchia dell'app, o
    // un payload malformato): la connessione ESISTE, quindi la persona è
    // presente — si usa "adesso" invece di scartarla e dichiararla offline.
    const at = typeof migliore.at === 'number' ? migliore.at : Date.now();
    out[userId] = {
      status: migliore.status || 'online',
      last_seen_at: new Date(at).toISOString(),
    };
  }
  return out;
}
