// Il contratto comune ai due registry di scrittura — M-1 dell'audit del 25
// agosto.
//
// PERCHÉ ESISTE. `PERSISTENCE` (il core) e `LISTE_WRITES` (il modulo Liste)
// appartengono a due famiglie: il primo è OTTIMISTICO — lo stato cambia subito
// e si compensa se la scrittura fallisce — il secondo CONFERMA PRIMA, cioè non
// mostra nulla che il database non abbia già scritto. Quella differenza era
// dichiarata a parole in cima a listePersistence.js («COSA NON FA, DI
// PROPOSITO»), e una prosa non è un controllo: bastava una entry nuova con un
// `rollback` copiato dal core perché il modulo diventasse per metà ottimistico
// senza che niente lo segnalasse.
//
// Qui si misura ciò che quelle parole affermavano.
import { describe, it, expect, vi } from "vitest";

// Qui si guarda la FORMA delle entry, non il round-trip di rete: il client
// Supabase non va istanziato (senza VITE_SUPABASE_URL non si costruisce
// affatto) e i due data layer sono spie che nessuno chiama.
vi.mock("../lib/supabase", () => ({ supabase: {}, default: {} }));
vi.mock("../lib/api.js", () => new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }));
vi.mock("../components/liste/listeApi.js", () => ({
  ListeAPI: new Proxy({}, { get: () => vi.fn() }),
}));

const { PERSISTENCE } = await import("../state/persistence.js");
const { LISTE_WRITES } = await import("../components/liste/listePersistence.js");
const {
  CAMPI_COMUNI, CAMPI_OTTIMISTICI, CAMPI_CONFERMA_PRIMA,
  erroreDiScrittura, messaggioSuccesso, testoErrore, toastErrore, toastSuccesso,
} = await import("../state/registroScritture.js");
const { RIFIUTO_RLS } = await import("../lib/esitoScrittura.js");

const voci = (registry) => Object.entries(registry);

describe("vocabolario delle entry", () => {
  // Un campo scritto male (`mapErrror`, `sucessMsg`) oggi non produce alcun
  // errore: la entry viene eseguita senza quel comportamento, in silenzio. È
  // il tipo di difetto che si scopre quando un utente segnala che un messaggio
  // non compare mai.
  it("il core usa solo i campi della famiglia ottimistica", () => {
    const ammessi = new Set([...CAMPI_COMUNI, ...CAMPI_OTTIMISTICI]);
    for (const [nome, spec] of voci(PERSISTENCE)) {
      for (const campo of Object.keys(spec)) {
        expect(ammessi.has(campo), `${nome}: campo "${campo}" non dichiarato`).toBe(true);
      }
    }
  });

  it("le liste usano solo i campi della famiglia «conferma prima»", () => {
    const ammessi = new Set([...CAMPI_COMUNI, ...CAMPI_CONFERMA_PRIMA]);
    for (const [nome, spec] of voci(LISTE_WRITES)) {
      for (const campo of Object.keys(spec)) {
        expect(ammessi.has(campo), `${nome}: campo "${campo}" non dichiarato`).toBe(true);
      }
    }
  });

  it("entrambi i registry nominano l'operazione allo stesso modo", () => {
    for (const [nome, spec] of [...voci(PERSISTENCE), ...voci(LISTE_WRITES)]) {
      expect(spec.persist, `${nome} senza persist`).toBeTypeOf("function");
    }
  });
});

describe("le due famiglie", () => {
  // Il cuore del rilievo: la famiglia non è un'etichetta, è una conseguenza
  // verificabile. Un registry che non mostra mai uno stato non confermato non
  // ha nulla da compensare (`rollback`), nulla in volo da proteggere da un
  // refetch concorrente (`entityId`) e nessun dispatch da arricchire prima che
  // avvenga (`normalize`).
  it("«conferma prima» non compensa, non marca scritture in volo, non normalizza", () => {
    for (const [nome, spec] of voci(LISTE_WRITES)) {
      for (const campo of CAMPI_OTTIMISTICI) {
        expect(spec[campo], `${nome}: "${campo}" appartiene alla famiglia ottimistica`)
          .toBeUndefined();
      }
    }
  });

  // Il verso opposto: il core È ottimistico, quindi almeno una entry deve
  // usare ciascuno di quei campi. Se un giorno non fosse più vero, la famiglia
  // sarebbe cambiata e questo file va riscritto insieme al resto — non è un
  // dettaglio che possa scivolare via in silenzio.
  it("la famiglia ottimistica del core è usata davvero", () => {
    for (const campo of CAMPI_OTTIMISTICI) {
      const quante = voci(PERSISTENCE).filter(([, spec]) => spec[campo]).length;
      expect(quante, `nessuna entry del core dichiara "${campo}"`).toBeGreaterThan(0);
    }
  });

  // Il successo delle liste si annuncia DOPO la conferma, quindi il messaggio
  // vive nella entry; nel core si annuncia prima (lo accoda il reducer) e va
  // semmai ritirato — per questo `successMsg` non esiste di là.
  it("solo «conferma prima» porta il messaggio di successo nella entry", () => {
    const conMessaggio = voci(LISTE_WRITES).filter(([, s]) => s.successMsg).length;
    expect(conMessaggio).toBeGreaterThan(0);
    expect(voci(PERSISTENCE).filter(([, s]) => s.successMsg)).toEqual([]);
  });
});

describe("primitive condivise", () => {
  it("erroreDiScrittura legge sia il singolo esito sia l'array", () => {
    expect(erroreDiScrittura({ error: null })).toBeNull();
    expect(erroreDiScrittura([{ error: null }, { error: null }])).toBeNull();
    const boom = { message: "boom" };
    expect(erroreDiScrittura([{ error: null }, { error: boom }])).toBe(boom);
  });

  // Il caso che nessuno dei due registry vedeva da solo: la RLS che rifiuta
  // senza errore, riconosciuta dal conteggio di righe a zero.
  it("erroreDiScrittura riconosce il rifiuto silenzioso della RLS", () => {
    expect(erroreDiScrittura({ error: null, count: 0 })).toBe(RIFIUTO_RLS);
    expect(erroreDiScrittura([{ error: null, count: 1 }, { error: null, count: 0 }]))
      .toBe(RIFIUTO_RLS);
  });

  it("testoErrore preferisce mapError, poi il messaggio, poi il ripiego", () => {
    expect(testoErrore({ mapError: () => "tradotto" }, { message: "grezzo" })).toBe("tradotto");
    expect(testoErrore({}, { message: "grezzo" })).toBe("grezzo");
    expect(testoErrore({}, {}, "ripiego")).toBe("ripiego");
    expect(testoErrore({}, undefined)).toBe("errore sconosciuto");
  });

  it("messaggioSuccesso accetta stringa, funzione degli argomenti, o niente", () => {
    expect(messaggioSuccesso({ successMsg: "fatto" })).toBe("fatto");
    expect(messaggioSuccesso({ successMsg: (n) => `${n} righe` }, [3])).toBe("3 righe");
    expect(messaggioSuccesso({})).toBeNull();
  });

  // Prima erano «Salvataggio fallito: …» nel core e «Errore: …» nelle liste:
  // due frasi per lo stesso evento davanti allo stesso utente.
  it("i due registry dicono la stessa frase per lo stesso evento", () => {
    expect(toastErrore("rete caduta")).toEqual({
      type: "SHOW_TOAST",
      payload: { type: "error", message: "Salvataggio fallito: rete caduta" },
    });
    expect(toastSuccesso("Lista creata")).toEqual({
      type: "SHOW_TOAST",
      payload: { type: "success", message: "Lista creata" },
    });
  });
});
