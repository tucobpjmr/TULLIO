// B-4 dell'analisi del 4 novembre · le Edge Function importano versioni esatte.
//
// Erano `jsr:@supabase/supabase-js@2` (e `npm:` in send-push): uno specificatore
// che il runtime risolve all'ULTIMA 2.x al momento del deploy. Due deploy dello
// stesso commit a una settimana di distanza potevano girare su due client
// diversi, e una regressione della libreria arrivava in produzione senza una
// riga cambiata nel repository. Ora la versione è scritta e coincide con quella
// del frontend in package-lock.json, così le due metà dell'app parlano con
// Supabase attraverso lo stesso codice.
//
// Il test legge i sorgenti (Vitest non risolve gli specificatori Deno): ogni
// import di un pacchetto @supabase/* deve portare una versione x.y.z, e quella
// versione deve essere la stessa del lockfile. Il controllo positivo in fondo
// impedisce che passi perché non ha trovato import da guardare.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RADICE = join(process.cwd(), "supabase", "functions");

function sorgentiTs(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const percorso = join(dir, nome);
    if (statSync(percorso).isDirectory()) return sorgentiTs(percorso);
    return nome.endsWith(".ts") ? [percorso] : [];
  });
}

// `import … from "jsr:@supabase/supabase-js@2.108.0"` e
// `import "jsr:@supabase/functions-js@2.108.0/edge-runtime.d.ts"`.
const IMPORT_SUPABASE = /["'](?:jsr|npm):@supabase\/([a-z-]+)(@[^/"']*)?(\/[^"']*)?["']/g;

const importSupabase = sorgentiTs(RADICE).flatMap((file) => {
  const testo = readFileSync(file, "utf8");
  return [...testo.matchAll(IMPORT_SUPABASE)].map((m) => ({
    file: file.slice(RADICE.length + 1),
    pacchetto: m[1],
    versione: m[2]?.slice(1) ?? null,
  }));
});

const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8"));
const VERSIONE_FRONTEND = lock.packages["node_modules/@supabase/supabase-js"].version;

describe("Edge Function · versioni di @supabase/* fissate (B-4)", () => {
  it("ci sono import da controllare (controllo positivo)", () => {
    expect(importSupabase.length).toBeGreaterThanOrEqual(5);
    expect(importSupabase.some((i) => i.pacchetto === "supabase-js")).toBe(true);
  });

  it("ogni import porta una versione esatta x.y.z", () => {
    const senzaVersione = importSupabase.filter((i) => !/^\d+\.\d+\.\d+$/.test(i.versione ?? ""));
    expect(senzaVersione).toEqual([]);
  });

  it("la versione è quella del frontend in package-lock.json", () => {
    const diverse = importSupabase.filter((i) => i.versione !== VERSIONE_FRONTEND);
    expect(diverse).toEqual([]);
  });
});
