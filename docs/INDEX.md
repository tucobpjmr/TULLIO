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

## Pianificazione

| Documento | Cosa contiene |
|---|---|
| [`ROADMAP.md`](ROADMAP.md) | Piano di sviluppo |
| [`ROADMAP_GO_LIVE.md`](ROADMAP_GO_LIVE.md) | Checklist per la messa in produzione |
| [`CHANGELOG.md`](CHANGELOG.md) | Storico delle versioni |

## Storico — non normativo

- [`handoff/`](handoff/) — 39 resoconti di sessione (`HANDOFF_SESSION_*.md`) e
  [`HANDOFF.md`](HANDOFF.md).

Sono un **log**, non una specifica. Documentano com'era il progetto al termine
di una certa sessione e possono contraddire lo stato attuale: sono utili per
ricostruire *perché* una decisione è stata presa, non per sapere *come*
funziona oggi il codice. Per quello valgono `CLAUDE.md` e il codice stesso.

Quando un handoff e `CLAUDE.md` si contraddicono, ha ragione `CLAUDE.md`; se
anche `CLAUDE.md` è in disaccordo col codice, il codice è la fonte di verità e
`CLAUDE.md` va corretto nello stesso commit che scopre la discrepanza.
