// @vitest-environment node
//
// M-3 dell'audit del 4 novembre · presenza e «sta scrivendo» sono canali
// Realtime PRIVATI (src/lib/realtime.js), e l'ingresso lo decidono le policy
// su `realtime.messages` (migrazioni 20261104181351 e 20261106101314):
// presenza a ogni utente attivo, «sta scrivendo» ai soli partecipanti della
// conversazione. Il primo caso è quello che ha trovato il buco della prima
// migrazione: l'ingresso chiede la lettura `broadcast`, anche sulla presenza.
//
// Perché un file a parte da rls.test.js, e perché `node`. La prima esecuzione
// (4 novembre, Verifica RLS dopo il merge di #257) li aveva dentro rls.test.js,
// che gira nell'ambiente jsdom della suite: lì il WebSocket nativo di Node
// solleva «The "event" argument must be an instance of Event» all'apertura
// (l'`Event` globale è quello di jsdom), il canale non si aggancia mai e il
// test scade. Le policy non c'entravano; l'ambiente sì.
//
// Stesse regole di rls.test.js: senza RLS_TEST_URL il describe è `.skip`;
// dentro rls.yml (RLS_TEST_REQUIRED=1) l'assenza dei segreti è un errore.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const anonKey = process.env.RLS_TEST_ANON_KEY;

if (process.env.RLS_TEST_REQUIRED === "1" && !(url && anonKey)) {
  throw new Error(
    "[realtime] RLS_TEST_REQUIRED=1 ma RLS_TEST_URL/RLS_TEST_ANON_KEY sono " +
    "assenti: i segreti dello staging non sono configurati (vedi rls.yml).",
  );
}

const suite = url && anonKey ? describe : describe.skip;

// Login + aggancio + un po' di margine: il default di 5 s non basta.
const TEMPO_CASO_MS = 30_000;
const TEMPO_AGGANCIO_MS = 15_000;

async function accedi(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login fallito (${email}): ${error.message}`);
  return client;
}

/** Apre un canale privato e risolve con lo stato finale dell'aggancio. */
const aggancio = (client, topic) => new Promise((risolvi) => {
  const canale = client.channel(topic, { config: { private: true } });
  const fine = (esito) => { client.removeChannel(canale); risolvi(esito); };
  const timer = setTimeout(() => fine("TIMEOUT"), TEMPO_AGGANCIO_MS);
  canale.subscribe((stato) => {
    if (stato === "SUBSCRIBED" || stato === "CHANNEL_ERROR") { clearTimeout(timer); fine(stato); }
  });
});

suite("realtime — i canali privati li apre solo chi le policy ammettono", () => {
  it("un utente attivo entra nella presenza dell'agenzia", async () => {
    const client = await accedi(process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
    expect(await aggancio(client, "presenza:agenzia")).toBe("SUBSCRIBED");
  }, TEMPO_CASO_MS);

  it("nessuno entra nel «sta scrivendo» di una conversazione di cui non fa parte", async () => {
    const client = await accedi(process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
    expect(await aggancio(client, "typing:00000000-0000-4000-8000-000000000000")).toBe("CHANNEL_ERROR");
  }, TEMPO_CASO_MS);
});
