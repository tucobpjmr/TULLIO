// supabase/functions/_shared/erroreInterno.ts
//
// La risposta a un guasto: dettagliata a log, opaca al chiamante.
//
// M-4 dell'audit del 4 settembre. `delete-user` aveva già la forma giusta
// per la deleteUser fallita («L'errore è stato registrato: riprova, e se
// persiste contatta chi amministra il progetto»), e le altre funzioni non
// l'avevano seguita: restituivano `err.message` di GoTrue o di PostgREST —
// cioè nomi di colonna, vincoli violati e messaggi interni — a un chiamante
// che è admin, ma è pur sempre l'esterno. È la stessa scelta di
// MSG_NON_AUTORIZZATO in adminPredicate.ts — un messaggio solo, perché
// distinguerli dice a chi riceve la risposta più di quanto gli serva —
// applicata ai guasti invece che ai rifiuti.
//
// Il `codice` è ciò che tiene insieme i due lati: chi riceve l'errore lo
// legge a schermo e lo detta, chi guarda i log lo ritrova accanto al
// messaggio vero (via `tag`, che identifica anche IN QUALE ramo della
// funzione — non solo in quale funzione — il guasto è avvenuto). Stessa
// forma di `codiceSegnalazione()` in src/lib/errorReporting.js.
//
// ⚠️ Solo per i 5xx. I 4xx di queste funzioni (409 email già registrata, 429
// rate limit, 502 servizio email non configurato) restano scritti a mano nei
// call site: sono messaggi AZIONABILI, pensati apposta per dire a chi
// amministra cosa fare — e distinguerli da un guasto interno è il motivo per
// cui questo non è un catch unico per tutto.
export function erroreInterno(tag: string, err: unknown): { error: string; codice: string } {
  const codice = `VD-${Date.now().toString(36).toUpperCase()}`;
  const dettaglio = err instanceof Error ? err.message : String(err);
  console.error(`[${tag}] (${codice})`, dettaglio);
  return {
    codice,
    error:
      "Operazione non riuscita. L'errore è stato registrato: riprova, e se " +
      `persiste segnala il codice ${codice} a chi amministra il progetto.`,
  };
}
