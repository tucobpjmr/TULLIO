// scripts/verifica-redirect/redirect.js
//
// La parte che DECIDE, separata da quella che parla con la rete (index.js).
// Stessa divisione di verifica-advisor/{advisor,index}.js e per la stessa
// ragione: il verdetto è la cosa che va testata, e un test non deve avere
// bisogno di un progetto Supabase raggiungibile per girare.

// L'host di produzione, cioè l'unico `.vercel.app` che questo progetto
// possiede davvero insieme ai due alias del team (vedi ORIGIN_PROPRIE in
// supabase/functions/_shared/originConsentite.ts, se e quando A-4 verrà
// chiuso). È anche il Site URL configurato in Supabase, quindi è il valore su
// cui GoTrue ripiega quando un `redirect_to` NON è consentito.
export const HOST_PRODUZIONE = 'tullio-seven.vercel.app';

// L'host CANARINO: un hostname che il progetto non possiede e che nessuno ha
// registrato. Non gli viene inviato nulla — la sonda legge l'header Location
// della risposta di GoTrue e non la segue mai.
//
// Il nome non è casuale: inizia per `tullio-` di proposito, così una sola
// sonda copre DUE rilievi dell'audit del 22 agosto. Se GoTrue lo accetta,
// significa che la allow-list ammette `*.vercel.app` (C-1). E siccome il
// prefisso `tullio-` è esattamente il pattern che `_shared/cors.ts` e
// `safeRedirect` considerano fidato (A-4), lo stesso hostname dimostra che
// quel pattern descrive un insieme che chiunque può ampliare creando un
// progetto Vercel con quel nome.
export const HOST_CANARINO = 'tullio-canarino-allowlist.vercel.app';

/** L'hostname di una URL, o null se la stringa non è una URL. */
export function hostDi(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

/**
 * Il verdetto della coppia di sonde.
 *
 * PERCHÉ SERVONO DUE SONDE E NON UNA. Con la sola sonda negativa (il canarino
 * viene rifiutato?) il controllo passerebbe anche nel caso in cui GoTrue
 * smettesse del tutto di onorare `redirect_to` — per un cambio di versione,
 * per un errore di battitura nel nome del parametro, per una risposta che non
 * è più un 3xx. Sarebbe un controllo verde per il motivo sbagliato, cioè la
 * classe di guasto che questo repository ha già incontrato due volte
 * (l'header `apikey` mancante in keep-supabase-warm.yml, e l'exit 0
 * silenzioso di verifica-advisor prima di ST-14/A-2).
 *
 * La sonda POSITIVA è il controllo di controllo: chiede a GoTrue di redirigere
 * verso l'host di produzione, che DEVE essere consentito. Se non lo è, non
 * sappiamo nulla sulla allow-list — sappiamo solo che la sonda non misura più
 * ciò che crede di misurare, ed è un esito distinto sia da "passato" sia da
 * "fallito".
 *
 * @param {object}      esiti
 * @param {string|null} esiti.locationCanario  header Location per il canarino
 * @param {string|null} esiti.locationProd     header Location per la produzione
 * @returns {{ stato: 'ok'|'allowlist-larga'|'inconcludente', messaggio: string }}
 */
export function valutaSonde({ locationCanario, locationProd }) {
  const hostProd = hostDi(locationProd);
  const hostCanario = hostDi(locationCanario);

  // ── Controllo di controllo ────────────────────────────────────────────────
  if (hostProd !== HOST_PRODUZIONE) {
    return {
      stato: 'inconcludente',
      messaggio:
        `la sonda positiva non è tornata su ${HOST_PRODUZIONE} ` +
        `(Location: ${locationProd ?? '—'}). Delle due l'una: l'host di produzione ` +
        'non è più nella allow-list, oppure questa sonda non misura più ciò che ' +
        'crede di misurare (GoTrue ha cambiato il modo di rispondere a ' +
        '/auth/v1/verify). In entrambi i casi il verdetto sul canarino qui sotto ' +
        'NON è affidabile e non va letto come "allow-list ristretta".',
    };
  }

  // ── Il rilievo vero ───────────────────────────────────────────────────────
  if (hostCanario === HOST_CANARINO) {
    return {
      stato: 'allowlist-larga',
      messaggio:
        `GoTrue ha accettato di redirigere verso ${HOST_CANARINO}, un hostname ` +
        'che questo progetto NON possiede. La allow-list dei Redirect URL ammette ' +
        'quindi domini di terze parti: chiunque può registrare un progetto Vercel ' +
        'con quel nome e far consegnare lì i token di sessione di un reset password ' +
        'legittimo. Vedi docs/SICUREZZA.md §9.',
    };
  }

  // GoTrue ripiega sul Site URL quando `redirect_to` non è consentito: è il
  // comportamento atteso e l'unico segnale che il rifiuto c'è stato — non
  // risponde con un errore, quindi "nessun errore" non prova niente.
  if (hostCanario === HOST_PRODUZIONE) {
    return {
      stato: 'ok',
      messaggio:
        `il canarino ${HOST_CANARINO} è stato rifiutato e GoTrue è ripiegato sul ` +
        `Site URL (${HOST_PRODUZIONE}). La allow-list non ammette domini estranei.`,
    };
  }

  return {
    stato: 'inconcludente',
    messaggio:
      `il canarino è finito su un host inatteso: ${locationCanario ?? '—'}. ` +
      'Non è né l\'host canarino (allow-list larga) né il Site URL (rifiuto ' +
      'corretto): la sonda va riletta prima di fidarsi del verdetto.',
  };
}
