// src/lib/cacheScadenza.js
// UNA CACHE IN MEMORIA CHE NON CRESCE PER SEMPRE.
//
// B-1 dell'audit del 10 settembre.
//
// ─── COSA NON C'ERA ────────────────────────────────────────────────────────
//
// Le due cache di signed URL (`lib/api/storage.js`) erano due `Map` nude. Una
// scadenza in realtà l'avevano — ogni voce portava il suo `expiresAt`, e il
// getter lo leggeva — ma nessuno la usava per LIBERARE: una voce scaduta
// veniva saltata e riscritta, mai rimossa. E nulla poneva un tetto al numero
// di chiavi.
//
// Sugli avatar non si vede: le chiavi sono i path degli avatar, cioè al
// massimo quante sono le persone in squadra. Sugli allegati sì: la chiave è il
// path del file, e in una PWA che resta aperta per giorni — i due driver la
// tengono aperta per mestiere — l'insieme dei file aperti in una sessione non
// ha un limite naturale. Ogni voce è una signed URL, qualche centinaio di byte
// di token: nessun singolo click se ne accorge, ed è esattamente il motivo per
// cui una perdita così non si presenta mai come un difetto — si presenta come
// una scheda che dopo tre giorni è diventata lenta.
//
// ─── LE DUE REGOLE, CHE SONO SEPARATE DI PROPOSITO ─────────────────────────
//
//   - la SCADENZA rende il contenuto corretto: una voce scaduta non viene
//     restituita, e viene tolta nell'istante in cui la si guarda;
//   - il TETTO rende il consumo limitato: oltre `tetto` si sacrificano prima
//     le voci scadute (è gratis: nessuno le vuole più) e poi, solo se non
//     bastano, quella usata meno di recente.
//
// Una sola delle due non basterebbe. Senza scadenza il tetto conserverebbe
// URL morte; senza tetto la scadenza da sola non toglie niente a chi non
// torna mai sullo stesso file — che è il caso normale degli allegati.
//
// ⚠️ LA POTATURA È PIGRA, ed è una scelta: una voce scaduta che nessuno
// richiede resta lì finché il tetto non la sfiora. Spazzare l'intera Map a
// ogni lettura costerebbe O(n) su ogni `<Avatar>` montato — cioè pagare a
// ogni render per un problema che è di fine giornata.
//
// ⚠️ NON È UNA CACHE PERSISTENTE e non deve diventarlo: una signed URL è un
// token d'accesso, e `svuotaCacheUrl()` la azzera al logout (B-4 del 5
// settembre). Ciò che deve sopravvivere al reload sta su IndexedDB, e ha un
// modulo suo — `lib/depositoIdb.js`.

/**
 * Il valore è una `string` perché è ciò che serve ai due soli chiamanti (una
 * signed URL). Renderlo generico oggi vorrebbe dire un parametro di tipo in
 * più al posto di un secondo caso d'uso che non esiste.
 *
 * @typedef {{ valore: string, scadeIl: number }} VoceCache
 */

/**
 * @typedef {object} CacheScadenza
 * @property {(chiave: string) => string|null} leggi   il valore se è ancora
 *   buono, `null` se manca o è scaduto (e in quel caso lo rimuove)
 * @property {(chiave: string, valore: string, scadeIl: number) => void} scrivi
 * @property {(chiave: string) => boolean} dimentica   invalida una chiave sola
 * @property {() => void} svuota
 * @property {() => number} conta                      quante voci ci sono ORA,
 *   scadute-ma-non-ancora-potate comprese: è la misura del consumo, non del
 *   contenuto utile
 */

/**
 * @param {{ tetto: number, adesso?: () => number }} opzioni
 *   `adesso` è iniettabile per i test, come in `state/codaScritture.js`:
 *   l'alternativa è un test che aspetta davvero un'ora.
 * @returns {CacheScadenza}
 */
export function creaCacheScadenza({ tetto, adesso = () => Date.now() }) {
  /** @type {Map<string, VoceCache>} */
  const voci = new Map();
  /** @param {VoceCache} v */
  const viva = (v) => v.scadeIl > adesso();

  return {
    leggi(chiave) {
      const v = voci.get(chiave);
      if (!v) return null;
      if (!viva(v)) { voci.delete(chiave); return null; }
      // Rimettere la voce in coda fa dell'ordine di inserimento di `Map`
      // l'ordine di ULTIMO USO: è ciò che rende «la prima chiave» la meno
      // usata di recente, e quindi quella che `scrivi` sacrifica.
      voci.delete(chiave);
      voci.set(chiave, v);
      return v.valore;
    },

    scrivi(chiave, valore, scadeIl) {
      voci.delete(chiave);
      voci.set(chiave, { valore, scadeIl });
      if (voci.size <= tetto) return;
      // Prima le scadute: buttarle non costa una rifirma a nessuno.
      for (const [k, v] of voci) if (!viva(v)) voci.delete(k);
      // Se ancora non bastano, la meno usata di recente — che dopo `leggi` è
      // la prima della Map. Un `while` e non un `if`: il tetto può essere
      // stato abbassato, e in quel caso qui ne avanza più d'una.
      while (voci.size > tetto) {
        const piuVecchia = voci.keys().next().value;
        if (piuVecchia === undefined) break;
        voci.delete(piuVecchia);
      }
    },

    dimentica: (chiave) => voci.delete(chiave),
    svuota: () => voci.clear(),
    conta: () => voci.size,
  };
}
