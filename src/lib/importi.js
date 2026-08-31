// src/lib/importi.js
// COME SI LEGGE UN IMPORTO SCRITTO DA UNA PERSONA, scritto una volta.
//
// C-1 e M-1 dell'audit di codebase del 31 agosto.
//
// ─── COSA SI ROMPEVA ───────────────────────────────────────────────────────
//
// `parseImporto` viveva in `components/liste/listeFormato.js` ed era:
//
//     parseFloat(String(raw ?? '').replace(',', '.'))
//
// `.replace(',', '.')` sostituisce LA PRIMA virgola e `parseFloat` si ferma al
// secondo punto. Su `"1.250,00"` — che diventa `"1.250.00"` — restituiva
// **1,25**. Non un errore: un numero valido, mille volte più piccolo di quello
// digitato.
//
// Nessuno strato lo intercettava. Il valore non è `null`, quindi
// `interpretabile()` di `lib/validators.js` lo accettava e nessun `FieldError`
// compariva; è diverso da zero, quindi il `check (importo <> 0)` di
// `movimenti_lista` lo accettava; sta comodamente dentro `numeric(12,2)`.
// Entrava nel saldo del buono viaggio, nel riepilogo che il cliente riceve e
// nella copia Word che esce dall'agenzia — cioè, dice il preambolo di
// `listeDocumenti.js`, «proprio quella in cui una cifra sbagliata è più
// difficile da smentire».
//
// La parte peggiore è che il sistema suggeriva il formato che sbagliava: il
// messaggio di `components/liste/regoleMovimento.js` è, alla lettera,
// «Importo non valido: usa una cifra come 1.250,00.»
//
// ─── PERCHÉ IL FILE STA QUI E NON NEL MODULO LISTE (M-1) ───────────────────
//
// La stessa regola di dominio era scritta DUE VOLTE, e le due divergevano:
// `scripts/importa-liste/parser.js` aveva `aNumero`, che toglie i punti PRIMA
// di tradurre la virgola e legge `1.250,00` correttamente. L'import in blocco
// interpretava bene gli importi; il form che l'operatore usa ogni giorno no.
//
// Non è il caso previsto dal preambolo di `_shared/requireActiveAdmin.ts` («i
// controlli duplicati non divergono: restano uguali e sbagliati insieme»): è
// la variante peggiore, in cui una delle due copie è giusta e nessuno se ne
// accorge, perché nessun test le confronta.
//
// L'interpretazione di un importo non appartiene al modulo Liste: appartiene
// all'applicazione, come `dates.js` per le date e `validators.js` per le
// regole di campo. Sta perciò in `src/lib/` — che è anche una delle due
// cartelle sotto `checkJs` (`jsconfig.json`), cioè dove un tipo sbagliato
// costa di più — ed è importata dai due call site: `listeFormato.js` la
// ri-esporta per i suoi dodici importatori, `scripts/importa-liste/parser.js`
// la importa direttamente (come già fa con `chiaveCliente`).
//
// ⛔ Non reintrodurre un'interpretazione locale accanto a un form. Se un
// domani servisse leggere un importo altrove — un import CSV, un campo di
// budget — il posto è questo file, non il componente che ne ha bisogno.

/**
 * Interpreta la cifra così come l'ha scritta una persona, senza giudicarla:
 * ritorna il numero (segno digitato compreso) o `null` se non è un numero.
 *
 * ─── LA REGOLA SUL PUNTO, che è l'unica cosa non ovvia ─────────────────────
 *
 * In italiano il punto raggruppa le migliaia (`1.250,00`) e la virgola separa
 * i decimali; nella notazione inglese è il contrario (`12.50`). Chi digita in
 * un gestionale usa entrambe, spesso nella stessa giornata, e il parser deve
 * accettarle tutte e due senza chiedere.
 *
 * Il criterio che le distingue senza ambiguità è **quante cifre il punto
 * raggruppa**:
 *
 *   - c'è una virgola  → la virgola è il decimale, TUTTI i punti sono
 *                        migliaia. `1.250,00` → 1250 ; `1250,5` → 1250.5
 *   - nessuna virgola, e i punti raggruppano esattamente tre cifre
 *                      → sono migliaia. `1.250` → 1250 ; `1.234.567` → 1234567
 *   - nessuna virgola, e il punto ne raggruppa una o due
 *                      → è un decimale all'inglese. `12.50` → 12.5
 *
 * ⚠️ `1.250` È GENUINAMENTE AMBIGUO e la regola sopra lo risolve come **1250**,
 * non come 1,25. Non è una deduzione: è una scelta, ed è quella che
 * `scripts/importa-liste/parser.js` prendeva già — cioè l'unica che non
 * reintroduce lo scarto fra le due copie che M-1 chiude. Chi intende un euro e
 * venticinque scrive `1,25`, che questa funzione legge senza ambiguità.
 *
 * `Number` e non `parseFloat`: `parseFloat("12abc")` vale 12 — legge il
 * PREFISSO di ciò che non è un numero e trasforma una battitura sbagliata in
 * un movimento valido (B-1 dello stesso audit). `Number("12abc")` è `NaN`,
 * cioè un rifiuto, che è la risposta giusta.
 *
 * @param {unknown} grezzo  ciò che l'utente ha digitato
 * @returns {number|null}   il numero, o `null` se la stringa non lo è
 */
export function aNumero(grezzo) {
  let s = String(grezzo ?? '').replace(/\s/g, '');
  // `Number('')` vale 0, non NaN: senza questa riga una casella vuota
  // diventerebbe uno zero invece di un rifiuto.
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Le cifre conservate da `numeric(12,2)`, la colonna `movimenti_lista.importo`.
 *
 * L'arrotondamento è QUI e non a database per una ragione sola: Postgres lo
 * farebbe comunque, in silenzio, e a schermo resterebbe la cifra digitata —
 * cioè un numero diverso da quello salvato, che è la stessa classe di difetto
 * di C-1 in scala ridotta. `scripts/importa-liste/parser.js` arrotondava già
 * così (`Number(valore.toFixed(2))`); ora lo fanno entrambi nello stesso punto.
 */
const CENTESIMI = 2;

/**
 * L'importo di un MOVIMENTO: l'interpretazione di `aNumero` più le due regole
 * che valgono solo qui.
 *
 * 1. **Il segno lo decide il form, non la tastiera.** `AddMovBox` e
 *    `EditMovimentoModal` hanno un selettore dare/avere (`SegnoSeg`), e quello
 *    è la fonte di verità: un `-` digitato per abitudine dentro la casella non
 *    deve poterlo contraddire. Da qui `Math.abs()` prima di applicare `segno`.
 * 2. **Zero non è un movimento.** Lo rifiuta anche il database
 *    (`check (importo <> 0)` in `20260713174309_modulo_buoni_liste_viaggio.sql`):
 *    intercettarlo qui evita il round-trip e dà un messaggio in italiano sotto
 *    il campo invece di un `check_violation`.
 *
 * L'ordine conta: si arrotonda PRIMA di confrontare con zero, altrimenti
 * `0,004` — che a database diventerebbe `0.00` e violerebbe il check —
 * passerebbe di qui come valido.
 *
 * @param {unknown} raw    ciò che l'utente ha digitato
 * @param {number} [segno] 1 (entrata) o -1 (uscita); qualunque altro valore
 *                         non negativo vale 1
 * @returns {number|null}  l'importo con segno, o `null` se non è interpretabile
 */
export function parseImporto(raw, segno = 1) {
  const n = aNumero(raw);
  if (n === null) return null;
  const arrotondato = Number(Math.abs(n).toFixed(CENTESIMI));
  if (arrotondato === 0) return null;
  return arrotondato * (segno < 0 ? -1 : 1);
}
