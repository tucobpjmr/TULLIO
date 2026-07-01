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
