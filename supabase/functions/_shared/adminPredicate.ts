// supabase/functions/_shared/adminPredicate.ts
//
// "CHI PUÒ AGIRE COME ADMIN", scritto una volta e senza dipendenze.
//
// PERCHÉ ESISTE, E PERCHÉ È UN FILE A SÉ. Le Edge Function privilegiate girano
// con la SERVICE_ROLE_KEY, che bypassa integralmente la RLS: lì il controllo
// nel corpo della funzione non è una difesa in profondità, è l'UNICA difesa.
// Deve perciò rispondere alla stessa domanda a cui risponde il database, con
// lo stesso verdetto — e fino all'11 agosto 2026 non era così:
//
//     if (caller?.role !== "admin") { … 403 }        // ← invite-user, delete-user
//
// mentre `public.is_admin()`, dopo la migrazione 20260806130000, è:
//
//     WHERE id = auth.uid()
//       AND role = 'admin' AND active = true AND coalesce(pending, false) = false
//
// Due categorie di chiamante passavano di qui e sono respinte da OGNI altro
// strato del sistema:
//
//   1. l'admin DISATTIVATO. `active = false` è il modo con cui il pannello
//      Team revoca i privilegi (TOGGLE_TEAM_MEMBER_ACTIVE), ma è una colonna
//      applicativa: non tocca la sessione di autenticazione. La RLS lo ferma
//      su ogni tabella (policy RESTRICTIVE `rls_active_only`, migrazione
//      20260621153006); queste funzioni, che la RLS non la attraversano, no.
//      Poteva ancora hard-eliminare qualunque utente, admin veri compresi.
//   2. l'admin INVITATO E MAI APPROVATO. invite-user pre-crea la riga con il
//      ruolo richiesto e `pending: true`, e l'invitato ottiene una sessione
//      valida cliccando il link d'invito. L'app lo ferma (PendingScreen), il
//      database lo ferma (il `coalesce(pending,false)` qui sopra) — le due
//      funzioni no. Il gate di approvazione, che è la ragione per cui la
//      colonna `pending` esiste, non copriva le due operazioni più distruttive
//      del sistema.
//
// Il predicato sta in un modulo PURO e senza import — nemmeno di tipo — per
// una ragione operativa: così è eseguibile da Vitest, che gira su Node e non
// saprebbe risolvere gli specificatori `jsr:`/`npm:` del runtime Deno. È
// quello che rende possibile src/test/edgeFunctionAdminGate.test.js, cioè il
// primo test che questo repo ha sul TERZO livello di autorizzazione: il client
// era già coperto (permissions.test.js, persistenceGuards.test.js), il
// database anche (test/integration/rls.test.js), le Edge Function da nessuno.
// Il difetto è vissuto lì in mezzo, e non è un caso.

/** La forma minima del profilo, come arriva da `select("role, active, pending")`. */
export interface ProfiloChiamante {
  role?: string | null;
  active?: boolean | null;
  pending?: boolean | null;
}

/**
 * Ricalca `public.is_admin()` nella sua forma corrente (20260806130000).
 *
 * Le tre condizioni sono esplicite e separate perché NON sono ridondanti fra
 * loro: un utente approvato e poi disattivato ha `pending = false` **e**
 * `active = false`, mentre un invitato mai approvato può avere `active = true`
 * con `pending = true` (la nota in testa alla 20260806130000 lo dice
 * esplicitamente: TOGGLE_TEAM_MEMBER_ACTIVE scrive solo `active`, quindi
 * nessuna delle due si deduce dall'altra).
 *
 * Il confronto sul ruolo è sul valore GREZZO della colonna, non normalizzato
 * da `toDbRole`: è così che lo fa il database (`role = 'admin'`), ed è il
 * database la specifica che questa funzione deve rispecchiare. Normalizzare
 * qui — e solo qui — reintrodurrebbe uno scarto fra i due verdetti, cioè
 * esattamente la classe di difetto che questo file chiude.
 *
 * `active === true` e `pending !== true` non sono simmetrici, e la differenza
 * è voluta: `active` è `NOT NULL DEFAULT TRUE` ma un NULL sopravvissuto a una
 * migrazione deve valere "non attivo" (il verdetto restrittivo), mentre
 * `pending` NULL deve valere "non in attesa" — che è esattamente ciò che dice
 * il `coalesce(pending, false)` del database.
 *
 * `undefined` è invece un caso a parte, e va tenuto distinto da `null`. Da
 * PostgREST una colonna selezionata torna `null`, mai `undefined`: `undefined`
 * significa che il campo NON È STATO CHIESTO, cioè un errore di programmazione
 * a monte (una `select` che non elenca tutte le colonne del predicato). Su
 * `active` la distinzione non serve perché `=== true` rifiuta già entrambi;
 * su `pending`, dove il valore assente è quello PERMISSIVO, serve eccome — e
 * il controllo esplicito qui sotto è ciò che impedisce a una select incompleta
 * di trasformarsi in un gate che non gatta. Il test lo esercita.
 */
export function puoAgireComeAdmin(caller: ProfiloChiamante | null | undefined): boolean {
  if (!caller) return false;
  // Campo non selezionato ≠ campo NULL: vedi sopra. Non ricade nel
  // `coalesce`, perché non c'è nessun valore su cui applicarlo.
  if (!("pending" in caller) || caller.pending === undefined) return false;
  return caller.role === "admin"
    && caller.active === true
    && caller.pending !== true;
}

/**
 * Le colonne da chiedere a `public.users`. Costante e non stringa in linea nei
 * due call site: se un domani il predicato guardasse un quarto campo, una
 * `select` dimenticata lo farebbe arrivare `undefined` — e `undefined` in
 * `puoAgireComeAdmin` è indistinguibile da "il campo dice di no". Il verdetto
 * sbagliato sarebbe quello restrittivo, quindi non un buco di sicurezza, ma
 * un 403 a un admin legittimo che nessuno saprebbe spiegare.
 */
export const COLONNE_PROFILO_ADMIN = "role, active, pending";

/**
 * Il messaggio è UNO per tutti e tre i rifiuti. Distinguerli ("non sei admin"
 * / "il tuo account è disattivato" / "sei in attesa di approvazione") direbbe
 * a un chiamante non autorizzato quale delle tre condizioni gli manca, cioè
 * quanto gli manca per arrivarci.
 */
export const MSG_NON_AUTORIZZATO = "Operazione riservata agli amministratori attivi";
