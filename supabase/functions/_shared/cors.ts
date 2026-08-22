// CORS condiviso per le Edge Function servite al browser (invite-user,
// delete-user, delete-account, set-user-active).
//
// Prima ogni funzione rispondeva con Access-Control-Allow-Origin: "*". Non è
// direttamente sfruttabile (gli endpoint sono Bearer-authed: il JWT viene
// inviato solo same-origin da supabase-js, un sito terzo non può ottenerlo),
// ma "*" è comunque più largo del necessario. Qui riflettiamo l'Origin SOLO se
// appartiene al progetto; per qualsiasi altro ripieghiamo sulla produzione, così
// la risposta esiste ma non è leggibile cross-origin da domini estranei.
// `Vary: Origin` perché l'header dipende dall'Origin della richiesta.
//
// A-4 dell'audit del 22 agosto: «appartiene al progetto» non si decide più qui.
// Era un prefisso (`tullio-*.vercel.app`) scritto in due copie — questa e
// `safeRedirect` in invite-user — e un prefisso su `vercel.app` non descrive
// un insieme che il progetto possiede, ma uno che chiunque può ampliare
// creando un progetto con quel nome. La regola sta ora in
// `originConsentite.ts`, in un elenco esatto e con il ragionamento accanto.
import { originConsentita, PROD_ORIGIN } from "./originConsentite.ts";

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": originConsentita(origin) ? origin : PROD_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
