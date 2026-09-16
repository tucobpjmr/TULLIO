// src/lib/comprimiImmagine.js
// Ridimensiona e ricomprime un'immagine PRIMA di caricarla su Storage.
//
// ─── PERCHÉ ESISTE ──────────────────────────────────────────────────────────
// L'archivio dei documenti di identità nasce con ~1000 file attesi, e i file
// sono foto scattate col telefono: 2-5 MB l'una, cioè 2-5 GB di bucket. Il
// progetto Supabase sta sul piano Free (1 GB di Storage; la scelta è
// dichiarata — vedi B-2/ST-14 in docs/AUDIT_ARCHITETTURA_2026-08-11.md), e
// quei file non ci starebbero. A 1600px di lato lungo e qualità 0.8 la stessa
// foto pesa ~300 kB: ~300 MB per l'intero archivio, dentro il piano con
// margine, e la banda MRZ in fondo al passaporto resta leggibile — che è
// l'unica proprietà del documento che la compressione potrebbe far perdere.
//
// ─── COSA NON FA, E PERCHÉ ──────────────────────────────────────────────────
// Non tocca i PDF: una scansione PDF non si ricomprime con una canvas, e
// tentarlo la rasterizzerebbe perdendo il testo selezionabile. Chi chiama
// passa il file così com'è (il tetto di 10 MB del bucket resta il limite) —
// vedi `comprimiSePossibile`.
//
// Non ritaglia e non ruota: un documento di identità va archiviato com'è
// stato fotografato. È la differenza con `ui/CropModal.jsx`, che usa la
// stessa tecnica canvas ma per uno scopo opposto (un avatar quadrato da una
// foto qualsiasi) — ed è la ragione per cui questo file esiste accanto a
// quello invece di estenderlo.

// Lato lungo massimo dell'immagine prodotta, in pixel.
//
// 1600 non è un numero tondo scelto a caso: la banda MRZ di un passaporto è
// alta ~1/8 della pagina, quindi su un'immagine da 1600px di lato lungo
// occupa ~200px — abbastanza perché i caratteri OCR-B restino distinguibili a
// occhio e in stampa. Sotto i 1200 cominciano a impastarsi.
export const LATO_MASSIMO = 1600;

// 0.8: la soglia sotto cui il JPEG inizia a mostrare artefatti visibili sui
// bordi netti del testo — che in un documento sono l'informazione.
export const QUALITA_JPEG = 0.8;

// Formati che questa funzione sa ricomprimere. HEIC/HEIF NON sono qui: Safari
// li decodifica, Chrome e Firefox no, e un `createImageBitmap` che fallisce a
// metà import lascerebbe l'utente senza spiegazione. Passano invece intatti
// (vedi `comprimiSePossibile`), e a quel punto è il tetto del bucket a
// decidere — che per una HEIC da telefono, formato già efficiente, basta.
const RICOMPRIMIBILI = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Le dimensioni di destinazione: l'immagine rimpicciolita finché il lato
 * lungo sta in `lato`, mantenendo le proporzioni. Un'immagine già più piccola
 * NON viene ingrandita — si tornerebbe indietro sulla qualità pagando in byte.
 *
 * Pura e testabile senza DOM: è la sola parte di questo modulo su cui si possa
 * sbagliare un conto.
 *
 * @param {number} larghezza
 * @param {number} altezza
 * @param {number} [lato]
 * @returns {{ larghezza: number, altezza: number }}
 */
export function dimensioniRidotte(larghezza, altezza, lato = LATO_MASSIMO) {
  const w = Number(larghezza) || 0;
  const h = Number(altezza) || 0;
  if (w <= 0 || h <= 0) return { larghezza: 0, altezza: 0 };
  const massimo = Math.max(w, h);
  if (massimo <= lato) return { larghezza: Math.round(w), altezza: Math.round(h) };
  const fattore = lato / massimo;
  // `max(1, …)` perché un'immagine estremamente allungata (una scansione a
  // striscia) potrebbe arrotondare il lato corto a 0, e una canvas 1600×0
  // produce un blob vuoto invece di un errore.
  return {
    larghezza: Math.max(1, Math.round(w * fattore)),
    altezza: Math.max(1, Math.round(h * fattore)),
  };
}

/**
 * True se questo file è un'immagine che sappiamo ricomprimere.
 * @param {File|Blob} file
 */
export const ricomprimibile = (file) =>
  RICOMPRIMIBILI.includes(String(file?.type || '').split(';')[0].trim());

/**
 * Decodifica il file in qualcosa che `drawImage` accetta.
 *
 * `createImageBitmap` è la strada diretta e non tocca il DOM; il fallback con
 * `<img>` + object URL copre i browser che non ce l'hanno e i casi in cui la
 * decodifica nativa rifiuta un file che l'elemento invece accetta. Entrambi i
 * rami revocano l'object URL: senza, ogni file importato tratterrebbe in
 * memoria la propria copia fino al reload — su un import da 1000 file non è
 * un dettaglio.
 */
async function decodifica(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Cade nel fallback: un formato che la decodifica nativa rifiuta può
      // comunque essere gestito da <img> (è il caso di certe JPEG con
      // metadati malformati prodotte da scanner datati).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((risolvi, rifiuta) => {
      const img = new Image();
      img.onload = () => risolvi(img);
      img.onerror = () => rifiuta(new Error('immagine non decodificabile'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Comprime un'immagine in JPEG, ridimensionata a `LATO_MASSIMO`.
 *
 * @param {File|Blob} file
 * @param {{ lato?: number, qualita?: number }} [opzioni]
 * @returns {Promise<Blob>} il JPEG prodotto
 * @throws se il file non è decodificabile o la canvas non produce un blob
 */
export async function comprimiImmagine(file, { lato = LATO_MASSIMO, qualita = QUALITA_JPEG } = {}) {
  const sorgente = await decodifica(file);
  const w = sorgente.width || sorgente.naturalWidth;
  const h = sorgente.height || sorgente.naturalHeight;
  const { larghezza, altezza } = dimensioniRidotte(w, h, lato);
  if (!larghezza || !altezza) throw new Error('immagine di dimensioni non valide');

  const canvas = document.createElement('canvas');
  canvas.width = larghezza;
  canvas.height = altezza;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas non disponibile');
  // Il fondo bianco conta per i PNG con trasparenza: senza, le zone
  // trasparenti diventano NERE nel JPEG, che su una scansione con i bordi
  // ritagliati significa un documento incorniciato di nero.
  //
  // ⚠️ NON è un token di tema, e non deve diventarlo: questo bianco finisce
  // COTTO dentro il JPEG che si archivia, non dipinto a schermo. Legarlo a
  // `--card` significherebbe che un documento caricato col tema scuro attivo
  // resta scuro per sempre, su ogni schermo e in stampa. Per la stessa ragione
  // è la parola chiave CSS e non un esadecimale: `verifica:convenzioni` conta
  // gli esadecimali fuori da `src/styles/` perché sono interfaccia sfuggita ai
  // token, e questo non è interfaccia.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, larghezza, altezza);
  ctx.drawImage(sorgente, 0, 0, larghezza, altezza);
  // `close()` solo se è un ImageBitmap: libera subito la memoria della
  // decodifica invece di aspettare il garbage collector, che su un import di
  // mille file arriva troppo tardi.
  sorgente.close?.();

  const blob = await new Promise((risolvi) => canvas.toBlob(risolvi, 'image/jpeg', qualita));
  if (!blob) throw new Error('compressione non riuscita');
  return blob;
}

/**
 * La forma con cui la chiama chi importa: comprime se può, altrimenti
 * restituisce il file originale invece di fallire.
 *
 * Il contratto è deliberatamente indulgente. Un import da 1000 file non deve
 * fermarsi perché uno era un HEIC o perché una canvas ha fallito su un
 * browser esotico: il file passa così com'è e la dimensione la giudica il
 * bucket. Il chiamante distingue i due esiti da `compresso`, che serve a dire
 * all'utente quanto ha risparmiato — non a decidere se procedere.
 *
 * @param {File} file
 * @param {{ lato?: number, qualita?: number }} [opzioni]
 * @returns {Promise<{ blob: Blob|File, compresso: boolean, tipo: string }>}
 */
export async function comprimiSePossibile(file, opzioni) {
  if (!ricomprimibile(file)) {
    return { blob: file, compresso: false, tipo: file?.type || 'application/octet-stream' };
  }
  try {
    const blob = await comprimiImmagine(file, opzioni);
    // Se la compressione ha prodotto un file PIÙ GRANDE dell'originale si
    // tiene l'originale: succede sulle foto già piccole, dove il
    // ricampionamento JPEG aggiunge byte senza aggiungere pixel. Comprimere
    // per peggiorare sarebbe il contrario del motivo per cui questo modulo
    // esiste.
    if (blob.size >= file.size) return { blob: file, compresso: false, tipo: file.type };
    return { blob, compresso: true, tipo: 'image/jpeg' };
  } catch {
    return { blob: file, compresso: false, tipo: file?.type || 'application/octet-stream' };
  }
}
