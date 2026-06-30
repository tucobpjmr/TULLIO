# HANDOFF — Sessione TULLIO: fix visibilità Coda Globale per Senior Agent (RLS)

**Data:** 30 giugno 2026 (sessione 39)
**Branch di lavoro:** `claude/senior-agent-queue-visibility-sgilnh`
**Per:** Claude Code / prossima sessione

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file. Sessione precedente: `docs/HANDOFF_SESSION_2026-06-29_v38_admin_mobile_dashboard_cleanup.md` (PR #85).

---

## 0. TL;DR (30 secondi)

Gli utenti **Senior Agent** non vedevano **nessun** task nella "Coda Globale" della Dashboard. Causa: **policy RLS `tasks_select`** sul DB Supabase, non il frontend. I task in coda globale hanno `assignees = '{}'`; la policy consentiva la lettura solo a `is_manager_or_admin() OR auth.uid() = ANY(assignees) OR created_by = auth.uid()`, quindi un ruolo `agent` (= Senior Agent nell'app) restava escluso. Fix: nuova migration `20260630_tasks_global_queue_agent_visibility.sql` che permette agli utenti attivi non-driver (admin/manager/agent) di leggere e prendere in carico i task in coda globale. **Migration applicata al DB live** e verificata; driver restano esclusi.

---

## 1. Diagnosi

- **Frontend OK**: `appGlobals.js` → `canViewTask` ritorna `true` per `isInGlobalQueue(task)` per qualsiasi non-driver; `Dashboard.jsx` costruisce `unassigned` correttamente. Quindi la UI mostrerebbe la coda.
- **DB il vero collo di bottiglia**: la policy live `tasks_select` era
  `is_manager_or_admin() OR auth.uid() = ANY(assignees) OR created_by = auth.uid()`.
  - `is_manager_or_admin()` controlla solo `role IN ('admin','manager')` (vedi `20260621_rls_hardening_active_users.sql`).
  - In DB il `role` è vincolato a `('admin','manager','agent','driver')` (CHECK in `20260605160705`); **Senior e Junior agent sono entrambi `agent`** — la distinzione Senior/Junior esiste solo lato frontend (`isSeniorAgent`/`isJuniorAgent` sul testo del ruolo).
  - Task coda globale → `assignees = '{}'` → nessuna delle 3 condizioni soddisfatta per un `agent` non creatore ⇒ riga nascosta dalla RLS.
- **Prova empirica** (simulando la sessione di un agente con `request.jwt.claims`): coda globale visibile = **0** su **2** task realmente presenti. Stesso buco su `tasks_update` (il bottone "Prendi in carico" sarebbe fallito).

Dati live al momento del fix: 5 agent attivi, 1 manager, 2 admin, 1 driver; 2 task in coda globale.

---

## 2. Fix — `supabase/migrations/20260630_tasks_global_queue_agent_visibility.sql`

- Nuovo helper `public.can_view_global_queue()` (SECURITY DEFINER, `search_path=public`): `true` se l'utente corrente è attivo con `role IN ('admin','manager','agent')`. Revoca a `public/anon`, grant a `authenticated`.
- `tasks_select` e `tasks_update` ricreate aggiungendo la clausola:
  `OR (cardinality(assignees) = 0 AND can_view_global_queue())`.
- **Driver esclusi** dalla coda globale (coerente con `canViewTask`, che per driver torna solo `isMyTask`). La distinzione Senior/Junior non è rappresentabile a DB (entrambi `agent`): la regola vale per tutti gli `agent`; il blocco "prendi in carico" per i Junior resta una restrizione frontend (`canEditTask`).
- WITH CHECK su update: dopo "prendi in carico" `assignees = [uid]` → soddisfa `uid = ANY(assignees)`.

---

## 3. Verifica

Simulazione RLS via `set_config('request.jwt.claims', …)`:

| Ruolo | Prima | Dopo |
|-------|-------|------|
| Senior Agent (Sofia, `agent`) | 0 | **2** ✅ |
| Driver (Giulia) | 0 | 0 ✅ (invariato) |

Migration **applicata al DB live** (`tullio` / `vmxvnxsqfisucugcpqlc`) via MCP `apply_migration` (registrata nello storico migrations) **e** versionata nel repo.

---

## 4. Note / possibili follow-up

- **Divergenza residua (non in scope)**: `canViewTask` lato frontend ritorna `true` anche per `isUrgent(task)` di altri (tab "Urgenti"), ma la RLS `tasks_select` non espone i task urgenti non assegnati/non creati dall'utente. Se la tab "Urgenti" deve mostrare task altrui agli agent, servirà un'estensione RLS analoga. Non toccato qui: il bug riportato riguardava solo la Coda Globale.
- Se in futuro si vuole distinguere Senior/Junior a livello DB, andrà aggiunto un valore di ruolo dedicato (oggi il CHECK ammette solo i 4 ruoli base).
