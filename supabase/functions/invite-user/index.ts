// supabase/functions/invite-user/index.ts
// Edge Function (Admin-only): invia un invito email via Supabase Auth e
// pre-crea il profilo in public.users con pending=true.
// verify_jwt:true → Supabase valida il JWT prima di eseguire il body.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireActiveAdmin } from "../_shared/requireActiveAdmin.ts";

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
  // Produzione.
  if (host === "tullio-seven.vercel.app") return value;
  // Preview deployment di QUESTO progetto: Vercel li serve come
  // <project>-<hash>-<scope>.vercel.app, cioè un'unica label prima di
  // ".vercel.app" che inizia con "tullio-". Il precedente check
  // host.endsWith(".vercel.app") accettava QUALSIASI progetto Vercel (anche di
  // terzi): un redirectTo manipolato avrebbe fatto arrivare il link d'invito
  // — con il token d'accesso — a un dominio di phishing. Qui restringiamo alla
  // sola famiglia di host del progetto ed escludiamo le label annidate (nessun
  // punto extra) così "tullio-x.attacker.vercel.app" non passa.
  const SUFFIX = ".vercel.app";
  if (host.endsWith(SUFFIX)) {
    const label = host.slice(0, -SUFFIX.length);
    if (label.startsWith("tullio-") && !label.includes(".")) return value;
  }
  return undefined;
}

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

    // Identità + ruolo del chiamante, con lo stesso predicato del database
    // (role = 'admin' AND active AND NOT pending). Il controllo precedente
    // guardava il solo `role`, quindi un admin disattivato o un admin invitato
    // e mai approvato poteva ancora invitare chiunque: vedi
    // _shared/adminPredicate.ts per il perché delle tre condizioni.
    const esito = await requireActiveAdmin(supabaseAdmin, supabaseUser);
    if (!esito.ok) return json({ error: esito.error }, esito.status);
    const callerId = esito.userId;

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
        data: { name, role, capacity, color, invited_by: callerId },
        ...(redirectTo ? { redirectTo } : {}),
      });

    if (inviteErr) {
      const im = (inviteErr.message ?? "").toLowerCase();
      if (im.includes("already been registered")) {
        return json({
          error: resend
            ? "L'utente ha già confermato l'account: non è possibile reinviare l'invito"
            : "Questa email è già registrata nel sistema",
        }, 409);
      }
      // GoTrue maschera l'errore SMTP sottostante come "Error sending invite
      // email". Tipicamente: provider email in modalità test (es. Resend invia
      // solo all'indirizzo del proprietario finché non si verifica un dominio)
      // oppure SMTP non configurato. Diamo un messaggio azionabile invece di un
      // 500 generico.
      if (im.includes("sending invite email") || im.includes("smtp") || im.includes("email")) {
        return json({
          error: "Invito non inviato: il servizio email non è configurato o è in modalità test. " +
            "Verifica un dominio su resend.com/domains (e imposta un mittente su quel dominio) " +
            "oppure configura un SMTP valido in Supabase → Auth → SMTP.",
        }, 502);
      }
      throw inviteErr;
    }

    // Per i reinvii il profilo e il contatto esistono già: saltiamo l'upsert.
    if (!resend) {
      const uid = inviteData.user.id;

      // Pre-crea profilo (il trigger DB fa lo stesso come safety-net).
      await supabaseAdmin.from("users").upsert(
        { id: uid, name, role, avatar, color, capacity, pending: true, active: false, invited_by: callerId },
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
