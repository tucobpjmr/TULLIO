// ─── XLSX LAZY LOADER + HARDENING ──────────────────────────────────────────
// Carica SheetJS (~430KB) solo alla prima import/export e ne cachea il modulo,
// così il bundle iniziale resta leggero (caveat #15, Step N). Estratto dal
// monolite (Step P Phase 2f) per essere condiviso da ImportTab e AdminIOTab.
//
// ⚠️ SICUREZZA — NON riportare a `"xlsx": "^0.18.5"` alla leggera. ─────────────
// La 0.18.5 è l'ULTIMA versione di SheetJS pubblicata sul registry npm: gli
// autori hanno smesso di pubblicare lì (motivi di licenza/distribuzione) e
// rilasciano le versioni successive — con i fix di sicurezza — solo sul loro
// CDN. `npm audit`/Dependabot segnalano quindi la 0.18.5 come "high, No fix
// available":
//   • GHSA-4r6h-8v6p-xvw6  (CVE-2023-30533) Prototype Pollution  — fix in 0.19.3+
//   • GHSA-5pgg-2g8v-p4x9  (CVE-2024-22363) ReDoS                — fix in 0.20.2+
//
// Fix DEFINITIVO raccomandato (quando la CI ha accesso di rete a cdn.sheetjs.com):
//   npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
// Questo sostituisce la entry semver in package.json con l'URL del tarball CDN
// (API pubblica invariata: XLSX.read / utils.sheet_to_json / writeFile) e
// registra l'URL nel lockfile, così `npm ci` continua a funzionare.
// NON è stato applicato in questo commit perché l'ambiente/CI in uso NON può
// raggiungere cdn.sheetjs.com (egress policy → 403): senza accesso al CDN non
// si può né rigenerare il lockfile né verificare build/test, e una entry URL
// non risolvibile romperebbe `npm ci`. In attesa della migrazione mitighiamo
// il rischio a livello applicativo (vedi sotto): il parsing è comunque
// client-side, quindi il blast radius è il browser di chi importa il file.
//
// Riverificato (analisi sicurezza S-06, 2026-08-06): stesso 403 dalla policy
// di rete della sessione — CONNECT tunnel failed, response 403 — quindi il
// blocco non è specifico di un ambiente passato, persiste anche oggi. Chi ha
// accesso di rete al CDN può applicare il comando sopra ed eseguire
// `npm test && npm run build` per verificarlo; nel frattempo la mitigazione
// applicativa qui sotto resta il fix effettivo, non un placeholder: copre
// entrambi i punti che analizzano file arbitrari (ImportTab, ClientImport-
// Modal), più un limite sincrono su file.size prima ancora di leggerli in
// memoria (vedi i due componenti — MAX_IMPORT_BYTES controllato lì PRIMA di
// FileReader.readAsArrayBuffer, non solo qui dopo).
// ────────────────────────────────────────────────────────────────────────────
let _xlsxPromise = null;
export const loadXLSX = () => (_xlsxPromise ||= import("xlsx"));

// Limite di dimensione per i file importati: riduce la superficie della ReDoS
// (GHSA-5pgg-2g8v-p4x9), che è amplificata da input molto grandi.
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024; // 15 MB

// Mitigazione della Prototype Pollution (GHSA-4r6h-8v6p-xvw6): un .xlsx malevolo
// può iniettare proprietà su Object.prototype DURANTE il parsing. Facciamo uno
// snapshot delle own-property di Object.prototype subito prima del parse
// (sincrono, single-thread: nessuna race) e, subito dopo, rimuoviamo qualsiasi
// chiave comparsa nel frattempo, rifiutando il file. Isolato ed esportato per
// essere testabile.
export const withPrototypePollutionGuard = (fn) => {
  const before = new Set(Object.getOwnPropertyNames(Object.prototype));
  const result = fn();
  const leaked = Object.getOwnPropertyNames(Object.prototype).filter((k) => !before.has(k));
  if (leaked.length) {
    for (const k of leaked) {
      try { delete Object.prototype[k]; } catch { /* prototype congelato: già inerte */ }
    }
    throw new Error(
      `File rifiutato: rilevato tentativo di prototype pollution (${leaked.join(", ")}).`
    );
  }
  return result;
};

// Punto d'ingresso unico e "sicuro" per leggere le righe del primo foglio di un
// file caricato (CSV/XLSX/XLS). Applica limite di dimensione + guard anti
// prototype-pollution attorno all'intero parse SheetJS. `arrayBuffer` è
// l'ArrayBuffer restituito da FileReader.readAsArrayBuffer.
export const readFirstSheetRows = async (
  arrayBuffer,
  { sheetToJsonOpts = { defval: "", raw: false } } = {}
) => {
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(
      `File troppo grande (${(arrayBuffer.byteLength / 1048576).toFixed(1)} MB, ` +
      `max ${MAX_IMPORT_BYTES / 1048576} MB).`
    );
  }
  const XLSX = await loadXLSX();
  // Caveat #18: leggiamo come ArrayBuffer + type "array" (non binary string).
  // Così SheetJS decodifica correttamente l'UTF-8 dei CSV (e rimuove il BOM
  // iniziale), evitando il mojibake sui caratteri accentati ("città", "è").
  const data = new Uint8Array(arrayBuffer);
  return withPrototypePollutionGuard(() => {
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, sheetToJsonOpts);
  });
};

// Individua l'indice della riga di intestazione dentro un array-di-array
// (`sheet_to_json` con header:1). Serve per gli export di gestionali legacy
// che anteappongono righe di titolo/metadati vuote prima della vera
// intestazione (es. "Esportazione del : 21/07/2026" + righe vuote prima di
// "Titolo,RagioneSociale,..."): assumere sempre la riga 0 come header, come
// fa readFirstSheetRows, romperebbe questi file. Euristica: cerca fra le
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

// Variante di readFirstSheetRows che non assume la riga 0 come intestazione:
// legge il foglio come griglia grezza, individua la riga header via
// detectHeaderRowIndex e costruisce gli oggetti riga da lì in poi. Stessa
// difesa in profondità (limite dimensione + guard anti prototype-pollution)
// dell'entry point esistente. `hints` sono le parole chiave di dominio da
// cercare nell'intestazione (per l'anagrafica clienti: nome/email/telefono/…).
export const readFirstSheetRowsAutoHeader = async (arrayBuffer, hints) => {
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(
      `File troppo grande (${(arrayBuffer.byteLength / 1048576).toFixed(1)} MB, ` +
      `max ${MAX_IMPORT_BYTES / 1048576} MB).`
    );
  }
  const XLSX = await loadXLSX();
  const data = new Uint8Array(arrayBuffer);
  return withPrototypePollutionGuard(() => {
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { rows: [], columns: [] };
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
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
  });
};
