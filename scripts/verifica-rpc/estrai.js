// scripts/verifica-rpc/estrai.js
//
// Estrae dai sorgenti le chiamate `supabase.rpc('nome', { ...argomenti })`.
//
// Serve i nomi (cosa sondare) e gli argomenti (con quali parametri sondare:
// PostgREST risolve una funzione per nome E nomi degli argomenti, quindi
// interrogarla senza è un falso "non trovata"). I nomi degli argomenti non
// seguono una convenzione unica — le RPC delle liste usano il prefisso `p_`,
// quelle della chat no (`msg_id`, `emoji`, `origin`) — perciò qui si leggono
// le chiavi effettive dell'oggetto, senza presumerne la forma.
//
// Il sorgente è attraversato con una piccola macchina a stati invece che con
// una regex secca: `.rpc(` dentro una stringa o un commento non è una
// chiamata, e prenderlo per buona significherebbe sondare un nome inventato e
// far scattare un allarme falso.

// Stati attraversati: codice, stringhe (', ", `), commenti (// e /* */),
// letterali regex. Ritorna la lista degli indici in cui inizia `.rpc(` nel
// codice vero e proprio.
function posizioniRpc(src) {
  const trovate = [];
  // Ultimo carattere significativo visto: distingue una divisione da un
  // letterale regex (`/` dopo `=`, `(`, `,`… apre una regex, dopo un
  // identificatore o `)` è una divisione).
  let precedente = '';
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    const due = src.slice(i, i + 2);

    if (due === '//') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
      continue;
    }
    if (due === '/*') {
      const fine = src.indexOf('*/', i + 2);
      i = fine === -1 ? src.length : fine + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      i = fineStringa(src, i);
      precedente = 'x'; // una stringa conta come valore, non come operatore
      continue;
    }
    if (c === '/' && apreRegex(precedente)) {
      i = fineRegex(src, i);
      precedente = 'x';
      continue;
    }
    if (src.startsWith('.rpc(', i)) {
      trovate.push(i);
      i += 5;
      precedente = '(';
      continue;
    }
    if (!/\s/.test(c)) precedente = c;
    i++;
  }
  return trovate;
}

function apreRegex(precedente) {
  return precedente === '' || '(,=:[!&|?{};+-*%~^<>'.includes(precedente);
}

// Indice subito dopo la stringa che inizia a `i` (src[i] è l'apice).
// I `${}` dentro i template literal non sono interpretati: nel codice sondato
// non compaiono negli argomenti delle RPC, e trattarli come testo semplice
// al più chiude la stringa tardi, mai troppo presto.
function fineStringa(src, i) {
  const apice = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === apice) return j + 1;
    j++;
  }
  return src.length;
}

function fineRegex(src, i) {
  let j = i + 1;
  let inClasse = false;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '[') inClasse = true;
    else if (src[j] === ']') inClasse = false;
    else if (src[j] === '/' && !inClasse) return j + 1;
    else if (src[j] === '\n') return j; // regex non chiusa: non era una regex
    j++;
  }
  return src.length;
}

// Avanza oltre spazi e commenti.
function saltaNeutro(src, i) {
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    if (src.startsWith('//', i)) {
      const fine = src.indexOf('\n', i);
      if (fine === -1) return src.length;
      i = fine + 1;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const fine = src.indexOf('*/', i + 2);
      i = fine === -1 ? src.length : fine + 2;
      continue;
    }
    return i;
  }
  return i;
}

// Chiavi di primo livello dell'oggetto letterale che inizia a `i` (src[i] è
// `{`). Le chiavi annidate non contano: sono dati passati alla RPC, non suoi
// parametri (es. `p_movimenti: [{ descrizione, importo }]`).
function chiaviOggetto(src, i) {
  const chiavi = [];
  let j = i + 1;

  while (j < src.length) {
    j = saltaNeutro(src, j);
    if (j >= src.length || src[j] === '}') break;
    if (src[j] === ',') { j++; continue; }

    let chiave = null;
    if (src[j] === '"' || src[j] === "'") {
      const fine = fineStringa(src, j);
      chiave = src.slice(j + 1, fine - 1);
      j = fine;
    } else if (src.startsWith('...', j)) {
      // Spread: gli argomenti non sono più leggibili staticamente. Si
      // restituisce quel che si è raccolto e si lascia decidere al chiamante.
      return { chiavi, completo: false, fine: saltaChiusura(src, i) };
    } else {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(j));
      if (!m) return { chiavi, completo: false, fine: saltaChiusura(src, i) };
      chiave = m[0];
      j += m[0].length;
    }

    chiavi.push(chiave);
    j = saltaNeutro(src, j);
    if (src[j] === ':') j = saltaValore(src, j + 1);
    // altrimenti è una proprietà abbreviata (`emoji,`): la chiave basta così
  }
  return { chiavi, completo: true, fine: j + 1 };
}

// Avanza fino alla virgola o alla graffa che chiude la coppia corrente,
// ignorando quelle annidate dentro parentesi, stringhe e commenti.
function saltaValore(src, i) {
  let profondita = 0;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (src.startsWith('//', j) || src.startsWith('/*', j)) { j = saltaNeutro(src, j); continue; }
    if (c === '"' || c === "'" || c === '`') { j = fineStringa(src, j); continue; }
    if ('{[('.includes(c)) { profondita++; j++; continue; }
    if ('}])'.includes(c)) {
      if (profondita === 0) return j;
      profondita--;
      j++;
      continue;
    }
    if (c === ',' && profondita === 0) return j;
    j++;
  }
  return j;
}

function saltaChiusura(src, i) {
  let profondita = 0;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === '"' || c === "'" || c === '`') { j = fineStringa(src, j); continue; }
    if ('{[('.includes(c)) profondita++;
    else if ('}])'.includes(c)) {
      profondita--;
      if (profondita === 0) return j + 1;
    }
    j++;
  }
  return j;
}

/**
 * Chiamate RPC presenti in un sorgente.
 *
 * @returns {Array<{nome: string, argomenti: string[], argomentiCompleti: boolean}>}
 *   `argomentiCompleti` false quando gli argomenti non sono leggibili
 *   staticamente (spread, chiavi calcolate): la sonda allora interroga la
 *   funzione anche senza argomenti invece di fidarsi di una lista parziale.
 */
export function estraiChiamateRpc(src) {
  const chiamate = [];

  for (const inizio of posizioniRpc(src)) {
    let i = saltaNeutro(src, inizio + 5);
    if (src[i] !== '"' && src[i] !== "'" && src[i] !== '`') continue; // nome non letterale
    const fineNome = fineStringa(src, i);
    const nome = src.slice(i + 1, fineNome - 1);
    if (!/^[a-z_][a-z0-9_]*$/i.test(nome)) continue;

    i = saltaNeutro(src, fineNome);
    let argomenti = [];
    let argomentiCompleti = true;
    if (src[i] === ',') {
      i = saltaNeutro(src, i + 1);
      if (src[i] === '{') {
        const o = chiaviOggetto(src, i);
        argomenti = o.chiavi;
        argomentiCompleti = o.completo;
      } else if (src[i] !== ')') {
        argomentiCompleti = false; // variabile passata per riferimento
      }
    }
    chiamate.push({ nome, argomenti, argomentiCompleti });
  }
  return chiamate;
}

/**
 * Unisce le chiamate trovate in più file in un elenco per nome di funzione.
 * Se lo stesso nome è chiamato con firme diverse le si tiene tutte: basta che
 * una risolva perché la funzione esista.
 */
export function raggruppaPerNome(chiamate) {
  const perNome = new Map();
  for (const c of chiamate) {
    if (!perNome.has(c.nome)) perNome.set(c.nome, { nome: c.nome, firme: [] });
    const voce = perNome.get(c.nome);
    const chiave = c.argomenti.slice().sort().join(',');
    if (!voce.firme.some((f) => f.chiave === chiave)) {
      voce.firme.push({ chiave, argomenti: c.argomenti, completo: c.argomentiCompleti });
    }
  }
  return [...perNome.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}
