// supabase/functions/delete-account/index.ts
// Self-service account deletion. Bans the caller from auth (prevents future
// logins) and sets public.users.active=false. Comments, messages, and tasks
// are preserved — cascade-deleting them from auth.users would wipe chat history.
// verify_jwt:true (set in supabase/config.toml or deploy flag).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    // Ban PRIMA di toccare public.users: è l'operazione critica (blocca ogni
    // login futuro). Se fallisce usciamo subito, senza aver ancora modificato
    // nulla — prima l'ordine inverso lasciava active=false in public.users
    // mentre l'account restava loggabile (stato incoerente).
    // 10 anni (87600h); i dati (commenti/messaggi) restano, cascade-safe.
    const { error: banErr } = await adminClient.auth.admin.updateUserById(user.id, {
      ban_duration: "87600h",
    });
    if (banErr) {
      console.error("[delete-account] ban error", banErr.message);
      return json({ error: "Impossibile completare l'eliminazione: " + banErr.message }, 500);
    }

    // Solo dopo il ban riuscito: disabilita in public.users.
    await adminClient.from("users").update({ active: false }).eq("id", user.id);

    return json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[delete-account]", msg);
    return json({ error: msg }, 500);
  }
});
