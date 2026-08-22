// M-4 (docs/AUDIT_ARCHITETTURA_2026-08.md) — la matrice di autorizzazione è
// scritta DUE volte dal 6 agosto: in lib/permissions.js (client) e nelle
// policy/funzioni private.* (database). persistenceGuards.test.js verifica
// che client e registry di persistenza concordino fra loro, ma nessun test
// esistente attraversa il confine di rete: tutti verificano che il CLIENT si
// comporti bene, mai che il DATABASE rifiuti chi il client non ferma. Se le
// due copie divergono — un refactor di permissions.js che dimentica di
// aggiornare la policy, o viceversa — nessun test esistente lo segnala.
//
// Questo file lo fa, ma richiede un database vero: tre utenti già
// provisionati (driver, agent con seniority='junior', utente con
// pending=true) su un progetto Supabase di STAGING, mai su produzione — le
// insert di sonda restano nella tabella se una policy che dovrebbe rifiutare
// non rifiuta, e su un progetto reale sarebbero dati sporchi in mezzo a
// quelli veri. Vedi il blocco SETUP qui sotto.
//
// Il file rientra nella suite di default (`npm test`), ma senza RLS_TEST_URL
// il describe esterno è `.skip`: nessun `beforeAll` gira, nessuna rete viene
// toccata, zero side effect — compare come skipped e basta. Per eseguirlo
// davvero servono le credenziali di staging più sotto e `npm run test:rls`
// (o `vitest run src/test/integration`, equivalente).
//
// ── SETUP (una tantum, sul progetto di staging) ─────────────────────────────
// 1. Tre utenti in auth + public.users, già APPROVATI (pending=false) tranne
//    il terzo, che va lasciato pending=true apposta:
//      - driver:  role='driver'
//      - junior:  role='agent', seniority='junior'
//      - pending: qualunque role, pending=true
// 2. Variabili d'ambiente per il test runner:
//      RLS_TEST_URL, RLS_TEST_ANON_KEY
//      RLS_TEST_DRIVER_EMAIL,  RLS_TEST_DRIVER_PASSWORD
//      RLS_TEST_JUNIOR_EMAIL,  RLS_TEST_JUNIOR_PASSWORD
//      RLS_TEST_PENDING_EMAIL, RLS_TEST_PENDING_PASSWORD
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const anonKey = process.env.RLS_TEST_ANON_KEY;

// A-2 dell'audit del 23 agosto. Lo skip qui sotto è la scelta giusta in
// locale — «non verificato qui» ≠ «rotto» — ma per undici giorni ha
// significato che questo file non veniva eseguito MAI: nessun workflow gli
// passava le credenziali, e in una suite da 132 file un solo skipped non si
// vede. Nel frattempo la divergenza che il file esiste per trovare c'era
// davvero (A-1: `canViewTask` concedeva le urgenti altrui, `tasks_select`
// no), ed è stata trovata leggendo il codice a mano.
//
// È l'argomento di A-3 dell'audit del 22 agosto — «lo script esisteva a zero
// errori e non lo eseguiva nessuno» — applicato alla verifica di sicurezza,
// con un'aggravante: `verifica:tipi` era davvero a zero, questo aveva
// qualcosa da trovare.
//
// Dentro il job che esiste per eseguirlo, lo skip NON è un esito accettabile:
// è il difetto, non una configurazione mancante. Ovunque altro resta uno skip.
//
// ⚠️ Il segnale è `RLS_TEST_REQUIRED`, impostato SOLO da rls.yml, e non
// `process.env.CI`. Su `CI` la guardia farebbe fallire anche `ci.yml`, che
// esegue `npm test` — cioè l'intera suite, questo file compreso — senza avere
// né volere le credenziali dello staging: si sarebbe rotta la CI esistente per
// difendere un job diverso. Il permesso di saltare non dipende dall'essere in
// CI, dipende da CHI sta eseguendo.
if (process.env.RLS_TEST_REQUIRED === "1" && !(url && anonKey)) {
  throw new Error(
    "[rls] RLS_TEST_REQUIRED=1 ma RLS_TEST_URL/RLS_TEST_ANON_KEY sono " +
    "assenti: i segreti dello staging non sono configurati. Vedi " +
    ".github/workflows/rls.yml — questo file non deve poter essere saltato " +
    "dal job che esiste per eseguirlo."
  );
}

const suite = url && anonKey ? describe : describe.skip;

async function accedi(email, password) {
  // persistSession: false — questi client vivono solo per la durata del
  // test, non devono scrivere in localStorage sotto jsdom.
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login fallito (${email}): ${error.message}`);
  const { data: { user } } = await client.auth.getUser();
  return { client, userId: user.id };
}

suite("RLS: la matrice di autorizzazione è applicata dal database, non solo dal client", () => {
  describe("Driver — private.can_use_task_category rifiuta tutto tranne 'transfer'", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD));
    });

    it("rifiuta l'insert di un task 'payment'", async () => {
      const { error } = await client.from("tasks").insert({
        title: "sonda rls driver", category: "payment", status: "todo", created_by: userId,
      });
      // 42501 = insufficient_privilege: è la RLS a rifiutare, non un vincolo
      // qualunque (NOT NULL, FK, …). Asserire solo "error è truthy" farebbe
      // passare il test anche per un motivo sbagliato.
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("consente l'insert di un task 'transfer'", async () => {
      const { data, error } = await client.from("tasks")
        .insert({ title: "sonda rls driver ok", category: "transfer", status: "todo", created_by: userId })
        .select().single();
      expect(error).toBeNull();
      await client.from("tasks").delete().eq("id", data.id);
    });
  });

  describe("Junior Agent — niente categorie 'payment'/'admin'", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD));
    });

    it("rifiuta la categoria 'payment'", async () => {
      const { error } = await client.from("tasks").insert({
        title: "sonda rls junior payment", category: "payment", status: "todo", created_by: userId,
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("rifiuta la categoria 'admin'", async () => {
      const { error } = await client.from("tasks").insert({
        title: "sonda rls junior admin", category: "admin", status: "todo", created_by: userId,
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("consente una categoria non riservata", async () => {
      const { data, error } = await client.from("tasks")
        .insert({ title: "sonda rls junior ok", category: "booking", status: "todo", created_by: userId })
        .select().single();
      expect(error).toBeNull();
      await client.from("tasks").delete().eq("id", data.id);
    });
  });

  describe("Utente pending — il gate RESTRICTIVE 'attivo' controlla anche pending", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_PENDING_EMAIL, process.env.RLS_TEST_PENDING_PASSWORD));
    });

    it("rifiuta la scrittura anche su una categoria che il ruolo permetterebbe", async () => {
      // rls_active_only è RESTRICTIVE su ogni comando e chiama
      // private.is_active_user(), che dal 20260806081127 controlla anche
      // pending=false: prima di quella migrazione active=true bastava, e un
      // utente mai approvato — la UI gli mostra PendingScreen — poteva
      // comunque scrivere chiamando PostgREST direttamente.
      const { error } = await client.from("tasks").insert({
        title: "sonda rls pending", category: "transfer", status: "todo", created_by: userId,
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });
  });

  describe("Escalation di users.role — il trigger BEFORE UPDATE la neutralizza", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD));
    });

    it("un self-update a role='admin' non produce un admin", async () => {
      // La policy users_update permette a chiunque di scrivere la propria
      // riga: senza il trigger trg_users_block_privileged_self_update, questo
      // sarebbe un'escalation di privilegi via PATCH diretto su
      // /rest/v1/users. La riga NON fallisce — il trigger la lascia passare e
      // ripristina silenziosamente role al valore precedente: è quello il
      // comportamento che il test misura, non un errore.
      const { data, error } = await client.from("users")
        .update({ role: "admin" }).eq("id", userId).select("role").single();
      expect(error).toBeNull();
      expect(data.role).not.toBe("admin");
    });
  });

  describe("user_contacts — la rubrica è del team, non solo del proprietario", () => {
    let client, userId;
    beforeAll(async () => {
      // Il driver: il ruolo con meno privilegi del sistema (niente Liste,
      // niente coda globale). Se anche lui legge i contatti di altri, la
      // policy non discrimina per ruolo — è `using (true)` per davvero, non
      // solo per gli utenti che qualcun altro ha già verificato a mano.
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD));
    });

    // M-4 dell'audit del 15 agosto. Il commento in lib/api.js e AuthContext.jsx
    // che descrive questa policy come `using (true)` — rubrica interna,
    // leggibile da chiunque sia autenticato, non solo dal proprietario — è
    // corretto OGGI, ma per un'intera fase del progetto era il contrario:
    // AuthContext.jsx:139-152 documenta un commento che affermava
    // «by-design privacy hardening, solo proprietario+admin» molto dopo che
    // la migrazione 20260629222802 aveva aperto la SELECT a tutto il team.
    // Questo test lega l'affermazione alla realtà: se la policy tornasse
    // own+admin, fallisce qui — non in un commento che nessuno ricontrolla.
    it("legge i contatti di ALTRI membri del team, non solo i propri", async () => {
      const { data, error } = await client.from("user_contacts").select("user_id, email, phone");
      expect(error).toBeNull();
      expect(data.length).toBeGreaterThan(1);
      expect(data.some((c) => c.user_id !== userId)).toBe(true);
    });
  });

  // A-1 dell'audit del 23 agosto, reso ESEGUIBILE.
  //
  // Il rilievo è stato trovato leggendo tre file e confrontandoli con
  // pg_policy a mano. Questo è il caso che lo avrebbe trovato da solo, ed è
  // scritto per restare utile dopo la correzione: non asserisce «l'agent vede
  // le urgenti altrui» come fatto, asserisce che il DATABASE e `canViewTask`
  // rispondano LO STESSO. Se un domani si decidesse di restringere il client
  // invece di allargare il database, questo test va aggiornato in un punto
  // solo — l'atteso — e continua a misurare l'invariante giusta.
  //
  // ⚠️ Perché la sonda la crea il DRIVER e la legge il JUNIOR: servono due
  // identità diverse, e sono le due che lo staging ha già. Il driver è anche
  // l'unico che può creare solo 'transfer' (private.can_use_task_category),
  // quindi la categoria non è una scelta estetica.
  describe("Urgenti altrui — il database concede ciò che canViewTask concede", () => {
    let driver, junior, taskId;

    beforeAll(async () => {
      driver = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
      junior = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);

      // Scadenza fra 12 ore: dentro la finestra di 24h sia di isUrgent()
      // (lib/taskUtils.js) sia di private.is_urgent_task(). Assegnata al
      // driver, quindi per il junior NON è né propria né in coda globale: il
      // ramo `isUrgent` è l'unico che possa concederla.
      const scadenza = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { data, error } = await driver.client.from("tasks").insert({
        title: "sonda rls urgente altrui", category: "transfer", status: "todo",
        created_by: driver.userId, assignees: [driver.userId], due_date: scadenza,
      }).select().single();
      if (error) throw new Error(`setup sonda urgente: ${error.message}`);
      taskId = data.id;
    });

    afterAll(async () => {
      if (taskId) await driver.client.from("tasks").delete().eq("id", taskId);
    });

    it("l'agent riceve la task urgente di un collega", async () => {
      const { data, error } = await junior.client
        .from("tasks").select("id").eq("id", taskId);
      expect(error).toBeNull();
      // Prima della migrazione 20260823090000 questa riga era 0: la policy
      // non aveva il ramo urgenza, e la scorciatoia «contatta l'assegnatario»
      // di UrgentQueue.jsx non compariva mai a un agent.
      expect(data).toHaveLength(1);
    });

    it("ma NON può modificarla: urgente ≠ modificabile, come dice canEditTask", async () => {
      // Il gemello negativo, e non è ridondanza: la migrazione tocca solo
      // tasks_select proprio perché questa asserzione deve restare vera. Una
      // UPDATE rifiutata dalla RLS non solleva — filtra le righe — quindi il
      // verdetto si legge dal CONTEGGIO, non da `error` (lib/esitoScrittura.js).
      const { count, error } = await junior.client
        .from("tasks").update({ title: "modificata dal junior" }, { count: "exact" })
        .eq("id", taskId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });

    it("il driver, che canViewTask esclude, non la riceve se non è sua", async () => {
      // Controllo positivo del confine: senza, «l'agent la vede» sarebbe
      // soddisfatto anche da una policy che l'ha aperta a chiunque. Il driver
      // qui è l'assegnatario, quindi si usa una seconda sonda NON sua.
      const scadenza = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      const { data: altrui, error: errIns } = await junior.client.from("tasks").insert({
        title: "sonda rls urgente del junior", category: "booking", status: "todo",
        created_by: junior.userId, assignees: [junior.userId], due_date: scadenza,
      }).select().single();
      expect(errIns).toBeNull();

      const { data, error } = await driver.client
        .from("tasks").select("id").eq("id", altrui.id);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);

      await junior.client.from("tasks").delete().eq("id", altrui.id);
    });
  });
});
