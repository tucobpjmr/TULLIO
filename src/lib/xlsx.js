// src/lib/xlsx.js
// ─── PORTA VERSO SHEETJS ────────────────────────────────────────────────────
// Punto d'ingresso unico per leggere e scrivere fogli. Da A-1 dell'audit
// sicurezza del 26 agosto la libreria NON gira più qui: questo modulo parla
// solo con `xlsxWorker.js`, che è l'unico a importarla. Il perché sta scritto
// per intero in testa a quel file; qui c'è il lato che l'applicazione usa.
//
// In breve: `xlsx@0.18.5` è l'ultima versione su npm e porta due CVE
// (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS) che
// non riceveranno mai un fix sul registry. Il parse avviene ora in un realm
// separato e usa-e-getta, quindi un file ostile inquina un prototipo che
// muore col worker invece di quello che tiene il token di sessione — e un
// blocco da ReDoS si chiude con `terminate()` invece di congelare la UI.
//
// ⚠️ Il fix DEFINITIVO resta la migrazione al tarball del CDN, da fare appena
// l'egress verso `cdn.sheetjs.com` è aperto (403 riverificato il 26 agosto):
//   npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
// Il worker non la sostituisce: la rende non urgente.
import { withPrototypePollutionGuard } from "./prototypeGuard.js";

// Limite di dimensione per i file importati: riduce la superficie della ReDoS
// (GHSA-5pgg-2g8v-p4x9), che è amplificata da input molto grandi. Resta
// controllato anche dai due componenti PRIMA di leggere il file in memoria
// (`file.size`), non solo qui dopo.
export const MAX_IMPORT_BYTES = 15 * 1024 * 1024; // 15 MB

// Tetto di tempo per una singola operazione. È la METÀ UTILE della difesa
// contro la ReDoS: il tetto di dimensione riduce la probabilità di incontrarla,
// questo ne limita l'effetto. 30 s è largo per un file legittimo da 15 MB su un
// telefono lento, e strettissimo rispetto a "per sempre", che è quanto durava
// prima un catastrophic backtracking sul thread della UI.
const TIMEOUT_MS = 30_000;

// Chiavi che non devono mai diventare proprietà di un oggetto costruito a
// partire dalle intestazioni di un file altrui. Non è pollution di per sé —
// `Object.fromEntries` crea proprietà PROPRIE anche per "__proto__", quindi il
// prototipo non viene toccato — ma è il nome che, passato più avanti a un
// merge scritto con un assegnamento (`out[k] = v`), la produrrebbe. Si tagliano
// al confine: qui è l'unico punto in cui i dati di un file estraneo entrano
// nell'applicazione, e un solo posto da presidiare è il motivo per cui questa
// porta esiste.
const CHIAVI_PERICOLOSE = new Set(["__proto__", "constructor", "prototype"]);

const righeSicure = (rows) =>
  rows.map((r) => {
    const pulita = {};
    for (const k of Object.keys(r)) {
      if (!CHIAVI_PERICOLOSE.has(k)) pulita[k] = r[k];
    }
    return pulita;
  });

// `withPrototypePollutionGuard` sorveglia questo passaggio, non più il parse.
// Il parse non ne ha più bisogno (gira altrove e quel realm viene buttato);
// questo sì: è codice del thread principale che itera nomi di chiave scelti da
// chi ha preparato il file, ed è l'ultimo punto in cui un errore nostro
// potrebbe trasformarli in una scrittura sul prototipo.
const normalizzaRisposta = (data) =>
  withPrototypePollutionGuard(() => ({
    ...data,
    rows: righeSicure(data.rows ?? []),
  }));

const oltreIlLimite = (byteLength) =>
  new Error(
    `File troppo grande (${(byteLength / 1048576).toFixed(1)} MB, ` +
    `max ${MAX_IMPORT_BYTES / 1048576} MB).`
  );

// Un worker PER OGNI operazione, terminato in ogni uscita. Non è uno spreco da
// ottimizzare con un'istanza condivisa: la vita corta del realm È la difesa.
// Riusare il worker fra due file significherebbe che il primo file ostile
// lascia il prototipo inquinato al secondo, cioè esattamente la proprietà che
// questo disegno esiste per garantire.
function esegui(messaggio) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("./xlsxWorker.js", import.meta.url), { type: "module" });
    } catch (e) {
      // Nessun ripiego in-process, ed è deliberato: leggere il file qui
      // significherebbe eseguire SheetJS nel realm della sessione, cioè
      // rinunciare all'unica proprietà per cui questo modulo è fatto così.
      // Meglio un import che fallisce con un messaggio chiaro.
      reject(new Error(`Impossibile avviare la lettura del file: ${e?.message ?? "worker non disponibile"}`));
      return;
    }

    let chiuso = false;
    const chiudi = () => {
      if (chiuso) return false;
      chiuso = true;
      clearTimeout(timer);
      worker.terminate();
      return true;
    };
    const timer = setTimeout(() => {
      if (chiudi()) {
        reject(new Error(
          "Lettura del file interrotta: sta impiegando troppo tempo. " +
          "Il file potrebbe essere danneggiato o troppo complesso."
        ));
      }
    }, TIMEOUT_MS);

    worker.onmessage = ({ data }) => {
      if (!chiudi()) return;
      if (data.ok) resolve(data);
      else reject(new Error(data.error));
    };
    worker.onerror = (e) => {
      if (!chiudi()) return;
      reject(new Error(e?.message || "lettura del file non riuscita"));
    };

    // Il buffer NON è trasferito: `postMessage` lo copia. Trasferirlo lo
    // renderebbe inutilizzabile nel chiamante, e i due componenti di import
    // tengono il proprio `ArrayBuffer` per rileggerlo quando l'utente cambia
    // la mappatura delle colonne senza ricaricare il file.
    worker.postMessage(messaggio);
  });
}

// Righe del primo foglio, assumendo l'intestazione in riga 0 (CSV/XLSX/XLS
// "normali"). `arrayBuffer` è quello di `FileReader.readAsArrayBuffer`.
//
// Caveat #18: si legge come ArrayBuffer con `type: "array"` (non binary
// string), così SheetJS decodifica correttamente l'UTF-8 dei CSV e rimuove il
// BOM iniziale, evitando il mojibake sugli accenti ("città", "è").
export const readFirstSheetRows = async (
  arrayBuffer,
  { sheetToJsonOpts = { defval: "", raw: false } } = {}
) => {
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) throw oltreIlLimite(arrayBuffer.byteLength);
  const data = await esegui({ op: "rows", buffer: arrayBuffer, sheetToJsonOpts });
  return normalizzaRisposta(data).rows;
};

// Variante che non assume la riga 0 come intestazione: legge il foglio come
// griglia grezza e individua la riga header via `detectHeaderRowIndex`.
// `hints` sono le parole chiave di dominio attese nell'intestazione.
export const readFirstSheetRowsAutoHeader = async (arrayBuffer, hints) => {
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) throw oltreIlLimite(arrayBuffer.byteLength);
  const data = await esegui({ op: "autoHeader", buffer: arrayBuffer, hints });
  const { rows, columns } = normalizzaRisposta(data);
  return { rows, columns: columns ?? [] };
};

// Export: costruisce il .xlsx nel worker e restituisce il Blob da scaricare.
// Sostituisce il vecchio `loadXLSX()` + `XLSX.writeFile()` del pannello Admin,
// che era il secondo punto in cui la libreria entrava nel thread principale —
// e, per il bundle, il motivo per cui ne sarebbero esistite due copie.
export const scriviFoglioXlsx = async (rows, sheetName = "Foglio1") => {
  const { buffer } = await esegui({ op: "write", rows, sheetName });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
};
