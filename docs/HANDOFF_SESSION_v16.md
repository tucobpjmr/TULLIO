# HANDOFF — Sessione 21: Scelta Fase 2 vs Fase 3 (dopo Fase 1 completata)

**Data:** Post sessione 20 (giugno 2026, sessione 21)  
**Sessione precedente:** Sessione 20 ha completato **Fase 1 CRM** (PR #51, #52, #53; caveat #26 e #27 chiusi). Nessun caveat aperto.  
**Per:** Claude Code / Claude Cowork (sessione 21)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-14_v15.md` per il contesto Fase 1.

---

## 0. TL;DR (60 secondi)

- ✅ **Fase 1 COMPLETA**. Anagrafica Clienti + Fornitori + Pratiche + Task↔Pratica + DossierSuppliers UI + filtro pratica in Ricerca.
- ✅ **Build verde** a 252.04 kB / 59.47 kB gz. Nessun caveat aperto.
- 🚧 **SCELTA SESSIONE 21**: Due strade parallele (non sequenziali):
  - **Fase 2 Operatività** (Notifiche pratiche, Calendario avanzato) → migliora workflow quotidiano.
  - **Fase 3 Finanziario** (Modulo costi fornitori vs budget, margini per pratica) → sblocca valore immediato € (colonne DB già presenti).
- 📋 **Architettura**: tutte le colonne necessarie (`dossier_suppliers.cost`, `dossiers.budget_total`) sono già in produzione. Nessun blocco tecnico su Fase 3.

---

## 1. Stato Fase 1 (riassunto sessione 20)

### ✅ Completa
| Modulo | PR | Stato |
|--------|-----|--------|
| Task ↔ Pratica | #51 | ✅ Mergeat, `dossierId` mappato su QuickAddTask + TaskSlideOver |
| Fornitori pratica (DossierSuppliers) | #52 | ✅ Mergeat, `FornitoriPanel` in `PraticaDetail`, CRUD locale ottimistico |
| Filtro pratica Ricerca avanzata | #53 | ✅ Mergeat, keyword search arricchita, badge 📁 nei risultati |
| Docs | #54 | ✅ Mergeat (handoff v15, changelog v2.2-dev, ROADMAP, CLAUDE.md updates) |

### Build
```
dist/assets/index-*.js   252.04 kB │ gzip: 59.47 kB
✅ Tutti i test Vercel Preview verdi a ogni merge.
```

### Caveat
**Nessun caveat aperto.** Fase 1 chiusa.

---

## 2. Punto decisionale — Fase 2 vs Fase 3

Entrambe sono **sbloccate e indipendenti**. Possono procedere in parallelo o in sequenza. Scelta dipende dal valore desiderato per l'utente finale.

### 📊 Opzione A: Fase 2 Operatività (Notifiche + Calendario pratiche)

**Beneficio**: Workflow giornaliero in tempo reale. I manager ricevono avvisi su cambio status pratica, date imminenti.

**Componenti**:
1. **Notifiche pratiche** (nuove trigger DB):
   - Change status pratica (Bozza → Confermata → In corso → Completata/Annullata)
   - Scadenza partenza imminente (es. <7 giorni)
   - Pattern simile a `notify_task_assigned` (Step J, sessione 11) ma su `dossiers` table.
   
2. **Calendario avanzato** (estensione CalendarPlanner):
   - Sovrapporre date `departure_date`/`return_date` delle pratiche come barre/blocchi colore per pratica.
   - Tooltip con numero pratica, cliente, destinazione, pax.
   - Integrato in vista Mese/Settimana/Giorno.

**Stima sforzo**: M (2–3 sessioni). Prerequisiti: nessuno.

---

### 💰 Opzione B: Fase 3 Finanziario (Costi fornitori, margini, budget)

**Beneficio**: Visibilità economica per pratiche. Ogni agenzia sa il margine lordo pratica vs budget preventivato.

**Componenti**:
1. **Riepilogo economico in PraticaDetail**:
   - Somma dei `dossier_suppliers.cost` per pratica.
   - Confronto vs `dossiers.budget_total` → **Margine lordo** (budget - sum costi).
   - Indicatore visivo: 🟢 (margine positivo), 🟡 (margine piccolo), 🔴 (over budget).
   - Percentuale scostamento: `(sum_costs / budget) * 100`.

2. **Tabella riepilogo Pratiche**:
   - Aggiungere colonne Budget, Costi fornitori, Margine, % Scostamento.
   - Filtro/ordinamento per margine, over-budget flag.

3. **Report finanziario (Admin)** (opzionale, Fase 3+):
   - Per cliente: costi totali, budget, margine cumulativo.
   - Per periodo: trend margini nel tempo.
   - Export PDF.

**Stima sforzo**: M per base (riepilogo PraticaDetail), L per report avanzato. Prerequisiti: Fase 1 completa ✅.

**Vantaggio architetturale**: Le colonne DB **già esistono** in produzione (`cost` numeric, `budget_total` numeric). Zero migration. Puro mapping UI + calcoli.

---

## 3. Architettura tecnica disponibile

### DB: nessun debito
```
dossiers:
  - id (uuid, PK)
  - number (text, PR-YYYY-NNN, auto-generated via trigger ✅)
  - title, status (bozza/confermata/in_corso/completata/annullata)
  - client_id (FK), departure_date, return_date
  - pax_adults, pax_children
  - budget_total (numeric, DEFAULT 0)  ← PRONTO PER FASE 3
  - created_at, updated_at

dossier_suppliers:
  - id (uuid, PK)
  - dossier_id (FK → dossiers)
  - supplier_id (FK → suppliers)
  - service_type (text, es. "hotel", "volo", "transfer")
  - cost (numeric, DEFAULT 0)  ← PRONTO PER FASE 3
  - notes (text)
  - created_at
```

### API + Mappers: pronte
- `Dossiers.list()` include join `dossier_suppliers(*, suppliers(*))`.
- `fromDbDossier` e `toDbDossier` già mappano `budgetTotal`.
- `fromDbDossierSupplier` mappa `cost`.

### UI: punto di innesto
- `PraticaDetail` ha il pannello `FornitoriPanel` (sessione 20) che lista i fornitori collegati con costi.
- Nuovo elemento: **riepilogo economico** (piccola sezione sopra/sotto FornitoriPanel) che calcola somma costi e mostra margine.

---

## 4. Consiglio sessione 21

**Non è scelta "giusta vs sbagliata"**. Dipende da cosa serve prima:

| Scenario | Consiglio |
|----------|-----------|
| **Manager vuole visibilità economica NOW** (valore € per il prezzo) | → **Fase 3 base** (riepilogo PraticaDetail in 1–2 sessioni) |
| **Team lavora a scadenze giornaliere** (scadenze imminenti, partenze) | → **Fase 2** (notifiche + calendario pratiche) |
| **Entrambi importanti** | → **Parallelo**: 2 branch, completare Fase 3 base in 1 sessione, Fase 2 in 2 sessioni |

**Raccomandazione personale**: Se sei in agenzia viaggi **reale**, il **Fase 3 Finanziario base** è 1–2 settimane di valore tangibile ($). Fase 2 è QoL (qualità della vita). Entrambe sbloccate. Scegli in base alle priorità del business.

---

## 5. Note tecniche

### Fase 2 — Notifiche pratiche
Pattern identico a Step J (sessione 11, `notify_task_assigned`):
```sql
CREATE OR REPLACE FUNCTION notify_dossier_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, type, payload, created_at)
    SELECT 
      u.id,
      'dossier_status_change',
      jsonb_build_object('dossier_id', NEW.id, 'dossier_number', NEW.number, 'new_status', NEW.status, 'client_name', (SELECT c.name FROM clients c WHERE c.id = NEW.client_id)),
      NOW()
    FROM public.users u
    WHERE u.role IN ('admin', 'manager')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
```

### Fase 3 — Riepilogo economico
Calcolo lato componente (React):
```javascript
const costSum = (suppliers || []).reduce((acc, s) => acc + (s.cost || 0), 0);
const budget = dossier.budgetTotal || 0;
const margin = budget - costSum;
const marginPct = budget > 0 ? (costSum / budget) * 100 : 0;
const status = margin >= 0 ? 'positive' : margin > -budget * 0.1 ? 'warning' : 'over';
```

Render: card con 3 KPI (Budget, Costi, Margine) + barra percentuale colorata.

---

## 6. Prossimi step (sessione 21+)

| Fase | Step | Sforzo | Quando |
|------|------|--------|--------|
| **2** | Notifiche pratiche (trigger + UI in NotificationsPanel) | M | Sessione 21 se scelta A |
| **2** | Calendario avanzato (overlay date pratiche) | M | Sessione 21–22 se scelta A |
| **3** | Riepilogo economico PraticaDetail | S | Sessione 21 se scelta B |
| **3** | Tabella Pratiche con colonne Budget/Costi/Margine | S | Sessione 21–22 se scelta B |
| **3** | Report Admin (per cliente, per periodo, export PDF) | L | Sessione 23+ |
| **Tutti** | Realtime/refresh manuale CRM (today one-shot al mount) | S | After Fase 2 or 3 base |
| **Tutti** | `BulkTaskCreator`: selettore pratica | S | After Fase 2 or 3 base |

---

## 7. Caveat aperti (aggiornato)

| # | Stato | Descrizione | Tipo |
|---|-------|-------------|------|
| #1–#27 | ✅ chiusi | Vedi cronologia CHANGELOG | — |
| **Residui Fase 2** | ⬜ | Realtime/refresh CRM; BulkTaskCreator selector pratica | QoL |

**Nessun caveat bloccante per Fase 2 o Fase 3.**

---

## 8. Checklist sessione 21 (pre-decisione)

- [ ] Leggere `docs/ROADMAP.md` aggiornato (Fase 1 ✅, Fase 2 vs 3 opzioni)
- [ ] Discutere con stakeholder: priorità (€ vs QoL)?
- [ ] Scegliere branch: `claude/fase2-*` o `claude/fase3-*` (o parallelo con 2 branch)
- [ ] Kickoff in loop (plan + code + test + commit + push)

---

**Riassunto**: Sei a un branching point con architettura solida da entrambi i lati. Scelta è business, non tecnica.
