// src/lib/confrontoIdratazione.js
// "Il payload appena letto dice qualcosa di diverso da quello di prima?"
//
// PERCHÉ ESISTE (ST-15). `AppDataContext` memoizza il proprio value su `team` e
// `categories`: finché il reducer non li SOSTITUISCE, l'identità non cambia e i
// venti metodi che il contesto espone non si ricostruiscono. Il `useMemo` è
// corretto — il problema sta a monte: l'idratazione dispatcha `SET_TEAM` anche
// quando i dati sono identici, quindi un evento realtime innocuo sulla tabella
// `users` invalidava comunque tutti i consumatori del contesto. Confrontare
// prima di dispatchare costa meno che memoizzare venti funzioni, e non sposta
// il problema in un altro file.
//
// ⚠️ DUE TRAPPOLE, entrambe deliberate qui dentro.
//
// 1. NON si confronta con `JSON.stringify`. Sarebbe sensibile all'ordine delle
//    chiavi (due oggetti equivalenti con chiavi in ordine diverso
//    risulterebbero diversi: il confronto non fallirebbe mai e il codice
//    sembrerebbe funzionare senza fare nulla) e tratterebbe `undefined` e
//    chiave assente come diversi. Qui si confronta chiave per chiave
//    sull'unione delle chiavi dei due oggetti.
//
// 2. L'ORDINE DELLE RIGHE conta ed è voluto. Le liste arrivano da una query
//    ordinata: se l'ordine cambia, è cambiato qualcosa che la UI mostra
//    (l'elenco del team è renderizzato in quell'ordine). Considerare
//    equivalenti due permutazioni significherebbe non aggiornare uno schermo
//    che deve cambiare.
//
// Il confronto è SUPERFICIALE per riga: le entità idratate qui (team,
// categorie) sono oggetti piatti di valori primitivi. Se un giorno una di esse
// portasse un oggetto annidato, questo confronto direbbe "diverso" ogni volta —
// che è il lato giusto in cui sbagliare: si torna al comportamento di prima,
// non a un aggiornamento perso.

const stessoValore = (a, b) => a === b || (a == null && b == null);

/** Due righe piatte sono equivalenti se coincidono su TUTTE le chiavi di entrambe. */
export const stessaRiga = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const chiavi = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of chiavi) {
    if (!stessoValore(a[k], b[k])) return false;
  }
  return true;
};

/**
 * Due liste sono equivalenti se hanno la stessa lunghezza e righe equivalenti
 * NELLO STESSO ORDINE (vedi trappola 2 sopra).
 *
 * `null`/`undefined` NON è mai equivalente a una lista: una lettura mancata o
 * fallita non deve far saltare un aggiornamento reale. È la terza trappola del
 * rilievo — saltare un dispatch è corretto solo se il payload è davvero
 * completo.
 */
export const stessaLista = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((riga, i) => stessaRiga(riga, b[i]));
};

/** Stessa idea per una mappa chiave → oggetto piatto (le categorie). */
export const stessaMappa = (a, b) => {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (a === b) return true;
  const chiavi = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of chiavi) {
    const va = a[k];
    const vb = b[k];
    if (va && vb && typeof va === "object" && typeof vb === "object") {
      if (!stessaRiga(va, vb)) return false;
    } else if (!stessoValore(va, vb)) return false;
  }
  return true;
};
