// src/test/errorReporting.test.js
// Blinda la rete di sicurezza globale (lib/errorReporting.js).
//
// Il valore di questo modulo sta tutto in due proprietà opposte fra loro:
// deve MOSTRARE ciò che oggi muore in console, e deve TACERE su tutto il
// resto. La seconda è quella che si rompe in silenzio — un filtro che smette
// di riconoscere il rumore non fa fallire nulla, produce solo un'app che
// avvisa in continuazione finché qualcuno non spegne l'handler.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installaHandlerGlobali,
  registraSinkErrori,
  _resetErrorReporting,
} from "../../lib/errorReporting.js";

// jsdom non implementa PromiseRejectionEvent: costruiamo un Event normale e
// gli appendiamo `reason`, che è l'unico campo che l'handler legge.
const emettiRejection = (reason) => {
  const ev = new Event("unhandledrejection");
  ev.reason = reason;
  window.dispatchEvent(ev);
};

// jsdom considera "uncaught" un evento `error` che nessun listener annulla e
// lo riporta al runner come fallimento del file. preventDefault lo tiene
// dentro il test: è ciò che fa il browser reale quando l'errore è gestito.
const emettiErrore = (error) => {
  const ev = new Event("error", { cancelable: true });
  ev.error = error;
  window.addEventListener("error", (e) => e.preventDefault(), { once: true });
  window.dispatchEvent(ev);
};

describe("errorReporting", () => {
  let disinstalla;
  let sink;

  beforeEach(() => {
    _resetErrorReporting();
    vi.spyOn(console, "error").mockImplementation(() => {});
    sink = vi.fn();
    disinstalla = installaHandlerGlobali();
    registraSinkErrori(sink);
  });

  afterEach(() => {
    disinstalla();
    _resetErrorReporting();
    vi.restoreAllMocks();
  });

  describe("cattura", () => {
    it("segnala una promise non gestita", () => {
      emettiRejection(new Error("insert fallita"));
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0][0]).toContain("insert fallita");
    });

    it("segnala un errore runtime non gestito", () => {
      emettiErrore(new TypeError("x is not a function"));
      expect(sink).toHaveBeenCalledTimes(1);
      expect(sink.mock.calls[0][0]).toContain("x is not a function");
    });

    it("accetta un motivo che è una stringa e non un Error", () => {
      emettiRejection("colonna inesistente");
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("colonna inesistente"));
    });

    it("non produce mai un messaggio vuoto, nemmeno per un motivo nullo", () => {
      // Un Error serializzato perde message/stack (proprietà non enumerabili)
      // e diventa "{}": è il bug che errText di lib/api.js esiste per evitare.
      emettiRejection(null);
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("errore imprevisto"));
    });

    it("logga in console anche quando nessun sink è registrato", () => {
      registraSinkErrori(null);
      _resetErrorReporting();
      expect(() => emettiRejection(new Error("prima del mount"))).not.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });

  // B-2 · in produzione, un errore di PROGRAMMAZIONE non mostra il testo
  // grezzo (che `ErrorDetails` nasconde nello stesso momento sullo stesso
  // schermo), un errore del DATA LAYER sì — perché porta informazione
  // azionabile (un vincolo respinto) che un `TypeError` interno non porta.
  describe("cosa finisce nel toast, e dove (B-2)", () => {
    afterEach(() => { vi.unstubAllEnvs(); });

    it("in produzione un TypeError NON mostra il messaggio grezzo, mostra un codice", () => {
      vi.stubEnv("DEV", false);
      emettiRejection(new TypeError("Cannot read properties of undefined (reading 'assignees')"));
      expect(sink).toHaveBeenCalledTimes(1);
      const msg = sink.mock.calls[0][0];
      expect(msg).not.toContain("assignees");
      expect(msg).toMatch(/segnala il codice VD-/);
    });

    it("in produzione un errore del data layer resta leggibile", () => {
      vi.stubEnv("DEV", false);
      emettiRejection(new Error("new row violates row-level security policy"));
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("row-level security policy"));
    });

    it("in DEV il TypeError resta leggibile come tutto il resto", () => {
      vi.stubEnv("DEV", true);
      emettiRejection(new TypeError("x is not a function"));
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("x is not a function"));
    });

    it("due TypeError identici ripetuti restano deduplicati (il codice non rompe l'anti-raffica)", () => {
      vi.stubEnv("DEV", false);
      for (let i = 0; i < 5; i++) emettiRejection(new TypeError("stesso errore interno"));
      expect(sink).toHaveBeenCalledTimes(1);
    });
  });

  describe("chunk lazy mancante", () => {
    // Scenario ordinario in produzione: deploy con una scheda aperta, gli hash
    // dei file cambiano, il chunk vecchio risponde 404. Il messaggio generico
    // non direbbe l'unica cosa utile, cioè che va ricaricata la pagina.
    it("dà un messaggio dedicato con l'invito a ricaricare", () => {
      emettiRejection(new Error("Failed to fetch dynamically imported module: /assets/AdminView-a1b2.js"));
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("ricarica la pagina"));
      expect(sink.mock.calls[0][0]).not.toContain("Failed to fetch");
    });

    it("riconosce anche la forma ChunkLoadError", () => {
      const e = new Error("Loading chunk 42 failed");
      e.name = "ChunkLoadError";
      emettiRejection(e);
      expect(sink).toHaveBeenCalledWith(expect.stringContaining("ricarica la pagina"));
    });
  });

  describe("silenzio sul rumore", () => {
    it("ignora il fallimento di caricamento di una risorsa (<img>)", () => {
      // Gli avatar sono <img> con signed URL a scadenza: senza questo filtro
      // una URL scaduta produrrebbe un toast per ogni riga di elenco.
      const img = document.createElement("img");
      document.body.appendChild(img);
      const ev = new Event("error", { bubbles: false });
      Object.defineProperty(ev, "target", { value: img });
      window.dispatchEvent(ev);
      expect(sink).not.toHaveBeenCalled();
      img.remove();
    });

    it("ignora un AbortError (cancellazione volontaria di una fetch)", () => {
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      emettiRejection(e);
      expect(sink).not.toHaveBeenCalled();
    });

    it("ignora il rumore benigno di ResizeObserver", () => {
      emettiErrore(new Error("ResizeObserver loop completed with undelivered notifications."));
      expect(sink).not.toHaveBeenCalled();
    });
  });

  describe("anti-raffica", () => {
    it("mostra una sola volta lo stesso errore ripetuto in rapida sequenza", () => {
      // Una subscription che riaggancia in loop emette lo stesso errore molte
      // volte al secondo: il toast è uno slot singolo e ogni ripetizione lo
      // riscrive senza aggiungere informazione.
      for (let i = 0; i < 5; i++) emettiRejection(new Error("rete non raggiungibile"));
      expect(sink).toHaveBeenCalledTimes(1);
    });

    it("lascia passare errori diversi nella stessa finestra", () => {
      emettiRejection(new Error("primo"));
      emettiRejection(new Error("secondo"));
      expect(sink).toHaveBeenCalledTimes(2);
    });

    it("non sopprime la console, che serve alla diagnosi", () => {
      // È spesso la RIPETIZIONE, non il singolo errore, a rivelare il problema:
      // il dedup vale per l'utente, non per chi ha gli strumenti aperti.
      for (let i = 0; i < 3; i++) emettiRejection(new Error("stesso errore"));
      expect(sink).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(3);
    });

    it("ripropone l'errore dopo la finestra di dedup", () => {
      vi.useFakeTimers();
      try {
        emettiRejection(new Error("rete giù"));
        vi.advanceTimersByTime(5001);
        emettiRejection(new Error("rete giù"));
        expect(sink).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("ciclo di vita del sink", () => {
    it("la deregistrazione ferma i messaggi ma non gli handler", () => {
      const annulla = registraSinkErrori(sink);
      annulla();
      emettiRejection(new Error("dopo lo smontaggio"));
      expect(sink).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("una deregistrazione tardiva non cancella il sink subentrato", () => {
      // Smontaggio e rimontaggio ravvicinati: il cleanup del vecchio effetto
      // gira DOPO che il nuovo si è registrato. Senza il confronto d'identità
      // l'app resterebbe muta pur avendo un sink valido.
      const vecchio = vi.fn();
      const annullaVecchio = registraSinkErrori(vecchio);
      const nuovo = vi.fn();
      registraSinkErrori(nuovo);
      annullaVecchio();

      emettiRejection(new Error("dopo il rimontaggio"));
      expect(nuovo).toHaveBeenCalledTimes(1);
      expect(vecchio).not.toHaveBeenCalled();
    });

    it("disinstalla rimuove entrambi i listener", () => {
      disinstalla();
      emettiRejection(new Error("promise"));
      emettiErrore(new Error("runtime"));
      expect(sink).not.toHaveBeenCalled();
      // Riassegnato perché afterEach lo richiama: disinstallare due volte è
      // innocuo (removeEventListener su un listener assente è un no-op).
      disinstalla = () => {};
    });
  });
});
