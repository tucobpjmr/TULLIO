# Indice della documentazione

`docs/` conteneva 50 file senza alcun ordinamento, di cui una quarantina di
handoff di sessione. Chi entrava non aveva modo di sapere quale documento
fosse ancora valido e quale fosse un resoconto storico di una sessione
conclusa mesi prima. Questo indice risponde a quella domanda.

## Vigente — da leggere

| Documento | Cosa contiene | Quando leggerlo |
|---|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Convenzioni, pattern, helper, caveat accumulati, mappa dei file | **Prima di qualsiasi modifica al codice** |
| [`SICUREZZA.md`](SICUREZZA.md) | Modello di sicurezza: RLS, ruoli, superficie esposta | Prima di toccare policy, RPC o Edge Function |
| [`MIGRAZIONI_SUPABASE.md`](MIGRAZIONI_SUPABASE.md) | Come si scrive e si applica una migrazione | Prima di aggiungere un file in `supabase/migrations/` |
| [`PROJECT_SPEC.md`](PROJECT_SPEC.md) | Specifiche funzionali e architettura | Per capire *perché* una feature è fatta così |

## Riferimento di dominio

| Documento | Cosa contiene |
|---|---|
| [`ANAGRAFICA_E_LISTE.md`](ANAGRAFICA_E_LISTE.md) | Modello dati di clienti e liste buoni viaggio |
| [`IMPORT_LISTE_VIAGGIO.md`](IMPORT_LISTE_VIAGGIO.md) | Formato e regole dell'import liste |

## Audit

Fotografie datate dello stato del progetto, con rilievi e piano d'azione. A
differenza degli handoff **restano normativi finché i rilievi sono aperti**:
ciascuno porta lo stato di avanzamento dei propri, aggiornato quando vengono
chiusi.

| Documento | Perimetro | Rilievi aperti |
|---|---|---|
| [`AUDIT_ARCHITETTURA_2026-08.md`](AUDIT_ARCHITETTURA_2026-08.md) | Architettura, sicurezza, correttezza, flusso dati (7-8 agosto 2026) | B-2 (interruttore in dashboard Supabase) |
| [`AUDIT_PERFORMANCE_2026-08.md`](AUDIT_PERFORMANCE_2026-08.md) | Performance e scalabilità lato client: bundle, code-splitting, memoizzazione, costo di render (9 agosto 2026) | **Nessuno.** P2-1/2/3 chiusi dal commit `8d3afb3`, P2-4 e P2-7 verificati chiusi il 10 agosto, P2-5 e P2-6 chiusi come ST-3 e ST-2, gli ultimi tre (P2-8/9/10) l'11 agosto come ST-9, ST-15 e ST-12. Il documento porta ora lo stato nella propria tabella. ⟦stato: 10/10 chiusi⟧ |
| [`AUDIT_STRUTTURA_2026-08-10.md`](AUDIT_STRUTTURA_2026-08-10.md) | Struttura del codice: organizzazione dei moduli, separazione delle responsabilità, duplicazione, anti-pattern React, componenti troppo estesi (10 agosto 2026) | ST-14 (interruttore in dashboard Supabase, lo stesso di B-2) — gli altri quattordici sono chiusi: ST-1…ST-5 il 10 agosto (§2-bis), ST-6…ST-13 e ST-15 l'11 agosto (§2-ter). Resta aperta **una** decisione dichiarata, non un rilievo: il secondo passo di ST-4 (messaggi per conversazione, sotto la soglia `messages > ~1500`). Il secondo passo di ST-2 — stato effimero di UI fuori dal reducer — era ancora dato per aperto qui, ma è stato fatto dal commit `fede80a`: `searchQuery` vive nel guscio (`VoyageDesk.jsx:223`), `showNotif`/`sidebarCollapsed` sono stato locale dei rispettivi componenti e non esistono più nel reducer. ⟦stato: 14/15 chiusi⟧ |
| [`AUDIT_ARCHITETTURA_2026-08-11.md`](AUDIT_ARCHITETTURA_2026-08-11.md) | Architettura, separazione delle responsabilità, duplicazione, anti-pattern React — e superficie di sicurezza riletta da capo (11 agosto 2026) | **A-3, B-2, B-3** aperti. **C-1** (critico) e **A-1** ✔ corretti nel repo e **deployati in produzione** l'11 agosto: predicato condiviso `_shared/adminPredicate.ts` + `requireActiveAdmin` (C-1, `invite-user` v9/`delete-user` v4); tabella `message_templates` + registry + idratazione (A-1). **A-2** ✔ corretto nel repo (`ClientsAPI.createMany` a blocchi + rollback parziale). **M-1…M-5 e B-1** ✔ corretti nel repo il 12 agosto (§6-bis): `meta.compensazione` letta in un punto solo dal wrapper `reducer`, otto overlay migrati a `ui/Modal.jsx` + pila dei modali per Esc, soglia di 30 s sul ritorno in primo piano, `EMPTY_TRASH` in una `delete … in (…)` atomica con rollback, `unreadChat` memoizzato, compensazioni mirate nella campanella. Tutto codice applicativo: arriva con il merge, nessun deploy separato. **B-2 e B-3 riverificati aperti il 12 agosto** (§6-ter) e non correggibili da questo repo: CDN SheetJS ancora `403` dalla egress policy, `auth_leaked_password_protection` ancora `WARN` sull'advisor live. Anche il **suggerimento strategico n. 3** (§5, non uno dei dodici rilievi contati sotto) è ✔ fatto e deployato il 12 agosto (§6-quater): la Edge Function `set-user-active` accompagna `TOGGLE_TEAM_MEMBER_ACTIVE` con un ban/unban vero lato `auth.admin`, così "disattivare" nel pannello Team revoca la sessione invece di limitarsi al flag applicativo. Il primo tentativo di applicare la migrazione di A-1 è fallito: `public.is_admin()`/`public.is_active_user()` non esistono più dalla `20260706181011` (spostate in `private`) — scarto anche in questo stesso documento e in `SICUREZZA.md`, corretto nello stesso intervento. ⟦stato: 9/12 chiusi⟧ |

## Pianificazione

| Documento | Cosa contiene |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Piano di sviluppo |
| [`ROADMAP_GO_LIVE.md`](ROADMAP_GO_LIVE.md) | Checklist per la messa in produzione |
| [`CHANGELOG.md`](CHANGELOG.md) | Storico delle versioni |

## Storico — non normativo

- [`handoff/`](handoff/) — 40 resoconti di sessione (`HANDOFF_SESSION_*.md`) e
  [`HANDOFF.md`](HANDOFF.md).

Sono un **log**, non una specifica. Documentano com'era il progetto al termine
di una certa sessione e possono contraddire lo stato attuale: sono utili per
ricostruire *perché* una decisione è stata presa, non per sapere *come*
funziona oggi il codice. Per quello valgono `CLAUDE.md` e il codice stesso.

Quando un handoff e `CLAUDE.md` si contraddicono, ha ragione `CLAUDE.md`; se
anche `CLAUDE.md` è in disaccordo col codice, il codice è la fonte di verità e
`CLAUDE.md` va corretto nello stesso commit che scopre la discrepanza.
