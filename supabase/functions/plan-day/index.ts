// supabase/functions/plan-day/index.ts
// Edge Function: proxy server-side verso l'API Anthropic per l'AI Day Planner.
// Prima il client chiamava api.anthropic.com direttamente dal browser: non
// funzionava (nessuna chiave API → 401, oltre a CORS) e qualsiasi chiave
// client-side sarebbe finita nel bundle. Qui la chiave ANTHROPIC_API_KEY vive
// solo lato server come secret. verify_jwt:true → solo utenti autenticati.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Modello aggiornato (il precedente claude-sonnet-4-20250514 era obsoleto).
// Centralizzato qui per cambiarlo senza toccare il client.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "Servizio AI non configurato (manca ANTHROPIC_API_KEY)." }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const prompt: string = typeof body?.prompt === "string" ? body.prompt : "";
    if (!prompt.trim()) return json({ error: "Prompt mancante" }, 400);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.error("[plan-day] anthropic", resp.status, detail);
      return json({ error: `Errore servizio AI (HTTP ${resp.status})` }, 502);
    }

    const data = await resp.json();
    // Concatena i blocchi di testo della risposta: il client farà strip del
    // markdown + JSON.parse (logica di parsing invariata rispetto a prima).
    const text = (data?.content || []).map((b: { text?: string }) => b.text || "").join("").trim();
    return json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("[plan-day]", msg);
    return json({ error: msg }, 500);
  }
});
