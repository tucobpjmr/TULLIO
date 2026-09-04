// supabase/functions/set-user-active/index.ts
// Edge Function (Admin-only): attiva/disattiva un membro del team, REVOCANDO
// davvero l'accesso invece di limitarsi al flag applicativo.
//
// PERCHÉ ESISTE. Suggerimento strategico n. 3 dell'audit di architettura
// dell'11 agosto. `public.users.active` è una colonna applicativa: prima
// TOGGLE_TEAM_MEMBER_ACTIVE la scriveva direttamente da client
// (`UsersAPI.setActive` → `supabase.from('users').update({ active })`), e la
// RLS (`rls_active_only`) la fa rispettare su ogni tabella — il che copre
// quasi tutto, tranne esattamente ciò che la RLS non attraversa: le Edge
// Function con `service_role` (era C-1, corretto l'11 agosto) e qualunque
// percorso futuro dello stesso tipo. Il token dell'utente disattivato restava
// valido fino a scadenza, e il refresh token continuava a rinnovarlo — la
// disattivazione dal pannello Team non era una revoca, era un'etichetta.
//
// Qui accompagniamo il flag con l'operazione che tocca DAVVERO la sessione:
// `auth.admin.updateUserById(id, { ban_duration })`. Stessa idea di
// `delete-account` (che banna per 10 anni prima di toccare `public.users`),
// ma reversibile: alla riattivazione il ban si rimuove (`ban_duration:
// "none"`, la convenzione GoTrue per "nessun ban").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireActiveAdmin } from "../_shared/requireActiveAdmin.ts";
import { registraAudit } from "../_shared/audit.ts";
import { entroLimite } from "../_shared/rateLimit.ts";
import { erroreInterno } from "../_shared/erroreInterno.ts";

// Non un ban "per sempre" letterale (a differenza di delete-account, che è
// irreversibile per scelta): è "fino a quando un admin non lo rimuove
// esplicitamente", che nell'API di GoTrue si esprime con una durata molto
// lunga e non con un valore speciale — l'unico valore speciale è "none" per
// TOGLIERE il ban, non per impostarne uno indefinito. Stessa durata di
// delete-account: entrambe le colonne significano "indefinitamente, finché
// un'azione esplicita non la cambia".
const BAN_INDEFINITO = "87600h"; // 10 anni

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

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    // Stesso predicato di invite-user/delete-user: admin, attivo, approvato.
    // Una funzione che può bannare qualunque sessione del team è distruttiva
    // almeno quanto quelle due, e gira con la stessa service_role che scavalca
    // integralmente la RLS — il controllo qui dentro non è difesa in
    // profondità, è l'unica difesa.
    const esito = await requireActiveAdmin(supabaseAdmin, supabaseUser);
    if (!esito.ok) return json({ error: esito.error }, esito.status);
    const callerId = esito.userId;

    // B-2 dell'audit del 2 settembre. Bannare/sbloccare una sessione per
    // chiamata: trenta l'ora per admin bastano a una revisione del team, non
    // a bannare l'intera agenzia in un ciclo da un token compromesso.
    if (!(await entroLimite(supabaseAdmin, `set-user-active:${callerId}`, 60, 30))) {
      return json({ error: "Troppe richieste in poco tempo: riprova più tardi" }, 429);
    }

    const body = await req.json();
    const targetId: string = (body.userId ?? "").trim();
    const active = body.active === true;
    if (!targetId) return json({ error: "userId mancante" }, 400);

    // Un admin non disattiva se stesso da qui: bannerebbe la propria sessione
    // nello stesso istante in cui la chiama, tagliandosi fuori senza che
    // nessun altro admin l'abbia deciso — la stessa classe di footgun che
    // delete-user previene sul self-delete e UPDATE_TEAM_MEMBER sul
    // self-demote. Il ramo "riattivare se stessi" è comunque irraggiungibile
    // (un utente bannato non ha un token valido con cui chiamare questa
    // funzione), ma bloccare il target uguale al chiamante in ENTRAMBE le
    // direzioni è una regola sola, più semplice da leggere che una condizionata
    // sul valore di `active`.
    if (targetId === callerId) {
      return json({ error: "Non puoi disattivare te stesso da qui: chiedi a un altro admin" }, 400);
    }

    // L'operazione che tocca la sessione PRIMA di quella che tocca solo
    // l'applicazione — nello stesso ordine di delete-account, e per lo stesso
    // motivo: se questa fallisce usciamo senza aver scritto nulla, invece di
    // lasciare `public.users.active` disallineato dalla sessione reale.
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      ban_duration: active ? "none" : BAN_INDEFINITO,
    });
    if (authErr) return json(erroreInterno("set-user-active/ban", authErr), 500);

    const { error: dbErr } = await supabaseAdmin.from("users").update({ active }).eq("id", targetId);
    if (dbErr) return json(erroreInterno("set-user-active/db", dbErr), 500);

    // Il trigger su public.users registra già il passaggio di `active`. Questa
    // voce dice l'altra metà, quella che il database non può vedere: che è
    // stata bannata (o sbloccata) la SESSIONE in GoTrue. Erano proprio le due
    // cose che 20260628 ha separato — il flag applicativo e la revoca vera —
    // e un registro che ne mostrasse una sola racconterebbe la disattivazione
    // come era PRIMA di quella correzione.
    await registraAudit(supabaseAdmin, callerId, active ? "user.sbloccato" : "user.bannato",
                        { type: "user", id: targetId }, { ban: !active });

    return json({ success: true });
  } catch (err: unknown) {
    return json(erroreInterno("set-user-active", err), 500);
  }
});
