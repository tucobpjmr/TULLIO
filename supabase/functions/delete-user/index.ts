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
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: "Token non valido" }, 401);

    // Solo gli admin possono eliminare altri utenti
    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (caller?.role !== "admin") {
      return json({ error: "Solo gli admin possono eliminare utenti" }, 403);
    }

    const body = await req.json();
    const targetId: string = (body.userId ?? "").trim();
    if (!targetId) return json({ error: "userId mancante" }, 400);

    // Un admin non può eliminare se stesso da qui: deve usare "Elimina account"
    // (delete-account) per non rimuovere la propria sessione a metà operazione.
    if (targetId === user.id) {
      return json({ error: "Non puoi eliminare il tuo account da qui: usa Elimina account dal profilo" }, 400);
    }

    // Hard-delete da auth.users. La FK CASCADE rimuove la riga public.users;
    // user_contacts ha la stessa FK su public.users(id) → ripulita a sua volta.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (delErr) {
      // Se l'utente non esiste più in auth (es. già eliminato), ripuliamo
      // comunque l'eventuale riga residua in public.users per sicurezza.
      if (delErr.message?.toLowerCase().includes("not found")) {
        await supabaseAdmin.from("users").delete().eq("id", targetId);
        return json({ success: true });
      }
      console.error("[delete-user]", delErr.message);
      return json({ error: "Impossibile eliminare l'utente: " + delErr.message }, 500);
    }

    return json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[delete-user]", msg);
    return json({ error: msg }, 500);
  }
});
