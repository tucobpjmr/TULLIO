// A-1 dell'analisi del 15 novembre (migrazione 20261116120000): il modulo
// Liste si scrive SOLO dalle RPC, e lo storico non si aggira.
//
// Le RPC sono SECURITY DEFINER con il gate private.can_liste(), e la
// scrittura diretta sulle tabelle è revocata ad `authenticated`. Prima un
// agent, con il proprio token e via REST, cambiava un importo senza riga in
// `lista_history` o scriveva uno storico inventato.
//
// File separato da rls.test.js per il tetto di righe; stesse regole: senza
// RLS_TEST_URL il describe è `.skip`, dentro rls.yml (RLS_TEST_REQUIRED=1)
// l'assenza dei segreti è un errore.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const anonKey = process.env.RLS_TEST_ANON_KEY;

if (process.env.RLS_TEST_REQUIRED === "1" && !(url && anonKey)) {
  throw new Error(
    "[listeScrittura] RLS_TEST_REQUIRED=1 ma RLS_TEST_URL/RLS_TEST_ANON_KEY sono " +
    "assenti: i segreti dello staging non sono configurati. Vedi .github/workflows/rls.yml."
  );
}

const suite = url && anonKey ? describe : describe.skip;

async function accedi(email, password) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login fallito (${email}): ${error.message}`);
  const { data: { user } } = await client.auth.getUser();
  return { client, userId: user.id };
}

// Un cliente fisso, riusato a ogni giro: chi gira questi test (agent) non può
// cancellare clienti, quindi crearne uno nuovo ogni notte li accumulerebbe
// sullo staging. La lista invece si elimina in afterAll.
const CLIENTE = "SONDA RLS LISTE";
const DATA = "2026-11-16";

suite("Liste — si scrive solo dalle RPC, e lo storico non si aggira", () => {
  let junior, driver, listaId, movimentoId;

  beforeAll(async () => {
    junior = await accedi(process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
    driver = await accedi(process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
    const { data: esistente } = await junior.client.from("clients")
      .select("id").eq("name", CLIENTE).limit(1).maybeSingle();
    const { data: lista, error: errLista } = await junior.client.rpc("crea_lista", esistente
      ? { p_client_id: esistente.id, p_titolo: "sonda A-1" }
      : { p_new_client_name: CLIENTE, p_titolo: "sonda A-1" });
    if (errLista) throw new Error(`sonda Liste: crea_lista ${errLista.message}`);
    listaId = lista;
    const { data: mov, error: errMov } = await junior.client.rpc("registra_movimento_lista", {
      p_lista_id: listaId, p_data: DATA, p_descrizione: "acconto sonda", p_importo: 100,
    });
    if (errMov) throw new Error(`sonda Liste: registra_movimento_lista ${errMov.message}`);
    movimentoId = mov;
  });

  afterAll(async () => {
    if (!listaId) return;
    await junior.client.rpc("archivia_lista", { p_id: listaId });
    await junior.client.rpc("elimina_lista_definitivamente", { p_id: listaId });
  });

  it("la RPC scrive il movimento e la sua riga di storico", async () => {
    const { data, error } = await junior.client.from("lista_history")
      .select("action").eq("movimento_id", movimentoId);
    expect(error).toBeNull();
    expect(data.map((r) => r.action)).toEqual(["movimento_aggiunto"]);
  });

  it("l'agent NON cambia un importo direttamente, e l'importo resta quello", async () => {
    const { error } = await junior.client.from("movimenti_lista")
      .update({ importo: 1 }).eq("id", movimentoId);
    expect(error?.code).toBe("42501");
    const { data } = await junior.client.from("movimenti_lista")
      .select("importo").eq("id", movimentoId).single();
    expect(Number(data.importo)).toBe(100);
  });

  it("né inserisce un movimento senza passare dalla RPC", async () => {
    const { error } = await junior.client.from("movimenti_lista").insert({
      lista_id: listaId, data_movimento: DATA, descrizione: "DIRETTO", importo: 1,
    });
    expect(error?.code).toBe("42501");
  });

  it("né scrive una voce di storico inventata", async () => {
    const { error } = await junior.client.from("lista_history").insert({
      lista_id: listaId, actor_id: junior.userId, action: "lista_creata",
    });
    expect(error?.code).toBe("42501");
  });

  it("né modifica la lista direttamente", async () => {
    const { error } = await junior.client.from("liste_viaggio")
      .update({ note: "diretta" }).eq("id", listaId);
    expect(error?.code).toBe("42501");
  });

  it("il driver è respinto dal gate dentro la RPC, non da una riga mancante", async () => {
    const { error } = await driver.client.rpc("registra_movimento_lista", {
      p_lista_id: listaId, p_data: DATA, p_descrizione: "x", p_importo: 1,
    });
    // Prima di A-1 il driver riceveva «Lista non trovata» (P0001): la RLS gli
    // nascondeva la riga. Ora è il gate: 42501, con il suo messaggio.
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/non consentita per il tuo ruolo/i);
  });
});
