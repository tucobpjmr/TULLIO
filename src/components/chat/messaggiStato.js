// Trasformazioni PURE della mappa `{ convId: [messaggi in ordine di tempo] }`
// (A-2 dell'analisi del 10 novembre). Vivono qui, fuori da useChatData, perché
// sono la parte che si può provare senza canale e senza rete.

const ms = (t) => {
  const n = Date.parse(t);
  return Number.isNaN(n) ? 0 : n;
};

const inOrdine = (lista) => {
  for (let i = 1; i < lista.length; i++) {
    if (ms(lista[i - 1].time) > ms(lista[i].time)) {
      return [...lista].sort((a, b) => ms(a.time) - ms(b.time));
    }
  }
  return lista;
};

/**
 * Applica una serie di eventi realtime di `messages`, riga per riga.
 * - `ins`: il messaggio si aggiunge (o sostituisce il suo omonimo);
 * - `upd`: si sostituisce SOLO se è già in stato. Un messaggio vecchio non
 *   ancora caricato resta fuori: aggiungerlo aprirebbe un buco nella storia,
 *   e «carica precedenti» lo porterà comunque nel suo stato corrente;
 * - `del`: si toglie, anche senza conoscerne la conversazione.
 */
export function applicaRighe(mappa, righe) {
  let out = mappa;
  const lista = (convId) => out[convId] || [];
  const scrivi = (convId, nuova) => { out = { ...out, [convId]: nuova }; };

  for (const r of righe) {
    if (r.tipo === "del") {
      const dove = r.convId && out[r.convId]
        ? [r.convId]
        : Object.keys(out).filter((c) => out[c].some((m) => m.id === r.id));
      for (const c of dove) {
        if (out[c].some((m) => m.id === r.id)) scrivi(c, out[c].filter((m) => m.id !== r.id));
      }
      continue;
    }
    const { m } = r;
    const attuale = lista(m.conversation_id);
    const presente = attuale.some((x) => x.id === m.id);
    if (presente) scrivi(m.conversation_id, attuale.map((x) => (x.id === m.id ? m : x)));
    else if (r.tipo === "ins") scrivi(m.conversation_id, inOrdine([...attuale, m]));
  }
  return out;
}

/**
 * Fonde la lettura delle ULTIME pagine delle conversazioni `lette` con ciò che
 * è già in stato (hooks/useChatData.js).
 * - Conversazione non troncata (pagina non piena): il server è tutta la verità.
 * - Troncata: il server copre solo dal suo messaggio più vecchio in poi; i
 *   messaggi più vecchi già caricati a pagine restano, o ogni rilettura
 *   ributterebbe via la storia appena letta.
 * - `parziale`: si sono lette solo alcune conversazioni (quelle nuove), le
 *   altre restano com'erano. Altrimenti le conversazioni non lette spariscono:
 *   la lettura completa è la lista delle conversazioni visibili.
 * @param {Record<string, any[]>} prima
 * @param {Record<string, any[]>} dalServer
 * @param {{ lette: string[], troncate: Set<string>, parziale?: boolean }} opts
 */
export function fondiFinestre(prima, dalServer, { lette, troncate, parziale = false }) {
  const out = parziale ? { ...prima } : {};
  for (const convId of lette) {
    const server = dalServer[convId] || [];
    if (!troncate.has(convId) || !server.length) { out[convId] = server; continue; }
    const soglia = ms(server[0].time);
    const nuovi = new Set(server.map((m) => m.id));
    const vecchi = (prima[convId] || []).filter((m) => ms(m.time) < soglia && !nuovi.has(m.id));
    out[convId] = vecchi.length ? [...vecchi, ...server] : server;
  }
  return out;
}

/**
 * Aggiunge in testa una pagina di messaggi precedenti. Ritorna anche quanti
 * erano davvero nuovi: zero significa che la storia è finita.
 */
export function aggiungiPagina(mappa, convId, pagina) {
  const attuale = mappa[convId] || [];
  const noti = new Set(attuale.map((m) => m.id));
  const nuovi = pagina.filter((m) => !noti.has(m.id));
  if (!nuovi.length) return { mappa, nuovi: 0 };
  return { mappa: { ...mappa, [convId]: inOrdine([...nuovi, ...attuale]) }, nuovi: nuovi.length };
}

/**
 * B-7 del 16 novembre · I non letti che il corpus locale NON contiene, per
 * conversazione: il conteggio del server meno quelli già nel corpus letto
 * insieme. Solo valori positivi; una conversazione senza scarto non compare.
 * @param {Array<{ conversation_id: string, non_letti: number|string }>} righeServer
 * @param {Record<string, any[]>} corpus
 * @param {string|null} uid
 * @returns {Record<string, number>}
 */
export function nonLettiOltreCorpus(righeServer, corpus, uid) {
  const out = /** @type {Record<string, number>} */ ({});
  for (const r of righeServer || []) {
    const convId = r?.conversation_id;
    if (!convId) continue;
    const locali = (corpus[convId] || [])
      .filter(m => m.sender !== uid && !m.readBy?.includes(uid)).length;
    const oltre = Number(r.non_letti) - locali;
    if (oltre > 0) out[convId] = oltre;
  }
  return out;
}
