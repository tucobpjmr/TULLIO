// src/lib/xlsxHeader.js
// La parte PURA della lettura di un foglio: individuare l'intestazione dentro
// una griglia array-di-array e costruire da lì gli oggetti riga. Nessun import
// di SheetJS, nessun DOM.
//
// PERCHÉ È UN FILE A SÉ (A-1 dell'audit sicurezza del 26 agosto). Da questo
// commit SheetJS gira SOLO dentro `xlsxWorker.js`, e questo codice serve a
// due chiamanti che non possono condividere un modulo che importi `xlsx`:
// il worker (che lo importa) e il percorso di ripiego in `xlsx.js` (che non
// deve trascinarsi la libreria nel chunk principale solo per riusare due
// funzioni di logica). Tenerle qui è ciò che permette al worker di essere
// l'unico consumatore di `xlsx` in tutto il progetto — che è il punto
// dell'intervento, non un suo effetto collaterale.

// Individua l'indice della riga di intestazione dentro un array-di-array.
// Serve per gli export di gestionali legacy che antepongono righe di
// titolo/metadati vuote prima della vera intestazione (es. "Esportazione del :
// 21/07/2026" + righe vuote prima di "Titolo,RagioneSociale,..."): assumere
// sempre la riga 0 come header romperebbe questi file. Euristica: cerca fra le
// prime `maxScan` righe quella con più celle che matchano gli `hints` forniti
// (parole chiave attese nell'intestazione, es. "email", "nome"); richiede
// almeno 2 match per non scambiare una riga dati per l'intestazione. Se
// nessuna riga soddisfa la soglia, ripiega sulla riga 0 (file "normali" senza
// blocco di metadati, dove l'intestazione è già la prima riga).
export const detectHeaderRowIndex = (rows2d, hints, maxScan = 20) => {
  const normHints = hints.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  let bestIdx = 0;
  let bestScore = -1;
  const scanLimit = Math.min(rows2d.length, maxScan);
  for (let i = 0; i < scanLimit; i++) {
    const row = rows2d[i] || [];
    const nonEmpty = row.map((c) => String(c ?? "").trim()).filter(Boolean);
    if (nonEmpty.length < 2) continue;
    const normCells = nonEmpty.map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const hits = normCells.filter((c) => normHints.some((h) => c.includes(h))).length;
    if (hits < 2) continue;
    const score = hits * 10 + Math.min(nonEmpty.length, 20);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return bestIdx;
};

// Dalla griglia grezza agli oggetti riga, usando `detectHeaderRowIndex` per
// sapere da dove partire. I nomi di colonna duplicati vengono suffissati
// (`Email`, `Email_1`, …): senza, `Object.fromEntries` terrebbe solo
// l'ultima occorrenza e una colonna sparirebbe in silenzio.
export const righeDaGriglia = (grid, hints) => {
  if (!grid.length) return { rows: [], columns: [] };
  const headerIdx = detectHeaderRowIndex(grid, hints);
  const rawHeaders = grid[headerIdx] || [];
  const seen = new Map();
  const columns = rawHeaders.map((h, i) => {
    const base = String(h ?? "").trim() || `Colonna ${i + 1}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}_${n}`;
  });
  const rows = grid.slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c ?? "").trim() !== ""))
    .map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ""])));
  return { rows, columns };
};
