// src/lib/xlsxWorker.js
// L'UNICO modulo del progetto che importa SheetJS.
//
// ─── PERCHÉ (A-1 dell'audit sicurezza del 26 agosto) ────────────────────────
//
// `xlsx@0.18.5` è l'ultima versione pubblicata sul registry npm — gli autori
// rilasciano le successive, con i fix, solo sul proprio CDN — e porta due
// vulnerabilità note:
//   • GHSA-4r6h-8v6p-xvw6 (CVE-2023-30533) Prototype Pollution — fix in 0.19.3+
//   • GHSA-5pgg-2g8v-p4x9 (CVE-2024-22363) ReDoS                — fix in 0.20.2+
// L'egress verso `cdn.sheetjs.com` è bloccato da questo ambiente (403,
// riverificato quattro volte fra il 6 e il 26 agosto), quindi la migrazione
// alla 0.20.3 non è applicabile qui: resta il fix DEFINITIVO da eseguire
// appena la rete lo consenta, con `npm install --save
// https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
//
// Fino ad allora la difesa era `withPrototypePollutionGuard`, che confronta i
// descrittori dei prototipi prima e dopo il parse. Funziona, ma va
// contabilizzata per ciò che è: una RILEVAZIONE A POSTERIORI. Se un gadget si
// innesca durante il parse, quando il guard se ne accorge è già stato
// eseguito — nel realm che tiene il token di sessione in `localStorage`.
//
// Questo file cambia la categoria della difesa da rilevare a CONTENERE. Il
// parse avviene in un realm separato e USA-E-GETTA: il worker viene creato per
// ogni file e terminato subito dopo la risposta, quindi il prototipo che un
// file ostile riesce a inquinare è quello del worker, e muore con lui. Il
// contesto che tiene la sessione non esegue mai una riga di SheetJS.
//
// È anche l'unica forma che dà una risposta alla ReDoS. Il tetto di
// dimensione (`MAX_IMPORT_BYTES`) ne riduce la superficie ma non la elimina:
// un `.csv` da pochi kB con la cella giusta blocca comunque il thread che lo
// parsa. Su quel thread — prima — non c'era niente da fare, era quello che
// disegna la UI. Un worker si può invece TERMINARE: il timeout in `xlsx.js`
// trasforma un blocco permanente dell'applicazione in un file rifiutato.
//
// ⚠️ NON importare `xlsx` da nessun altro punto del progetto. Vale per il
// parse E per la scrittura (l'export Excel del pannello Admin passa da
// `op: "write"` qui sotto): un secondo import altrove non solo riporterebbe la
// libreria nel realm principale, ma ne duplicherebbe ~430 kB nel bundle,
// perché Vite emetterebbe due chunk distinti. Il divieto è presidiato da
// `VIETATO_XLSX_FUORI_DAL_WORKER` in eslint.config.js.
import { read, utils, write } from "xlsx";
import { righeDaGriglia } from "./xlsxHeader.js";

// `self` in un module worker è un DedicatedWorkerGlobalScope, ma jsconfig.json
// carica la lib DOM (giusto per il resto di src/, che è un'app React) e lì
// `self` è una Window: `postMessage` risulta quindi quello con `targetOrigin`,
// e la lista dei transferable non tipa. Il cast è ristretto a questo alias
// invece di essere sparso sui tre call site — e resta l'unico `any` del file.
/** @type {{ onmessage: ((e: MessageEvent) => void) | null, postMessage: (m: unknown, t?: Transferable[]) => void }} */
const ambito = /** @type {any} */ (self);

// Le opzioni del parse sono FISSE e non arrivano dal messaggio: `cellHTML`
// e `cellFormula` sono le due che fanno produrre a SheetJS contenuto che un
// chiamante potrebbe poi riversare nella pagina, e nessuno dei tre call site
// le usa. Lasciarle configurabili dal messaggio significherebbe che il modo
// più pericoloso di chiamare questo worker è a un parametro di distanza.
/** @type {import("xlsx").ParsingOptions} */
const OPZIONI_LETTURA = { type: "array", cellDates: true, cellHTML: false, cellFormula: false };

const primoFoglio = (buffer) => {
  const wb = read(new Uint8Array(buffer), OPZIONI_LETTURA);
  return wb.Sheets[wb.SheetNames[0]] ?? null;
};

ambito.onmessage = ({ data }) => {
  try {
    if (data.op === "rows") {
      const sheet = primoFoglio(data.buffer);
      ambito.postMessage({ ok: true, rows: sheet ? utils.sheet_to_json(sheet, data.sheetToJsonOpts) : [] });
      return;
    }

    if (data.op === "autoHeader") {
      const sheet = primoFoglio(data.buffer);
      if (!sheet) { ambito.postMessage({ ok: true, rows: [], columns: [] }); return; }
      const grid = utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
      const { rows, columns } = righeDaGriglia(grid, data.hints);
      ambito.postMessage({ ok: true, rows, columns });
      return;
    }

    if (data.op === "write") {
      const ws = utils.json_to_sheet(data.rows);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, data.sheetName || "Foglio1");
      // `type: "array"` e non `writeFile`: il download lo fa il thread
      // principale, che è l'unico ad avere un DOM. Il buffer torna indietro
      // trasferito, non copiato.
      const buffer = write(wb, { type: "array", bookType: "xlsx" });
      ambito.postMessage({ ok: true, buffer }, [buffer]);
      return;
    }

    ambito.postMessage({ ok: false, error: `operazione sconosciuta: ${data.op}` });
  } catch (e) {
    // Il messaggio dell'errore, non l'oggetto: un Error non sempre attraversa
    // structured clone con lo stack intatto, e qui serve solo il testo.
    ambito.postMessage({ ok: false, error: e?.message ?? "lettura del file non riuscita" });
  }
};
