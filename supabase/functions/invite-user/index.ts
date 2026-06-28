// supabase/functions/invite-user/index.ts
// Edge Function (Admin-only): invia un invito email via Supabase Auth e
// pre-crea il profilo in public.users con pending=true.
// verify_jwt:true → Supabase valida il JWT prima di eseguire il body.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = new Set(["admin", "manager", "agent", "driver"]);

// Origin consentiti per il link d'invito: produzione + preview Vercel del
// progetto. Restituisce l'URL solo se valido, altrimenti undefined (Supabase
// userà il Site URL configurato nel Dashboard).
function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let u: URL;
  try { u = new URL(value); } catch { return undefined; }
  if (u.protocol !== "https:") return undefined;
  const host = u.hostname.toLowerCase();
  const ok = host === "tullio-seven.vercel.app" || host.endsWith(".vercel.app");
  return ok ? value : undefined;
}

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

    // Controlla che il chiamante sia admin
    const { data: caller } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (caller?.role !== "admin") {
      return json({ error: "Solo gli admin possono invitare nuovi utenti" }, 403);
    }

    const body = await req.json();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const name: string = (body.name ?? "").trim();
    const rawRole: string = body.role ?? "agent";
    const role: string = VALID_ROLES.has(rawRole) ? rawRole : "agent";
    const capacity: number = Number(body.capacity) || 8;
    const color: string = body.color || "#3B82F6";
    const resend: boolean = body.resend === true;
    // redirectTo passato dal client (window.location.origin): garantisce che
    // il link nell'email punti all'ambiente corretto (preview o produzione)
    // invece di dipendere dal Site URL configurato in Supabase Dashboard.
    // Hardening: accettiamo SOLO la produzione e i preview *.vercel.app di
    // questo progetto. Senza whitelist un admin potrebbe (anche per errore)
    // far puntare il link d'invito a un dominio di phishing.
    const redirectTo: string | undefined = safeRedirect(body.redirectTo);

    if (!email || (!resend && !name)) {
      return json({ error: "Email e nome sono obbligatori" }, 400);
    }

    // Genera avatar dalle iniziali (non serve per resend ma non fa male)
    const parts = name.split(/\s+/);
    const avatar = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();

    // Invia (o reinvia) invito via Supabase Auth Admin API.
    // invited_by viaggia nei metadata → letto dal trigger handle_new_auth_user.
    // Quando resend=true l'utente esiste già: Supabase aggiorna il token e
    // reinvia l'email se l'account non è ancora confermato. Se l'utente ha
    // già confermato, Auth restituisce "already been registered".
    const { data: inviteData, error: inviteErr } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { name, role, capacity, color, invited_by: user.id },
        ...(redirectTo ? { redirectTo } : {}),
      });

    if (inviteErr) {
      if (inviteErr.message?.includes("already been registered")) {
        return json({
          error: resend
            ? "L'utente ha già confermato l'account: non è possibile reinviare l'invito"
            : "Questa email è già registrata nel sistema",
        }, 409);
      }
      throw inviteErr;
    }

    // Per i reinvii il profilo e il contatto esistono già: saltiamo l'upsert.
    if (!resend) {
      const uid = inviteData.user.id;

      // Pre-crea profilo (il trigger DB fa lo stesso come safety-net).
      await supabaseAdmin.from("users").upsert(
        { id: uid, name, role, avatar, color, capacity, pending: true, active: false, invited_by: user.id },
        { onConflict: "id" }
      );

      // Pre-crea contatto
      await supabaseAdmin.from("user_contacts").upsert(
        { user_id: uid, email },
        { onConflict: "user_id" }
      );
    }

    return json({ success: true, userId: inviteData.user.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[invite-user]", msg);
    return json({ error: msg }, 500);
  }
});
