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
| [`AUDIT_STRUTTURA_2026-08-10.md`](AUDIT_STRUTTURA_2026-08-10.md) | Struttura del codice: organizzazione dei moduli, separazione delle responsabilità, duplicazione, anti-pattern React, componenti troppo estesi (10 agosto 2026) | ST-14 (interruttore in dashboard Supabase, lo stesso di B-2) — gli altri quattordici sono chiusi: ST-1…ST-5 il 10 agosto (§2-bis), ST-6…ST-13 e ST-15 l'11 agosto (§2-ter). Delle due decisioni dichiarate (non rilievi), il secondo passo di ST-2 (stato effimero di UI fuori dal reducer) è stato deciso e chiuso l'11 agosto (PR #171, §2-quater); resta aperto solo il secondo passo di ST-4 (messaggi per conversazione, sotto la soglia `messages > ~1500` — riconfermato a 13 messaggi l'11 agosto). ⟦stato: 14/15 chiusi⟧ |

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
