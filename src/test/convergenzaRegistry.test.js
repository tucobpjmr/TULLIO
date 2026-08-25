// A-1 (audit di architettura del 15 agosto) — l'invariante «è andata bene» ha
// UNA definizione, e tutti e tre i registry di scrittura la usano.
//
// PERCHÉ ESISTE. Il rilievo descrive due architetture dati parallele (il core e
// il modulo Liste) — la stessa diagnosi che M-1 del 25 agosto ha ripreso e
// chiuso sull'asse della FORMA delle entry — e la parte che resta vera anche
// dopo la sua revisione è questa: l'invariante «zero righe toccate da una scrittura mirata
// a una riga = rifiuto della RLS» è stata scoperta UNA volta (C-1 del 14
// agosto, secondo passaggio) e poi ri-scoperta DUE volte, in implementazioni
// che non condividevano codice. `lib/esitoScrittura.js` è nato per chiudere
// quella ripetizione — e nomina per esteso i tre consumatori previsti: il
// core, la chat, il modulo Liste.
//
// Al 18 agosto ne aveva due. Il terzo — `listePersistence.js` — era rimasto
// con il proprio `if (error)` scritto a mano, cioè con la cecità che quel
// modulo esiste per togliere. Non produceva un difetto visibile, perché le
// diciotto operazioni del modulo passano tutte da una RPC (che non ritorna un
// conteggio di righe): è precisamente il genere di divergenza che non fallisce
// finché non conta, e allora fallisce in silenzio.
//
// Questo test guarda i SORGENTI e non il comportamento, di proposito. «Questo
// registry userà la definizione condivisa anche per la scrittura che
// aggiungeremo domani» non è una proprietà osservabile a runtime su un
// registry che oggi non ha scritture su tabella: è una proprietà della forma
// del codice, e si verifica leggendola. È lo stesso mestiere del controllo
// `lazy() senza boundary` in verifica:convenzioni.
import { describe, it, expect } from "vitest";

const REGISTRY = {
  "core (hooks/useSyncedDispatch.js)": (await import("../hooks/useSyncedDispatch.js?raw")).default,
  "chat (components/chat/chatCommands.js)": (await import("../components/chat/chatCommands.js?raw")).default,
  "liste (components/liste/listePersistence.js)": (await import("../components/liste/listePersistence.js?raw")).default,
};

// M-1 (audit del 25 agosto) ha portato la definizione un passo più vicino ai
// registry a tabella: il core e le liste non chiamano più `esitoScrittura`
// direttamente ma `erroreDiScrittura` di state/registroScritture.js, che è la
// stessa cosa più il caso «array di risposte» — quello che il core sapeva
// gestire e le liste no. Il modulo condiviso è quindi il terzo modo ammesso di
// conoscere la definizione, e la catena resta UNA sola: il test qui sotto
// verifica anche che quel modulo, a sua volta, importi l'originale.
//
// L'IMPORT, non la chiamata: cercare `esitoScrittura(` prenderebbe anche la
// prosa dei commenti, che in questi file la nominano tutti. L'import c'è se e
// solo se il file la usa davvero — `no-unused-vars` lo toglierebbe.
const IMPORTA_ESITO = /import\s*\{[^}]*\besitoScrittura\b[^}]*\}\s*from\s*["'][^"']*esitoScrittura/;
const IMPORTA_REGISTRO = /import\s*\{[^}]*\berroreDiScrittura\b[^}]*\}\s*from\s*["'][^"']*registroScritture/s;
const CONOSCE_LA_DEFINIZIONE = (testo) => IMPORTA_ESITO.test(testo) || IMPORTA_REGISTRO.test(testo);

const REGISTRO_CONDIVISO = (await import("../state/registroScritture.js?raw")).default;

// ⛔ QUESTO TEST NON VIETA OGNI `if (res.error)`, ed è una precisazione che
// vale la pena scrivere perché la prima stesura ci provava. Un `.error` letto
// a mano è legittimo in tre casi vivi, tutti in chatCommands.js: la pulizia
// degli allegati sullo storage (non è una scrittura su riga, un `count` non
// esiste), la lettura dell'esito di una creazione di conversazione ancora in
// volo, e soprattutto `markReadBulk` — dove ZERO righe toccate è l'esito
// NORMALE (nessun messaggio da segnare come letto) e non un rifiuto. Lo dice
// `esitoScrittura` stessa nel proprio commento: l'adozione è per-metodo, non
// tutto-o-niente. Vietarlo in blocco avrebbe trasformato una guardia in un
// ostacolo, e sarebbe stato l'errore che questo file esiste per non ripetere.
//
// L'invariante verificata è quindi quella vera e sola: ognuno dei tre registry
// CONOSCE la definizione condivisa e la importa. Quale call site debba usarla
// è un giudizio per caso, che il modulo condiviso già motiva.
describe("i tre registry di scrittura condividono la definizione di «è andata bene»", () => {
  it.each(Object.keys(REGISTRY))("%s conosce la definizione condivisa", (nome) => {
    expect(CONOSCE_LA_DEFINIZIONE(REGISTRY[nome])).toBe(true);
  });

  // L'anello in mezzo: se il modulo condiviso smettesse di importare
  // l'originale, i due registry che passano da lui avrebbero una definizione
  // propria senza che nulla lo dica — cioè esattamente la divergenza che
  // questo file esiste per intercettare, spostata di un livello.
  it("il modulo condiviso importa l'originale, non ne riscrive una copia", () => {
    expect(IMPORTA_ESITO.test(REGISTRO_CONDIVISO)).toBe(true);
  });

  it("il controllo positivo: il pattern non passa a vuoto", () => {
    // Senza questo caso quelli sopra passerebbero anche con una regex rotta che
    // non trova mai niente — il modo in cui un controllo smette di controllare
    // restando verde.
    expect(IMPORTA_ESITO.test('import { esitoScrittura } from "../lib/esitoScrittura.js";')).toBe(true);
    expect(IMPORTA_ESITO.test('import { altro } from "../lib/esitoScrittura.js";')).toBe(false);
    expect(IMPORTA_ESITO.test("// esitoScrittura citata solo in un commento")).toBe(false);
    expect(IMPORTA_REGISTRO.test('import { erroreDiScrittura } from "../state/registroScritture.js";')).toBe(true);
    expect(IMPORTA_REGISTRO.test('import { toastErrore } from "../state/registroScritture.js";')).toBe(false);
    expect(CONOSCE_LA_DEFINIZIONE("// nominata solo in un commento")).toBe(false);
  });
});
