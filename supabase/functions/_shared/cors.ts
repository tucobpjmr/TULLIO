// CORS condiviso per le Edge Function servite al browser (invite-user,
// delete-user, delete-account).
//
// Prima ogni funzione rispondeva con Access-Control-Allow-Origin: "*". Non è
// direttamente sfruttabile (gli endpoint sono Bearer-authed: il JWT viene
// inviato solo same-origin da supabase-js, un sito terzo non può ottenerlo),
// ma "*" è comunque più largo del necessario. Qui riflettiamo l'Origin SOLO se
// appartiene al progetto — produzione o preview <project>-…-.vercel.app che
// inizia con "tullio-" (stessa logica di safeRedirect in invite-user, così i
// preview a hostname dinamico continuano a funzionare). Per qualsiasi altro
// Origin ripieghiamo sulla produzione: la risposta esiste ma non è leggibile
// cross-origin da domini estranei. `Vary: Origin` perché l'header dipende
// dall'Origin della richiesta (cache corretta).

const PROD_ORIGIN = "https://tullio-seven.vercel.app";

function isAllowedOrigin(origin: string): boolean {
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "tullio-seven.vercel.app") return true;
  const SUFFIX = ".vercel.app";
  if (host.endsWith(SUFFIX)) {
    const label = host.slice(0, -SUFFIX.length);
    if (label.startsWith("tullio-") && !label.includes(".")) return true;
  }
  return false;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : PROD_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
