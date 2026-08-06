// ─── LAYOUT A COLONNE ────────────────────────────────────────────────────────
// Assegna una colonna a ogni evento di una giornata in modo che due task
// sovrapposti nel tempo non si coprano a vicenda. Usata dalle due griglie
// orarie (CalendarDayGrid, CalendarWeekGrid).

// Returns array of { task, col, totalCols } with non-overlapping column placement.
export function layoutColumns(dayTasks) {
  const sorted = [...dayTasks].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const colEnds = []; // end-minute of last event assigned to each column
  const items = sorted.map(t => {
    const d = new Date(t.dueDate);
    const startMin = d.getHours() * 60 + d.getMinutes();
    const durH = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
    const endMin = startMin + durH * 60;
    let col = colEnds.findIndex(e => e <= startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(endMin); }
    else colEnds[col] = endMin;
    return { task: t, col, startMin, endMin };
  });
  // Assign totalCols = max col in the overlapping group + 1
  return items.map(item => {
    const totalCols = Math.max(...items
      .filter(o => o.startMin < item.endMin && o.endMin > item.startMin)
      .map(o => o.col)) + 1;
    return { ...item, totalCols };
  });
}

// `memo` è la seconda metà del lavoro fatto dai provider, non un extra: il
// genitore (VoyageDeskInner) si ri-renderizza a ogni azione — toast compreso —
// e senza questo il calendario si ri-renderizzerebbe con lui, provider o no.
// Le prop rimaste sono solo `dispatch`, che useSyncedDispatch tiene a identità
// stabile: il confronto shallow riesce e il render si salta. I task arrivano
// da useTasks(), quindi il componente si aggiorna quando cambiano loro.
