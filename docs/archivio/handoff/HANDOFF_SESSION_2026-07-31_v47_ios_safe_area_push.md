# HANDOFF — Sessione 2026-07-31 v47
### iPhone: schermata sotto la status bar + notifiche push che non arrivano

Due segnalazioni dallo stesso dispositivo (iPhone, PWA installata sulla Home),
due cause indipendenti.

| # | Sintomo | Causa | Dove si risolve |
|---|---------|-------|-----------------|
| 1 | La schermata si sovrappone alla barra di sistema: ora/batteria coprono i pulsanti, alcuni diventano intoccabili | `viewport-fit=cover` + status bar translucida senza compensazione delle safe area | CSS/inline style (frontend) |
| 2 | Le notifiche push non arrivano sul telefono | Sottoscrizione push invalidata da iOS e riga cancellata dal server, senza che nulla si ri-registri | `lib/push.js`, `public/sw.js`, Edge Function, 1 migration |

---

## 1. Sovrapposizione alla status bar (safe area)

### Diagnosi

`index.html` dichiara da sempre:

```html
<meta name="viewport" content="... viewport-fit=cover" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

Questa combinazione è una scelta voluta (l'app usa **tutto** lo schermo, la
topbar celeste arriva fino al bordo), ma impone al CSS di rispettare le safe
area: status bar / Dynamic Island in alto, home indicator in basso. Nel codice
`env(safe-area-inset-*)` compariva solo in 3 punti (composer chat, footer
TaskSlideOver, bottom-nav), quindi:

- la **Topbar** (58px, `position: sticky; top: 0`) finiva per metà sotto la
  status bar → logo, campanella e avatar coperti (screenshot 2);
- l'header del **pannello chat** (`position: fixed; top: 0`) subiva lo stesso
  destino → pulsanti "Online", ✏️ e ✕ non tappabili (screenshot 1);
- idem per l'header del **TaskSlideOver**;
- i pannelli Ricerca/Notifiche su mobile sono `position: fixed` a `top: 64/56`,
  cioè ancorati al bordo **fisico** dello schermo: finivano sotto la topbar;
- la bottom-nav usava `padding: 6px 4px env(safe-area-inset-bottom, 6px)`: su un
  telefono senza tacca l'inset vale `0px` e il padding inferiore **collassava a
  zero** invece di restare 6px.

### Soluzione

**`index.html`** — i token stanno qui, non nel `FontLoader` di `VoyageDesk.jsx`,
perché servono anche a login / reset password / ErrorBoundary, che non montano
l'app:

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}
```

Valgono `0px` su desktop e su ogni dispositivo senza tacca: **nessuna modifica
visiva fuori da iPhone**, e si possono sommare senza condizionali.

| File | Modifica |
|------|----------|
| `index.html` | definizione dei 4 token |
| `src/VoyageDesk.jsx` | `.vd-safe-top`/`.vd-safe-bottom`, `.vd-app-shell` (100vh→100dvh con fallback), bottom-nav con `calc(6px + var(--safe-bottom))`, `.vd-main-scroll` e `.vd-modal-mh` che scontano gli inset |
| `src/components/shell/Topbar.jsx` | topbar `height: calc(58px + var(--safe-top))` + `padding-top` pari all'inset (lo sfondo celeste continua a riempire la status bar); pannelli Ricerca e Notifiche `top: calc(64px/56px + var(--safe-top))` e altezza massima al netto degli inset (lista scrollabile, testata e toggle push sempre visibili) |
| `src/components/chat/ChatPanel.jsx` | header `padding: calc(14px + var(--safe-top)) 16px 14px` |
| `src/components/tasks/TaskSlideOver.jsx` | header `padding: calc(18px + var(--safe-top)) 22px 18px` |
| `src/components/shell/FAB.jsx`, `src/components/ui/Toast.jsx` | `bottom: calc(80px + var(--safe-bottom))` — restano sopra la bottom-nav, che ora è più alta dell'home indicator |
| `src/auth/LoginScreen.jsx`, `UpdatePasswordScreen.jsx`, `ErrorBoundary.jsx`, `main.jsx` | padding delle schermate a tutta pagina con gli inset |

Il pattern è sempre lo stesso: **padding**, non margine. Lo sfondo dell'elemento
continua a riempire la zona della status bar (niente striscia vuota), il
contenuto scende sotto.

---

## 2. Notifiche push che non arrivano su iPhone

### Diagnosi

La catena è `notifications` → trigger `notify_push()` → pg_net → Edge Function
`send-push` → Apple Push Service → dispositivo. Tre punti fragili, tutti
specifici di iOS:

**a) Sottoscrizione invalidata, riga cancellata, nessuno che si ri-registra.**
iOS butta via la push subscription con una certa disinvoltura: aggiornamento
della PWA, app scaricata per liberare spazio, riavvio. Al primo invio successivo
Apple risponde 410 e la Edge Function — correttamente — cancella la riga da
`push_subscriptions`. Da quel momento **nessun push viene più inviato a quel
dispositivo, per sempre**: nulla nel client ricreava la sottoscrizione. Peggio,
il toggle continuava a mostrarsi verde perché `getPushState()` guardava solo
`pushManager.getSubscription()` (stato del browser), mai il DB.

**b) `pushsubscriptionchange` non gestito.** L'evento con cui il browser
annuncia la rotazione dell'endpoint non aveva handler nel service worker.

**c) TTL implicito.** `subscriber.pushTextMessage(message, {})` non specificava
il TTL: senza, il push service può trattarlo come `0` = *consegna solo se il
dispositivo è connesso in questo istante, altrimenti scarta*. Su iPhone (schermo
spento, rete assente, risparmio energetico) è la differenza tra una notifica che
arriva con qualche minuto di ritardo e una che non arriva mai.

### Soluzione

**`src/lib/push.js`**
- `getPushState(userId)` ora ritorna anche `synced`: verifica con
  `Push.findByEndpoint()` che alla subscription del browser corrisponda una riga
  su `push_subscriptions`. `enabled && !synced` = "il server non sa dove
  inviare". Un errore di rete non declassa lo stato (niente falsi allarmi
  offline).
- **`syncPushSubscription(userId)`** — riparazione silenziosa: se manca la
  subscription la ricrea (il permesso è già concesso, non serve un gesto
  utente), poi fa l'upsert della riga. Copre i tre scenari: subscription
  buttata da iOS, endpoint ruotato, riga cancellata da un 410 transitorio.
- Intenzione dell'utente memorizzata in `localStorage` (`vd:push-intent`): senza,
  non si potrebbe distinguere "l'utente ha spento le push" da "il sistema le ha
  revocate", e ri-sottoscrivere in silenzio sarebbe sbagliato nel primo caso.
- `sendTestPush()` per la prova end-to-end.

**`src/VoyageDesk.jsx`** — `syncPushSubscription` gira a ogni avvio dell'app
(e quando il service worker segnala `push-subscription-changed`). No-op per chi
non ha mai attivato le push.

**`public/sw.js`** — handler `pushsubscriptionchange`: ri-sottoscrive con la
stessa chiave VAPID e avvisa le finestre aperte, che salvano il nuovo endpoint
(il service worker non ha la sessione Supabase, non può scrivere sul DB). Se
nessuna finestra è aperta ci pensa `syncPushSubscription` alla riapertura.

**`supabase/functions/send-push/index.ts`** — TTL esplicito di 24h; nei log
degli errori compaiono host e status HTTP, così un rifiuto di Apple
(`web.push.apple.com`, tipicamente 400/403 su VAPID) si distingue a colpo
d'occhio da uno di FCM.

**`supabase/migrations/20260731_push_test_and_ios_fixes.sql`**
- RPC `send_test_push()` (security definer, nessun parametro, destinatario
  sempre `auth.uid()`): inserisce una notifica `push_test` per se stessi e
  lascia che sia la catena normale a consegnarla. L'INSERT diretto su
  `notifications` non è concesso a nessuno — le notifiche nascono solo da
  trigger — da qui la RPC. La riga precedente dello stesso utente viene
  sostituita: la prova si può ripetere senza affollare la campanella.
- `notify_push()` ridefinita con il case `push_test` (per il resto identica alla
  versione di `20260725_chat_message_notifications`; nessun trigger toccato).

**`src/components/shell/Topbar.jsx`** — il toggle push ora mostra:
- l'avviso "⚠️ Questo dispositivo non risulta registrato sul server" con il
  pulsante **Ricollega dispositivo** quando `enabled && !synced`;
- il pulsante **Invia notifica di prova**, che è il modo per capire in dieci
  secondi, da soli, se il percorso server → telefono funziona (prima serviva
  farsi assegnare un task da un collega);
- hint iOS più espliciti (dove riattivare il permesso: Impostazioni →
  Notifiche → VoyageDesk).

---

## ⚠️ Da fare dopo il merge (non automatico)

1. **Applicare la migration** `20260731_push_test_and_ios_fixes.sql` sul
   progetto Supabase (vedi `docs/MIGRAZIONI_SUPABASE.md`). Senza, il pulsante
   "Invia notifica di prova" risponde con errore `function send_test_push does
   not exist`; tutto il resto funziona lo stesso.
2. **Ri-deployare la Edge Function** `send-push` (TTL + log): 
   `supabase functions deploy send-push`.
3. **Sull'iPhone**: chiudere e riaprire la PWA dopo il deploy (il service worker
   si aggiorna al riavvio), poi campanella → "Invia notifica di prova".
   - Notifica ricevuta → catena a posto.
   - Nessuna notifica e avviso "non registrato" → toccare "Ricollega
     dispositivo" e ripetere.
   - Nessuna notifica senza avviso → il problema è a valle: controllare i log
     della Edge Function (ora riportano host e status della risposta di Apple).

## Verifiche eseguite

| Test | Esito |
|------|-------|
| `npm test` | 298 passati, 33 file (9 nuovi in `src/test/push.test.js`) ✅ |
| `npm run lint` | 0 errori (5 warning pre-esistenti, nessuno nei file toccati) ✅ |
| `npm run build` | OK ✅ |
| CRLF `VoyageDesk.jsx` | preservati ✅ |

Non verificabile da qui: la resa su un iPhone reale (safe area) e la ricezione
della push sul dispositivo — servono il deploy e il telefono.

## Limiti noti

- Le safe area valgono `0px` in Safari fuori dalla PWA installata: lì la
  sovrapposizione non si presentava e non cambia nulla.
- `syncPushSubscription` ripara solo **all'apertura dell'app**: se iOS invalida
  la sottoscrizione mentre l'app è chiusa, le notifiche restano perse finché
  l'utente non la riapre almeno una volta. È un limite del modello Web Push su
  iOS, non aggirabile lato server.
- Il TTL di 24h vale per tutte le notifiche: una push generata di notte e
  consegnata al primo risveglio del dispositivo è considerata ancora utile.
