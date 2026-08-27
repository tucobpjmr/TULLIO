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

  describe("public.users — il gate 'attivo' vale sulla RUBRICA, non sul profilo", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_PENDING_EMAIL, process.env.RLS_TEST_PENDING_PASSWORD));
    });

    // A-3 dell'audit sicurezza del 26 agosto. `public.users` era l'unica
    // tabella sensibile senza il gate "utente attivo": la sua policy di SELECT
    // era `using (true)`, quindi un invitato mai approvato — che l'app ferma su
    // PendingScreen e che ogni ALTRA tabella respinge — leggeva l'intera
    // rubrica interna con una GET su /rest/v1/users.
    it("un pending NON legge le righe degli altri membri", async () => {
      const { data, error } = await client.from("users").select("id").neq("id", userId);
      // Nessun errore: una policy che non seleziona righe produce un elenco
      // vuoto, non un 42501. È la differenza che rende questo caso invisibile
      // a chi cerca solo gli errori.
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    // Il contrappeso, e il motivo per cui la correzione NON è una
    // `rls_active_only` copiata dalle altre quattordici tabelle: con quella,
    // questa select tornerebbe vuota, `AuthContext.caricaProfilo` non
    // troverebbe il profilo e AuthGate mostrerebbe ProfileErrorScreen —
    // «profilo non trovato» — al posto di PendingScreen. Se un domani qualcuno
    // "uniformasse" la policy alle altre, è questo test a fermarlo.
    it("ma legge SEMPRE la propria, che è ciò che fa apparire PendingScreen", async () => {
      const { data, error } = await client.from("users")
        .select("id, pending").eq("id", userId).single();
      expect(error).toBeNull();
      expect(data.id).toBe(userId);
      expect(data.pending).toBe(true);
    });

    it("e non può più scrivere nemmeno sulla propria riga", async () => {
      // Prima di A-3 `users_update` chiedeva solo `id = auth.uid()`: un pending
      // o un utente appena disattivato poteva aggiornare nome, avatar e foto.
      // Il trigger fermava l'escalation (role/active/pending), non la scrittura
      // in sé — sono due porte diverse, e questa era rimasta aperta.
      const { data, error } = await client.from("users")
        .update({ name: "sonda rls pending" }).eq("id", userId).select("name");
      expect(error).toBeNull();
      // Zero righe aggiornate: la USING non seleziona la riga, quindi la UPDATE
      // non trova nulla da scrivere — di nuovo un successo vuoto, non un 42501.
      expect(data).toEqual([]);
    });
  });

  describe("audit_log — append-only, e leggibile solo dagli admin", () => {
    let client, userId;
    beforeAll(async () => {
      ({ client, userId } = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD));
    });

    // A-2 dell'audit sicurezza del 26 agosto. Il registro non ha alcuna policy
    // di INSERT/UPDATE/DELETE per `authenticated`: con la RLS attiva l'assenza
    // di policy È il divieto, e questo test è ciò che lo dimostra invece di
    // affermarlo. Se qualcuno aggiungesse una policy di insert "per comodità",
    // il registro smetterebbe di essere una prova e questo diventerebbe rosso.
    it("un utente non admin non lo legge", async () => {
      const { data, error } = await client.from("audit_log").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("nessuno può inserirci una voce a mano", async () => {
      const { error } = await client.from("audit_log").insert({
        actor_id: userId, action: "sonda.falsa", details: {},
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("e nemmeno passando dalla RPC può firmarla per conto d'altri", async () => {
      // `registra_audit` non ha un parametro "attore": lo ricava da auth.uid().
      // È l'unica riga che impedisce di scrivere una voce col nome di qualcun
      // altro, ed è il motivo per cui la RPC esiste invece di un GRANT INSERT.
      const { data, error } = await client.rpc("registra_audit", {
        p_action: "sonda.rls", p_target_type: "test", p_target_id: null, p_details: {},
      });
      expect(error).toBeNull();
      expect(data).toBeTruthy();
      // La voce esiste ma il driver non può rileggerla: la SELECT è solo admin.
      const { data: righe } = await client.from("audit_log").select("id").eq("id", data);
      expect(righe).toEqual([]);
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

    // A-2, secondo passaggio del 26 agosto. Il `expect(error).toBeNull()` qui
    // sopra è corretto e per mesi ha detto, senza accorgersene, qual era il
    // difetto: un tentativo di escalation rispondeva 200 e spariva. Ora il
    // trigger di guardia, prima di annullare il delta, lo scrive in audit_log
    // come `user.modifica_privilegi_negata`.
    //
    // ⚠️ COSA QUESTO TEST NON COPRE, e va detto invece di lasciarlo intendere:
    // la VOCE non è verificata da qui. `audit_log` è leggibile ai soli admin e
    // lo staging non ha un utente admin provisionato (il setup in cima al file
    // ne elenca tre: driver, junior, pending). Quello che si verifica qui è
    // che la scrittura del registro non rompa il percorso di guardia — se
    // `private.audit` sollevasse, l'UPDATE fallirebbe invece di rispondere 200
    // con il ruolo invariato, ed è esattamente ciò che le due righe sopra
    // misurano. La voce è stata verificata a mano sullo staging il 26 agosto
    // (una sola riga, delta completo, nessuna per le modifiche non
    // privilegiate); per inchiodarla serve un quarto utente admin fra i
    // segreti del workflow.
    it("il tentativo negato non rompe la UPDATE che lo contiene", async () => {
      const { error } = await client.from("users")
        .update({ role: "admin", capacity: 999 }).eq("id", userId);
      expect(error).toBeNull();
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
      // Prima della migrazione 20260822215237 questa riga era 0: la policy
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
  // M-3 dell'audit sicurezza del 26 agosto — reso ESEGUIBILE.
  //
  // `messages_update` lascia passare in USING e in CHECK OGNI partecipante su
  // OGNI messaggio della conversazione, ed è voluto: reazioni, read receipt e
  // pin sono UPDATE che fa chi non è il mittente. La restrizione vera — «solo
  // il mittente può cambiare il CONTENUTO» — vive interamente nel trigger
  // `messages_blocca_modifiche_altrui`, che confronta `to_jsonb(new)` e
  // `to_jsonb(old)` meno le colonne collaborative.
  //
  // Il trigger è scritto bene (la sottrazione di colonne è la forma giusta:
  // una colonna nuova ricade per difetto nel ramo protetto). Il rilievo è
  // ARCHITETTURALE: una regola di autorizzazione con UN SOLO punto di
  // applicazione, su una tabella da cui un trigger di guardia analogo è GIÀ
  // stato rimosso una volta —
  // 20260814210100_drop_trigger_messages_guard_participant_update.sql. Se
  // sparisse di nuovo, la RLS da sola consentirebbe a ogni partecipante di
  // riscrivere il testo di chiunque, e nulla lo segnalerebbe.
  //
  // Questi test sono ciò che rende RUMOROSA quella rimozione. Il secondo e il
  // terzo contano quanto il primo: senza, una futura stretta della policy che
  // rompesse reazioni e pin passerebbe verde.
  describe("messages — solo il mittente riscrive il contenuto, ma tutti reagiscono", () => {
    let driver, junior, convId, msgId;

    beforeAll(async () => {
      driver = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
      junior = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);

      const { data: conv, error: errConv } = await driver.client.from("conversations").insert({
        type: "direct", participants: [driver.userId, junior.userId],
      }).select().single();
      if (errConv) throw new Error(`setup conversazione: ${errConv.message}`);
      convId = conv.id;

      // La colonna del testo è `text`, non `content`: i messaggi portano anche
      // file, vocali e waveform, e `type` distingue i casi.
      const { data: msg, error: errMsg } = await driver.client.from("messages").insert({
        conversation_id: convId, sender_id: driver.userId, type: "text", text: "originale",
      }).select().single();
      if (errMsg) throw new Error(`setup messaggio: ${errMsg.message}`);
      msgId = msg.id;
    });

    afterAll(async () => {
      // I messaggi se ne vanno in CASCADE con la conversazione. La notifica di
      // chat che l'INSERT ha generato (trigger `notify_message_chat`) no: è del
      // junior, e solo lui può cancellarla — `notifications_delete_own`. Senza
      // questa riga lo staging accumulerebbe una notifica per ogni esecuzione
      // del workflow.
      if (convId) {
        await junior.client.from("notifications").delete()
          .eq("payload->>conversation_id", convId);
        await driver.client.from("conversations").delete().eq("id", convId);
      }
    });

    it("un partecipante non mittente non può riscrivere il testo altrui", async () => {
      const { error } = await junior.client.from("messages")
        .update({ text: "riscritto dal junior" }).eq("id", msgId);
      // Qui l'errore c'è davvero, e non è la RLS: il trigger SOLLEVA con
      // errcode 42501 invece di filtrare la riga. È la differenza fra questo
      // caso e le UPDATE respinte dalla policy, che rispondono 200 con zero
      // righe (vedi "urgenti altrui" più sopra) — e sarebbe anche il primo
      // sintomo visibile se il trigger sparisse: da eccezione a successo muto.
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");

      const { data: dopo } = await driver.client.from("messages")
        .select("text").eq("id", msgId).single();
      expect(dopo.text).toBe("originale");
    });

    it("nemmeno può attribuirsi il messaggio cambiando `sender_id`", async () => {
      // Primo ramo del trigger, e il più importante: `sender_id` è la colonna
      // da cui dipende ogni altra guardia. Se si potesse riscrivere, il ramo
      // «sono io il mittente» diventerebbe una porta invece di un controllo.
      const { error } = await junior.client.from("messages")
        .update({ sender_id: junior.userId }).eq("id", msgId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("ma PUÒ reagire: il ramo collaborativo deve restare aperto", async () => {
      const { error } = await junior.client.rpc("messages_toggle_reaction", {
        msg_id: msgId, emoji: "\u{1F44D}",
      });
      expect(error).toBeNull();

      const { data: dopo } = await driver.client.from("messages")
        .select("reactions").eq("id", msgId).single();
      expect(Object.keys(dopo.reactions)).toContain("\u{1F44D}");
    });

    it("e PUÒ fissare in bacheca il messaggio di un altro", async () => {
      // `MessagesAPI.setPinned` è una UPDATE diretta sulle tre colonne del pin,
      // ed è la scrittura più esposta al rifiuto silenzioso: è l'unica che si
      // fa sul messaggio ALTRUI. Il verdetto si legge dal CONTEGGIO, non da
      // `error` — una riga filtrata dalla RLS non solleva.
      const { count, error } = await junior.client.from("messages")
        .update({
          pinned: true, pinned_by: junior.userId, pinned_at: new Date().toISOString(),
        }, { count: "exact" })
        .eq("id", msgId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });

    it("il trigger non è una guardia sul solo `text`: qualunque colonna non collaborativa è protetta", async () => {
      // La sottrazione di colonne (`to_jsonb(new) - 'reactions' - 'read_by' -
      // 'pinned' - …`) fa sì che una colonna NUOVA nasca protetta. Questo test
      // lo verifica su una colonna che non è il testo: se qualcuno riscrivesse
      // il trigger elencando i campi vietati invece di sottrarre quelli
      // permessi, il caso qui sotto passerebbe e il primo test resterebbe verde.
      const { error } = await junior.client.from("messages")
        .update({ type: "system" }).eq("id", msgId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });
  });
});
