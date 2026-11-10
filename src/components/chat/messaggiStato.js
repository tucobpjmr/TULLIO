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
 * Fonde la rilettura del corpus con ciò che è già in stato.
 * - Corpus intero (`troncato` falso): il server è tutta la verità.
 * - Corpus troncato al tetto: il server copre solo da `soglia` in poi (il suo
 *   messaggio più vecchio). I messaggi più vecchi già caricati a pagine
 *   restano, o ogni rilettura ributterebbe via la storia appena letta.
 */
export function fondiCorpus(prima, dalServer, { troncato }) {
  if (!troncato) return dalServer;
  let soglia = Infinity;
  for (const lista of Object.values(dalServer)) {
    if (lista.length) soglia = Math.min(soglia, ms(lista[0].time));
  }
  const out = { ...dalServer };
  for (const [convId, lista] of Object.entries(prima)) {
    const nuovi = new Set((dalServer[convId] || []).map((m) => m.id));
    const vecchi = lista.filter((m) => ms(m.time) < soglia && !nuovi.has(m.id));
    if (vecchi.length) out[convId] = [...vecchi, ...(dalServer[convId] || [])];
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
