// M-1, M-2, M-3 dell'analisi del 16 novembre (migrazioni 20261117111322,
// 20261117111329, 20261117111335): partecipanti delle chat dirette, scrittura
// degli allegati in coda globale, campi immutabili dei commenti.
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
    "[rlsChatAllegatiCommenti] RLS_TEST_REQUIRED=1 ma RLS_TEST_URL/RLS_TEST_ANON_KEY sono " +
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

suite("RLS — chat dirette, allegati in coda globale, commenti", () => {
  // M-1 dell'analisi del 16 novembre — migrazione 20261117111322.
  // `conversations_update` chiede solo che chi scrive resti partecipante: in
  // una chat diretta si poteva togliere l'altro o aggiungere un terzo, che
  // legge tutta la cronologia. Il trigger `trg_conversations_guard_participants`
  // lo rifiuta (42501), e rifiuta anche il cambio di `type` che lo aggirerebbe.
  // I gruppi restano aperti: scelta del 17 novembre.
  describe("Chat diretta — i partecipanti non si cambiano", () => {
    let driver, junior, convId;

    beforeAll(async () => {
      driver = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
      junior = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
      const { data, error } = await driver.client.from("conversations").insert({
        type: "direct", participants: [driver.userId, junior.userId],
      }).select().single();
      if (error) throw new Error(`setup chat diretta: ${error.message}`);
      convId = data.id;
    });

    afterAll(async () => {
      if (convId) await driver?.client.from("conversations").delete().eq("id", convId);
    });

    it("un partecipante non toglie l'altro", async () => {
      const { error } = await junior.client.from("conversations")
        .update({ participants: [junior.userId] }).eq("id", convId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("né la trasforma in gruppo per aggirare il blocco", async () => {
      const { error } = await junior.client.from("conversations")
        .update({ type: "group" }).eq("id", convId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("ma pin, nome e icona si scrivono ancora", async () => {
      // Controllo positivo: è ciò che fa ConversationsAPI.update.
      const { count, error } = await junior.client.from("conversations")
        .update({ pinned: true }, { count: "exact" }).eq("id", convId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  });

  // M-2 dell'analisi del 16 novembre — migrazione 20261117111329. Seguito di
  // «Coda globale — il Junior la vede ma non la modifica»: le policy di
  // SCRITTURA degli allegati usavano ancora `can_view_global_queue()`. Ora
  // passano da `can_take_global_queue()`, e `uploaded_by` è il chiamante.
  describe("Allegati in coda globale — il Junior li vede ma non li scrive", () => {
    let driver, junior, taskId, rigaId;

    beforeAll(async () => {
      driver = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
      junior = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
      const { data, error } = await driver.client.from("tasks").insert({
        title: "sonda rls allegati coda globale", category: "transfer", status: "todo",
        created_by: driver.userId, assignees: [],
      }).select().single();
      if (error) throw new Error(`setup sonda allegati: ${error.message}`);
      taskId = data.id;
    });

    afterAll(async () => {
      if (rigaId) await driver?.client.from("task_files").delete().eq("id", rigaId);
      if (taskId) {
        await driver?.client.from("tasks")
          .update({ deleted_at: new Date().toISOString() }).eq("id", taskId);
      }
    });

    it("il junior non registra un allegato", async () => {
      const { error } = await junior.client.from("task_files").insert({
        task_id: taskId, file_name: "j.txt", file_url: `${taskId}/j.txt`,
        uploaded_by: junior.userId,
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("né carica il file nel bucket", async () => {
      const { error } = await junior.client.storage.from("task-files")
        .upload(`${taskId}/sonda-junior-${Date.now()}.txt`,
          new Blob(["sonda"], { type: "text/plain" }));
      expect(error).toBeTruthy();
    });

    it("chi ha creato il task non carica a nome di un collega", async () => {
      const { error } = await driver.client.from("task_files").insert({
        task_id: taskId, file_name: "d.txt", file_url: `${taskId}/d.txt`,
        uploaded_by: junior.userId,
      });
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("a nome proprio sì", async () => {
      const { data, error } = await driver.client.from("task_files").insert({
        task_id: taskId, file_name: "d.txt", file_url: `${taskId}/d.txt`,
        uploaded_by: driver.userId,
      }).select().single();
      expect(error).toBeNull();
      rigaId = data.id;
    });

    it("e il junior la vede ma non la cancella", async () => {
      const { data } = await junior.client.from("task_files").select("id").eq("id", rigaId);
      expect(data).toHaveLength(1);
      const { count, error } = await junior.client.from("task_files")
        .delete({ count: "exact" }).eq("id", rigaId);
      expect(error).toBeNull();
      expect(count).toBe(0);
    });
  });

  // M-3 dell'analisi del 16 novembre — migrazione 20261117111335.
  // `comments_update_own` guarda solo `user_id`: cambiando `task_id` l'autore
  // spostava il commento in un task che non vede. Il trigger
  // `trg_comments_campi_immutabili` rifiuta il cambio di task, autore e data.
  describe("Commenti — task e autore non si riscrivono", () => {
    let driver, junior, taskMio, taskAltrui, commentoId;

    beforeAll(async () => {
      driver = await accedi(
        process.env.RLS_TEST_DRIVER_EMAIL, process.env.RLS_TEST_DRIVER_PASSWORD);
      junior = await accedi(
        process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
      // Assegnato al SOLO junior: il suo commento non genera notifiche.
      const mio = await driver.client.from("tasks").insert({
        title: "sonda rls commenti", category: "transfer", status: "todo",
        created_by: driver.userId, assignees: [junior.userId],
      }).select().single();
      if (mio.error) throw new Error(`setup task commenti: ${mio.error.message}`);
      taskMio = mio.data.id;
      // Del driver e assegnato a lui: il junior non lo vede.
      const altrui = await driver.client.from("tasks").insert({
        title: "sonda rls commenti (altrui)", category: "transfer", status: "todo",
        created_by: driver.userId, assignees: [driver.userId],
      }).select().single();
      if (altrui.error) throw new Error(`setup task altrui: ${altrui.error.message}`);
      taskAltrui = altrui.data.id;
      const c = await junior.client.from("comments").insert({
        task_id: taskMio, user_id: junior.userId, text: "originale",
      }).select().single();
      if (c.error) throw new Error(`setup commento: ${c.error.message}`);
      commentoId = c.data.id;
    });

    afterAll(async () => {
      if (commentoId) await junior?.client.from("comments").delete().eq("id", commentoId);
      for (const id of [taskMio, taskAltrui]) {
        if (id) {
          await driver?.client.from("tasks")
            .update({ deleted_at: new Date().toISOString() }).eq("id", id);
        }
      }
    });

    it("l'autore non sposta il commento in un task che non vede", async () => {
      const { error } = await junior.client.from("comments")
        .update({ task_id: taskAltrui }).eq("id", commentoId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("né lo attribuisce a un altro", async () => {
      const { error } = await junior.client.from("comments")
        .update({ user_id: driver.userId }).eq("id", commentoId);
      expect(error).toBeTruthy();
      expect(error.code).toBe("42501");
    });

    it("il testo invece si corregge", async () => {
      const { count, error } = await junior.client.from("comments")
        .update({ text: "corretto" }, { count: "exact" }).eq("id", commentoId);
      expect(error).toBeNull();
      expect(count).toBe(1);
    });
  });
});
