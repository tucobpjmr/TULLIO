// supabase/functions/delete-account/index.ts
// Self-service account deletion. Bans the caller from auth (prevents future
// logins) and sets public.users.active=false. Comments, messages, and tasks
// sono preservati — cascade-deleting them from auth.users would wipe chat history.
// verify_jwt:true (set in supabase/config.toml or deploy flag).
//
// M-2 dell'audit del 13 agosto: ban + active=false bastano a impedire
// l'accesso, ma non cancellano NESSUN dato personale — email e telefono in
// user_contacts, nome, avatar e foto profilo restavano leggibili per sempre,
// mentre l'azione si chiama "Elimina account". La preservazione di
// commenti/messaggi/task resta intenzionale (sono cronologia condivisa del
// team, vedi delete-user/index.ts per il contrasto con l'hard-delete admin);
// quello che va rimosso è ciò che identifica la PERSONA, non il contenuto che
// ha lasciato. Dopo il ban: user_contacts (email/telefono) viene eliminata,
// push_subscriptions pure (endpoint del dispositivo, inutile con l'account
// bannato), e su public.users nome/avatar/colore/foto vengono sostituiti con
// un profilo anonimo — la riga resta per non spezzare le FK di
// commenti/messaggi/task già preservati di proposito.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { entroLimite } from "../_shared/rateLimit.ts";
import { erroreInterno } from "../_shared/erroreInterno.ts";
import { registraAudit } from "../_shared/audit.ts";

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorizzato" }, 401);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify JWT to get caller's user ID
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Token non valido" }, 401);

    // B-2 dell'audit del 2 settembre. Raggiungibile da QUALUNQUE utente
    // autenticato — non serve essere admin — quindi un tetto per chiamante
    // conta comunque: cinque all'ora tollerano un retry dopo un errore di
    // rete senza permettere a un token rubato di martellare la funzione.
    if (!(await entroLimite(adminClient, `delete-account:${user.id}`, 60, 5))) {
      return json({ error: "Troppe richieste in poco tempo: riprova più tardi" }, 429);
    }

    // Ban PRIMA di toccare public.users: è l'operazione critica (blocca ogni
    // login futuro). Se fallisce usciamo subito, senza aver ancora modificato
    // nulla — prima l'ordine inverso lasciava active=false in public.users
    // mentre l'account restava loggabile (stato incoerente).
    // 10 anni (87600h); i dati (commenti/messaggi) restano, cascade-safe.
    const { error: banErr } = await adminClient.auth.admin.updateUserById(user.id, {
      ban_duration: "87600h",
    });
    if (banErr) return json(erroreInterno("delete-account/ban", banErr), 500);

    // Solo dopo il ban riuscito: disabilita e anonimizza in public.users, e
    // rimuove i dati personali nelle tabelle satellite. Best-effort e in
    // parallelo — nessuna di queste operazioni deve poter far fallire una
    // richiesta il cui passo critico (il ban) è già andato a buon fine;
    // un errore qui lascia l'account comunque inaccessibile, solo con la
    // pulizia PII da ricontrollare.
    // B-5 dell'audit del 4 settembre: i nomi qui devono restare nello stesso
    // ordine dell'array sotto — sono la sola chiave che lega un fallimento
    // `Promise.allSettled` (che non porta un'etichetta) alla pulizia che
    // rappresenta.
    const PULIZIE = ["profilo", "contatti (email/telefono)", "iscrizioni push", "avatar"];
    const results = await Promise.allSettled([
      adminClient.from("users").update({
        active: false,
        name: "Utente eliminato",
        avatar: null,
        color: null,
        photo_url: null,
      }).eq("id", user.id),
      // email/telefono: l'unica PII rimasta fuori da public.users dal
      // 20260613100833 (hardening privacy contatti).
      adminClient.from("user_contacts").delete().eq("user_id", user.id),
      // Endpoint push del dispositivo: l'account bannato non riceverà mai più
      // notifiche, non c'è motivo di conservarli.
      adminClient.from("push_subscriptions").delete().eq("user_id", user.id),
      // Foto profilo nel bucket privato 'avatars' (path <user_id>/avatar.jpg,
      // vedi lib/api.js Users.uploadAvatar). .remove() su un file assente non
      // è un errore, quindi non serve verificare prima se esiste.
      adminClient.storage.from("avatars").remove([`${user.id}/avatar.jpg`]),
    ]);
    const residui: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error("[delete-account] pulizia PII", PULIZIE[i], r.reason);
        residui.push(PULIZIE[i]);
      } else if (r.value?.error) {
        console.error("[delete-account] pulizia PII", PULIZIE[i], r.value.error.message);
        residui.push(PULIZIE[i]);
      }
    });

    // Il ban è già irreversibile e riuscito: l'utente è comunque fuori. Ma
    // prima questo fallimento finiva SOLO in console.error — leggibile da chi
    // ha accesso ai log della funzione, non da chi amministra il progetto dal
    // pannello. L'audit_log è il posto che gli admin guardano davvero, ed è
    // scritto anche quando `residui` è vuoto: un `user.autoeliminato` senza
    // residui è la prova che la pulizia È passata, non solo che nessuno l'ha
    // controllata.
    await registraAudit(adminClient, user.id, "user.autoeliminato", { type: "user", id: user.id },
      residui.length ? { residui } : {});

    // Nessun `warning` quando `residui` è vuoto: un campo `warning: null` a
    // fianco di `success: true` chiederebbe a ogni chiamante di sapere che è
    // innocuo. La sua assenza è già il messaggio "nessun avviso" — stessa
    // forma di `invite-user` sull'upsert del profilo.
    return residui.length
      ? json({
        success: true,
        warning: `Account eliminato, ma la pulizia di alcuni dati non è riuscita: ${residui.join(", ")}. `
          + "Chi amministra il progetto può verificare dal registro di controllo.",
      })
      : json({ success: true });
  } catch (err: unknown) {
    return json(erroreInterno("delete-account", err), 500);
  }
});
