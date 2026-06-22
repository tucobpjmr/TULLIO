# HANDOFF — Session 34 (Roadmap "Operatività 100%" + Allegati Task → OneDrive → WhatsApp)

> **Status**: documento di pianificazione (nessun codice applicativo nuovo, solo handoff + roadmap)
> **Branch**: `claude/remove-hours-task-creation-1scdk1`
> **PR**: #76 (draft)
> **Base**: `main`
> **Sessione precedente**: v33 (Block 4 — Account Management ✅)

---

## 0. TL;DR

L'utente vuole portare la web app al **100% di operatività** aggiungendo **due nuove funzioni**:

1. **Allega da OneDrive** — l'utente sceglie un file dal proprio OneDrive (account **Azure personale / MSA**) e lo allega a un task. **Decisione presa**: il file viene **copiato nello storage dell'app** (Supabase), non solo linkato.
2. **Invia file da WhatsApp a un task** — l'utente invia un file via **WhatsApp** e questo viene allegato a un task dell'app. **Decisione presa**: si usa l'**API ufficiale Meta WhatsApp Business Cloud** (numero dedicato + app Meta). Routing scelto: **codice task nella didascalia** del messaggio.

### ⚠️ Scoperta bloccante (prerequisito comune)
**I task NON hanno allegati reali oggi.** In `src/components/tasks/TaskSlideOver.jsx` (righe ~232-239) c'è solo un **placeholder inerte** ("📎 Trascina file qui o clicca per caricare") che non fa nulla. Non esiste:
- tabella `task_files`,
- bucket storage per i task,
- API `TaskFiles.*`,
- UI di upload/lista/download.

➡️ **Entrambe le funzioni richieste poggiano su un'infrastruttura allegati-task che va costruita PRIMA.** Questo è il **Block 5** qui sotto, ed è il vero gating item.

---

## 1. Stato di partenza (cosa esiste già)

| Asset | Stato | Riferimento |
|---|---|---|
| Storage privato per **chat** | ✅ funzionante | bucket `chat-files`, migration `20260611_chat_files_storage.sql`, `Messages.uploadFile()` in `src/lib/api.js:217` |
| Pattern upload client → bucket | ✅ riusabile | `Messages.uploadFile(file, conversationId)` (path `<convId>/<uuid>-<nome>`, signed URL per download) |
| Edge Functions (pattern) | ✅ 2 esistenti | `supabase/functions/invite-user/`, `supabase/functions/delete-account/` (verify_jwt, admin client) |
| Mappatura telefono → utente | ✅ esiste | `user_contacts.phone` (migration `20260613100833_user_contacts_table.sql`) — chiave per il routing WhatsApp |
| RLS task | ✅ | `tasks_select`: `is_manager_or_admin() OR auth.uid() = ANY(assignees)` (coda globale = assignees vuoti) — da rispecchiare sul bucket task-files |
| Allegati **task** | ⛔ **assenti** | solo placeholder in `TaskSlideOver.jsx` |

**Pattern di riferimento per upload** (da `src/lib/api.js`):
```js
uploadFile: async (file, conversationId) => {
  const path = `${conversationId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from('chat-files').upload(path, file);
  // ... crea signed URL per il download
}
```

---

## 2. Roadmap "Operatività 100%" (blocchi in ordine di dipendenza)

```
Block 5  Allegati Task (fondazione)        ──┬── prerequisito di 6 e 7
Block 6  Allega da OneDrive (Azure MSA)      │
Block 7  Invia file da WhatsApp              │
Block 8  Rifiniture "100% usable"          ──┘ (sicurezza/onboarding residui)
```

---

### 🧱 Block 5 — Allegati Task (FONDAZIONE) — 🔴 Alta — Sforzo M

Obiettivo: rendere reale l'area "ALLEGATI" del task, con upload diretto, lista, download, eliminazione e **provenienza** (manuale / OneDrive / WhatsApp).

**5.1 — Migration DB** (`supabase/migrations/<data>_task_files.sql`)
```sql
create table public.task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  file_name   text not null,
  file_size   bigint,
  file_type   text,
  file_url    text not null,                 -- path nel bucket task-files
  source      text not null default 'upload' -- 'upload' | 'onedrive' | 'whatsapp'
              check (source in ('upload','onedrive','whatsapp')),
  uploaded_by uuid references public.users(id),
  created_at  timestamptz not null default now()
);
alter table public.task_files enable row level security;

-- visibilità = stessa di tasks (manager/admin oppure assegnatario)
create policy task_files_select on public.task_files for select to authenticated
using (exists (select 1 from public.tasks t where t.id = task_id
  and (public.is_manager_or_admin() or auth.uid() = any(t.assignees))));
create policy task_files_insert on public.task_files for insert to authenticated
with check (exists (select 1 from public.tasks t where t.id = task_id
  and (public.is_manager_or_admin() or auth.uid() = any(t.assignees))));
create policy task_files_delete on public.task_files for delete to authenticated
using (uploaded_by = auth.uid() or public.is_admin());
```

**5.2 — Bucket storage** `task-files` (privato, limite es. 25 MB)
```sql
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files','task-files', false, 26214400) on conflict (id) do nothing;
```
Policy su `storage.objects` che rispecchiano la visibilità del task (path convention `<task_id>/<uuid>-<nome>`, deriva l'autorizzazione dal 1° segmento = `task_id`, come fa già `chat-files`). Vedi `chat_files_select/insert/delete` come template, sostituendo il join su `conversations` con un join su `tasks`.

**5.3 — API** (`src/lib/api.js`, nuovo export `TaskFiles`)
- `list(taskId)` → righe + signed URL
- `upload(file, taskId, source='upload')` → upload bucket + insert riga
- `remove(id, path)` → delete riga + delete object
- `createSignedUrl(path)` per il download

**5.4 — UI** (`src/components/tasks/TaskSlideOver.jsx`)
- Sostituire il placeholder (righe ~232-239) con:
  - dropzone reale (drag & drop + click → `<input type=file>`),
  - lista allegati con icona per tipo, nome, dimensione, **badge provenienza** (manuale / ☁️ OneDrive / 🟢 WhatsApp), pulsanti download/elimina,
  - stato loading durante upload, toast su errore.
- Caricare gli allegati al mount del task (o lazy quando si apre lo slide-over).

**5.5 — Test** (Vitest): helper puri (formattazione dimensione file, icona da mime, validazione dimensione/limite).

**Deliverable**: allegati funzionanti end-to-end via upload manuale. Da qui in poi OneDrive e WhatsApp sono "solo" sorgenti alternative che chiamano `TaskFiles.upload(..., source)`.

---

### ☁️ Block 6 — Allega da OneDrive (account Azure personale) — 🟡 Media — Sforzo M

**Prerequisito**: Block 5 completo.

**6.1 — Setup Azure (manuale, una tantum — fuori dal codice)**
1. Portale Azure → **App registrations** → New registration.
2. *Supported account types*: **"Personal Microsoft accounts only"** (o "any org + personal" se servono anche account business). Per OneDrive personale MSA va bene "personal".
3. *Redirect URI*: tipo **SPA** → l'origin dell'app (es. `https://tullio-...vercel.app` e `http://localhost:5173`).
4. *API permissions* (delegated, Microsoft Graph): `Files.Read`, `User.Read`, `offline_access`. Nessun consenso admin necessario per scope delegati base.
5. Copiare il **Application (client) ID** → diventa env pubblica `VITE_AZURE_CLIENT_ID`. **Nessun client secret** (SPA con PKCE).

**6.2 — Frontend: file picker**
- Opzione consigliata: **OneDrive File Picker v8** (popup ufficiale Microsoft) — gestisce auth + UI di selezione e restituisce `driveId` + `itemId` + token di accesso delegato. In alternativa **MSAL.js** (`@azure/msal-browser`) + chiamate Graph manuali.
- Dipendenza nuova: `@azure/msal-browser` (e/o lo script del picker). Documentare come eccezione vendor (come SheetJS).
- UI: nel dropzone allegati del task, bottone **"☁️ Allega da OneDrive"** → apre il picker → l'utente sceglie un file.

**6.3 — Edge Function `onedrive-import`** (`supabase/functions/onedrive-import/index.ts`, `verify_jwt: true`)
Motivo del server-side: i file possono essere grandi e non vogliamo gestire il download/CORS lato browser né esporre token in modo improprio.
- Input dal client: `{ taskId, driveId, itemId, accessToken }` (token delegato dell'utente Microsoft, ottenuto dal picker/MSAL).
- Verifica JWT Supabase → `user.id`; controlla che l'utente possa editare il task.
- Scarica i byte da Microsoft Graph: `GET https://graph.microsoft.com/v1.0/drives/{driveId}/items/{itemId}/content` con `Authorization: Bearer <accessToken>`. (Per OneDrive personale si può usare anche `/me/drive/items/{itemId}/content`.)
- Carica nel bucket `task-files` (service-role) e inserisce riga `task_files` con `source='onedrive'`, `uploaded_by = user.id`.
- Ritorna la riga creata; il client aggiorna la lista.
- **Limiti**: gestire timeout/dimensione (file molto grandi → considerare upload a chunk o limite). Validare mime/size.

**6.4 — Env / secrets**
- Frontend: `VITE_AZURE_CLIENT_ID` (pubblica).
- Edge Function: nessun secret Microsoft necessario (usa il token delegato passato dal client). Usa già `SUPABASE_SERVICE_ROLE_KEY` dell'ambiente.

**Rischi/Note**:
- Il token delegato è a vita breve; il picker lo fornisce al momento → l'import deve avvenire subito.
- Account **personale** MSA: alcune feature SharePoint/business non si applicano; restare su `/me/drive`.
- Verificare i redirect URI per ogni ambiente (preview Vercel ha URL dinamici → registrare il dominio stabile o usare un dominio custom).

---

### 🟢 Block 7 — Invia file da WhatsApp a un task — 🟡 Media — Sforzo L

**Prerequisito**: Block 5 completo. **Decisione**: API ufficiale **Meta WhatsApp Business Cloud**. **Routing**: codice task nella didascalia.

**7.1 — Setup Meta (manuale, una tantum — fuori dal codice)**
1. **Meta for Developers** → crea App (tipo Business) → aggiungi prodotto **WhatsApp**.
2. Ottieni un **numero di test** (gratis) o registra un **numero dedicato** reale (NB: non può essere un numero già usato su WhatsApp personale).
3. Genera un **token di accesso permanente** (System User token) → secret `WHATSAPP_TOKEN`.
4. Annota il **Phone Number ID** → secret `WHATSAPP_PHONE_NUMBER_ID`.
5. Configura il **Webhook**: callback URL = URL dell'Edge Function (vedi 7.2), `verify_token` a tua scelta → secret `WHATSAPP_VERIFY_TOKEN`. Sottoscrivi il campo `messages`.
6. Annota l'**App Secret** → secret `WHATSAPP_APP_SECRET` (per validare la firma `X-Hub-Signature-256`).

**7.2 — Edge Function `whatsapp-webhook`** (`supabase/functions/whatsapp-webhook/index.ts`, **`verify_jwt: false`** — endpoint pubblico chiamato da Meta)
- **GET** (verifica webhook): se `hub.mode=subscribe` e `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → rispondi `hub.challenge`.
- **POST** (eventi in arrivo):
  1. **Verifica firma** `X-Hub-Signature-256` (HMAC-SHA256 del body con `WHATSAPP_APP_SECRET`). Rifiuta se non valida.
  2. Estrai il messaggio: mittente (`from` = numero E.164), eventuale **media** (image/document/audio/video → `media_id`), e **caption/testo**.
  3. **Routing**: estrai il **codice task** dalla didascalia con regex (es. `#T?([0-9a-zA-Z]{6,8})`). Mappa il codice → `task_id`.
  4. **Autorizzazione mittente**: cerca `user_contacts.phone == from` → ottieni `user_id`. Se non trovato → ignora/risponde "numero non riconosciuto". (Sicurezza: non allegare da numeri sconosciuti.)
  5. **Scarica il media**: `GET https://graph.facebook.com/v20.0/{media_id}` (con `WHATSAPP_TOKEN`) → ritorna un URL → scarica i byte (Bearer token).
  6. Carica nel bucket `task-files` (service-role) + insert `task_files` con `source='whatsapp'`, `uploaded_by = user_id`.
  7. (Opzionale) Invia **conferma WhatsApp**: "✅ Allegato al task «titolo»".
  8. Rispondi sempre `200` velocemente a Meta (idealmente processa in modo non bloccante).

**7.3 — Codice task & UX lato app**
- Serve un **codice breve e leggibile** per il task. I task hanno UUID → due opzioni:
  - (a) primi 8 caratteri dell'UUID (zero migration, ma poco "umano"),
  - (b) **nuova colonna `tasks.short_code`** (es. 6 char base36, indicizzata univoca) — consigliata per leggibilità.
- In `TaskSlideOver`: mostrare un box **"Invia file da WhatsApp"** con il numero WhatsApp dell'agenzia + istruzione: *"Invia il file a +XX con didascalia `#T<codice>`"* + bottone "copia codice".

**7.4 — Env / secrets (Edge Function)**
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (+ `SUPABASE_SERVICE_ROLE_KEY` già presente).

**7.5 — Evoluzione fase 2 (opzionale)** — "Collega WhatsApp dall'app"
Tabella `whatsapp_link_sessions(user_id, task_id, expires_at)`: l'utente apre il task → "Collega WhatsApp" → finestra di N minuti in cui i file inviati da quel numero vanno automaticamente a quel task (niente codice da digitare). Più fluido ma richiede stato server e gestione TTL.

**Rischi/Note**:
- Numero dedicato: un numero su WhatsApp **Business Cloud** non può coincidere con un WhatsApp personale attivo.
- Costi: gratis entro le soglie Meta per i messaggi in entrata; i messaggi di conferma in uscita possono rientrare nella finestra di servizio 24h (gratuita) se l'utente ha scritto per primo.
- L'endpoint è pubblico: la **verifica firma** è obbligatoria; non fidarsi mai del `from` senza il match su `user_contacts`.

---

### ✅ Block 8 — Rifiniture "100% usable" (sicurezza & onboarding residui)

Voci già note dalla roadmap, da chiudere per dire "100%":

| Voce | Priorità | Sforzo | Dove |
|---|---|---|---|
| **HIBP** — protezione password compromesse | 🔴 | S (config) | Dashboard Supabase → Auth → Password Protection (toggle, **non** via codice/SQL) |
| Email confirmation enforcement + UI "reinvia" | 🟡 | S | Supabase Auth + LoginScreen |
| Admin **bulk invite** + invio link | 🟡 | M | esiste `invite-user` function + `BulkInviteModal` |
| Block 2 — RLS hardening pending users | 🟡 | S | quando ci saranno utenti reali |
| Bacheca: **menzioni @utente** con notifica | 🟡 | S | trigger DB su `notices` (già `20260621_notice_mentions.sql` parziale?) |
| Calendario: eventi **multipli/ricorrenti** | 🟡 | M | `CalendarPlanner` |
| **TypeScript** migration | ⚪ | L | sessione dedicata |
| Copertura **test** estesa (Vitest) | ⚪ | M | infra già pronta (31 test) |

---

## 3. Sequenza consigliata

1. **Block 5 (Allegati Task)** — sblocca tutto il resto. Da solo già dà valore (upload manuale).
2. **Block 6 (OneDrive)** — setup Azure + picker + `onedrive-import`.
3. **Block 7 (WhatsApp)** — setup Meta + `whatsapp-webhook` + codice task.
4. **Block 8** — HIBP (quick win sicurezza) + il resto man mano.

Stima grossolana: Block 5 ≈ 1 sessione, Block 6 ≈ 1, Block 7 ≈ 1-2, Block 8 spalmato.

---

## 4. Azioni manuali richieste all'utente (non automatizzabili da codice)

| Quando | Cosa | Perché |
|---|---|---|
| Prima di Block 6 | Registrare l'app su **Azure** (client ID, redirect URI, scope `Files.Read`) | OAuth OneDrive |
| Prima di Block 7 | Creare **Meta App + WhatsApp Business**, numero dedicato, token permanente, app secret | API WhatsApp ufficiale |
| Block 8 | Attivare **HIBP** in Dashboard Supabase | Toggle non esposto via API/MCP |
| Per i preview | Decidere un **dominio stabile** (custom) | I redirect/webhook richiedono URL fissi; i preview Vercel cambiano |

---

## 5. File toccati / da creare (mappa rapida)

```
NUOVI
  supabase/migrations/<data>_task_files.sql        (Block 5)
  supabase/functions/onedrive-import/index.ts      (Block 6)
  supabase/functions/whatsapp-webhook/index.ts     (Block 7)
  src/test/taskFiles.test.js                        (Block 5)

MODIFICATI
  src/lib/api.js                  → export TaskFiles (Block 5)
  src/components/tasks/TaskSlideOver.jsx → dropzone reale + lista + sorgenti (5/6/7)
  package.json                    → @azure/msal-browser (Block 6)
  supabase/migrations/<data>_task_short_code.sql  → opzionale (Block 7, opzione b)
  .env / Vercel env               → VITE_AZURE_CLIENT_ID (Block 6)
  Edge Function secrets           → WHATSAPP_* (Block 7)
```

---

**Session 34 — Pianificazione Allegati + OneDrive + WhatsApp: documento pronto. Implementazione da avviare dal Block 5.**
