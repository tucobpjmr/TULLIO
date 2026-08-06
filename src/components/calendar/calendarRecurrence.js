// ─── RICORRENZE ──────────────────────────────────────────────────────────────
// Espansione delle ricorrenze in istanze visualizzabili. Matematica pura sulle
// date, testata a parte (src/test/recurrence.test.js): è il calcolo più costoso
// del calendario, ed è la ragione per cui la vista è memoizzata.

// Numero di giorni (28–31) del mese `month` (0-based) dell'anno `year`.
function daysInMonthOf(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Calcola l'occorrenza N-esima di una ricorrenza a partire SEMPRE dalla data base
// originale (n = 0 restituisce la base stessa). Derivare ogni occorrenza dalla base
// — invece di iterare su un accumulatore — evita lo slittamento permanente dovuto
// all'overflow di setMonth/setFullYear quando il giorno di partenza non esiste nel
// mese/anno target. Per monthly/yearly il giorno viene "clampato" all'ultimo giorno
// valido del mese target (es. 31 gen → 28/29 feb → 31 mar → 30 apr → 31 mag; 29 feb
// annuale → 28 feb negli anni non bisestili). L'ora del giorno (ore/minuti/secondi/ms)
// della base è sempre preservata.
export function nthRecurrence(base, recurrence, n) {
  if (recurrence === "daily") {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }
  if (recurrence === "weekly") {
    const d = new Date(base);
    d.setDate(d.getDate() + n * 7);
    return d;
  }
  if (recurrence === "monthly" || recurrence === "yearly") {
    const step = recurrence === "yearly" ? 12 : 1;
    const totalMonths = base.getMonth() + n * step;
    const year = base.getFullYear() + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    const day = Math.min(base.getDate(), daysInMonthOf(year, month));
    return new Date(
      year, month, day,
      base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()
    );
  }
  // Ricorrenza sconosciuta: nessun avanzamento.
  return new Date(base);
}

// Generates virtual task copies for recurring tasks within [rangeStart, rangeEnd].
// Virtual copies have isRecurringInstance:true and originalId pointing to the base.
export function expandRecurring(tasks, rangeStart, rangeEnd) {
  const result = [];
  for (const t of tasks) {
    if (!t.dueDate || !t.recurrence || t.recurrence === "none") {
      result.push(t);
      continue;
    }
    const orig = new Date(t.dueDate);
    // Ogni occorrenza è ricavata dalla base originale tramite l'indice `n`
    // (n = 0 → base), così un mese/anno "corto" non altera le occorrenze successive.
    let n = 0;
    let cur = nthRecurrence(orig, t.recurrence, n);
    let safety = 0;
    // Wind forward to first occurrence >= rangeStart
    while (cur < rangeStart && safety++ < 400) {
      n++;
      cur = nthRecurrence(orig, t.recurrence, n);
    }
    // Emit all occurrences in [rangeStart, rangeEnd]
    safety = 0;
    while (cur <= rangeEnd && safety++ < 400) {
      const isOrig = cur.getTime() === orig.getTime();
      result.push({
        ...t,
        id: isOrig ? t.id : `${t.id}_r${cur.getTime()}`,
        dueDate: cur.toISOString(),
        isRecurringInstance: !isOrig,
        originalId: t.id,
      });
      n++;
      cur = nthRecurrence(orig, t.recurrence, n);
    }
  }
  return result;
}

// ── Column layout for overlapping events ────────────────────────────────────
