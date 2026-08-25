// Le variabili CSS scritte nel sorgente esistono davvero.
//
// PERCHÉ ESISTE. A-2 (audit del 22 agosto) ha sostituito 122 import nominati da
// `styles/common.js` con un import qualificato (`stiliComuni.card`). La
// sostituzione ha però toccato anche cinque STRINGHE che non erano
// identificatori: `"var(--card)"` è diventato `"var(--stiliComuni.card)"` in
// Trash, Archive e ArchivedListe. Un nome di custom property con un punto non è
// valido, quindi quei fondi non si dipingevano affatto — e nulla lo segnalava:
// non è un errore di sintassi JS, non è un warning del browser, e a schermo si
// vede solo che uno sfondo è trasparente invece che color scheda.
//
// Il controllo è sui SORGENTI perché è lì che il difetto vive: una variabile
// inventata non fallisce a runtime, si limita a non applicarsi.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const file = [];
(function scandisci(dir) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) scandisci(p);
    else if (/\.(js|jsx)$/.test(nome) && !p.includes("/test/")) file.push(p);
  }
})("src");

// I nomi dichiarati dai due fogli di stile dell'app: quello globale e quello
// del modulo Liste viaggio, che ha una palette propria col prefisso `--lv-*`
// (il modulo mantiene di proposito lo stile della SPA da cui viene).
const DICHIARATE = new Set(
  ["src/styles/global.css", "src/components/liste/liste.css"]
    .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/gi)])
    .map((m) => m[1]),
);

const USATE = /var\(\s*(--[^),\s]+)/g;

describe("var(--…) nel sorgente", () => {
  it("ogni variabile usata è dichiarata in global.css", () => {
    const sconosciute = [];
    for (const p of file) {
      const testo = readFileSync(p, "utf8");
      for (const m of testo.matchAll(USATE)) {
        if (!DICHIARATE.has(m[1])) sconosciute.push(`${p}: ${m[1]}`);
      }
    }
    expect(sconosciute).toEqual([]);
  });

  // Controllo positivo: senza, il test passerebbe anche con una regex che non
  // trova mai niente o con un elenco di dichiarate che contiene tutto.
  it("il pattern non passa a vuoto", () => {
    expect(DICHIARATE.has("--card")).toBe(true);
    expect(DICHIARATE.has("--lv-muted")).toBe(true);
    expect(DICHIARATE.has("--stiliComuni.card")).toBe(false);
    expect([...'background: "var(--navy)"'.matchAll(USATE)].map(m => m[1])).toEqual(["--navy"]);
  });
});
