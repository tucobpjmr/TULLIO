// scripts/verifica-advisor/advisor.js
//
// Parte pura del controllo advisor: dato l'esito grezzo delle chiamate alla
// Management API di Supabase (security + performance advisors), decide se il
// controllo deve fallire.
//
// Perché solo "ERROR" fa fallire: i lint di livello WARN/INFO di questo
// progetto sono in parte accettati consapevolmente (es. le funzioni
// SECURITY DEFINER richiamabili da `authenticated` come get_vapid_public_key
// o reset_completo — gate applicativo voluto, non un buco; gli indici non
// ancora usati su tabelle nuove). Farli fallire tutti trasformerebbe un
// controllo periodico in un allarme costante e ignorato — la stessa
// preoccupazione già scritta in scripts/verifica-rpc/sonda.js. ERROR sì:
// sono cose come RLS disabilitata su una tabella esposta, dove non c'è un
// motivo legittimo per cui dovrebbe restare così.
// ─── ST-14 · GLI AVVISI ACCETTATI SONO UN ELENCO, NON UNA CATEGORIA ─────────
// Il commento qui sopra dice il vero ma nasconde una cosa: «i WARN di questo
// progetto sono in parte accettati consapevolmente». In parte. Fra i dieci WARN
// dell'advisor, nove sono le funzioni SECURITY DEFINER esposte di proposito
// (motivate in docs/SICUREZZA.md) e uno — `auth_leaked_password_protection` —
// per due audit di fila (B-2 dell'8 agosto, ST-14 del 10) non era accettato da
// nessuno: trattarlo come "un WARN come gli altri" lo aveva reso invisibile.
//
// Da qui in avanti l'accettazione è NOMINATA: i lint in questo elenco non fanno
// fallire, tutti gli altri sì — compresi quelli che non esistono ancora, che è
// il caso che conta davvero (un WARN nuovo su una tabella nuova oggi si
// perderebbe in mezzo a quelli noti).
const AVVISI_ACCETTATI = new Set([
  // Funzioni SECURITY DEFINER richiamabili da `authenticated`: sono le RPC
  // transazionali del modulo Liste e le due letture di configurazione. Il gate
  // è applicativo e voluto, non un buco — vedi docs/SICUREZZA.md.
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
  // Indici non ancora usati su tabelle nuove: informativo per definizione.
  'unused_index',
  'unindexed_foreign_keys',
  // ─── auth_leaked_password_protection · accettato il 12 agosto ────────────
  // Non era un rilievo aperto per mancanza di tempo: era aperto perché fino ad
  // allora nessuno aveva deciso esplicitamente. La decisione è arrivata da chi
  // amministra il progetto — la verifica contro HaveIBeenPwned è una funzione
  // del piano Supabase **Pro**, e il progetto resta sul piano Free per scelta.
  // Non è quindi "da attivare quando qualcuno se ne ricorda": è un costo
  // ricorrente non approvato, non un interruttore dimenticato. Se il piano
  // cambiasse, va tolta da qui e riattivata dalla dashboard — finché non
  // cambia, farla fallire ogni volta sarebbe un allarme su una scelta già
  // presa, esattamente il rumore che questo elenco esiste per evitare.
  'auth_leaked_password_protection',
]);

// ─── M-3 · GLI AVVISI ACCETTATI SONO UN ELENCO DI FUNZIONI, NON SOLO DI NOMI ─
// AVVISI_ACCETTATI accetta i due lint qui sotto per il NOME del lint — cioè
// per categoria: qualunque funzione SECURITY DEFINER raggiungibile da
// anon/authenticated produce lo stesso `name`. Le otto funzioni di oggi sono
// state verificate una per una (📄 docs/SICUREZZA.md §1: ognuna ha una guardia
// di ruolo interna, o — per get_vapid_public_key/get_migrazioni_applicate —
// non ha nulla da proteggere). Ma il nome del lint non distingue "una delle
// otto già viste" da "una funzione nuova, di ieri, mai controllata da
// nessuno": una futura SECURITY DEFINER esposta ad anon senza guardia
// produrrebbe lo STESSO warning, con lo stesso nome, e passerebbe muta in
// mezzo alle otto note. È esattamente il difetto che ST-14 aveva chiuso per
// auth_leaked_password_protection, riaperto qui su un asse diverso (funzione
// invece di lint).
//
// Elenco sincronizzato a mano con la tabella di docs/SICUREZZA.md §1 — la
// stessa scelta di AVVISI_ACCETTATI: nominare, non categorizzare.
const FUNZIONI_SECURITY_DEFINER_VERIFICATE = new Set([
  'reset_completo',
  'elimina_lista_definitivamente',
  'importa_backup',
  'rimuovi_beneficiario_lista',
  'sposta_titolare_lista',
  'send_test_push',
  'get_vapid_public_key',
  'get_migrazioni_applicate',
]);

// I due soli lint, in AVVISI_ACCETTATI, il cui `name` non basta a giudicare
// l'oggetto innocuo: si applicano a QUALUNQUE funzione SECURITY DEFINER
// futura, non a un fatto fisso del progetto (a differenza di unused_index o
// auth_leaked_password_protection, che restano accettati per nome).
const LINT_PER_FUNZIONE_SECURITY_DEFINER = new Set([
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
]);

// Supabase riporta l'identità dell'oggetto in `metadata.name` (schema a parte
// in `metadata.schema`) — l'unico campo strutturato dei due; `detail` e
// `description` sono testo pensato per essere letto, non parsato.
const nomeOggetto = (lint) => lint.metadata?.name;

export function valutaLints(lints) {
  const errori = lints.filter((l) => l.level === 'ERROR');
  const avvisi = lints.filter((l) => l.level === 'WARN');
  // Un WARN non nominato nell'elenco è un rilievo aperto che nessuno ha
  // deciso di accettare: va detto, e va detto in modo che qualcuno lo chiuda.
  // Per i due lint per-funzione, il nome accettato non basta: l'oggetto deve
  // essere una delle funzioni già verificate, altrimenti — mancasse pure
  // `metadata.name`, e quindi la possibilità di verificarlo — resta un
  // rilievo aperto invece di sparire in silenzio: meglio un falso allarme da
  // richiudere a mano che un buco muto.
  const nonAccettati = avvisi.filter((l) => {
    if (!AVVISI_ACCETTATI.has(l.name)) return true;
    if (!LINT_PER_FUNZIONE_SECURITY_DEFINER.has(l.name)) return false;
    const fn = nomeOggetto(l);
    return !fn || !FUNZIONI_SECURITY_DEFINER_VERIFICATE.has(fn);
  });
  return {
    fallisce: errori.length > 0 || nonAccettati.length > 0,
    errori,
    avvisi,
    nonAccettati,
  };
}

export { AVVISI_ACCETTATI, FUNZIONI_SECURITY_DEFINER_VERIFICATE };
