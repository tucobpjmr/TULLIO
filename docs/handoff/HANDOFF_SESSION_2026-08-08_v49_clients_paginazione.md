# HANDOFF — sessione 49 (8 agosto 2026, stesso giorno di v48)

> Branch `claude/db-max-rows-cap-verify-3dz9gs`. Chiude il secondo dei due
> punti lasciati aperti da v48 sulla verifica B-1 — non con la misura mancante
> (ancora non ottenibile da sessione), ma togliendole la giustificazione:
> `Clients.list()` non dipende più dal valore del cap.

## In una riga

`fetchAllRows` (già in `listeApi.js`) è ora condiviso in
`src/lib/fetchAllRows.js`; `Clients.list()` lo usa invece di un `select('*')`
nudo. Nessun cambiamento di comportamento visibile finché `clients` resta
sotto il cap — la correzione è per quando (non se) lo supererà.

## Cosa è cambiato

- **Nuovo** `src/lib/fetchAllRows.js`: `fetchAllRows` + `WITH_COUNT`, estratti
  da `listeApi.js` senza modifiche di logica.
- `src/lib/listeApi.js`: importa `fetchAllRows`/`WITH_COUNT` dal nuovo modulo
  invece di definirli localmente. Tutti i call site (`list`, `listTrash`,
  `saldi`, `listaIdsDiCliente`, `backupData`) restano invariati.
- `src/lib/api.js`: `Clients.list()` passa da
  `supabase.from('clients').select('*').order('name')` a
  `fetchAllRows(() => supabase.from('clients').select('*', WITH_COUNT).order('name'))`.
  Unico chiamante: `useAppHydration.js:207`, già in forma
  `const { data, error } = await ClientsAPI.list()` — compatibile senza tocchi.
- **Nuovo** `src/test/clientsPaginazione.test.js` (5 casi, stesso pattern di
  `listePaginazione.test.js`): tutte le righe oltre 1000, pagine contigue,
  tenuta anche con un cap simulato più basso di una pagina, nessuna pagina in
  più quando si è sotto il cap, propagazione dell'errore.

## Perché non ho aspettato la misura del cap

La correzione non la richiede: paginare fermandosi sul `count` esatto del
`Content-Range` è strettamente migliore di un `select('*')` nudo qualunque sia
il valore reale di `db-max-rows` (1000, 500, illimitato). In v48 non era stata
applicata solo per perimetro (B-1 riguardava altro); questo branch nasce
apposta su questo punto, quindi il perimetro c'è.

## Cosa resta davvero aperto

Il valore effettivo di `db-max-rows` **non è verificabile da sessione**, né
ora né in v48: non è in `pg_db_role_setting`, non lo espone nessun tool
Supabase MCP disponibile (sono management-plane ma non coprono
Settings → API → Max rows), e il test empirico alternativo — una GET REST
senza `.range()` su una tabella sopra il cap, per contare quante righe tornano
davvero — richiede un JWT autenticato con ruolo admin/manager/agent che non è
disponibile qui (RLS blocca l'anon key). **Va guardato a mano in dashboard**,
una tantum: non per decidere se applicare questa correzione (già fatto), ma
per sapere se restano altre query non paginate a rischio nel progetto.

## Stato misurato

| | v48 | v49 |
|---|---|---|
| Test | 831 verdi + 7 skipped, 69 file | **836 verdi + 7 skipped, 70 file** |
| ESLint | 0 errori, 19 warning | invariato |
| Build produzione | ok | ok |

## Migrazioni

Nessuna. Solo codice client.
