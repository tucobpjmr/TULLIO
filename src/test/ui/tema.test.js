// Il tema scuro — M-4 dell'audit del 10 settembre.
//
// Due cose da tenere ferme, e nessuna delle due è «i colori sono belli».
//
//   1. LA PALETTE SCURA È COMPLETA. Un token dichiarato in `:root` e
//      dimenticato nei due blocchi scuri non produce alcun errore: resta al
//      valore chiaro, cioè un fondo bianco in mezzo al buio o un testo scuro
//      su scuro. È lo stesso tipo di guasto silenzioso che
//      `variabiliCss.test.js` intercetta per le variabili inventate.
//   2. I DUE BLOCCHI SCURI DICONO LA STESSA COSA. Sono duplicati per forza
//      (il CSS non sa dare un nome a un gruppo di dichiarazioni), e un
//      duplicato che diverge è peggio di nessun duplicato: chi sceglie
//      «scuro» a mano vedrebbe un'app diversa da chi lo eredita dal sistema.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import {
  TEMI, ETICHETTE_TEMA, CHIAVE_TEMA, leggiTema, salvaTema, applicaTema, temaEffettivo,
} from "../../lib/tema.js";

const css = readFileSync("src/styles/global.css", "utf8");

// I nomi dichiarati dentro un blocco, dato il suo selettore. Il corpo si
// prende fino alla prima `}` — questi blocchi non ne annidano.
const tokenDi = (selettore) => {
  const i = css.indexOf(selettore);
  expect(i, `selettore assente: ${selettore}`).toBeGreaterThan(-1);
  const corpo = css.slice(i + selettore.length, css.indexOf("}", i));
  return new Set([...corpo.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map(m => m[1]));
};

// Il `:root` della palette è il secondo del file: il primo dichiara le sole
// safe-area. Lo si individua dal token che apre la palette, non dall'ordine.
const palette = tokenDi(":root {\n  --navy");

describe("la palette scura", () => {
  const sceltaEsplicita = tokenDi(':root[data-tema="scuro"] {');
  const daSistema = tokenDi(':root:not([data-tema="chiaro"]) {');

  it("copre ogni token della palette chiara", () => {
    const mancanti = [...palette].filter(t => !sceltaEsplicita.has(t));
    expect(mancanti, `token senza valore scuro: ${mancanti.join(", ")}`).toEqual([]);
  });

  it("dice la stessa cosa nei due blocchi", () => {
    expect([...daSistema].sort()).toEqual([...sceltaEsplicita].sort());
  });

  it("dichiara color-scheme, che è ciò che scurisce anche il browser", () => {
    // Senza, restano chiari gli elementi che disegna il browser e non noi:
    // barre di scorrimento, campi di data, autocomplete. L'app sarebbe scura
    // con dentro dei rettangoli bianchi.
    expect(sceltaEsplicita.has("--focus")).toBe(true);
    const i = css.indexOf(':root[data-tema="scuro"] {');
    expect(css.slice(i, css.indexOf("}", i))).toContain("color-scheme: dark");
  });
});

// M-1 dell'analisi del 14 novembre. Il riquadro d'avviso aveva il fondo
// giallo pallido scritto in duro e il testo da token: al buio il testo
// diventava quasi bianco, su un fondo rimasto chiaro. Qui si misura il
// contrasto WCAG (soglia AA, 4.5:1) in tutti e due i temi, e si vieta il
// ritorno del colore in duro nei componenti.
describe("il riquadro d'avviso", () => {
  const valoreDi = (selettore, token) => {
    const i = css.indexOf(selettore);
    const corpo = css.slice(i, css.indexOf("}", i));
    const m = corpo.match(new RegExp(`${token}\\s*:\\s*(#[0-9a-fA-F]{6})`));
    expect(m, `${token} senza esadecimale in ${selettore}`).toBeTruthy();
    return m[1];
  };
  const luminanza = (hex) => {
    const [r, g, b] = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrasto = (a, b) => {
    const [chiaro, scuro] = [luminanza(a), luminanza(b)].sort((x, y) => y - x);
    return (chiaro + 0.05) / (scuro + 0.05);
  };
  const BLOCCHI = [":root {\n  --navy", ':root:not([data-tema="chiaro"]) {', ':root[data-tema="scuro"] {'];

  it.each(BLOCCHI)("testo e testo d'avviso si leggono sul fondo (%s)", (blocco) => {
    const fondo = valoreDi(blocco, "--avviso-bg");
    for (const inchiostro of ["--text", "--avviso-testo"]) {
      const c = contrasto(fondo, valoreDi(blocco, inchiostro));
      expect(c, `${inchiostro} su --avviso-bg: ${c.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("nessun componente scrive il fondo d'avviso in duro", () => {
    const file = execSync("git ls-files src/components", { encoding: "utf8" })
      .split("\n").filter(f => /\.(jsx?|css)$/.test(f) && !f.includes(".test."));
    const colpevoli = file.filter(f => /#FEF3C7/i.test(readFileSync(f, "utf8")));
    expect(colpevoli, "usa var(--avviso-bg) e var(--avviso-bordo)").toEqual([]);
  });
});

describe("la scelta dell'utente", () => {
  const salvaOriginale = { get: window.localStorage.getItem, set: window.localStorage.setItem };
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-tema");
  });
  afterEach(() => {
    window.localStorage.getItem = salvaOriginale.get;
    window.localStorage.setItem = salvaOriginale.set;
    vi.restoreAllMocks();
  });

  it("parte da «sistema» quando non c'è niente di salvato", () => {
    expect(leggiTema()).toBe("sistema");
  });

  it("ricorda la scelta", () => {
    salvaTema("scuro");
    expect(leggiTema()).toBe("scuro");
  });

  it("torna a «sistema» togliendo la chiave, non scrivendoci dentro «sistema»", () => {
    // Il selettore che segue il sistema operativo è quello che NEGA il chiaro:
    // un attributo con un terzo valore lo lascerebbe passare per caso.
    salvaTema("chiaro");
    salvaTema("sistema");
    expect(window.localStorage.getItem(CHIAVE_TEMA)).toBeNull();
  });

  it("ignora un valore salvato che non è uno dei tre", () => {
    window.localStorage.setItem(CHIAVE_TEMA, "fucsia");
    expect(leggiTema()).toBe("sistema");
  });

  it("sopravvive a uno storage che rifiuta di rispondere", () => {
    // Navigazione privata, permessi negati, quota piena: il tema non è un
    // dato di lavoro, e perderne la memoria non deve fermare l'app.
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("negato"); });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("negato"); });
    expect(leggiTema()).toBe("sistema");
    expect(() => salvaTema("scuro")).not.toThrow();
  });

  it("scrive sul documento ciò che il CSS legge", () => {
    applicaTema("scuro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("scuro");
    applicaTema("chiaro");
    expect(document.documentElement.getAttribute("data-tema")).toBe("chiaro");
    applicaTema("sistema");
    expect(document.documentElement.hasAttribute("data-tema")).toBe(false);
  });

  it("risolve «sistema» con la preferenza del sistema operativo", () => {
    // jsdom non implementa matchMedia: si definisce, non si spia.
    const originale = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (q) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {} }),
    });
    expect(temaEffettivo("sistema")).toBe("scuro");
    expect(temaEffettivo("chiaro")).toBe("chiaro");
    if (originale) Object.defineProperty(window, "matchMedia", originale);
    else delete (/** @type {any} */ (window)).matchMedia;
  });

  it("e senza matchMedia sceglie il chiaro, che è il default dichiarato in :root", () => {
    // Un ambiente che non sa rispondere non deve produrre un'app scura per
    // sbaglio: è lo stesso principio di useOnlineStatus, che in dubbio
    // assume «online».
    expect(temaEffettivo("sistema")).toBe("chiaro");
  });

  it("ha un'etichetta per ognuno dei tre", () => {
    for (const t of TEMI) expect(ETICHETTE_TEMA[t]).toBeTruthy();
  });
});


describe("useTema — la scelta come stato dell'interfaccia", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-tema");
  });

  it("parte da ciò che è già applicato al documento", async () => {
    const { useTema } = await import("../../hooks/useTema.js");
    salvaTema("scuro");
    const { result } = renderHook(() => useTema());
    expect(result.current.tema).toBe("scuro");
    expect(result.current.effettivo).toBe("scuro");
  });

  it("scegliere scrive sul documento e ricorda", async () => {
    const { useTema } = await import("../../hooks/useTema.js");
    const { result } = renderHook(() => useTema());
    act(() => { result.current.scegli("chiaro"); });
    expect(document.documentElement.getAttribute("data-tema")).toBe("chiaro");
    expect(leggiTema()).toBe("chiaro");
    expect(result.current.effettivo).toBe("chiaro");
  });

  it("con «sistema» l'etichetta segue il sistema che cambia idea", async () => {
    // Su iOS e Android il tema scuro segue un orario: il CSS si aggiorna da
    // solo (è una media query), ma l'etichetta «Sistema — ora chiaro»
    // resterebbe a mentire.
    const ascoltatori = [];
    const originale = Object.getOwnPropertyDescriptor(window, "matchMedia");
    let scuro = false;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (q) => ({
        media: q,
        get matches() { return scuro; },
        addEventListener: (_e, f) => ascoltatori.push(f),
        removeEventListener: () => {},
      }),
    });
    const { useTema } = await import("../../hooks/useTema.js");
    const { result } = renderHook(() => useTema());
    expect(result.current.effettivo).toBe("chiaro");

    scuro = true;
    act(() => { for (const f of ascoltatori) f(); });
    expect(result.current.effettivo).toBe("scuro");

    if (originale) Object.defineProperty(window, "matchMedia", originale);
    else delete (/** @type {any} */ (window)).matchMedia;
  });
});
