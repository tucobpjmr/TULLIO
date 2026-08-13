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
| [`AUDIT_ARCHITETTURA_2026-08.md`](AUDIT_ARCHITETTURA_2026-08.md) | Architettura, sicurezza, correttezza, flusso dati (7-8 agosto 2026) | **Nessuno.** B-2 (`leaked_password_protection`) era l'unico non chiuso: **accettato il 12 agosto** — richiede il piano Supabase Pro, il progetto resta sul Free per scelta di chi lo amministra, non un interruttore dimenticato. |
| [`AUDIT_PERFORMANCE_2026-08.md`](AUDIT_PERFORMANCE_2026-08.md) | Performance e scalabilità lato client: bundle, code-splitting, memoizzazione, costo di render (9 agosto 2026) | **Nessuno.** P2-1/2/3 chiusi dal commit `8d3afb3`, P2-4 e P2-7 verificati chiusi il 10 agosto, P2-5 e P2-6 chiusi come ST-3 e ST-2, gli ultimi tre (P2-8/9/10) l'11 agosto come ST-9, ST-15 e ST-12. Il documento porta ora lo stato nella propria tabella. ⟦stato: 10/10 chiusi⟧ |
| [`AUDIT_STRUTTURA_2026-08-10.md`](AUDIT_STRUTTURA_2026-08-10.md) | Struttura del codice: organizzazione dei moduli, separazione delle responsabilità, duplicazione, anti-pattern React, componenti troppo estesi (10 agosto 2026) | **Nessun rilievo aperto.** Tutti e quindici chiusi o accettati: ST-1…ST-5 il 10 agosto (§2-bis), ST-6…ST-13 e ST-15 l'11 agosto (§2-ter), ST-14 (`leaked_password_protection`, lo stesso di B-2) **accettato il 12 agosto** — richiede il piano Supabase Pro, il progetto resta sul Free per scelta. Resta aperta **una** decisione dichiarata, non un rilievo: il secondo passo di ST-4 (messaggi per conversazione, sotto la soglia `messages > ~1500`). Il secondo passo di ST-2 — stato effimero di UI fuori dal reducer — era ancora dato per aperto qui, ma è stato fatto dal commit `fede80a`: `searchQuery` vive nel guscio (`VoyageDesk.jsx:223`), `showNotif`/`sidebarCollapsed` sono stato locale dei rispettivi componenti e non esistono più nel reducer. ⟦stato: 15/15 chiusi⟧ |
| [`AUDIT_ARCHITETTURA_2026-08-11.md`](AUDIT_ARCHITETTURA_2026-08-11.md) | Architettura, separazione delle responsabilità, duplicazione, anti-pattern React — e superficie di sicurezza riletta da capo (11 agosto 2026) | **A-3, B-2** aperti. **C-1** (critico) e **A-1** ✔ corretti nel repo e **deployati in produzione** l'11 agosto: predicato condiviso `_shared/adminPredicate.ts` + `requireActiveAdmin` (C-1, `invite-user` v9/`delete-user` v4); tabella `message_templates` + registry + idratazione (A-1). **A-2** ✔ corretto nel repo (`ClientsAPI.createMany` a blocchi + rollback parziale). **M-1…M-5 e B-1** ✔ corretti nel repo il 12 agosto (§6-bis): `meta.compensazione` letta in un punto solo dal wrapper `reducer`, otto overlay migrati a `ui/Modal.jsx` + pila dei modali per Esc, soglia di 30 s sul ritorno in primo piano, `EMPTY_TRASH` in una `delete … in (…)` atomica con rollback, `unreadChat` memoizzato, compensazioni mirate nella campanella. Tutto codice applicativo: arriva con il merge, nessun deploy separato. **B-2 riverificato aperto il 12 agosto** (§6-ter), non correggibile da questo repo: CDN SheetJS ancora `403` dalla egress policy. **B-3 accettato il 12 agosto** (§6-ter): `leaked_password_protection` richiede il piano Supabase Pro, il progetto resta sul Free per scelta — non è più un rilievo aperto, `auth_leaked_password_protection` è ora in `AVVISI_ACCETTATI`. Anche il **suggerimento strategico n. 3** (§5, non uno dei dodici rilievi contati sotto) è ✔ fatto e deployato il 12 agosto (§6-quater): la Edge Function `set-user-active` accompagna `TOGGLE_TEAM_MEMBER_ACTIVE` con un ban/unban vero lato `auth.admin`, così "disattivare" nel pannello Team revoca la sessione invece di limitarsi al flag applicativo. Il primo tentativo di applicare la migrazione di A-1 è fallito: `public.is_admin()`/`public.is_active_user()` non esistono più dalla `20260706181011` (spostate in `private`) — scarto anche in questo stesso documento e in `SICUREZZA.md`, corretto nello stesso intervento. ⟦stato: 10/12 chiusi⟧ |
| [`AUDIT_ARCHITETTURA_2026-08-12.md`](AUDIT_ARCHITETTURA_2026-08-12.md) | Architettura, struttura, separazione delle responsabilità, duplicazione, anti-pattern React e sicurezza — **primo audit che verifica anche lo stato reale della produzione e della CI**, non il solo repository (12 agosto 2026) | **Tutti e 14 i rilievi ✔ chiusi**, in tre interventi fra il 12 e il 13 agosto (§4, §4-bis, §4-ter). **C-1, A-1, A-2, A-3 e A-4 il 12-13 agosto** (§4). **C-1** (critico) era il rilievo che dettava il calendario: `TaskThreads.comments()`/`history()` leggono senza paginazione due tabelle a crescita monotona — `task_history` è a 621 righe con ~14,8/giorno, cioè **~26 giorni** dal cap `db-max-rows`, dopo i quali la cronologia sarebbe sparita dalla UI a ogni evento realtime senza alcun errore. Corretto: `TaskThreads.comments/history` e `Tasks.list` passano ora da `fetchAllRows`, e con loro non resta una sola lettura del data layer che possa essere troncata in silenzio (il costo di `count: 'exact'` sulla select annidata dei task, l'unica riserva che teneva ferma la terza, è stato misurato: 11 ms contro un timeout di 8 s). Blindato da 12 nuovi casi in `paginazione.test.js`. **A-1** ✔ il workflow *Verifica RPC* era rosso a ogni run dall'8 agosto perché la `20260808120000` risultava non applicata — in realtà lo era (verificata colonna per colonna e funzione per funzione), mancava la sola riga in `schema_migrations`, ora registrata. **A-2 ✔ chiuso il 13 agosto**: il controllo advisor non aveva **mai** girato perché `SUPABASE_ACCESS_TOKEN` non era configurato e lo script usciva 0 in silenzio — corretta prima la parte di codice (annotazione `::warning` sul salto), poi chi amministra il repository ha generato il Personal Access Token e configurato il secret; rilanciato con `workflow_dispatch` (run #91), il log conferma **20 lint valutati realmente** (0 errori, 0 avvisi non accettati, 10 avvisi motivati), non più il messaggio di skip. **A-3** ✔ era un consolidamento lasciato a metà — `views/archiveFilters.js` nato per unificare tre copie di `filterByPeriod`/`PERIOD_OPTIONS`/`chipStyle`, `Trash.jsx` restato con la terza — corretto passando `Trash.jsx` alle stesse funzioni condivise di `Archive.jsx`/`ArchivedListe.jsx`: −32 righe (458 da 490), la stessa etichetta ("Sempre") in tutte e tre le viste. **A-4** ✔ `ListeViaggio.jsx` era a 495/500 righe: estratti `liste/listeOrdinamento.js` (filtro, insiemi e ordinamento della home, funzioni pure) e `liste/ListaRow.jsx` (il secondo componente del file) — chiude anche uno dei casi `react/no-multi-comp` (tornato a 19 in 12 file). Test: **1150 verdi**, lint 0 errori/19 warning, `verifica:convenzioni` nessuna divergenza. **Secondo intervento, stesso 13 agosto (§4-bis): M-2, M-3, M-4, M-5, M-6, B-1, B-2 e B-3 ✔ chiusi.** M-2 anonimizza `public.users` e cancella `user_contacts`/`push_subscriptions`/l'avatar invece di limitarsi al ban; M-3 accetta i due lint SECURITY DEFINER per (lint, oggetto) invece che per solo lint, fail-closed su `metadata.name` mancante; M-4 aggiunge `pending` a `canAccessListe`, come già in `can_liste()` dal 6 agosto; M-5 aggiunge il guard admin esplicito più il confronto post-scrittura che smaschera un revert silenzioso del trigger; M-6 sposta il caricamento dei font su `<link>`+`preconnect` nell'HTML iniziale; B-1 valida `capacity`/`color` in `invite-user`; B-2 fa paginare `Messages.listAll` oltre il cap con `fetchRowsUpTo`; B-3 azzera `react/no-multi-comp` (0 in 0 file, ogni componente locale in un file suo). **M-1 ✔ chiuso il 13 agosto, terzo intervento (§4-ter)**, dopo essere stato aperto e documentato come tale: 1.153 `style={{…}}` fatti di soli letterali sollevati a costanti di modulo (1.487 → **334**, tutti con almeno una proprietà dinamica), i due `<style>` iniettati a runtime diventati `styles/global.css` e `liste/liste.css` emessi da Vite, e `'unsafe-inline'` **tolto da `style-src`** — l'ultima direttiva permissiva della CSP. Il sollevamento non è un refactor visivo e per questo non serviva un browser: l'inizializzatore di ogni costante è la fetta di sorgente originale dell'oggetto, e per tutti e 1.153 gli attributi la costante è stata risolta e confrontata con la forma di prima (zero difformità). La CSP invece è stata provata in Chromium contro il build reale: 0 violazioni, 13 elementi con attributo `style` correttamente resi. §4-ter corregge anche una frase di §4-bis che dava il passo per impossibile — «il risultato passa comunque dall'attributo style» — ed era sbagliata: React scrive via CSSOM, che la CSP non intercetta. Due guardie perché il numero non risalga: una regola `no-restricted-syntax` a zero violazioni e i 334 rimasti rimisurati da `verifica:convenzioni`. Test: **1168 verdi**. ⟦stato: 14/14 chiusi⟧ |

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
