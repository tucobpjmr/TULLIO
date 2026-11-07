// supabase/functions/_shared/corpoJson.ts
//
// B-4 dell'analisi del 6 novembre. `await req.json()` lancia su un corpo
// malformato, e il `catch` esterno lo trasformava in un 500 «errore interno».
// È una richiesta sbagliata, non un guasto: va 400.
//
// Ritorna l'oggetto, oppure `null` se il corpo manca, non è JSON o non è un
// oggetto (`null`, un numero, un array): in tutti questi casi `body.campo`
// non ha senso, e su `null` lancerebbe un TypeError.
export async function leggiCorpoJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const corpo: unknown = await req.json();
    return corpo !== null && typeof corpo === "object" && !Array.isArray(corpo)
      ? corpo as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

// Un campo testo del corpo, ripulito. Un valore che non è una stringa (un
// numero, un oggetto) vale «mancante»: `.trim()` su di lui lancerebbe.
export const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const MSG_CORPO_NON_VALIDO = "Corpo della richiesta non valido: serve un oggetto JSON";
