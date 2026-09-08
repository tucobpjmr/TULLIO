// src/test/realtime/canaliPrivati.test.js
// A-1 dell'audit dell'8 settembre. L'invariante di FORMA sui canali Realtime.
//
// PERCHÉ UN TEST SUL SORGENTE E NON SUL COMPORTAMENTO. Ciò che questo rilievo
// ha chiuso non è un bug di logica: è un'opzione mancante. `subscribeToPresence`
// e `subscribeToTyping` funzionavano perfettamente — troppo, perché
// funzionavano anche per chi non doveva. Nessun test di comportamento poteva
// accorgersene: il canale pubblico si sottoscrive, riceve e pubblica esattamente
// come quello privato, e la differenza vive nel server di Realtime, non qui.
//
// L'unica cosa che questo lato del confine può garantire è che l'opzione ci
// SIA, su ogni canale che non sia `postgres_changes` — e questa è la garanzia
// che serve, perché il difetto di partenza era esattamente la sua assenza in
// un file che nessuno rileggeva. È lo stesso metodo di
// `src/test/hooks/useUrlStato.test.jsx`, che legge i `case` di
// `VoyageDeskInner.jsx` dal sorgente per confrontarli con il Set delle viste:
// quando la regola è «ogni X del file deve avere Y», il file è il soggetto.
//
// ⚠️ COSA QUESTO TEST NON PROVA, e va detto perché non venga scambiato per la
// verifica del rilievo: che le policy su `realtime.messages` esistano e siano
// giuste. Quello sta nella migrazione 20260908120000 e si misura contro un
// database (vedi la sua nota operativa in coda). Qui si misura solo che il
// client CHIEDA di essere autorizzato. Le due metà sono inseparabili, e questo
// test è la guardia della metà che vive nel repository.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `join(process.cwd(), …)` e non `import.meta.url`: sotto jsdom quest'ultimo
// è un URL http, non file:, e `fileURLToPath` solleva. È la stessa forma già
// usata da src/test/hooks/useUrlStato.test.jsx per leggere VoyageDeskInner.jsx.
const SORGENTE = readFileSync(join(process.cwd(), "src", "lib", "realtime.js"), "utf8");

// Ogni `supabase.channel(...)` del file, con TUTTA la catena che lo segue.
//
// La catena serve: `subscribeToTable` scrive `.channel(...).on('postgres_changes',
// …).subscribe()`, e ciò che distingue quel canale dagli altri due sta nel
// `.on()`, non negli argomenti di `.channel()`. Una prima stesura si fermava
// alla parentesi di `.channel(` e classificava tutti e tre i canali come «da
// proteggere» — cioè il test passava a raccontare una cosa falsa sul file.
//
// Si bilanciano le parentesi (non si cerca il `;`): i corpi dei callback
// contengono punti e virgola, quindi scandire fino al primo `;` taglierebbe a
// caso.
function chiamateChannel(sorgente) {
  const fineArgomenti = (da) => {
    let i = da, profondita = 0;
    do {
      if (sorgente[i] === "(") profondita++;
      else if (sorgente[i] === ")") profondita--;
      i++;
    } while (i < sorgente.length && profondita > 0);
    return i;
  };

  const trovate = [];
  const re = /\.channel\(/g;
  let m;
  while ((m = re.exec(sorgente)) !== null) {
    let i = fineArgomenti(m.index + m[0].length - 1);
    // Continua a consumare i `.metodo(...)` concatenati: è lì che vive il
    // `postgres_changes` che distingue i canali tabellari dagli altri.
    for (;;) {
      let j = i;
      while (j < sorgente.length && /\s/.test(sorgente[j])) j++;
      if (sorgente[j] !== ".") break;
      const apertura = sorgente.indexOf("(", j);
      if (apertura === -1) break;
      i = fineArgomenti(apertura);
    }
    trovate.push(sorgente.slice(m.index, i));
  }
  return trovate;
}

describe("A-1 · i canali realtime non-postgres_changes sono privati", () => {
  const chiamate = chiamateChannel(SORGENTE);

  it("il file dichiara i canali che ci aspettiamo (la regex regge ancora)", () => {
    // Se questa fallisce non è il rilievo a essere tornato: è cambiata la
    // FORMA del file, e il resto del test starebbe misurando il vuoto — che
    // è il modo in cui un controllo passa senza controllare nulla.
    expect(chiamate.length).toBe(3);
  });

  it("presence e broadcast passano private: true", () => {
    // `postgres_changes` è l'unico canale che NON deve essere privato: quelle
    // sottoscrizioni sono già autorizzate da Realtime contro le policy della
    // TABELLA, per conto dell'utente, ed è la metà del protocollo che è sempre
    // stata a posto. Si riconosce dal `.on('postgres_changes'...)` che segue.
    const daProteggere = chiamate.filter((c) => !c.includes("postgres_changes"));
    expect(daProteggere.length).toBe(2);
    for (const chiamata of daProteggere) {
      expect(chiamata).toMatch(/private:\s*true/);
    }
  });

  it("il canale postgres_changes NON è privato", () => {
    // L'invariante opposta, e non è simmetria per eleganza: renderlo privato
    // lo manderebbe a valutare `realtime.messages`, dove nessuna policy nomina
    // i suoi topic — cioè romperebbe l'idratazione realtime di tutta l'app.
    const tabellare = chiamate.filter((c) => c.includes("postgres_changes"));
    expect(tabellare.length).toBe(1);
    expect(tabellare[0]).not.toMatch(/private:\s*true/);
  });

  it("i due topic privati sono quelli che le policy nominano", () => {
    // Il legame fra questo file e la migrazione 20260908120000: le policy
    // sono scritte su `presenza:agenzia` e su `typing:<uuid>`. Se un topic
    // venisse rinominato qui senza toccare le policy, il canale smetterebbe
    // di funzionare in produzione e non lo direbbe nessun test — la RLS nega
    // in silenzio, non spiega.
    expect(SORGENTE).toMatch(/CANALE_PRESENZA\s*=\s*['"]presenza:agenzia['"]/);
    expect(SORGENTE).toMatch(/\.channel\(\s*`typing:\$\{conversationId\}`/);
  });
});
