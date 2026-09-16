// src/components/documenti/importaDocumenti.js
// L'orchestrazione dell'import massivo: comprimi, carica, riporta l'esito.
//
// ─── PERCHÉ NON STA NEL COMPONENTE ──────────────────────────────────────────
// Perché è la parte che può sbagliare, e in un componente React sarebbe
// verificabile solo montando una modale e simulando mille file. Qui è una
// funzione con tre dipendenze iniettate (`comprimi`, `carica`, `onProgresso`):
// il test le sostituisce e misura l'ordine delle chiamate, la dimensione dei
// blocchi e il comportamento sugli errori.
//
// ─── PERCHÉ A BLOCCHI E NON TUTTI INSIEME ───────────────────────────────────
// Mille `upload` lanciati insieme aprono mille richieste: il browser ne
// accoda la maggior parte, la memoria tiene mille blob compressi in attesa, e
// il primo errore di rete arriva quando ormai sono tutte partite. A blocchi di
// quattro la memoria resta limitata a quattro immagini decodificate, la barra
// di avanzamento avanza davvero mentre lavora, e l'annullamento ha un punto in
// cui fermarsi.
//
// ⛔ `Promise.allSettled` e non `Promise.all`: un file rifiutato (MIME non
// ammesso, troppo grande, RLS) non deve interrompere gli altri 999. È lo
// stesso criterio già adottato per `RESTORE_BACKUP` e `RENAME_CLIENT_IN_TASKS`
// (M-1/M-2 dell'audit del 14 agosto, secondo passaggio).

// Quanti file per blocco. Quattro è il numero di richieste che un browser
// tiene aperte verso lo stesso host senza accodarle (il limite è sei, e due
// vanno lasciate al resto dell'app: la sessione si rinnova e le signed URL si
// firmano mentre l'import gira).
export const DIMENSIONE_BLOCCO = 4;

/**
 * Divide un array in blocchi di `n`. Pura, esportata perché il test della
 * dimensione del blocco non deve passare da un finto uploader.
 *
 * @template T
 * @param {T[]} elementi
 * @param {number} n
 * @returns {T[][]}
 */
export function aBlocchi(elementi, n = DIMENSIONE_BLOCCO) {
  const blocchi = [];
  for (let i = 0; i < (elementi || []).length; i += n) blocchi.push(elementi.slice(i, i + n));
  return blocchi;
}

/**
 * Esegue l'import.
 *
 * @param {object[]} righe          `{ file, passeggero }` già validate dal chiamante
 * @param {object} dipendenze
 * @param {(file: File) => Promise<{blob: Blob, compresso: boolean}>} dipendenze.comprimi
 * @param {(blob: Blob, nomeFile: string, meta: object) => Promise<{error: object|null}>} dipendenze.carica
 * @param {(fatti: number, totale: number) => void} [dipendenze.onProgresso]
 * @param {() => boolean} [dipendenze.annullato]  interroga fra un blocco e
 *   l'altro: l'annullamento NON interrompe un blocco già partito — quei file
 *   sono in volo e fermarli a metà lascerebbe oggetti senza riga.
 * @param {object} [dipendenze.metaComuni]  tipo e note applicati a tutte le righe
 * @returns {Promise<{ caricati: number, falliti: {nomeFile: string, passeggero: string, motivo: string}[], byteRisparmiati: number, interrotto: boolean }>}
 */
export async function importaDocumenti(righe, {
  comprimi, carica, onProgresso, annullato = () => false, metaComuni = {},
}) {
  const esito = { caricati: 0, falliti: [], byteRisparmiati: 0, interrotto: false };
  const totale = (righe || []).length;
  let fatti = 0;

  for (const blocco of aBlocchi(righe)) {
    if (annullato()) { esito.interrotto = true; return esito; }

    const risultati = await Promise.allSettled(blocco.map(async (riga) => {
      const { blob } = await comprimi(riga.file);
      // La dimensione risparmiata si misura qui e non dopo: `riga.file.size` è
      // l'originale, `blob.size` il caricato, e dopo l'upload il file
      // originale può essere già stato rilasciato.
      const risparmio = Math.max(0, (riga.file?.size || 0) - (blob?.size || 0));
      const { error } = await carica(blob, riga.file.name, {
        ...metaComuni,
        passeggero: riga.passeggero,
      });
      if (error) throw new Error(error.message || "Caricamento non riuscito");
      return risparmio;
    }));

    risultati.forEach((r, i) => {
      fatti += 1;
      if (r.status === "fulfilled") {
        esito.caricati += 1;
        esito.byteRisparmiati += r.value || 0;
      } else {
        esito.falliti.push({
          nomeFile: blocco[i].file?.name || "(senza nome)",
          passeggero: blocco[i].passeggero,
          motivo: r.reason?.message || "Errore sconosciuto",
        });
      }
    });
    onProgresso?.(fatti, totale);
  }

  return esito;
}
