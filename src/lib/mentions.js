// Caveat #2 — parser @menzioni lato client (gemello di public.find_mentioned_users
// nel DB). Stessa strategia: match greedy contro i nomi utenti reali, dal piu'
// lungo al piu' corto, cosi' i nomi composti ("@Maria Grazia") matchano per
// intero e un prefisso piu' corto non viene catturato dentro un nome piu' lungo.
//
// Boundary coerenti col trigger DB:
//   - iniziale: la @ deve essere a inizio testo o preceduta da un non-alfanumerico
//     (evita falsi positivi tipo email "me@marco.com");
//   - finale: dopo il nome ci dev'essere fine testo o un carattere non-lettera
//     (i digit contano come boundary, come [^[:alpha:]] nel DB).

const NAME_CHAR = /[A-Za-zÀ-ÿ]/;          // lettera (boundary finale = non-lettera)
const ALNUM_BEFORE = /[A-Za-z0-9À-ÿ]/;    // alfanumerico (vietato prima della @)

// Ritorna gli span menzionati: [{ id, name, start, end }] ordinati per posizione.
// `end` e' esclusivo e copre "@" + nome.
export function findMentions(text, members) {
  if (typeof text !== "string" || !text || !Array.isArray(members)) return [];
  const names = members
    .filter((m) => m && m.id && typeof m.name === "string" && m.name.trim())
    .map((m) => ({ id: m.id, name: m.name, lower: m.name.toLowerCase() }))
    .sort((a, b) => b.name.length - a.name.length); // longest-first (greedy)
  if (!names.length) return [];

  const lower = text.toLowerCase();
  const out = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "@") { i++; continue; }
    const before = text[i - 1];
    if (before !== undefined && ALNUM_BEFORE.test(before)) { i++; continue; }
    let matched = null;
    for (const n of names) {
      if (lower.startsWith(n.lower, i + 1)) {
        const after = text[i + 1 + n.name.length];
        if (after === undefined || !NAME_CHAR.test(after)) { matched = n; break; }
      }
    }
    if (matched) {
      const end = i + 1 + matched.name.length;
      out.push({ id: matched.id, name: matched.name, start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return out;
}
