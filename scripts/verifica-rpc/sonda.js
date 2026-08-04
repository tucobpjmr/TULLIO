// scripts/verifica-rpc/sonda.js
//
// Verifica che ogni RPC chiamata dal frontend esista davvero sul database, con
// la sola chiave anon — quella già pubblica nel bundle e in
// .github/workflows/keep-supabase-warm.yml.
//
// ── Perché in GET ──────────────────────────────────────────────────────────
// La sonda non deve MAI eseguire una RPC: gira contro il database di
// produzione. PostgREST accetta le funzioni VOLATILE solo in POST e rifiuta la
// GET con 405 — rifiuto che arriva prima dell'esecuzione. Tutte le RPC di
// questa app sono VOLATILE tranne get_vapid_public_key (STABLE, sola lettura),
// quindi interrogare in GET le fa risolvere senza eseguirne nessuna.
// Una POST le eseguirebbe per davvero ogni volta che anon ha il permesso: è
// successo con aggiungi_beneficiario_lista, a cui mancava la REVOKE (vedi
// migrazione 20260804100000).
//
// ── Perché i controlli ─────────────────────────────────────────────────────
// La distinzione su cui si regge tutto è "PGRST202 = funzione assente" contro
// "405/42501 = funzione presente ma non interrogabile così". È il
// comportamento di PostgREST oggi, non un contratto: se una versione futura lo
// cambiasse, una sonda ingenua segnalerebbe venti funzioni mancanti tutte
// insieme. Perciò prima di dare un verdetto la sonda si mette alla prova su
// casi di cui conosce già la risposta, e se non li supera si dichiara
// inconcludente invece di dare un allarme falso. Un controllo che urla al
// lupo viene ignorato, e allora tanto vale non averlo.

export const PRESENTE = 'presente';
export const MANCANTE = 'mancante';
export const INDETERMINATO = 'indeterminato';

// Nome che non può esistere: serve a farsi dire da PostgREST com'è fatta la
// risposta per una funzione assente.
export const NOME_CONTROLLO = 'zz_sonda_funzione_inesistente_zz';

/**
 * Classifica una risposta a una sonda GET /rpc/<nome>.
 * Pura: `risposta` è { stato, corpo } già letto, così è testabile senza rete.
 */
export function classifica({ stato, corpo }) {
  const codice = corpo && typeof corpo === 'object' ? corpo.code : null;

  // PGRST202: la funzione non è nella schema cache. È l'errore esatto visto
  // dall'utente su modifica_note_lista.
  if (codice === 'PGRST202') return MANCANTE;

  // 42501 (insufficient_privilege): la funzione c'è, anon non può eseguirla.
  // È il caso normale per tutte le RPC di questa app.
  if (codice === '42501') return PRESENTE;

  // 405: funzione VOLATILE interrogata in GET. C'è, e non è stata eseguita.
  if (stato === 405) return PRESENTE;

  // 200: ha risposto (STABLE e concessa ad anon, es. get_vapid_public_key se
  // un giorno venisse aperta). Esiste di sicuro.
  if (stato >= 200 && stato < 300) return PRESENTE;

  // Altri errori con un codice Postgres (5 caratteri) vengono dal corpo della
  // funzione o dai suoi permessi: per esistere, esiste.
  if (typeof codice === 'string' && /^[0-9A-Z]{5}$/.test(codice)) return PRESENTE;

  return INDETERMINATO;
}

// Una GET su /rpc/<nome> con gli argomenti come parametri vuoti: PostgREST
// risolve l'overload per nome e nomi degli argomenti.
function url(base, nome, argomenti) {
  const u = new URL(`${base.replace(/\/$/, '')}/rest/v1/rpc/${nome}`);
  for (const a of argomenti) u.searchParams.set(a, '');
  return u.toString();
}

async function interroga(fetchImpl, base, chiave, nome, argomenti) {
  const r = await fetchImpl(url(base, nome, argomenti), {
    method: 'GET',
    headers: { apikey: chiave, Authorization: `Bearer ${chiave}` },
  });
  let corpo = null;
  try { corpo = await r.json(); } catch { /* risposta senza corpo JSON */ }
  return { stato: r.status, corpo };
}

/**
 * Sonda una funzione. Se con gli argomenti dedotti risulta assente riprova
 * senza: gli argomenti si leggono dal sorgente e possono essere incompleti,
 * e un errore di lettura non deve diventare un allarme.
 */
export async function sondaFunzione(fetchImpl, base, chiave, voce) {
  const tentativi = [];
  for (const firma of voce.firme) {
    tentativi.push(firma.argomenti);
    if (!firma.completo && firma.argomenti.length) tentativi.push([]);
  }
  if (!tentativi.some((t) => t.length === 0)) tentativi.push([]);

  let esito = MANCANTE;
  const risposte = [];
  for (const argomenti of tentativi) {
    const r = await interroga(fetchImpl, base, chiave, voce.nome, argomenti);
    risposte.push({ argomenti, ...r });
    const c = classifica(r);
    if (c === PRESENTE) return { nome: voce.nome, esito: PRESENTE, risposte };
    if (c === INDETERMINATO) esito = INDETERMINATO;
  }
  return { nome: voce.nome, esito, risposte };
}

/**
 * Esegue i controlli preliminari e poi sonda tutte le funzioni.
 *
 * Ritorna { verdetto, mancanti, dettagli, motivo }.
 * verdetto: 'ok' | 'drift' | 'indeterminato'.
 */
export async function verifica({ fetchImpl = fetch, base, chiave, funzioni }) {
  // Controllo 1 — l'API risponde. Senza questo un blackout di rete
  // sembrerebbe la sparizione di tutte le funzioni.
  try {
    const r = await fetchImpl(`${base.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: chiave, Authorization: `Bearer ${chiave}` },
    });
    if (!r.ok) {
      return { verdetto: INDETERMINATO, mancanti: [], dettagli: [], motivo: `l'API REST ha risposto ${r.status}` };
    }
  } catch (e) {
    return { verdetto: INDETERMINATO, mancanti: [], dettagli: [], motivo: `API REST irraggiungibile: ${e.message}` };
  }

  // Controllo 2 — una funzione inesistente deve risultare mancante. Se non
  // succede, "mancante" non è più riconoscibile e la sonda non può concludere.
  const controllo = await interroga(fetchImpl, base, chiave, NOME_CONTROLLO, []);
  if (classifica(controllo) !== MANCANTE) {
    return {
      verdetto: INDETERMINATO,
      mancanti: [],
      dettagli: [],
      motivo: `una funzione inesistente non risulta mancante (HTTP ${controllo.stato}, code ${controllo.corpo?.code ?? '—'}): PostgREST non risponde più come atteso`,
    };
  }

  const dettagli = [];
  for (const voce of funzioni) dettagli.push(await sondaFunzione(fetchImpl, base, chiave, voce));

  const mancanti = dettagli.filter((d) => d.esito === MANCANTE).map((d) => d.nome);
  const presenti = dettagli.filter((d) => d.esito === PRESENTE);

  // Controllo 3 — se nessuna funzione risulta presente, la spiegazione più
  // probabile non è che il database le abbia perse tutte, ma che la sonda stia
  // interrogando il progetto sbagliato o uno schema non esposto.
  if (funzioni.length > 1 && presenti.length === 0) {
    return {
      verdetto: INDETERMINATO,
      mancanti: [],
      dettagli,
      motivo: 'nessuna delle funzioni risulta presente: più probabile un problema della sonda che un database senza RPC',
    };
  }

  return {
    verdetto: mancanti.length ? 'drift' : 'ok',
    mancanti,
    dettagli,
    motivo: null,
  };
}
