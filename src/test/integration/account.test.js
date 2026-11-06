// A-3 dell'analisi del 6 novembre — è GoTrue, non il client, a rifiutare un
// cambio password senza la password attuale.
//
// `AuthContext.cambiaPassword` manda `current_password`, e il campo nel
// profilo lo chiede. Ma la garanzia è un'opzione di Supabase Auth («Require
// current password when changing password») che vive nella dashboard, non nel
// repository, e nessun test unitario la vede. Questo file la interroga sullo
// staging: se qualcuno la spegne, o non è mai stata accesa, diventa rosso.
//
// ⛔ PERCHÉ NON CAMBIA MAI DAVVERO LA PASSWORD. La «nuova» password è quella
// ATTUALE dell'utente di prova. Con l'opzione accesa GoTrue risponde
// `current_password_*` prima di guardare la nuova. Con l'opzione spenta
// risponde `same_password`. In nessun caso la password cambia, quindi le
// credenziali di CI restano buone anche quando il test fallisce.
//
// ⛔ PERCHÉ QUI NON C'È «Elimina account». Il caso naturale sarebbe chiamare
// `delete-account` con una password sbagliata e aspettarsi 403. Ma se sullo
// staging girasse ancora la versione di prima, quella che non chiede niente,
// la stessa chiamata eliminerebbe DAVVERO l'utente di prova. La funzione è
// provata in edge/deleteAccountRiautenticazione.test.js e, dopo ogni deploy,
// a mano su un utente usa-e-getta (docs/CHANGELOG.md, 6 novembre (iv)).
//
// Stesse regole di rls.test.js: senza RLS_TEST_URL il describe è `.skip`;
// dentro rls.yml (RLS_TEST_REQUIRED=1) l'assenza dei segreti è un errore.
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const anonKey = process.env.RLS_TEST_ANON_KEY;
const email = process.env.RLS_TEST_JUNIOR_EMAIL;
const password = process.env.RLS_TEST_JUNIOR_PASSWORD;

if (process.env.RLS_TEST_REQUIRED === "1" && !(url && anonKey)) {
  throw new Error(
    "[account] RLS_TEST_REQUIRED=1 ma RLS_TEST_URL/RLS_TEST_ANON_KEY sono " +
    "assenti: i segreti dello staging non sono configurati. Vedi .github/workflows/rls.yml."
  );
}

const suite = url && anonKey ? describe : describe.skip;

suite("Cambio password: GoTrue chiede la password attuale", () => {
  let client;
  beforeAll(async () => {
    client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`login fallito (${email}): ${error.message}`);
  });

  it("senza current_password: current_password_required", async () => {
    const { error } = await client.auth.updateUser({ password });
    expect(error?.code).toBe("current_password_required");
  });

  it("con una current_password sbagliata: current_password_invalid", async () => {
    const { error } = await client.auth.updateUser({ password, current_password: `${password}-sbagliata` });
    expect(error?.code).toBe("current_password_invalid");
  });
});
