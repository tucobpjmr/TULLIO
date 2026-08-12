// C-1 — il terzo livello di autorizzazione, quello che nessun test guardava.
//
// Le regole di permesso di questo progetto vivono in tre linguaggi:
//
//   JavaScript puro   lib/permissions.js       → permissions.test.js
//                                                persistenceGuards.test.js
//   SQL               is_admin(), le policy     → test/integration/rls.test.js
//   TypeScript        le Edge Function          → NIENTE (fino a questo file)
//
// Il primo è allineato con sé stesso, il primo col secondo. Il terzo non era
// coperto da nessuno dei due — il suo codice non entra nemmeno nel perimetro
// di Vitest — ed è esattamente lì che il difetto è vissuto per sessioni: fino
// all'11 agosto 2026 `invite-user` e `delete-user` decidevano chi è admin
// guardando la sola colonna `role`, mentre `public.is_admin()` (nella forma
// data dalla migrazione 20260806130000) guarda anche `active` e `pending`.
//
// Poiché quelle funzioni girano con la SERVICE_ROLE_KEY, che bypassa la RLS,
// il loro controllo interno non era una difesa in profondità: era l'unica
// difesa. Due categorie di chiamante che ogni altro strato respinge passavano
// di lì — l'admin disattivato (cioè il modo in cui il pannello Team REVOCA i
// privilegi) e l'admin invitato e mai approvato — e le due operazioni che
// potevano compiere sono le più distruttive del sistema: invitare chiunque e
// hard-eliminare qualunque riga di auth.users.
//
// ── PERCHÉ QUESTO TEST HA DUE METÀ ────────────────────────────────────────
// (1) Il PREDICATO si esegue davvero. `_shared/adminPredicate.ts` è un modulo
//     puro e senza import — nemmeno di tipo — proprio perché Vitest gira su
//     Node e non saprebbe risolvere gli specificatori `jsr:`/`npm:` del
//     runtime Deno. La matrice qui sotto è la stessa che rls.test.js
//     provisiona lato database, verificata qui senza rete.
// (2) Il CABLAGGIO si verifica staticamente, leggendo i sorgenti delle due
//     funzioni — stessa tecnica di realtimeOriginContract.test.js, e per la
//     stessa ragione: un predicato corretto che nessuno chiama è esattamente
//     lo stato in cui il progetto si trovava. Un test sul solo predicato
//     sarebbe passato anche PRIMA della correzione, se il predicato fosse
//     esistito in un file mai importato.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  puoAgireComeAdmin,
  COLONNE_PROFILO_ADMIN,
} from "../../supabase/functions/_shared/adminPredicate.ts";

// set-user-active (12 agosto, suggerimento strategico n. 3): banna/sbanna la
// sessione di un membro del team con auth.admin.updateUserById, girando con la
// stessa service_role di invite-user/delete-user — stesso gate, per la stessa
// ragione: qui il controllo non è difesa in profondità, è l'unica difesa.
const FUNZIONI_PRIVILEGIATE = ["invite-user", "delete-user", "set-user-active"];

const sorgente = (nome) =>
  readFileSync(join(process.cwd(), "supabase", "functions", nome, "index.ts"), "utf8");

// I file delle Edge Function sono per metà commenti, e questi commenti
// DISCUTONO a lungo proprio il controllo sbagliato che stiamo cercando ("il
// controllo precedente guardava il solo `role`"). Senza toglierli, la metà (2)
// leggerebbe le spiegazioni come codice e fallirebbe sul testo che descrive la
// correzione. Stessa precauzione di realtimeOriginContract.test.js sui .sql.
const senzaCommenti = (ts) =>
  ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

// ─── (1) IL PREDICATO ──────────────────────────────────────────────────────

describe("puoAgireComeAdmin — rispecchia public.is_admin()", () => {
  // Il caso che deve passare, e uno solo: tutto il resto è un rifiuto.
  it("ammette l'admin attivo e approvato", () => {
    expect(puoAgireComeAdmin({ role: "admin", active: true, pending: false })).toBe(true);
  });

  // ── I DUE CASI DI C-1 ──
  // Non sono varianti dello stesso: sono i due percorsi realmente sfruttabili,
  // e vanno nominati perché un domani qualcuno "semplificherà" il predicato in
  // `role === "admin" && active` e questo file deve dire quale dei due sta per
  // riaprire.
  it("RIFIUTA l'admin disattivato (C-1, percorso 1: la revoca dal pannello Team)", () => {
    // TOGGLE_TEAM_MEMBER_ACTIVE scrive SOLO `active`: pending resta false.
    // La sessione di auth resta valida — `active` è una colonna applicativa,
    // non un ban — quindi senza questa condizione l'utente appena revocato
    // conserva l'accesso alle due funzioni.
    expect(puoAgireComeAdmin({ role: "admin", active: false, pending: false })).toBe(false);
  });

  it("RIFIUTA l'admin invitato e mai approvato (C-1, percorso 2: il gate pending)", () => {
    // invite-user pre-crea la riga con `pending: true, active: false`, e
    // l'invitato ottiene una sessione valida dal link d'invito.
    expect(puoAgireComeAdmin({ role: "admin", active: false, pending: true })).toBe(false);
    // La combinazione che la 20260806130000 chiama fuori esplicitamente: un
    // utente può avere active=true con pending ancora true, perché nessuno è
    // mai passato dall'approvazione che azzera pending. `active` da solo non
    // basta, ed è il motivo per cui le condizioni sono tre e non due.
    expect(puoAgireComeAdmin({ role: "admin", active: true, pending: true })).toBe(false);
  });

  it("rifiuta gli altri ruoli, anche attivi e approvati", () => {
    for (const role of ["manager", "agent", "driver"]) {
      expect(puoAgireComeAdmin({ role, active: true, pending: false }), role).toBe(false);
    }
  });

  it("rifiuta un profilo assente, nullo o senza i campi", () => {
    // `maybeSingle()` restituisce null per un utente auth senza riga in
    // public.users (invito interrotto, riga cancellata a mano): senza profilo
    // il verdetto dev'essere no, non un crash.
    expect(puoAgireComeAdmin(null)).toBe(false);
    expect(puoAgireComeAdmin(undefined)).toBe(false);
    expect(puoAgireComeAdmin({})).toBe(false);
    // Campi assenti dalla select: `undefined` non deve mai valere "sì". Il
    // caso che conta è il secondo — `pending` assente — perché lì il valore
    // mancante sarebbe quello PERMISSIVO: una select che dimentica la colonna
    // riaprirebbe in silenzio il percorso 2 di C-1. Su `active` il rifiuto
    // arriva già da `=== true`, qui è solo per simmetria.
    expect(puoAgireComeAdmin({ role: "admin" })).toBe(false);
    expect(puoAgireComeAdmin({ role: "admin", active: true })).toBe(false);
    expect(puoAgireComeAdmin({ role: "admin", active: true, pending: undefined })).toBe(false);
  });

  it("tratta i NULL come li tratta il database: active NULL = no, pending NULL = sì", () => {
    // Il database dice `active = true` (NULL non lo soddisfa) e
    // `coalesce(pending, false) = false` (NULL lo soddisfa). L'asimmetria è
    // voluta e va conservata: è la differenza fra rispecchiare il predicato SQL
    // e riscriverne una versione "più pulita" che risponde diversamente.
    expect(puoAgireComeAdmin({ role: "admin", active: null, pending: false })).toBe(false);
    expect(puoAgireComeAdmin({ role: "admin", active: true, pending: null })).toBe(true);
  });

  it("non normalizza il ruolo: il confronto è quello grezzo del database", () => {
    // `role = 'admin'` lato SQL è case-sensitive e non passa da toDbRole.
    // Accettare "Admin" qui creerebbe uno scarto fra i due verdetti proprio
    // nel punto che esiste per eliminarlo.
    expect(puoAgireComeAdmin({ role: "Admin", active: true, pending: false })).toBe(false);
    expect(puoAgireComeAdmin({ role: " admin", active: true, pending: false })).toBe(false);
  });
});

// ─── (2) IL CABLAGGIO ──────────────────────────────────────────────────────

describe("Edge Function privilegiate — il gate è cablato, non solo disponibile", () => {
  it.each(FUNZIONI_PRIVILEGIATE)("%s passa da requireActiveAdmin", (nome) => {
    const src = senzaCommenti(sorgente(nome));
    expect(src).toMatch(/import\s*\{\s*requireActiveAdmin\s*\}\s*from\s*["']\.\.\/_shared\/requireActiveAdmin\.ts["']/);
    expect(src).toMatch(/await\s+requireActiveAdmin\s*\(/);
  });

  it.each(FUNZIONI_PRIVILEGIATE)(
    "%s non rilegge il ruolo per conto proprio (è così che C-1 è nato)",
    (nome) => {
      const src = senzaCommenti(sorgente(nome));
      // Il controllo originale, nelle sue forme riconoscibili. Non è una
      // ricerca di stringhe per pedanteria: la duplicazione È il difetto —
      // due copie dello stesso controllo non divergono, restano uguali e
      // sbagliate insieme, che è quello che è successo qui.
      expect(src).not.toMatch(/\.select\(\s*["']role["']\s*\)/);
      expect(src).not.toMatch(/caller\?\.role\s*!==\s*["']admin["']/);
    },
  );

  it("la select del profilo chiede tutte e tre le colonne del predicato", () => {
    // Se il predicato guardasse un campo che la select non chiede, arriverebbe
    // `undefined` — e il verdetto sarebbe un 403 a un admin legittimo, che
    // nessuno saprebbe spiegare. La costante è condivisa apposta; qui si
    // verifica che elenchi davvero ciò che il predicato legge.
    for (const campo of ["role", "active", "pending"]) {
      expect(COLONNE_PROFILO_ADMIN, campo).toContain(campo);
    }
  });

  it("delete-account NON usa il gate admin: è self-service, e deve restarlo", () => {
    // Il controesempio che protegge dall'eccesso di zelo. Questa funzione
    // elimina l'account di CHI CHIAMA: richiedere il ruolo admin la
    // renderebbe inutilizzabile proprio per gli utenti a cui serve. Il suo
    // solo controllo corretto è "il token è valido", ed è quello che ha.
    const src = senzaCommenti(sorgente("delete-account"));
    expect(src).not.toMatch(/requireActiveAdmin/);
    expect(src).toMatch(/auth\.getUser\(\)/);
  });
});
