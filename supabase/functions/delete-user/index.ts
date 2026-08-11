// supabase/functions/delete-user/index.ts
// Edge Function (Admin-only): elimina DEFINITIVAMENTE un utente.
// A differenza di delete-account (self-service, banna e conserva la cronologia),
// questa rimuove la riga da auth.users: la FK public.users.id → auth.users è
// ON DELETE CASCADE, quindi il profilo applicativo viene ripulito in automatico.
// Serve all'admin per liberare un'email "fantasma" (utente pending mai entrato
// o invito da rifare): dopo la delete, Users.invite() non darà più
// "già registrato" e l'invito potrà essere reinviato da zero.
// verify_jwt:true → Supabase valida il JWT prima di eseguire il body.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireActiveAdmin } from "../_shared/requireActiveAdmin.ts";

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

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verifica identità del chiamante tramite il suo JWT
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    // Solo gli admin ATTIVI e già approvati possono eliminare altri utenti,
    // con lo stesso predicato del database (role = 'admin' AND active AND NOT
    // pending). Il controllo precedente guardava il solo `role`: su una
    // funzione che hard-elimina una riga di auth.users girando con la
    // service_role, questo era il buco più grave del progetto — un admin
    // appena disattivato poteva cancellare gli admin che lo avevano
    // disattivato. Vedi _shared/adminPredicate.ts.
    const esito = await requireActiveAdmin(supabaseAdmin, supabaseUser);
    if (!esito.ok) return json({ error: esito.error }, esito.status);
    const callerId = esito.userId;

    const body = await req.json();
    const targetId: string = (body.userId ?? "").trim();
    if (!targetId) return json({ error: "userId mancante" }, 400);

    // Un admin non può eliminare se stesso da qui: deve usare "Elimina account"
    // (delete-account) per non rimuovere la propria sessione a metà operazione.
    if (targetId === callerId) {
      return json({ error: "Non puoi eliminare il tuo account da qui: usa Elimina account dal profilo" }, 400);
    }

    // Hard-delete da auth.users. La FK CASCADE rimuove la riga public.users;
    // user_contacts ha la stessa FK su public.users(id) → ripulita a sua volta.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (delErr) {
      // Estrai un messaggio sensato: AuthApiError espone {name, status, code, message}
      // ma in alcuni casi message è vuoto/oggetto e arriva come "{}" lato client.
      const rawMsg = typeof delErr.message === "string" && delErr.message.trim()
        ? delErr.message
        : JSON.stringify(delErr);
      const lower = rawMsg.toLowerCase();

      // Se l'utente non esiste più in auth (es. già eliminato), ripuliamo
      // comunque l'eventuale riga residua in public.users per sicurezza.
      if (lower.includes("not found")) {
        await supabaseAdmin.from("users").delete().eq("id", targetId);
        return json({ success: true });
      }

      // Foreign key violation: dipendenza che impedisce la cancellazione.
      // (Mapping coerente col fix migration task_files.uploaded_by → SET NULL.)
      if (lower.includes("foreign key") || lower.includes("violates")) {
        console.error("[delete-user] FK violation", rawMsg);
        return json({
          error:
            "Impossibile eliminare l'utente: ci sono dati collegati che lo " +
            "impediscono (es. allegati o messaggi). Applica le ultime migrazioni " +
            "del database e riprova.",
        }, 409);
      }

      console.error("[delete-user]", rawMsg);
      return json({ error: "Impossibile eliminare l'utente: " + rawMsg }, 500);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[delete-user]", msg);
    return json({ error: msg }, 500);
  }
});
