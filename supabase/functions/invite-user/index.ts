// Edge Function: invite-user
// Fase 3 (mono-agenzia) — onboarding dei ~15 utenti reali.
// Solo un admin (verificato lato server via JWT + tabella users) può invitare.
// Crea l'utente in auth.users e invia l'email di invito; il trigger
// handle_new_user popola public.users (pending=true) + user_contacts.
// Variabili SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// sono iniettate automaticamente da Supabase nelle Edge Functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLES = ["admin", "manager", "agent", "driver"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Metodo non consentito" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1) Identifica il chiamante dalla sua sessione.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json(401, { error: "Non autenticato" });

    // 2) Verifica che sia admin (service-role bypassa le RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: me } = await admin
      .from("users").select("role").eq("id", user.id).single();
    if (me?.role !== "admin") {
      return json(403, { error: "Solo gli amministratori possono invitare utenti" });
    }

    // 3) Valida input.
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "agent");
    const color = body.color ? String(body.color) : null;
    const avatar = body.avatar ? String(body.avatar) : null;
    const capacity = Number.isFinite(Number(body.capacity)) ? Number(body.capacity) : null;
    const redirectTo = body.redirectTo ? String(body.redirectTo) : undefined;

    if (!email || !email.includes("@")) return json(400, { error: "Email non valida" });
    if (!name) return json(400, { error: "Nome obbligatorio" });
    if (!ROLES.includes(role)) return json(400, { error: "Ruolo non valido" });

    // 4) Crea l'utente e invia l'invito. handle_new_user crea il profilo.
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name, role },
      redirectTo,
    });
    if (invErr) {
      const msg = /already been registered|already exists/i.test(invErr.message)
        ? "Esiste già un utente con questa email"
        : invErr.message;
      return json(400, { error: msg });
    }

    // 5) Completa il profilo con i campi non gestiti dal trigger.
    const patch: Record<string, unknown> = {};
    if (avatar) patch.avatar = avatar;
    if (color) patch.color = color;
    if (capacity != null) patch.capacity = capacity;
    if (Object.keys(patch).length && inv?.user?.id) {
      await admin.from("users").update(patch).eq("id", inv.user.id);
    }

    return json(200, { ok: true, userId: inv?.user?.id ?? null });
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? String(e) });
  }
});
