# Audit architettura, struttura e sicurezza — 14 agosto 2026

Perimetro richiesto: organizzazione di cartelle e moduli, separazione delle
responsabilità (logica di business, chiamate API, stato locale, componenti UI),
duplicazione, anti-pattern React/JS, e superficie di sicurezza.

Come l'audit del 12 agosto, questo **non si è fermato al repository**: i rilievi
M-4, B-1 e B-2 nascono dal confronto fra ciò che il repository descrive e ciò
che il database di produzione contiene davvero. Il rilievo **C-1** invece nasce
dal confronto fra due strati dello stesso repository — un layer dati che
gestisce un campo e il suo unico chiamante che quel campo lo lascia cadere.

Verifiche eseguite: `npm test` (**1168 passati**, 7 skip, 98 file, 1 skip di
file), advisor di sicurezza e performance Supabase sul progetto di produzione
`vmxvnxsqfisucugcpqlc`, ispezione diretta di policy RLS, trigger, funzioni,
grant, bucket storage e schemi, confronto migrazioni repository ↔ produzione,
lettura integrale delle cinque Edge Function e del registry di persistenza.

> **Nota su un falso allarme, riportato perché è istruttivo.** Una prima sonda
> sembrava mostrare che `messages_blocca_modifiche_altrui()` in produzione non
> avesse il fix dell'ancora sul mittente (S-08). Era il pattern `LIKE` della
> sonda a essere sbagliato, non la produzione: il testo cercato era
> `old.sender_id is distinct from`, mentre la condizione reale — corretta in
> entrambi — è `new.sender_id is distinct from old.sender_id`. Verificato
> leggendo il corpo intero della funzione: **repository e produzione
> coincidono**. Nessun rilievo.

---

## 1. Executive Summary

**Il progetto resta in ottima salute.** I confini fra livelli sono reali e non
solo dichiarati: `lib/api.js` è l'unico punto che parla con Supabase per il
core, `state/persistence.js` dichiara le scritture invece di sparpagliarle,
`lib/permissions.js` è puro e riceve il team come argomento, e il modulo Liste
ha un data layer privato protetto da una regola di lint. La superficie di
sicurezza del database è solida: RLS attiva su tutte e 19 le tabelle di
`public`, `anon` senza alcun privilegio di tabella, entrambe le viste in
`security_invoker`, tutte le funzioni `SECURITY DEFINER` vive con
`SET search_path`, i tre bucket privati e con `allowed_mime_types`. Le Edge
Function privilegiate passano tutte dallo stesso predicato admin condiviso.

**Il quadro cambia su un punto, e non è un punto di sicurezza.** Il difetto più
grave trovato è una **perdita di dati silenziosa nel percorso di ripristino da
backup del modulo Liste**: il layer dati sa gestire i cointestatari, l'export li
scrive nel file, la RPC li accetta — ma l'unico chiamante del ripristino
costruisce il payload con tre campi su quattro e lascia cadere il quarto. Il
ripristino riesce, il toast conta le righe importate, e i cointestatari non
tornano. È esattamente lo scenario che il commento in `listeApi.js` dichiara di
aver chiuso quando ha aggiunto `lista_beneficiari` al backup.

Il secondo tema è una **divergenza sistematica fra schermo e database sulla
bacheca avvisi**: le tre azioni sugli avisi sono le uniche mutazioni del
registry prive sia di `guard` sia di `rollback`, mentre la RLS le nega a chi non
è autore né manager — e la UI mostra i pulsanti a tutti. Il risultato è che
l'utente riceve due toast contraddittori e l'avviso resta cancellato a schermo
fino al reload. È la classe di difetto che il registry di persistenza esiste per
chiudere, rimasta aperta proprio sull'entità meno sorvegliata.

Il resto sono rilievi di manutenibilità e di igiene: tre copie della stessa
"signed URL con cache", un controllo di scarto migrazioni mono-direzionale per
costruzione, e alcuni residui in produzione (uno schema di backup di luglio, una
funzione orfana, un trigger reso ridondante).

**Nessun rilievo di questo audit è sfruttabile da un utente non autenticato.**
Tutti richiedono una sessione valida del team, e i due più gravi non sono
problemi di autorizzazione ma di fedeltà fra ciò che l'app mostra e ciò che il
database contiene.

---

## 2. Tabella delle priorità

| # | Priorità | Rilievo | File | Impatto |
|---|---|---|---|---|
| **C-1** | 🔴 **Critico** — ✔ chiuso 14/8 | Il ripristino da backup delle Liste scarta i cointestatari: il payload è costruito senza `beneficiari` | `components/liste/ListeViaggio.jsx:278` | Perdita dati silenziosa e non segnalata nel percorso di disaster recovery |
| **A-1** | 🟠 **Alta** — ✔ chiuso 14/8 | Bacheca avvisi: nessun `guard`, nessun `rollback`, pulsanti mostrati a tutti | `state/persistence.js:266-273`, `components/dashboard/NoticeBoard.jsx:182-207` | UI che diverge dal DB in modo sistematico + due toast contraddittori |
| **M-1** | 🟡 Media — ✔ chiuso 14/8 | `delete-user` non rimuove l'avatar dallo storage (`delete-account` sì) | `supabase/functions/delete-user/index.ts:391-423` | PII orfana a tempo indefinito dopo l'eliminazione definitiva di un utente |
| **M-2** | 🟡 Media — ✔ chiuso 14/8 | `invite-user` ignora l'esito dei due `upsert` e risponde comunque `success` | `supabase/functions/invite-user/index.ts:581-597` | Invito "riuscito" con profilo o contatto non scritti, senza alcun segnale |
| **M-3** | 🟡 Media | Tre implementazioni della stessa "signed URL + cache TTL" | `lib/api.js:121-134, 547-558, 606-615` | Duplicazione a tre copie: un fix di TTL o di invalidazione ne raggiunge una sola |
| **M-4** | 🟡 Media | Il controllo di scarto migrazioni è mono-direzionale per costruzione | `scripts/verifica-rpc/migrazioni.js:78-81` | Una migrazione applicata solo in produzione non è rilevabile da nessun controllo |
| **B-1** | 🟢 Bassa | Schema `backup_liste_20260729` ancora in produzione (3 tabelle, ~2.323 righe) | produzione, non nel repo | Copia di dati di luglio senza RLS né retention dichiarata |
| **B-2** | 🟢 Bassa | `public.next_dossier_number()` orfana: la sua sequence è stata droppata | `migrations/20260616221642` | Funzione morta che fallirebbe se invocata; nessuno può invocarla |
| **B-3** | 🟢 Bassa | Due trigger sovrapposti su `messages` con strategie opposte | `migrations/20260613092421` vs `20260806150000` | Il più vecchio è irraggiungibile; enumera colonne, cioè la strategia che il nuovo dichiara sbagliata |
| **B-4** | 🟢 Bassa | `.svg` classificato come immagine, ma i bucket lo rifiutano | `lib/fileUtils.js:41-47`, `chat/chatFiles.js:19-25` | Ramo morto; l'utente vede l'anteprima promessa e l'upload fallisce |

**Accettati, non rilievi** (già decisi in audit precedenti, riverificati oggi e
tuttora coerenti): `auth_leaked_password_protection` (richiede il piano Pro),
`get_migrazioni_applicate()` eseguibile da `anon` (espone i soli `version`/`name`
di migrazioni già leggibili nel repository — verificato oggi che il repository
`tucobpjmr/TULLIO` è effettivamente **pubblico**, quindi la premessa del
ragionamento regge), e le sette RPC `SECURITY DEFINER` eseguibili da
`authenticated` (hanno tutte il controllo di ruolo nel corpo).

---

## 3. Action plan dettagliato

### 🔴 C-1 — Il ripristino da backup perde i cointestatari

> **✔ CHIUSO il 14 agosto, stesso giorno.** `onBackupFile` costruisce ora il
> payload con `beneficiari`, `confermaImport` lo conta nel toast finale, e
> `ImportaBackupConfirmModal` lo mostra nella conferma. **Un dettaglio emerso
> solo implementando la correzione**: la firma del componente aveva già
> ricevuto `nB = 0` nel diff proposto qui sotto, ma il punto in cui
> `<ImportaBackupConfirmModal>` viene istanziato in `ListeViaggio.jsx`
> continuava a passare solo `nL`/`nM` — senza quella riga la modale avrebbe
> sempre mostrato "0 cointestatari" (anzi, nessuna clausola, per via del
> default), nonostante il payload inviato alla RPC fosse già corretto. Trovato
> perché la guardia di regressione (sotto) verifica il testo mostrato E il
> payload effettivo, non solo uno dei due — è la stessa lezione dell'audit:
> due metà di un percorso vanno verificate insieme, mai una sola. Guardia
> aggiunta in `src/test/listeDataTools.test.jsx` ("i cointestatari nel file di
> backup arrivano fino alla RPC di ripristino"): costruisce un file di backup
> con `beneficiari`, e asserisce sia il testo della conferma sia
> `ListeAPIMock.importaBackup.mock.calls[0][0].beneficiari` — il payload
> *davvero* passato alla RPC, non quello che il componente dichiara di avere
> costruito. Test: **1169 verdi** (era 1168), lint 0 errori,
> `verifica:convenzioni` nessuna divergenza.

**File:** `src/components/liste/ListeViaggio.jsx:262-283` (la riga che rompe è
la **278**)

**Cosa succede.** `ListeAPI.backupData()` esporta quattro insiemi —
`clients`, `liste`, `beneficiari`, `movimenti` — e il commento che ha aggiunto
il terzo dice esplicitamente perché:

> «più `lista_beneficiari` (cointestatari) da quando esiste la cointestazione —
> senza, un ripristino dopo un reset totale riporterebbe indietro liste e
> movimenti ma **perderebbe in silenzio chi era cointestatario di cosa**.»
> — `listeApi.js:341-344`

`ListeAPI.importaBackup()` è stata adeguata di conseguenza: costruisce un passo
dedicato per `payload.beneficiari` (`listeApi.js:303`), conta le righe totali
includendole (`:308`) e accumula `beneficiari_added` (`:329`). La RPC
`importa_backup` in produzione le gestisce — verificato.

Ma l'**unico chiamante** costruisce il payload così:

```js
// ListeViaggio.jsx:277-282 — stato attuale
apriOverlay("import", {
  payload: { clients: data.clients || [], liste: data.liste || [], movimenti: data.movimenti || [] },
  nL: (data.liste || []).length,
  nM: (data.movimenti || []).length,
  progress: null,
});
```

`beneficiari` non c'è. E siccome `chunk()` è difensiva
(`rows?.length || 0`, `listeApi.js:75-81`), `chunk(undefined)` restituisce `[]`
senza sollevare: **nessun errore, nessun passo, nessuna riga**. Il ripristino si
conclude con successo, il toast annuncia clienti/liste/movimenti — e i
cointestatari, che erano nel file, non sono più nel database.

**Perché è critico.** È l'unico difetto trovato che distrugge dati invece di
mostrarli male, ed è nel percorso che si esegue **dopo un disastro**, cioè nel
momento in cui nessuno ha una seconda copia da cui accorgersene. Il difetto è
anche invisibile per costruzione: la modale di conferma annuncia `nL` liste e
`nM` movimenti (`ImportaBackupConfirmModal.jsx:33`) e il toast finale elenca gli
stessi tre insiemi — nessuno dei due nomina i cointestatari, quindi la loro
assenza non ha dove manifestarsi.

**Esposizione reale, oggi.** `select count(*) from public.lista_beneficiari` in
produzione restituisce **0**: nessun cointestatario esiste ancora, quindi al
momento non c'è nulla da perdere. Non è una ragione per rimandare — la
cointestazione è una funzionalità viva (modali, RPC, storico, UI di dettaglio
tutti presenti dal 2 agosto), e il difetto si arma da solo il giorno in cui la
prima lista viene cointestata. È però la ragione per cui la correzione è
**sicura da applicare subito**: non c'è nessuno stato pregresso da riconciliare.

**Soluzione.** Passare il quarto insieme, e renderlo visibile nei due punti in
cui l'utente conta le righe — perché un campo che nessuna schermata nomina è un
campo che può sparire di nuovo senza che nessuno se ne accorga.

```js
// ListeViaggio.jsx — onBackupFile
    if (!data || data.app !== "liste-viaggio" || !Array.isArray(data.liste)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Il file non sembra un backup di questa app." } });
      return;
    }
    apriOverlay("import", {
      // `beneficiari` NON è opzionale per distrazione: i backup prodotti prima
      // della cointestazione (2 agosto) non hanno il campo, e per quelli `[]`
      // è la risposta giusta. Ometterlo del tutto invece — com'era fino al 14
      // agosto — fa sparire i cointestatari anche dai backup che LI CONTENGONO,
      // senza errore: `chunk(undefined)` ritorna `[]` e il passo non viene
      // nemmeno costruito (listeApi.js:75-81, :303).
      payload: {
        clients: data.clients || [],
        liste: data.liste || [],
        beneficiari: data.beneficiari || [],
        movimenti: data.movimenti || [],
      },
      nL: (data.liste || []).length,
      nB: (data.beneficiari || []).length,
      nM: (data.movimenti || []).length,
      progress: null,
    });
```

```jsx
// ImportaBackupConfirmModal.jsx — firma e testo
export function ImportaBackupConfirmModal({ nL, nB = 0, nM, progress = null, onClose, onSave }) {
  …
  Il file contiene {nL} liste{nB ? `, ${nB} cointestatari` : ""} e {nM} movimenti.
  I dati verranno AGGIUNTI a …
```

```js
// ListeViaggio.jsx — confermaImport, toast finale
    dispatch({
      type: "SHOW_TOAST",
      payload: {
        type: "success",
        message: `Backup caricato: +${res.clients_added} clienti, +${res.liste_added} liste, `
          + `+${res.beneficiari_added} cointestatari, +${res.movimenti_added} movimenti`,
      },
    });
```

**Guardia perché non si riapra.** Il difetto è nato perché il layer dati e il
suo chiamante sono stati modificati in momenti diversi, e nulla lega le due
forme. Un test sul solo `onBackupFile` non basterebbe: verificherebbe la forma
che il chiamante costruisce, non che sia *la stessa* che il layer consuma. La
guardia giusta lega export e import, che è l'invariante vera —

```js
// src/test/listeBackupRoundTrip.test.js (nuovo)
// L'insieme di chiavi che backupData() ESPORTA deve coincidere con quello che
// il ripristino RIMANDA a importaBackup(). È l'invariante che C-1 ha violato:
// il file conteneva `beneficiari`, la RPC li accettava, e il chiamante li
// lasciava cadere in silenzio fra i due. Un test su una sola delle due metà
// non l'avrebbe visto — e infatti non l'ha visto.
it("ogni insieme esportato nel backup viene rimandato al ripristino", async () => {
  const esportate = Object.keys((await ListeAPI.backupData()).data);   // mock
  const inviate = Object.keys(payloadCostruitoDa(fileDiBackup));       // onBackupFile
  expect(new Set(inviate)).toEqual(new Set(esportate));
});
```

---

### 🟠 A-1 — La bacheca avvisi diverge dal database, in modo sistematico

> **✔ CHIUSO il 14 agosto, stesso giorno.** I tre pezzi proposti sono stati
> implementati: `canEditNotice` in `lib/permissions.js`, `guard`+`rollback`
> nelle tre entry di `persistence.js`, gating dei pulsanti in
> `NoticeBoard.jsx`. **Un quarto pezzo, non previsto dal piano originale, si
> è rivelato necessario implementando gli altri tre.** Il reducer stesso
> (`baseReducer`) non controllava ALCUN permesso su `UPDATE_NOTICE`/
> `DELETE_NOTICE`/`TOGGLE_PIN_NOTICE` — a differenza di `UPDATE_TASK`/
> `DELETE_TASK`, che negano con `canEditTask` prima di applicare. Il registry
> di persistenza da solo non basta a chiudere il rilievo: quando un `guard`
> nega, `useSyncedDispatch` non blocca l'azione — la dispatcha comunque al
> reducer, **contando sul reducer per produrre il toast di rifiuto** (è il
> pattern documentato in testa a quel file). Senza un controllo nel reducer,
> quella richiesta negata veniva applicata in locale lo stesso: "Avviso
> aggiornato" mostrato a un utente la cui scrittura la RLS avrebbe respinto,
> e nessun rollback la correggeva perché dal punto di vista
> dell'orchestratore l'azione non era stata negata affatto — il guard aveva
> fatto il suo lavoro fermando la RETE, ma non fermava lo STATO locale.
> Aggiunto lo stesso pattern dei task (`if (!prev) return state` per un
> record fantasma, poi `if (!canEditNotice(...)) return _denied()`) alle tre
> case del reducer. Aggiunto anche il case `RESTORE_NOTICE` (gemello
> silenzioso di `RESTORE_CLIENT`, per il rollback di `DELETE_NOTICE`); il
> rollback di `UPDATE_NOTICE` non ne ha bisogno, rimanda un altro
> `UPDATE_NOTICE` con lo snapshot intero — stesso pattern di
> `UPDATE_TEAM_MEMBER`, che fa scattare `meta.compensazione` e sopprime il
> toast di successo.
>
> Guardie di regressione in due file nuovi (il terzo — la sezione originale
> di `persistenceGuards.test.js` — superava le 500 righe effettive appena
> aggiunta, e "un file, una responsabilità" vale anche per i test, come già
> per `TOGGLE_TEAM_MEMBER_ACTIVE`): `noticeGuardsPersistence.test.js` (guard
> per i cinque ruoli × tre azioni, rollback, il caso del record fantasma) e
> `noticeBoardPermessi.test.jsx` (i pulsanti compaiono solo per chi la RLS
> lascerebbe agire; la reazione resta a tutti, confermato local-only — vedi
> nota su `TOGGLE_NOTICE_REACTION` più sotto). Test: **1200 verdi** (era
> 1169, +31), lint 0 errori, `verifica:convenzioni` nessuna divergenza.
>
> **La domanda che l'audit aveva lasciato aperta su `TOGGLE_NOTICE_REACTION`
> è risolta, non per verifica RLS ma per lettura del codice**: l'azione non
> ha ALCUNA entry nel registry di persistenza — è dichiarata esplicitamente
> in `NON_PERSISTITE_OGGI` di `persistenceGuards.test.js` ("Per gli avvisi la
> RPC corrispondente non esiste"). Nessuna scrittura di rete parte mai per
> questa azione: il sospetto che la RLS potesse rifiutarla in silenzio era
> fondato sulla forma sbagliata del problema — non c'è nulla che la RLS possa
> rifiutare, perché non c'è nessuna richiesta. Il pulsante 😀 resta quindi
> visibile a tutti, senza gating.

**File:** `src/state/persistence.js:266-273` e
`src/components/dashboard/NoticeBoard.jsx:182-207`

**Cosa succede.** Le policy RLS su `notices` in produzione sono corrette e
restrittive:

```
notices_update / notices_delete:
  using (author_id = auth.uid() OR private.is_manager_or_admin())
```

Il registry di persistenza, però, dichiara le tre azioni così:

```js
// persistence.js:266-273 — stato attuale
UPDATE_NOTICE: { persist: (s, a) => NoticesAPI.update(a.payload.id, toDbNoticePatch(a.payload)) },
DELETE_NOTICE: { persist: (s, a) => NoticesAPI.remove(a.payload) },
TOGGLE_PIN_NOTICE: {
  persist: (s, a) => {
    const prev = (s.notices || []).find(n => n.id === a.payload);
    return NoticesAPI.togglePin(a.payload, !prev?.pinned);
  },
},
```

**Nessun `guard`. Nessun `rollback`.** Sono le uniche mutazioni del registry con
entrambe le assenze su un'entità la cui RLS *nega davvero* qualcosa. E la UI non
compensa: `NoticeBoard.jsx:182-207` rende i pulsanti 📌 / ✏️ / ✕ per **ogni**
avviso, senza confrontare `n.author` con `currentUserId` — benché il componente
abbia già `getMember` e `currentUserId` dal contesto (`:29`) e legga `n.author`
due righe sopra (`:150`).

**La sequenza che ne risulta**, per un agent che clicca ✕ sull'avviso del
manager:

1. `useSyncedDispatch` non trova né `ADMIN_ONLY_ACTIONS` né un `guard` → passa;
2. il reducer rimuove l'avviso e accoda **"Avviso rimosso dalla bacheca"**
   (successo, `reducer.js:509-512`);
3. la RLS rifiuta la `DELETE`;
4. `fail()` cerca un `rollback`, non lo trova, e accoda
   **"Salvataggio fallito: …"**;
5. `pushToast` deduplica per messaggio, quindi i due toast — uno verde, uno
   rosso, sullo stesso gesto — restano **entrambi a schermo**;
6. l'avviso resta sparito dalla bacheca fino al reload: la `DELETE` fallita non
   genera nessun evento realtime, quindi **niente viene mai a correggere la UI**.

Per `TOGGLE_PIN_NOTICE` è peggio in un modo sottile: il reducer non emette alcun
toast (`:513-517`), quindi l'utente vede solo l'errore mentre il pin *sembra*
aver funzionato.

**Perché è alta e non media.** Non è un caso di rete sfortunato: è il percorso
**nominale** per ogni utente che non sia autore o manager, cioè per la maggior
parte del team sulla maggior parte degli avvisi. Ed è la classe di difetto che
`persistence.js` dichiara in testa di esistere per chiudere («la UI continuerebbe
a mostrare un ruolo che il database non ha»), rimasta aperta sull'unica entità a
cui nessun audit precedente ha guardato.

**Soluzione — tre pezzi, e servono tutti e tre.**

*(a) Il predicato, in `lib/permissions.js`, accanto agli altri.* Non nel
componente: è la stessa domanda che si pone la RLS, e questo file esiste perché
abbia una risposta sola.

```js
// lib/permissions.js — in fondo alla sezione permessi
// Rispecchia le policy `notices_update`/`notices_delete` (autore OR
// manager/admin). Manager e admin passano da `private.is_manager_or_admin()`
// lato DB: qui la stessa coppia di ruoli, con lo stesso confronto esatto su
// `toDbRole` usato ovunque.
export const canEditNotice = (team, notice, userId) => {
  if (!notice || !userId) return false;
  if (notice.author === userId) return true;
  const role = getRoleType(team, userId);
  return role === 'admin' || role === 'manager';
};
```

*(b) Il guard e il rollback nel registry.* Il guard ferma la scrittura; il
rollback rimette a posto lo stato ottimistico quando la scrittura fallisce
comunque (rete, o un ruolo revocato che lo state React non sa ancora).

```js
// state/persistence.js
const findNotice = (state, id) => (state.notices || []).find(n => n.id === id);

UPDATE_NOTICE: {
  guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload?.id), uid),
  persist: (s, a) => NoticesAPI.update(a.payload.id, toDbNoticePatch(a.payload)),
  // Lo snapshot è l'avviso INTERO pre-dispatch: UPDATE_NOTICE fa merge di
  // `...action.payload` sulla riga, quindi rimandare solo i campi toccati
  // lascerebbe indietro quelli che il patch aveva cambiato — un rollback
  // parziale, che è peggio di nessuno perché sembra riuscito (stessa ragione
  // del `?? null` esplicito in UPDATE_OWN_PROFILE).
  rollback: (s, a) => {
    const prev = findNotice(s, a.payload?.id);
    return prev ? { type: "UPDATE_NOTICE", payload: prev } : null;
  },
  mapError: () => "avviso non aggiornato",
},

DELETE_NOTICE: {
  guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload), uid),
  persist: (s, a) => NoticesAPI.remove(a.payload),
  // Come DELETE_CLIENT: si rimette l'oggetto intero, non l'id — la riga
  // cancellata non è più rileggibile dal server.
  rollback: (s, a) => {
    const prev = findNotice(s, a.payload);
    return prev ? { type: "RESTORE_NOTICE", payload: prev } : null;
  },
  mapError: () => "avviso non eliminato",
},

TOGGLE_PIN_NOTICE: {
  guard: (s, a, uid) => canEditNotice(s.team, findNotice(s, a.payload), uid),
  persist: (s, a) => NoticesAPI.togglePin(a.payload, !findNotice(s, a.payload)?.pinned),
  // È la propria inversa (applica sempre `!pinned` sul valore corrente):
  // ridispatcharla torna al punto di partenza, senza snapshot — stessa
  // proprietà di TOGGLE_TEAM_MEMBER_ACTIVE.
  rollback: (s, a) => ({ type: "TOGGLE_PIN_NOTICE", payload: a.payload }),
  mapError: () => "pin non aggiornato",
},
```

`RESTORE_NOTICE` è un case nuovo nel reducer, gemello di `RESTORE_CLIENT`:
reinserisce la riga senza toast, rispettando l'ordinamento pinned-first.

*(c) La UI smette di offrire ciò che verrà rifiutato.* Necessario ma **non
sufficiente**, ed è la ragione per cui i tre pezzi vanno insieme: nascondere un
pulsante è una scelta di layout, non un controllo — lo dice già
`listePersistence.js:17` a proposito del reset totale.

```jsx
// NoticeBoard.jsx — dentro sorted.map
const author = getMember(n.author);
const modificabile = canEditNotice(team, n, currentUserId);
…
<div style={rowAbsoluteGap2}>
  {/* La reazione resta a tutti: è la sola azione che la RLS concede a
      chiunque partecipi (notices_update non copre `reactions`? — verificare
      con la policy prima di spostare anche questa dentro il guard). */}
  <button onClick={() => setReactingId(reactingId === n.id ? null : n.id)} …>😀</button>
  {modificabile && (
    <>
      <button onClick={() => dispatch({ type: "TOGGLE_PIN_NOTICE", payload: n.id })} …/>
      <button onClick={() => setEditing({ … })} …/>
      <button onClick={async () => { … }} …/>
    </>
  )}
</div>
```

> ⚠️ Un dettaglio da chiarire prima di implementare (c): `TOGGLE_NOTICE_REACTION`
> passa dalla stessa policy `notices_update`, che richiede autore o
> manager/admin. Se è così, **anche le reazioni agli avvisi altrui sono già
> rifiutate dal database** e nessuno se n'è accorto per la stessa ragione (il
> reducer non emette toast su quel case). Va verificato sul database prima di
> decidere se la reazione resta fuori dal guard o se serve una policy a colonne
> come quella già in piedi su `messages`. **Non l'ho verificato**: `notices` non
> ha un trigger equivalente a `messages_blocca_modifiche_altrui`, quindi il
> sospetto è fondato, ma la conferma richiede una prova di scrittura in
> produzione che esula da un audit in sola lettura.

**Guardia.** `src/test/persistenceGuards.test.js` verifica già, per ogni action,
che il verdetto del `guard` coincida con quello del reducer. Le tre entry vanno
aggiunte al suo elenco: è il test che rende la simmetria una proprietà misurata
invece che una promessa.

---

### 🟡 M-1 — `delete-user` lascia l'avatar nello storage

> **✔ CHIUSO il 14 agosto.** `rimuoviAvatar()` chiama
> `storage.from("avatars").remove(...)` in **entrambi** i punti in cui la
> funzione conclude che l'utente è sparito — la hard-delete riuscita e il ramo
> "not found" (utente già assente da `auth.users`, ripulito solo lato
> `public.users`) — non nel solo percorso principale del diff proposto: il
> secondo ramo perde l'avatar con la stessa certezza del primo, e ometterlo
> avrebbe chiuso il rilievo solo a metà. Best-effort, come previsto: un errore
> di storage non fa fallire una hard-delete già committata su `auth.users`.
> Guardia di regressione per lettura di sorgente (lo stesso approccio di
> `edgeFunctionAdminGate.test.js`, perché questi `.ts` non entrano nel
> perimetro eseguibile di Vitest) in
> `src/test/edgeFunctionsPiiEsitoScritture.test.js`: verifica che la rimozione
> compaia almeno due volte nel file, non una.

**File:** `supabase/functions/delete-user/index.ts:391-423`

L'eliminazione **self-service** (`delete-account`) fa la pulizia PII completa,
avatar compreso, e il commento in testa spiega perché
(`delete-account/index.ts:315`):

```ts
adminClient.storage.from("avatars").remove([`${user.id}/avatar.jpg`]),
```

L'eliminazione **definitiva da parte di un admin** — che è più distruttiva,
perché hard-elimina la riga `auth.users` — non fa nulla di equivalente. La FK
`ON DELETE CASCADE` ripulisce `public.users` e `user_contacts`, ma **una foreign
key non raggiunge un bucket**: il file `<user_id>/avatar.jpg` resta in
`storage.objects` per sempre, e con esso la fotografia di una persona il cui
account è stato eliminato su richiesta. È lo stesso ragionamento già scritto per
`purgeTasks` in `lib/api.js:287-291` («la FK ripulisce le righe metadati ma NON
tocca i file fisici»), non applicato qui.

**Soluzione.** Dopo la `deleteUser` riuscita, prima del `return`:

```ts
    // La FK CASCADE ripulisce public.users e user_contacts, ma non raggiunge
    // lo storage: senza questa riga la foto di un utente ELIMINATO su richiesta
    // resta nel bucket a tempo indefinito. Stessa pulizia di delete-account,
    // che è l'eliminazione MENO distruttiva delle due. Best-effort: il fallimento
    // non deve rovesciare una hard-delete già committata su auth.users —
    // .remove() su un file assente non è comunque un errore.
    const { error: avatarErr } = await supabaseAdmin.storage
      .from("avatars").remove([`${targetId}/avatar.jpg`]);
    if (avatarErr) console.error("[delete-user] avatar residuo", avatarErr.message);

    return json({ success: true });
```

`push_subscriptions` non serve qui: la sua FK su `public.users(id)` cade con il
CASCADE, a differenza dell'oggetto nel bucket.

---

### 🟡 M-2 — `invite-user` risponde `success` anche se i due upsert falliscono

> **✔ CHIUSO il 14 agosto.** L'Edge Function legge ora l'esito di entrambi gli
> upsert e ritorna `{ success: true, userId, warning }` quando uno dei due
> fallisce, come da piano. **La metà client, assente dal piano originale, è
> stata implementata comunque**: `data.warning` restava un campo morto se
> nessuno dei tre chiamanti lo avesse letto. `AddTeamMemberModal` mostra un
> toast `type: "warning"` (non `"error"`: l'invito è comunque riuscito —
> `ToastItem.jsx` distingue già i due tipi, arancione contro rosso, e il
> warning non intercetta lo screen reader con `role="alert"`) al posto del
> solito "Invito inviato". `BulkInviteModal` guadagna un terzo stato per riga
> (`"warn"`, accanto a `"ok"`/`"err"`) con il proprio conteggio nel riepilogo —
> un invito con warning non è né un successo pulito né un fallimento, ed è
> l'unico dei tre punti d'ingresso dove più righe sullo stesso invio possono
> avere esiti diversi tra loro. `AdminTeamTab` (reinvio) non ha bisogno di
> alcuna modifica: la funzione salta l'upsert quando `resend: true`, quindi
> `warning` non è mai presente su quel percorso. Guardie in due file:
> `edgeFunctionsPiiEsitoScritture.test.js` per il cablaggio server (lettura di
> sorgente) e `inviteWarning.test.jsx` per il comportamento dei due componenti
> (il warning sostituisce il successo, non si accumula con esso; la riga
> "con avviso" non conta né fra gli inviati né fra i falliti). Test:
> **1178 verdi** su questo branch (base 1169 + 9), lint 0 errori,
> `verifica:convenzioni` nessuna divergenza.

**File:** `supabase/functions/invite-user/index.ts:581-597`

```ts
    if (!resend) {
      const uid = inviteData.user.id;
      await supabaseAdmin.from("users").upsert({ … });          // esito scartato
      await supabaseAdmin.from("user_contacts").upsert({ … });  // esito scartato
    }
    return json({ success: true, userId: inviteData.user.id });
```

Il commento dice «il trigger DB fa lo stesso come safety-net» — vero per
`public.users` (`handle_new_auth_user`), **non** per `user_contacts`, che nessun
trigger popola. Se quell'upsert fallisce, l'email dell'invitato non entra in
rubrica: l'invito parte, l'admin legge "success", e il buco si manifesta più
tardi come un contatto vuoto che nessuno collega a questo momento.

C'è anche un'asimmetria di ruolo da notare: l'upsert scrive
`role, capacity, color` **già validati** poco sopra (`:511-527`, B-1 del 13
agosto), ma se fallisce resta la riga del trigger, che quei valori li prende dai
`raw_user_meta_data` — cioè dallo stesso body, non validato dallo stesso
percorso. Un upsert fallito in silenzio non è quindi solo "un contatto mancante".

**Soluzione.** Non far fallire l'invito — l'email è già partita, e un 500 qui
spingerebbe l'admin a riprovare generando un secondo invito — ma **dirlo**:

```ts
    if (!resend) {
      const uid = inviteData.user.id;
      const [profilo, contatto] = await Promise.all([
        supabaseAdmin.from("users").upsert(
          { id: uid, name, role, avatar, color, capacity, pending: true, active: false, invited_by: callerId },
          { onConflict: "id" },
        ),
        supabaseAdmin.from("user_contacts").upsert({ user_id: uid, email }, { onConflict: "user_id" }),
      ]);

      // L'email d'invito è GIÀ partita: un 500 qui farebbe riprovare l'admin e
      // genererebbe un secondo invito per lo stesso indirizzo. Si risponde
      // quindi 200, ma con l'avvertenza — e a log il motivo vero. Il silenzio
      // era l'unica opzione da escludere: per `user_contacts` non esiste
      // nessun trigger di riserva, quindi il suo fallimento non lo ripara
      // nessuno e non lo segnala niente.
      const problemi = [
        profilo.error && "profilo",
        contatto.error && "contatto (email)",
      ].filter(Boolean);
      if (problemi.length) {
        console.error("[invite-user] upsert", profilo.error?.message, contatto.error?.message);
        return json({
          success: true,
          userId: uid,
          warning: `Invito inviato, ma non è stato possibile pre-creare: ${problemi.join(", ")}. `
            + "Controlla la scheda del membro nel pannello Team dopo il primo accesso.",
        });
      }
    }
```

Lato client, `invokeFn` (`lib/api.js:49-61`) già normalizza `{ data, error }`:
basta che `BulkInviteModal`/`AddTeamMemberModal` mostrino `data.warning` come
toast di avvertimento quando presente.

---

### 🟡 M-3 — Tre copie della stessa "signed URL con cache"

**File:** `src/lib/api.js:121-134` (`Users.getAvatarUrl`), `:547-558`
(`Messages.getFileUrl`), `:606-615` (`TaskFiles.getFileUrl`)

Le tre funzioni hanno lo stesso corpo — leggi la cache, controlla la scadenza,
`createSignedUrl(path, 3600)`, scrivi in cache con `now + 55 min` — e
differiscono per il solo nome del bucket. Due condividono la `Map`
(`signedUrlCache`), la terza ne ha una propria (`avatarUrlCache`), per una
ragione documentata e valida (frequenza d'uso diversa) che però riguarda **quale
Map**, non **quale algoritmo**.

Il costo non è estetico. Il TTL è scritto tre volte come coppia di numeri
scollegati (`60 * 60` nella firma, `55 * 60 * 1000` nella scadenza): il margine
di 5 minuti è un invariante che nessuna delle tre esprime, e cambiarne uno solo
in una delle tre non rompe nessun test. Nota anche che `signedUrlCache` è
dichiarata a `:561`, **dopo** i due oggetti che la usano — corretto a runtime
(le closure risolvono alla chiamata), ma è il tipo di ordine che un lettore deve
verificare invece di poter dare per scontato.

**Soluzione.** Una factory, sopra il primo consumatore:

```js
// lib/api.js — sopra `export const Users`
// Signed URL con cache in memoria, per i tre bucket privati.
//
// Il MARGINE fra TTL richiesto e scadenza in cache è l'invariante che questa
// funzione esiste per rendere esplicito: la URL si considera scaduta cinque
// minuti PRIMA che il server la rifiuti, così un click che parte poco prima
// della scadenza non riceve un 400. Finché la coppia era scritta a mano in tre
// punti (`60 * 60` e `55 * 60 * 1000`), il margine non era una regola: era una
// coincidenza fra sei numeri.
const TTL_SIGNED_URL_S = 60 * 60;
const MARGINE_SCADENZA_MS = 5 * 60 * 1000;

const creaSignedUrlGetter = (bucket, cache) => async (path) => {
  if (!path) return { url: null, error: null };
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SIGNED_URL_S);
  const url = data?.signedUrl ?? null;
  if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SIGNED_URL_S * 1000 - MARGINE_SCADENZA_MS });
  return { url, error };
};

// Due Map e non una: un avatar è richiesto da decine di componenti nello stesso
// render, un allegato da un click — frequenze d'uso diverse, quindi pressioni
// diverse sulla stessa struttura. È la sola differenza fra i tre consumatori
// che valga la pena tenere.
const avatarUrlCache = new Map();
const signedUrlCache = new Map();

const avatarSignedUrl = creaSignedUrlGetter('avatars', avatarUrlCache);
```

I tre call site diventano:

```js
// Users.getAvatarUrl — conserva il ramo dei valori NON-path, che è suo e non
// generalizzabile: i data URI base64 e le public URL http sopravvissuti al
// passaggio a bucket privato non sono path e non vanno firmati.
getAvatarUrl: async (value) => {
  if (!value) return { url: null, error: null };
  if (value.startsWith('data:') || value.startsWith('http')) return { url: value, error: null };
  return avatarSignedUrl(value);
},

// Messages.getFileUrl
getFileUrl: creaSignedUrlGetter('chat-files', signedUrlCache),

// TaskFiles.getFileUrl
getFileUrl: creaSignedUrlGetter('task-files', signedUrlCache),
```

Sparisce anche la dichiarazione tardiva di `signedUrlCache`, che a quel punto
sta sopra ogni suo uso.

---

### 🟡 M-4 — Il controllo di scarto migrazioni guarda in una direzione sola

**File:** `scripts/verifica-rpc/migrazioni.js:76-81`

```js
const mancanti = locali.filter((l) => (
  l && !versioniApplicate.has(l.prefix) && !nomiApplicati.has(l.slug) && !eccezioni.has(l.file)
));
return { mancanti, applicate: applicate.length };
```

Il filtro parte da `locali`: rileva **repository → produzione** (una migrazione
committata e mai applicata) e non può, per costruzione, rilevare
**produzione → repository** — una migrazione applicata al database e mai
committata. È la direzione più insidiosa delle due, perché il sintomo non è un
errore ma un'assenza: nulla si rompe finché qualcuno non ricostruisce lo schema
dai file (ambiente di staging, ripartenza da zero, disaster recovery), e a quel
punto la logica manca senza che nessun controllo l'abbia mai nominata.

Che il rischio sia concreto lo dice il progetto stesso: le migrazioni si
applicano a mano, e `ECCEZIONI_STORICHE` documenta tre casi già applicati fuori
dal flusso tracciato.

**Verificato oggi:** il confronto per nome produce **15 voci applicate in
produzione senza un file omonimo nel repository**. Le ho ispezionate una per
una: sono **tutte** rinominazioni della stessa migrazione (es. il file
`20260609174842_step_j_fix3.sql` è registrato come
`step_j_fix3_tasks_set_created_by`; `20260806150000_messages_solo_mittente_…`
è stato applicato in due tempi, base + `…_fix_sender_anchor`). **Nessuno scarto
reale.** Il rilievo non è che ci sia uno scarto: è che se ci fosse, nessuno lo
saprebbe — e le 15 voci legittime sono anche il motivo per cui il controllo
inverso non può essere una semplice differenza di insiemi.

**Soluzione.** Aggiungere il verso opposto come **avviso** (non come errore) con
un elenco di corrispondenze note, così il rumore è dichiarato invece che
implicito:

```js
// scripts/verifica-rpc/migrazioni.js

// Migrazioni applicate con un nome diverso da quello del file che le
// descrive. Non sono scarto: sono lo stesso oggetto sotto due etichette,
// tipicamente perché lo strumento di applicazione ha generato il proprio slug.
// Elencate una per una — e non dedotte con un confronto permissivo — per la
// stessa ragione di ECCEZIONI_STORICHE: un confronto per sottostringa
// silenzierebbe anche lo scarto vero dal nome simile.
export const ALIAS_APPLICATE = new Map([
  ['step_j_fix3_tasks_set_created_by', '20260609174842_step_j_fix3'],
  ['step_j_fix4_mention_regex',        '20260609184437_step_j_fix4'],
  ['step_j_fix5_notifications_rls',    '20260609190630_step_j_fix5'],
  ['20260611_origin_tagging',          '20260610192442_origin_tagging'],
  ['fix_clients_insert_rls_and_helper_fn_notes',   '20260622213034_fix_clients_insert_rls'],
  ['perf_rls_auth_uid_initplan_and_dedup_policies','20260622213133_perf_rls_initplan_dedup'],
  // Applicata in due tempi (base + fix dell'ancora sul mittente), consolidata
  // in un solo file: verificato il 14 agosto che il corpo in produzione
  // corrisponde a quello del file.
  ['messages_blocca_modifiche_altrui_fix_sender_anchor',
   '20260806150000_messages_solo_mittente_modifica_contenuto'],
  // … le restanti, con la stessa disciplina
]);

// Il verso OPPOSTO a `mancanti`: applicate al database e assenti dal
// repository. Non fa fallire il workflow — le rinominazioni legittime sono
// molte e un rosso permanente è il modo per cui un controllo smette di essere
// creduto (vedi sonda.js) — ma le nomina, che è ciò che oggi non succede
// affatto: una migrazione applicata solo in produzione non compare in NESSUN
// controllo, e si scopre quando si ricostruisce lo schema dai file.
export function trovaNonVersionate({ locali, applicate, alias = ALIAS_APPLICATE }) {
  const slugLocali = new Set(locali.filter(Boolean).map((l) => l.slug));
  const prefissiLocali = new Set(locali.filter(Boolean).map((l) => l.prefix));
  return applicate.filter((a) =>
    !slugLocali.has(a.name) && !prefissiLocali.has(a.version) && !alias.has(a.name));
}
```

Nel runner, come `::warning` annotato — la stessa scelta già fatta per il salto
dell'advisor (A-2 del 12 agosto), e per lo stesso motivo: un controllo che non
può fallire deve almeno essere visibile.

---

### 🟢 B-1 — Lo schema `backup_liste_20260729` è ancora in produzione

Verificato oggi: lo schema esiste con 3 tabelle (`liste_viaggio`,
`movimenti_lista`, `lista_history`) e **~2.323 righe stimate**, istantanea del
29 luglio. Nessuna RLS (`relrowsecurity = false`), nessuna primary key — gli
advisor di performance lo segnalano tre volte.

**Non è raggiungibile dall'esterno**, ed è la ragione per cui resta Bassa:
verificato che né `anon` né `authenticated` hanno `USAGE` sullo schema né
`SELECT` sulle tabelle. Restano copie di dati di clienti reali senza scadenza
dichiarata, accessibili a `service_role` — cioè a ogni Edge Function e a
chiunque abbia la chiave.

**Soluzione.** Decidere e scrivere la decisione, invece di lasciarla implicita:
se il backup del 29 luglio ha ancora una funzione, dichiararla in
`docs/MIGRAZIONI_SUPABASE.md` con una data di scadenza; altrimenti

```sql
-- Istantanea pre-migrazione del 29 luglio, conservata durante il consolidamento
-- del modulo Liste. Il modulo è in produzione e ha il proprio backup JSON
-- scaricabile: questa copia non ha più un lettore.
drop schema if exists backup_liste_20260729 cascade;
```

---

### 🟢 B-2 — `public.next_dossier_number()` è orfana

`20260616221642_remove_pratiche_fornitori.sql` rimuove il modulo pratiche: droppa
`generate_dossier_number()`, le tabelle e la sequence `dossier_number_seq` — ma
**non** `next_dossier_number()`, che di quella sequence si serviva. La funzione è
quindi rimasta in produzione e fallirebbe se invocata.

Non è un rischio di sicurezza: `20260613092355` e `20260616055351` le hanno già
revocato l'`EXECUTE` da `public`, `anon` e `authenticated`, e ha
`search_path` impostato. È l'unica funzione `SECURITY DEFINER` del progetto senza
`SET search_path` *nel file che la crea* — la lacuna è stata chiusa da un `ALTER`
successivo, il che vale quanto averla scritta bene, ma rende il file fuorviante
per chi lo legge oggi.

```sql
-- Ultimo residuo del modulo pratiche, rimosso dalla 20260616221642: la sua
-- sequence non esiste più dal 16 giugno, quindi la funzione fallirebbe se
-- qualcuno riuscisse a invocarla (nessuno può: EXECUTE revocato dal 13 giugno).
drop function if exists public.next_dossier_number();
```

---

### 🟢 B-3 — Due trigger sovrapposti su `messages`, con strategie opposte

Verificato in produzione: `public.messages` ha **entrambi** i trigger
`BEFORE UPDATE`.

| Trigger | Origine | Strategia |
|---|---|---|
| `trg_messages_blocca_modifiche_altrui` | `20260806150000` | **Allowlist** su `to_jsonb`: solleva eccezione |
| `trg_messages_guard_participant_update` | `20260613092421` | **Enumerazione** di 15 colonne: le ripristina in silenzio |

I trigger scattano in ordine alfabetico di nome: `blocca_…` viene prima e
solleva, quindi `guard_…` non viene mai raggiunto per una modifica vietata. Non
è un difetto di comportamento — è un difetto di **leggibilità della regola**: la
migrazione del 6 agosto argomenta in modo esplicito perché l'enumerazione di
colonne è la strategia sbagliata («una colonna aggiunta domani nasce NON
protetta»), e l'implementazione che incarna quella strategia è ancora installata
accanto alla sua sostituta. Chi aggiunge una colonna a `messages` domani trova
due regole, una delle quali gli dice il contrario dell'altra.

```sql
-- Sostituito da trg_messages_blocca_modifiche_altrui (20260806150000), che
-- solleva invece di ripristinare in silenzio e ragiona per allowlist invece che
-- per enumerazione. Irraggiungibile in pratica (l'altro scatta prima in ordine
-- alfabetico e solleva), ma lasciarlo installato significa tenere in piedi
-- l'esempio della strategia che la sua sostituta è stata scritta per superare.
drop trigger if exists trg_messages_guard_participant_update on public.messages;
drop function if exists public.messages_guard_participant_update();
```

Da fare **dopo** aver verificato che nessuna scrittura legittima dipenda dal
ripristino silenzioso — le RPC `messages_mark_read` e `messages_toggle_reaction`
toccano solo colonne in allowlist, quindi non dovrebbero, ma è una prova da fare
prima e non un'inferenza da fare dopo.

---

### 🟢 B-4 — `.svg` promesso come immagine, rifiutato dal bucket

`lib/fileUtils.js:41-47` (`mediaKind`) e `chat/chatFiles.js:19-25`
(`fileKindFromName`) classificano `.svg` come immagine. Verificato in
produzione: **nessuno dei tre bucket ha `image/svg+xml` fra gli
`allowed_mime_types`** — l'upload viene rifiutato dal server.

Il ramo è quindi morto, ma non innocuo: l'utente che trascina un SVG vede
l'icona 🖼️ e l'anteprima promessa, poi l'upload fallisce con un errore di MIME
type che non nomina l'SVG. Vale la pena notare che l'esclusione dell'SVG dai
bucket è **corretta e va mantenuta** (un SVG è un documento eseguibile, e
`TaskAttachments.jsx:93` / `ChatMessage.jsx:74` aprono gli allegati con
`window.open` — su origin Supabase, quindi fuori dalla portata della sessione
dell'app, ma è un margine da non consumare).

```js
// lib/fileUtils.js — SVG tolto: nessun bucket lo accetta (allowed_mime_types
// non include image/svg+xml, ed è voluto: un SVG è un documento eseguibile).
// Tenerlo qui prometteva un'anteprima a un file che l'upload rifiuta.
export function mediaKind(mimeOrName = "") {
  const s = String(mimeOrName).toLowerCase();
  if (/^image\/|\.(png|jpe?g|gif|webp|bmp)$/.test(s)) return "image";
  …
```

Stessa rimozione in `fileKindFromName` (`chatFiles.js:23`) e in `fileIcon`
(`fileUtils.js:29`). Meglio ancora: rifiutare l'SVG **prima** dell'upload con un
messaggio che lo nomini, invece di lasciar arrivare l'errore dal server.

---

## 4. Cosa è stato verificato e risultava già a posto

Elencato perché un audit che riporta solo i problemi non dice quanta superficie
ha coperto — e perché la prossima lettura non rifaccia lo stesso lavoro.

**Database (produzione, ispezione diretta):** RLS attiva su tutte e 19 le
tabelle `public`; `anon` senza `SELECT`/`INSERT`/`UPDATE`/`DELETE` su nessuna;
entrambe le viste (`liste_saldi`, `lista_partecipanti`) con
`security_invoker=true` — cioè le policy delle tabelle sottostanti si applicano
davvero; tutte le funzioni `SECURITY DEFINER` vive con `SET search_path`
(l'unica senza è la orfana di B-2); i tre bucket privati, con `file_size_limit`
e `allowed_mime_types` coerenti con le costanti del client; policy su `notices`
e `conversations` lette una per una.

**Edge Function:** le tre privilegiate (`invite-user`, `delete-user`,
`set-user-active`) passano tutte da `requireActiveAdmin` con il predicato
condiviso; `safeRedirect` e `isAllowedOrigin` restringono correttamente alla
famiglia di host del progetto ed escludono le label annidate; `send-push`
confronta il secret a tempo costante; il self-delete e il self-demote sono
bloccati in tre punti diversi e coerenti.

**Client:** nessun `dangerouslySetInnerHTML`, `innerHTML`, `eval` o
`new Function` in tutto `src/`; l'unico HTML costruito come stringa (`docHtml`
in `listeApi.js`) applica `escHtml` a ogni interpolazione di testo libero; tutti
i `window.open` passano `noopener`; nessun segreto nella history git oltre alla
chiave `anon` (pubblica per progetto, già motivata nei workflow); l'import di
`lib/supabase` è confinato a tre file, come da regola di lint.

**Test e CI:** 1168 test verdi in 54 s; CI esegue lint, convenzioni, test, build
e verifica del bundle; il workflow *Verifica RPC* copre RPC, migrazioni e
advisor su produzione.

**Complessità dei componenti:** nessun file oltre 561 righe; il massimo di
`useEffect` in un componente è 7 (`ConversationView`), di `useState` è 10
(`ProfileEditor`, `ClientiView`) — entrambi sotto le soglie che gli audit
precedenti hanno usato come segnale. Nessun componente da spezzare con urgenza.

---

## 5. Il tema di fondo, in una riga

I due rilievi più gravi hanno la stessa forma, e non è la forma di un bug di
sicurezza: **uno strato è stato esteso e il suo chiamante no**. In C-1 il layer
dati ha imparato a gestire i cointestatari e il componente che lo chiama non lo
sa; in A-1 il database ha imparato a negare le modifiche agli avvisi altrui e il
registry che ci scrive non lo sa. In entrambi i casi il codice compila, i test
passano e la UI dichiara successo — perché non esiste nulla che leghi le due
forme fra loro.

È lo stesso problema che `state/persistence.js` descrive in testa a se stesso
(«due switch paralleli da tenere allineati: qualsiasi divergenza non produce un
errore di compilazione, produce dati che si scostano in silenzio») e che ha già
risolto una volta, per i task, con `persistenceGuards.test.js`. La direzione di
lavoro suggerita non è "più controlli", è **estendere quella stessa tecnica alle
due frontiere rimaste scoperte**: il round-trip export↔import del backup (la
guardia proposta in C-1) e la simmetria guard↔RLS per le entità che oggi non ce
l'hanno (avvisi, e con lo stesso metodo clienti e categorie).
