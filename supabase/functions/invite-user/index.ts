// supabase/functions/invite-user/index.ts
// Edge Function (Admin-only): invia un invito email via Supabase Auth e
// pre-crea il profilo in public.users con pending=true.
// verify_jwt:true → Supabase valida il JWT prima di eseguire il body.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireActiveAdmin } from "../_shared/requireActiveAdmin.ts";
// A-4 dell'audit del 22 agosto: `safeRedirect` viveva qui come copia della
// stessa regola di `_shared/cors.ts`, con lo stesso difetto in entrambe —
// vedi il preambolo di originConsentite.ts. Ora la regola è una sola.
import { redirectConsentito } from "../_shared/originConsentite.ts";
import { registraAudit } from "../_shared/audit.ts";

const VALID_ROLES = new Set(["admin", "manager", "agent", "driver"]);

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
    // B-1 dell'audit del 13 agosto: `Number(body.capacity) || 8` accettava
    // qualunque numero — negativo, frazionario, 1e9 — perché `||` scarta solo
    // 0/NaN, non i valori fuori range. Stesso trattamento di VALID_ROLES sopra:
    // fuori dal range plausibile (1-100 task) si ricade sul default invece di
    // rifiutare la richiesta, l'edge function resta permissiva come per role.
    const rawCapacity = Number(body.capacity);
    const capacity: number =
      Number.isInteger(rawCapacity) && rawCapacity >= 1 && rawCapacity <= 100 ? rawCapacity : 8;
    // `body.color || "#3B82F6"` accettava qualunque stringa non vuota: l'unico
    // punto d'ingresso di questo campo in UI è <input type="color">, che
    // produce sempre un #rrggbb valido, ma l'edge function è raggiungibile
    // anche a bocce ferme via /functions/v1/invite-user con un body qualsiasi.
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
    const color: string = typeof body.color === "string" && HEX_COLOR.test(body.color)
      ? body.color
      : "#3B82F6";
    const resend: boolean = body.resend === true;
    // redirectTo passato dal client (window.location.origin): garantisce che
    // il link nell'email punti all'ambiente corretto (preview o produzione)
    // invece di dipendere dal Site URL configurato in Supabase Dashboard.
    // Hardening: accettiamo SOLO la produzione e i preview *.vercel.app di
    // questo progetto. Senza whitelist un admin potrebbe (anche per errore)
    // far puntare il link d'invito a un dominio di phishing.
    const redirectTo: string | undefined = redirectConsentito(body.redirectTo);

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

      // Pre-crea profilo (il trigger DB fa lo stesso come safety-net) e contatto.
      const [profilo, contatto] = await Promise.all([
        supabaseAdmin.from("users").upsert(
          { id: uid, name, role, avatar, color, capacity, pending: true, active: false, invited_by: callerId },
          { onConflict: "id" }
        ),
        supabaseAdmin.from("user_contacts").upsert(
          { user_id: uid, email },
          { onConflict: "user_id" }
        ),
      ]);

      // M-2 dell'audit del 14 agosto. L'esito dei due upsert veniva scartato:
      // il commento sopra ("il trigger DB fa lo stesso come safety-net") vale
      // per public.users (handle_new_auth_user), ma NON per user_contacts, che
      // nessun trigger popola. Se quell'upsert falliva l'admin leggeva
      // "success" e l'email dell'invitato restava fuori dalla rubrica, senza
      // alcun segnale che collegasse il vuoto a questo momento.
      //
      // Non si fa fallire la richiesta: l'email d'invito è GIÀ partita
      // (supabaseAdmin.auth.admin.inviteUserByEmail sopra), e un 500 qui
      // spingerebbe l'admin a riprovare generando un secondo invito per lo
      // stesso indirizzo. Si risponde quindi comunque success, ma con un
      // avviso — il silenzio era l'unica opzione da escludere.
      const problemi = [
        profilo.error && "profilo",
        contatto.error && "contatto (email)",
      ].filter(Boolean);
      if (problemi.length) {
        console.error("[invite-user] upsert", profilo.error?.message, contatto.error?.message);
        return json({
          success: true,
          userId: uid,
          warning: `Invito inviato, ma non è stato possibile pre-creare: ${problemi.join(", ")}. `
            + "Controlla la scheda del membro nel pannello Team dopo il primo accesso.",
        });
      }
    }

    // Il RUOLO con cui si invita è la decisione privilegiata di questa
    // funzione: pre-crea una riga con `role` già impostato, e da lì in poi il
    // trigger su public.users vedrà solo eventuali CAMBI. Senza questa voce il
    // registro mostrerebbe le promozioni e non le nomine.
    // Nessuna email nei details: `audit_log.details` non porta PII.
    await registraAudit(supabaseAdmin, callerId, resend ? "user.invito_reinviato" : "user.invitato",
                        { type: "user", id: inviteData.user.id }, { role, resend });

    return json({ success: true, userId: inviteData.user.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[invite-user]", msg);
    return json({ error: msg }, 500);
  }
});
