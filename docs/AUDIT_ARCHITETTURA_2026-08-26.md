# Audit architettura — 26 agosto 2026

Perimetro: **solo il punto 1** — organizzazione di cartelle e moduli,
separazione delle responsabilità (dominio / chiamate API / stato locale / UI),
duplicazione e anti-pattern React. Undici rilievi: **nessuno critico, due di
alta priorità**.

Eseguito su un repository con `lint`, `test` (1691 passati, 11 saltati),
`verifica:tipi`, `verifica:convenzioni` (41 controlli, nessuna divergenza) e
`build` tutti verdi, e con **zero cicli** nel grafo degli import di `src/`
(258 moduli, misurati).

⟦stato: 2/12 chiusi⟧

> **Sulla numerazione.** `A-` = alta priorità, `M-` = media, `B-` = bassa,
> come negli audit dal 12 al 16 agosto e in quello del 25.

> **Aggiornamento — A-1 e A-2 chiusi.** In fondo a ciascuno dei due c'è la
> sezione «Come è stato chiuso», con ciò che è stato fatto e le due cose che si
> sono scoperte facendolo: il controllo di A-1 non poteva dichiarare un
> perimetro proprio (il suo stato finale corretto è zero file), e il test del
> doppio invio scritto con `fireEvent` **passava anche sul codice difettoso**.
> Il rilievo **M-6** non c'era nella prima stesura: l'ha trovato il controllo
> corretto, ed è il primo segno che A-1 fa il suo mestiere.

---

## Executive summary

Il progetto è in **ottima salute strutturale** e non è una formula di
cortesia: nessun ciclo di import, nessun file oltre il tetto, zero
`dangerouslySetInnerHTML`/`innerHTML`/`eval`, RLS su tutte e 22 le tabelle,
CSP senza `unsafe-inline`, e undici audit precedenti tutti chiusi. I rilievi
qui sotto non descrivono un'app che si sta sfaldando: descrivono **il bordo
esatto a cui si è fermato il lavoro di convergenza fatto finora.**

Quel bordo ha un nome ed è sempre lo stesso: **`src/components/liste/`.**

Il modulo Liste è arrivato da un porting (una SPA vanilla) e da allora ha
ricevuto le convergenze del core *una alla volta e in ritardo* — l'ultima,
`esitoScrittura`, appena il 25 agosto (M-1). Il risultato è che oggi il core ha
un contratto per ciascuno dei suoi problemi ricorrenti e il modulo Liste ne ha
una copia più debole per quasi tutti: il salvataggio (A-2), gli editor in linea
(B-2), la formattazione e la generazione di documenti dentro il data layer
(B-1). Dodici form del modulo scrivono con `const [saving, setSaving]` scritto a
mano, mentre `useSalvataggio` — l'hook che esiste per quello, con il freno al
doppio invio su `ref` e il guard di smontaggio — ha tredici call site e **nessuno
dentro `liste/`.**

**Il rilievo che conta più di tutti è però A-1, ed è di natura diversa.** Il
progetto ha un controllo automatico che certifica «form che scrivono senza
attendere l'esito: **0**». Quel controllo riconosce un form dall'import di
`validaCampi` e una scrittura da `dispatch({ type: "<azione del registry
core>" })`. Le scritture del modulo Liste passano da `esegui("nomeOperazione",
…)`: **nessuna** di esse può far scattare quel predicato. Il `0` è vero, ma è
vero su un perimetro più piccolo del codice, e niente lo dice. `AddMovBox.jsx`
è la dimostrazione: importa `validaCampi` (riga 10), gestisce `saving` a mano
(righe 40, 74, 78), ed è invisibile al controllo per un motivo solo — scrive
con `esegui`. È **a una riga** dall'essere segnalato, ed è esente in silenzio.

Un controllo verde su un perimetro non dichiarato è peggio di un controllo
assente: quello assente lascia la domanda aperta, questo la chiude con la
risposta sbagliata. È lo stesso difetto che `formSenzaAttesaEsito` già si
protegge dal lato opposto — solleva `LetturaFallita` se *nessun* file importa
`validaCampi` — ma manca dell'altra metà: nessuno verifica che il perimetro
contenga tutti i form.

Il resto è debito ordinario e ben circoscritto: sei corpi di idratazione
gemelli in `useAppHydration` (M-1), un'API dei permessi con tre forme di
chiamata per la stessa domanda (M-2), il modulo con il **fan-in più alto
dell'app** (`styles/common.js`, 85 importatori) che ha i nomi peggiori (M-3),
il fetch-al-mount riscritto nove volte con tre nomi di flag diversi accanto a
un `useIsMounted` che già c'è (M-4).

**Una cosa trovata per strada e non è fra i rilievi.** In `Dashboard.jsx:114`
`me` è **l'oggetto membro** (`getMember(uid)`); in `Trash.jsx:54`,
`Archive.jsx:59` e `ChatPanel.jsx:97` `me` è **la stringa id**. Stesso
identificatore, due tipi, quattro file vicini. Nessun difetto oggi — è dentro
M-2 perché è la stessa domanda («chi sono io?») che non ha una risposta sola.

---

## Tabella delle priorità

| # | Priorità | Area | Rilievo | Dove |
|---|---|---|---|---|
| **A-1** ✔ | Alta | Controlli | Il controllo «form che scrivono senza attendere l'esito» **non può vedere** `components/liste/`: verde su un perimetro più piccolo del codice, e non dichiarato | `scripts/verifica-convenzioni/convenzioni.js:342-357` |
| **A-2** ✔ | Alta | Duplicazione / robustezza | 12 form del modulo Liste fuori dal contratto «salva e chiudi»: freno al doppio invio sullo *stato* invece che su un `ref`, nessun `finally`, nessun guard di smontaggio | `components/liste/**` (12 file) |
| **M-1** | Media | Duplicazione | `useAppHydration`: sei corpi di idratazione quasi identici e tre `applyRow` gemelli che differiscono per due token | `hooks/useAppHydration.js:201-653` |
| **M-2** | Media | SoC / API | I permessi hanno tre forme di chiamata per la stessa domanda; `userId` è ridondante in 28 call site su 29; `me` ha due tipi in quattro file | `state/AppDataContext.jsx:60-88` + 29 call site |
| **M-3** | Media | Accoppiamento | Il modulo con il fan-in più alto dell'app (85) ha nomi meccanici e sei nomi nati da collisione (`rowGap62`, `gridGap102`…) | `styles/common.js` |
| **M-4** | Media | Convergenza | «Fetch al mount, scarta la risposta tardiva» riscritto 9 volte con 3 nomi di flag, accanto a `useIsMounted` che già lo risolve | 9 file in `components/`, `hooks/` |
| **M-5** | Media | SoC | `AdvancedSearchPanel`: UI + fetch + reducer + ~110 righe di filtraggio di dominio su due famiglie di entità, in un componente | `components/search/AdvancedSearchPanel.jsx` |
| **M-6** | Media | Convergenza | Due modali admin scrivono senza passare da un registry (`Users.invite`) e tengono `busy` a mano: stessa forma di A-2, fuori dal perimetro di entrambi i controlli | `admin/AddTeamMemberModal.jsx:62` · `admin/BulkInviteModal.jsx:65` |
| **B-1** | Bassa | SoC | `listeApi.js` (537 righe) è quattro moduli: data layer, formattazione, costanti di dominio, generazione documenti | `components/liste/listeApi.js` |
| **B-2** | Bassa | Duplicazione | Tre editor in linea gemelli nella stessa cartella: stesso stato, stesso ciclo, stessa barra azioni copiata | `liste/{TitoloTestata,NoteInterne,CellEditor}.jsx` |
| **B-3** | Bassa | Navigabilità | 143 file di test piatti in `src/test/` contro 25 cartelle di sorgente; la struttura vive nei prefissi dei nomi | `src/test/` |
| **B-4** | Bassa | Anti-pattern React | `key={i}` su una lista identificata e alimentata dal realtime | `components/tasks/TaskCommenti.jsx:72` |

---

## A-1 · Il controllo che certifica un perimetro più piccolo del codice

**Dove.** `scripts/verifica-convenzioni/convenzioni.js:342-357`.

**Il rilievo.** `npm run verifica:convenzioni` stampa oggi:

```
✓ form che scrivono senza attendere l'esito: 0
```

Il predicato che produce quel numero è:

```js
export function formSenzaAttesaEsito(sorgenti, azioni) {
  const HA_FORM  = /import\s*\{[^}]*\bvalidaCampi\b[^}]*\}\s*from/;
  const ATTENDE  = /\buseSalvataggio\b|await\s+dispatch\s*\(/;
  const SCRIVE   = new RegExp(
    `dispatch\\(\\s*\\{\\s*type:\\s*["'](?:${azioni.join('|')})["']`);
  // …
  return conForm.filter(f => SCRIVE.test(f.testo) && !ATTENDE.test(f.testo))
                .map(f => f.path);
}
```

`azioni` viene da `azioniRegistry(src/state/persistence.js)`, cioè dalle azioni
del registry **del core**. Un form è dunque «un form» solo se importa
`validaCampi`, e «scrive» solo se dispatcha un'azione del core.

Il modulo Liste non soddisfa né l'una né l'altra condizione, per costruzione:

| Condizione | `components/liste/` |
|---|---|
| importa `validaCampi` | 1 file su 12 (`AddMovBox.jsx`) |
| dispatcha un'azione del registry core | **0 file** — le scritture passano da `esegui("nomeOperazione", …)` (`listePersistence.js`) |

Il perimetro effettivo del controllo su `components/liste/` è quindi **0 form
su 12**.

**Perché è di alta priorità.** `AddMovBox.jsx` lo rende concreto:

```js
// src/components/liste/AddMovBox.jsx
10:  import { validaCampi, obbligatorio, interpretabile, primoCampoInvalido } from "../../lib/validators.js";
40:  const [saving, setSaving] = useState(false);
61:  if (saving) return;
63:  const trovati = validaCampi(valori, REGOLE);
74:  setSaving(true);
75:  const { ok } = await esegui("registraMovimento", { … });
78:  setSaving(false);
```

Passa `HA_FORM` (riga 10). Fallisce `ATTENDE` (nessun `useSalvataggio`, nessun
`await dispatch`). È esattamente ciò che il controllo cerca — e non viene
segnalato solo perché `SCRIVE` non riconosce `esegui(...)` come una scrittura.
**Una riga di differenza fra "segnalato" e "esente in silenzio".**

Il file ha già la difesa opposta: `formSenzaAttesaEsito` **solleva** se nessun
sorgente importa `validaCampi`, perché «senza, questo controllo non ha più
nessun form da guardare». Manca l'altra metà — che i form guardati siano
*tutti* i form.

**La correzione.** Riconoscere anche il secondo verbo di scrittura dell'app, e
riconoscere un form da ciò che un form fa (avere uno stato di invio) invece che
da un import specifico. Il controllo va inoltre reso *rumoroso* sul proprio
perimetro: deve dire quanti form ha guardato, non solo quanti ne ha bocciati.

```js
// scripts/verifica-convenzioni/convenzioni.js

/**
 * I form che scrivono senza attendere l'esito.
 *
 * ⚠️ IL PERIMETRO È PARTE DEL CONTRATTO. Fino ad A-1 (audit del 26 agosto)
 * questo predicato riconosceva un form dall'import di `validaCampi` e una
 * scrittura da `dispatch({ type: <azione del registry core> })`. Le dodici
 * form di `components/liste/` non soddisfano né l'una né l'altra — scrivono
 * con `esegui("nomeOperazione", …)` — quindi il `0` che questo controllo
 * stampava era vero sul core e muto sul modulo Liste, senza che niente lo
 * dicesse. Un controllo verde su un perimetro non dichiarato è peggio di un
 * controllo assente.
 *
 * Ora un form è «un file che ha uno stato di invio», che è ciò che un form fa,
 * e le scritture sono DUE: il dispatch del registry core e l'esecutore del
 * registry Liste. `perimetro` torna insieme ai rilievi così che il chiamante
 * possa dichiararlo invece di darlo per scontato.
 */
export function formSenzaAttesaEsito(sorgenti, azioni) {
  // Uno stato di invio: `saving`, `busy`, `inVolo` — comunque lo si chiami.
  const HA_FORM = /useState\(false\)/.source
    && /const\s*\[\s*(?:saving|busy|inVolo|invio)\s*,/;
  const ATTENDE = /\buseSalvataggio\b|await\s+dispatch\s*\(/;
  const SCRIVE_CORE = new RegExp(
    `dispatch\\(\\s*\\{\\s*type:\\s*["'](?:${azioni.join('|')})["']`);
  // Il secondo verbo di scrittura dell'app: il registry del modulo Liste.
  const SCRIVE_LISTE = /\besegui\s*\(\s*["'][a-zA-Z]/;
  const SCRIVE = (t) => SCRIVE_CORE.test(t) || SCRIVE_LISTE.test(t);

  const conForm = (sorgenti || []).filter(f => HA_FORM.test(f.testo));
  if (conForm.length === 0) {
    throw new LetturaFallita(
      'Nessun file di src/ dichiara uno stato di invio: o i form sono spariti, ' +
      'o il nome della variabile è cambiato. Senza, questo controllo non ha ' +
      'più nessun form da guardare.');
  }
  const perimetro = conForm.filter(f => SCRIVE(f.testo)).map(f => f.path);
  if (perimetro.length === 0) {
    throw new LetturaFallita(
      'Nessuno dei form trovati risulta scrivere: i due verbi di scrittura ' +
      'riconosciuti (dispatch del registry core, `esegui` del registry Liste) ' +
      'non descrivono più come questa app scrive.');
  }
  return {
    perimetro,
    fuori: perimetro.filter(p =>
      !ATTENDE.test(conForm.find(f => f.path === p).testo)),
  };
}
```

E in `scripts/verifica-convenzioni/index.js`, **due** controlli invece di uno —
il secondo è quello che impedisce al perimetro di restringersi in silenzio:

```js
const esito = formSenzaAttesaEsito(sorgenti, azioni);
controlli.push({
  nome: 'form che scrivono senza attendere l\'esito', dove: 'docs/CLAUDE.md',
  dichiarato: 0, misurato: esito.fuori.length,
  rimedio: `Passa da \`useSalvataggio\`: ${esito.fuori.join(', ')}`,
});
// A-1 · Il numero di form GUARDATI è dichiarato in docs/CLAUDE.md, come i
// call site di useSalvataggio: se il perimetro si restringe (un form nuovo che
// scrive in un modo che il predicato non riconosce) il controllo lo dice,
// invece di continuare a stampare uno 0 su un insieme più piccolo.
controlli.push({
  nome: 'form nel perimetro del contratto', dove: 'docs/CLAUDE.md',
  dichiarato: leggiPerimetroForm(claudeMd), misurato: esito.perimetro.length,
  rimedio: `Aggiorna la frase «N form sono nel perimetro» (misurati: ${esito.perimetro.join(', ')}).`,
});
```

**Nota.** Applicare questa correzione fa passare il controllo da `0` a `12`
finché A-2 non è chiuso. È il punto: il numero deve diventare rosso *prima* che
il debito venga pagato, non dopo.

---

### Come è stato chiuso ✔

`scriveDavvero()` raccoglie i **due** verbi di scrittura dell'app in un posto
solo — il `dispatch` del registry core, `esegui("nomeOperazione", …)` del
modulo Liste e la sua forma confezionata `onSave.run()` — con l'avvertenza che
un terzo registry va aggiunto lì. Il controllo passa da `0` a `1`
(`liste/AddMovBox.jsx`), che è il numero vero.

**Due controlli e non uno**, perché rispondono a due domande diverse e nessuna
delle due da sola descrive un file: «form che scrivono senza attendere l'esito»
(marcatore `validaCampi`: ci sono dati digitati da perdere) e «stato di invio
scritto a mano» (marcatore `const [saving|busy|inVolo, …]` su una scrittura: le
tre garanzie del contratto rifatte peggio). Il secondo trova tutte e dodici le
form del modulo. Fonderli avrebbe fatto perdere metà dei casi a ciascuno: un
form validato che si chiude subito non ha per forza uno stato di invio, e una
conferma senza campi digitati non importa `validaCampi` pur avendone uno.

**Una cosa scoperta scrivendolo, e che la prima stesura di questo rilievo aveva
sbagliato.** L'audit proponeva che *entrambi* i controlli dichiarassero il
proprio perimetro. Per il secondo è **contraddittorio**: il suo perimetro è
l'insieme dei file che hanno il difetto, quindi il suo stato finale corretto è
**zero file** — un `LetturaFallita` sul perimetro vuoto farebbe fallire lo
script il giorno in cui il debito è pagato. È l'unico controllo di
`convenzioni.js` che non solleva sul presupposto vuoto, e c'è un test che fissa
quella scelta invece di lasciarla sembrare una dimenticanza. A proteggerlo dal
restringersi in silenzio è il perimetro dichiarato del *primo*, che condivide
`scriveDavvero`: se un verbo smette di essere riconosciuto, quel numero cala e
il controllo lo dice — per entrambi.

Il perimetro dichiarato è **sette** form (`docs/CLAUDE.md`), e non otto come
diceva la stesura iniziale: i sei del core più `liste/AddMovBox.jsx`.

**E una scoperta che vale come rilievo nuovo:** il controllo corretto ha
illuminato due file che nessuno dei due predicati raggiunge —
`admin/AddTeamMemberModal.jsx` e `admin/BulkInviteModal.jsx`, che scrivono con
`Users.invite` senza passare da alcun registry. È **M-6**, e il fatto che siano
emersi facendo A-1 è il primo segno che il controllo fa il suo mestiere.

---

## A-2 · Dodici form del modulo Liste fuori dal contratto «salva e chiudi»

**Dove.** `components/liste/{AddMovBox,CellEditor,NoteInterne,TitoloTestata}.jsx`
e `components/liste/modals/{AggiungiBeneficiario,BulkMovimenti,EditLista,EditMovimento,ImportaBackupConfirm,NuovaLista,ResetTotale,SpostaTitolare}Modal.jsx`.

**Il rilievo.** Il contratto «salva e chiudi» è uno dei più curati del progetto:
`hooks/useSalvataggio.js` lo implementa, `src/test/salvaEChiudi.test.jsx` ne fissa
le proprietà e `src/test/salvaEChiudiSeiForm.test.jsx` ha esteso quelle proprietà
ai sei form che l'audit del 19 agosto aveva trovato fuori. I nove form coperti
dai due test sono:

```
clients/ClienteModal · tasks/QuickAddTask · tasks/TaskSlideOver
admin/AddCategoryModal · admin/tabs/AdminCategoriesTab · admin/tabs/AdminTeamTab
admin/tabs/MessageTemplatesSection · dashboard/NoticeEditorModal · tasks/Trash
```

**Nessuno è in `components/liste/`**, e i dodici form del modulo hanno tutti la
stessa forma scritta a mano:

```js
// src/components/liste/TitoloTestata.jsx:12,25-31 (e identica negli altri 11)
const [saving, setSaving] = useState(false);
// …
const save = async () => {
  if (saving) return;                                   // ① freno sullo STATO
  // …
  setSaving(true);
  const { ok } = await esegui("modificaTitolo", { id: lista.id, titolo });
  setSaving(false);                                     // ② nessun finally
  if (!ok) return;                                      // ③ nessun guard di smontaggio
  setEditing(false);
  await onSaved();
};
```

Tre differenze rispetto al contratto, tutte già argomentate **dentro
`useSalvataggio.js`**:

① **Il freno al doppio invio legge lo stato, non un `ref`.** Dal commento
dell'hook: «fra due click ravvicinati React può non aver ancora
ri-renderizzato, quindi entrambi i gestori leggerebbero `inVolo === false` e
partirebbero due scritture». Su `registraMovimento` due scritture sono **due
movimenti** su un saldo — il modulo dove, per dichiarazione della sua stessa
architettura, «il dato è denaro» (M-1 del 25 agosto).

② **`setSaving(false)` non è in un `finally`.** Sempre dal commento dell'hook:
«`QuickAddTask` aveva `setBusy(true)` senza try, quindi una qualunque eccezione
lasciava `busy` a `true` per sempre — modale congelata, bottone spento, nessun
messaggio». `useListeWrite` (`listePersistence.js:216-247`) non ha try/catch
attorno a `await spec.persist(...args)`, e solleva esso stesso su operazione non
dichiarata (riga 221).

③ **Nessun guard di smontaggio.** `useIsMounted` esiste ed è la convenzione
dichiarata in `docs/CLAUDE.md`; qui `setSaving(false)` scrive dopo un `await` su
un componente che il genitore può aver già smontato (`chiudiOverlay()` dopo il
successo).

**La correzione.** Non riscrivere dodici volte: adottare l'hook, che accetta già
qualunque `esegui` che ritorni un esito.

```js
// src/components/liste/TitoloTestata.jsx — dopo
import { useSalvataggio } from "../../hooks/useSalvataggio.js";

export function TitoloTestata({ lista, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  // `salva` ha identità stabile e porta con sé il freno su ref, il finally e
  // il guard di smontaggio — le tre cose che le dodici copie scritte a mano
  // del modulo non avevano (A-2). `esegui` ritorna { ok }, che qui si traduce
  // nella forma che l'hook legge: un `error` truthy è un fallimento.
  const { salva, inVolo, errore } = useSalvataggio(
    async (titolo) => {
      const { ok } = await esegui("modificaTitolo", { id: lista.id, titolo });
      return ok ? {} : { error: true };   // il toast lo ha già mostrato il registry
    },
    { alSuccesso: async () => { setEditing(false); await onSaved(); } },
  );

  const open = () => { setValue(lista.titolo || ""); setEditing(true); };

  const onSalva = () => {
    const titolo = value.trim() || null;               // vuoto = lista senza titolo
    if (titolo === (lista.titolo || null)) return setEditing(false); // niente da salvare
    salva(titolo);
  };
  // … <button disabled={inVolo}>{inVolo ? "Salvo…" : "Salva"}</button>
  //    {errore && <FieldError>{errore}</FieldError>}
}
```

**Chiusura del rilievo.** Estendere `salvaEChiudiSeiForm.test.jsx` (o un
`salvaEChiudiListe.test.jsx` gemello) ai dodici form, con lo stesso metodo che
il file dichiara: verificare insieme che **il pannello non si sia chiuso** e che
**i valori digitati siano ancora nel DOM**. Con A-1 corretto, il controllo di
`verifica:convenzioni` torna a 0 da solo e resta un presidio, non una
fotografia.

---

### Come è stato chiuso ✔

Tutte e dodici le form passano ora dal contratto attraverso
`components/liste/useSalvataggioLista.js`, l'adattatore che parla il dialetto
del modulo: la scrittura risponde `true`/`false` (il contratto di `run()` e di
`{ ok }`) invece che `{ error }`, e **il testo dell'errore non viene
ri-esposto** perché lo mostra già il registry come toast — renderizzarlo
accanto darebbe due frasi diverse per lo stesso evento davanti allo stesso
utente, cioè il difetto chiuso da M-1 del 25 agosto.

I due controlli di A-1 tornano a **0**, e `usiSalvataggio` sale da 13 a **26**
call site: conta entrambi i nomi di proposito, perché contare il solo nome nudo
avrebbe fatto *scendere* quel numero il giorno in cui dodici form hanno adottato
il contratto — cioè avrebbe raccontato l'opposto di quel che è successo.

Chiuso anche un refuso in attesa trovato per strada: `ResetTotaleModal`
confrontava la frase di conferma con un letterale `"RESET TOTALE"` scritto nel
componente, mentre `listePersistence.js` esporta `CONFERMA_RESET` **proprio
perché** quella frase è metà del contratto della RPC e un refuso nel chiamante
trasformerebbe l'operazione irreversibile in un errore incomprensibile. Ora la
costante alimenta il confronto, l'etichetta e il placeholder: le tre occorrenze
non possono più divergere.

**La metà che conta: `src/test/salvaEChiudiListe.test.jsx`**, 40 casi, terzo
file della famiglia dopo `salvaEChiudi` (il contratto) e `salvaEChiudiSeiForm`
(i sei del 19 agosto). Stesso metodo: ogni caso guarda **due** cose insieme —
che il pannello non si sia chiuso *e* che i valori digitati siano ancora nel
DOM — perché un test che si accontentasse del messaggio d'errore passerebbe
anche su una modale che si chiude subito dopo averlo mostrato.

**⚠️ Il difetto che il test stesso ha rischiato di avere, e che vale più della
correzione.** La prima stesura del caso sul doppio invio usava due
`fireEvent.click` di fila. **Passava anche sul codice difettoso** — verificato
eseguendola contro i file pre-A-2. La ragione: `fireEvent` avvolge ogni click
in un `act()` proprio, quindi React ri-renderizza *fra* i due click, al secondo
il bottone è già `disabled` e il gestore non parte nemmeno. Quel test misurava
`disabled`, non il freno.

La corsa vera si riproduce con due `dispatchEvent` nativi dentro **un solo**
`act()`: React batcha, il commit arriva alla fine dello scope, e i due gestori
girano entrambi con la closure del render precedente — che è esattamente dove
`if (saving) return` legge `false` due volte. Riscritto così, il test **fallisce
sul codice pre-A-2 con «expected 1 times, but got 2 times»** e passa su quello
nuovo. Su `registraMovimento` quei due erano due movimenti su un saldo.

---

## M-1 · `useAppHydration`: sei corpi gemelli e tre `applyRow` identici

**Dove.** `hooks/useAppHydration.js`, righe 201, 387, 425, 489, 571, 623.

**Il rilievo.** Sei sottoscrizioni, e per cinque di esse il corpo è **lo stesso
programma con tre token cambiati**:

```js
// notices (387) · categories (425) · users (489) · clients (571) · templates (623)
const { data, error } = await XAPI.list();
if (!isCurrent()) return;
if (error) {
  console.error("[VoyageDesk] X.list", error);
  onError(`Caricamento X fallito: ${error.message || ""}`);
  segnaCaricata("x");
  return;
}
dispatch({ type: "SET_X", payload: (data || []).map(fromDbX) });
segnaCaricata("x");
```

E tre `applyRow` (tasks 287, notices 407, clients 595) che differiscono per il
solo nome dell'azione e del mapper:

```js
applyRow: (tbl, payload) => {
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    if (!id) return false;
    dispatch({ type: "MERGE_X_ROW", payload: { eventType: "DELETE", id } });
    return true;
  }
  const row = fromDbX(payload.new);
  if (!row?.id) return false;
  dispatch({ type: "MERGE_X_ROW", payload: { eventType: payload.eventType, row } });
  return true;
},
```

**Perché è un difetto e non «tre righe uguali».** Il lato *reducer* di questo
stesso problema è già convergente: `applicaRigaRealtime` in
`state/pendingWrites.js` è una funzione sola che i tre `case MERGE_*_ROW`
chiamano, e il suo commento spiega perché. Il lato *chiamante* no. La
conseguenza è la solita: il prossimo `useDebouncedTableSubscription` copierà la
forma dal vicino, e la copia con cui si trova a lavorare potrebbe essere quella
di `clients`, che ha una riga in più (`if (!clientiCompleti.current) return true`)
il cui significato non è generale.

**La correzione.** Due fabbriche nello stesso file, sopra le sottoscrizioni.

```js
// ─── M-1 · le due forme ricorrenti dell'idratazione ───────────────────────
// Cinque delle sei sottoscrizioni caricano un'entità intera allo stesso modo,
// e tre applicano una riga realtime allo stesso modo. Il lato reducer di
// questo problema è già uno solo (`applicaRigaRealtime` in pendingWrites.js);
// qui c'era il lato chiamante, in tre e in cinque copie.

/** Il corpo di un refetch d'entità: legge, scarta se tardivo, dispatcha, segna. */
const idratazione = ({ entita, etichetta, list, mapper, action, dispatch, onError, segnaCaricata }) =>
  async (isCurrent) => {
    const { data, error } = await list();
    if (!isCurrent()) return;
    if (error) {
      console.error(`[VoyageDesk] ${etichetta}`, error);
      onError(`Caricamento ${etichetta} fallito: ${error.message || ""}`);
      segnaCaricata(entita);
      return;
    }
    dispatch({ type: action, payload: (data || []).map(mapper) });
    segnaCaricata(entita);
  };

/** `applyRow` per una tabella la cui riga è autosufficiente. */
const applicaRiga = ({ action, mapper, dispatch, quandoIgnorare }) =>
  (_tbl, payload) => {
    if (quandoIgnorare?.()) return true;   // gestito: la decisione è non fare nulla
    if (payload.eventType === "DELETE") {
      const id = payload.old?.id;
      if (!id) return false;               // senza id: reload completo
      dispatch({ type: action, payload: { eventType: "DELETE", id } });
      return true;
    }
    const row = mapper(payload.new);
    if (!row?.id) return false;
    dispatch({ type: action, payload: { eventType: payload.eventType, row } });
    return true;
  };
```

Il call site diventa dichiarativo, e ciò che resta scritto a mano è **solo ciò
che è davvero diverso** — che è il punto:

```js
useDebouncedTableSubscription(["notices"],
  idratazione({ entita: "notices", etichetta: "Notices.list", list: NoticesAPI.list,
                mapper: fromDbNotice, action: "SET_NOTICES", dispatch, onError, segnaCaricata }),
  { enabled, deps: [enabled],
    applyRow: applicaRiga({ action: "MERGE_NOTICE_ROW", mapper: fromDbNotice, dispatch }) });

useDebouncedTableSubscription(["clients"],
  idratazione({ entita: "clients", etichetta: "Clients.list", list: ClientsAPI.list,
                mapper: fromDbClient, action: "SET_CLIENTS", dispatch, onError, segnaCaricata }),
  { enabled, deps: [enabled],
    // ⚠️ Finché nessuno ha chiesto l'anagrafica non c'è niente da tenere
    // allineato: applicare la riga costruirebbe un'anagrafica di uno, due,
    // tre clienti — parziale e indistinguibile da una vera.
    applyRow: applicaRiga({ action: "MERGE_CLIENT_ROW", mapper: fromDbClient, dispatch,
                            quandoIgnorare: () => !clientiCompleti.current }) });
```

`tasks` resta scritta a mano: ha il ramo `soloThread`, la finestra delle
completate e `fondiTask` — è l'unica davvero diversa, e ora si vede.

---

## M-2 · «Chi sono io?» ha tre forme di chiamata e due tipi

**Dove.** `state/AppDataContext.jsx:60-88`, e i 29 call site nei componenti.

**Il rilievo, in tre parti.**

**(a) Il contesto è un livello di applicazione parziale, non un contenitore di
dati.** Diciassette delle sue voci sono `(...args) => P.f(team, ...args)`.
Poiché il valore è un `useMemo([team, categories, currentUserId])`, **ogni
cambiamento del team invalida l'identità di tutte e diciassette insieme** — e
`team` cambia per ogni evento realtime su `users`, presenza e avatar compresi.
Chi mette una di queste funzioni in un array di dipendenze (e succede:
`Dashboard.jsx:120`, `[allTasks, getVisibleTasks, uid]`) ricalcola su cambi che
non lo riguardano.

**(b) `userId` è ridondante in 28 call site su 29.** Misurati:

```
canViewTask(t, uid) ×4     canEditTask(task, me) ×3    getRoleType(uid) ×2
getRoleType(currentUserId) ×2   canEditTask(task, currentUserId) ×2
canAccessListe(currentUserId) ×2  getAvailableCategories(currentUserId) ×2
isJuniorAgent(uid) ×2      … e l'UNICA eccezione: isJuniorAgent(m.id)
```

Il contesto **conosce già** `currentUserId` e lo espone. Ogni call site lo
ripassa. Un parametro che è sempre lo stesso valore non documenta nulla e apre
una sola strada: passare quello sbagliato, senza che niente lo segnali.

**(c) Convivono tre forme per la stessa domanda,** e tre nomi per lo stesso
valore:

```js
P.isAdmin(team, uid)                       // lib/permissions.js, forma pura
ctx.isAdmin(uid)                           // AppDataContext, forma legata
canAccessAdmin(state.team, state.currentUserId)   // VoyageDeskInner, forma pura di nuovo
```

```js
Trash.jsx:54       const me = currentUserId;      // me : string
Archive.jsx:59     const me = currentUserId;      // me : string
ChatPanel.jsx:97   const me = currentUserId || appUserId;   // me : string
Dashboard.jsx:114  const me = getMember(uid);     // me : { id, name, role, … }
```

**La correzione.** Il contesto sa chi è l'utente: che lo *usi*. Due superfici
esplicite invece di una ambigua — `io` per «me» (il caso normale) e `per(id)`
per «qualcun altro» (il caso raro, che diventa visibile).

```js
// src/state/AppDataContext.jsx — dopo
export function AppDataProvider({ team, categories, currentUserId, children }) {
  const value = useMemo(() => {
    const t = team || [];
    const c = categories || {};

    // M-2 · I predicati legati a UN utente. `per(id)` è la forma generale;
    // `io` è `per(currentUserId)`, cioè il 28° caso su 29. Prima il parametro
    // c'era sempre e valeva sempre `currentUserId`: un argomento che non
    // distingue niente e che si può solo sbagliare.
    const per = (uid) => ({
      ruolo:            () => P.getRoleType(t, uid),
      isAdmin:          () => P.isAdmin(t, uid),
      isDriver:         () => P.isDriver(t, uid),
      isJuniorAgent:    () => P.isJuniorAgent(t, uid),
      isSeniorAgent:    () => P.isSeniorAgent(t, uid),
      vedeTask:         (task) => P.canViewTask(t, task, uid),
      modificaTask:     (task) => P.canEditTask(t, task, uid),
      creaCategoria:    (cat) => P.canCreateTaskCategory(t, cat, uid),
      accedeAdmin:      () => P.canAccessAdmin(t, uid),
      accedeListe:      () => P.canAccessListe(t, uid),
      modificaCliente:  () => P.canEditClient(t, uid),
      eliminaCliente:   () => P.canDeleteClient(t, uid),
      taskVisibili:     (tasks) => P.getVisibleTasks(t, tasks, uid),
      categorieDisponibili: () => P.getAvailableCategories(c, t, uid),
    });

    return {
      team: t, categories: c, currentUserId,
      getMember: (id) => P.getMember(t, id),
      getAssignableTeam: () => P.getAssignableTeam(t),
      per,
      io: per(currentUserId),
    };
  }, [team, categories, currentUserId]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
```

I call site diventano leggibili senza dover risalire a cosa sia `uid`:

```js
// prima                                    // dopo
const listeAllowed = canAccessListe(uid);   const listeAllowed = io.accedeListe();
canViewTask(t, uid)                         io.vedeTask(t)
isJuniorAgent(m.id)                         per(m.id).isJuniorAgent()   // ← il caso raro, ora visibile
```

E sul naming, una regola sola da aggiungere a `docs/CLAUDE.md` accanto alla
«lingua degli identificatori» (B-3 del 25 agosto): **`me` è la persona,
`currentUserId` è il suo id.** `Dashboard.jsx:114` (`const me = getMember(uid)`)
è già dalla parte giusta; i tre `const me = currentUserId` diventano
`const uid = currentUserId` o spariscono con `io`.

---

## M-3 · Il modulo più accoppiato dell'app ha i nomi peggiori

**Dove.** `src/styles/common.js`.

**Il rilievo.** Misurato sul grafo degli import di `src/` (258 moduli):

| Modulo | Fan-in |
|---|---|
| **`styles/common.js`** | **85** |
| `state/AppDataContext.jsx` | 47 |
| `state/DispatchContext.jsx` | 41 |
| `lib/taskConstants.js` | 34 |
| `lib/api.js` | 26 |

È il modulo che l'app importa di più — più del data layer, più dello stato — e
i suoi ottanta nomi sono per metà **meccanici** (`txtF13Muted` = testo 13px in
`--text-muted`) e per sei **nati da una collisione**:

```
rowGap62   rowCenterGap82   rowCenterBetween2   gridGap102   txtF10Bold2   txtF12Muted2
    3 file       7 file            10 file          5 file       5 file        7 file
```

`rowGap62` **non** è «gap 62»: è «la seconda forma che somigliava a `rowGap6`»
(`{display:flex, gap:6, justifyContent:"flex-end"}`). Il nome non descrive né
il valore né il ruolo; per sapere cosa fa bisogna aprire il file, da uno dei
tre call site.

Il file lo ammette in testa: «Un nome meccanico è un segnale utile: dice che
quella forma non ha ancora un significato nell'app». Vero, e il segnale è stato
letto: `cardElevata` è nato promuovendo `boxR14`, e il commento lo racconta. Ma
il segnale è rimasto acceso su ottanta nomi, e i sei con il suffisso numerico
sono un secondo problema sopra al primo — non dicono «forma senza significato»,
dicono **una cosa falsa**.

Nota di contorno, che è la ragione per cui questo non è di priorità più alta:
`verifica:convenzioni` presidia già i due bordi importanti («forme di stile
identiche in 3+ file: 0», «forme già in common.js riscritte altrove: 0»). Il
registro non si sfalda. Sono i nomi a non reggere il fan-in.

**La correzione**, in due passi, nessuno dei quali cambia un pixel:

**1. I sei nomi da collisione perdono il numero e prendono il ruolo.** Sono
28 call site in tutto, un rename meccanico verificabile riga per riga:

```js
// prima                    // dopo
rowGap62          →  rowAzioniInLinea    // flex, gap 6, allineato a destra: la coppia Annulla/Salva
rowCenterGap82    →  rowFiltri           // flex centrato, gap 8, wrap, mb 16: le barre di filtro
rowCenterBetween2 →  piedeSezione        // space-between con bordo superiore: il piede di una sezione
gridGap102        →  grigliaCampi        // la griglia dei campi di un form
txtF10Bold2       →  etichettaSezione    // 10px bold spaziato: le INTESTAZIONI IN MAIUSCOLO
txtF12Muted2      →  sottotitolo         // 12px muted con mt 2: la riga sotto un titolo
```

**2. Una regola che impedisce al problema di tornare,** perché il rename da
solo non lo fa — il prossimo nome in collisione nascerà allo stesso modo:

```js
// eslint.config.js — accanto a STILE_INLINE_COSTANTE
// M-3 (audit del 26 agosto). `rowGap62` non è «gap 62»: è «la seconda forma
// che somigliava a rowGap6», e da tre call site non c'è modo di saperlo. Il
// suffisso numerico di collisione è l'unico caso in cui un nome meccanico
// smette di essere un segnale onesto e diventa una informazione falsa.
// Vietato SOLO in questo file: `grid2ColGap12` (due colonne) e `txtF13`
// (tredici pixel) hanno cifre che significano qualcosa e restano.
const VIETATO_SUFFISSO_COLLISIONE = {
  selector: 'Program > ExportNamedDeclaration > VariableDeclaration >' +
            'VariableDeclarator[id.name=/^(row|col|grid|txt|box|card)[A-Za-z]+[A-Za-z]\\d$/]',
  message: 'Nome di stile con suffisso numerico di collisione (…2, …3): dice ' +
           'una cosa falsa sul valore. Dai alla forma il nome del suo ruolo ' +
           '— vedi M-3 dell\'audit del 26 agosto.',
};
// … in files: ['src/styles/common.js']
```

---

## M-4 · «Fetch al mount» riscritto nove volte, con tre nomi

**Dove.** Nove effetti, tre nomi di flag:

| Nome | File |
|---|---|
| `alive` | `admin/tabs/AdminTeamTab.jsx:72` · `search/AdvancedSearchPanel.jsx:94` · `hooks/usePushNavigation.js:72` |
| `annullato` | `ui/Avatar.jsx:36` · `clients/ClientiView.jsx:140` · `hooks/useRicercaClienti.js:46` |
| `cancelled` | `chat/message/VoiceRecorder.jsx:80` · `hooks/useDebouncedTableSubscription.js:127` · `hooks/usePresence.js:97` |

**Il rilievo.** La domanda è una — «la risposta è arrivata tardi, la scarto?» —
e il progetto le ha già dato una risposta, due volte: `useIsMounted()`
(6 consumatori) e `isCurrent()` di `useDebouncedTableSubscription`, che il
commento di `useIsMounted` dichiara esplicitamente essere «lo STESSO contratto».
Poi ci sono queste nove, che non usano né l'una né l'altra.

Non sono tutte equivalenti, ed è importante dirlo: `Avatar` e `useRicercaClienti`
si difendono anche dal **cambio di dipendenza** (l'ultima risposta arrivata non
è l'ultima richiesta fatta), che `useIsMounted` non copre. Ma la gestione
dell'errore diverge senza motivo su tutte e nove — silenzio (`Avatar`,
`useRicercaClienti`), `console.error` (`ClientiView`, `AdvancedSearchPanel`),
oppure stato d'errore con bottone «Riprova» (`ClienteListePanel`) — e chi ne
scrive una decima copia la copia dal vicino, ereditando quella scelta per caso.

**La correzione.** Una primitiva sola per «carica al mount, scarta il tardivo»,
che copre entrambi i casi (smontaggio *e* cambio di dipendenza) e rende
l'errore una decisione dichiarata:

```js
// src/hooks/useCaricamento.js
// M-4 (audit del 26 agosto). «Carica al mount, scarta la risposta tardiva»
// era scritto nove volte con tre nomi di flag diversi (`alive`, `annullato`,
// `cancelled`) e tre gestioni dell'errore incompatibili — silenzio,
// console.error, stato d'errore con Riprova — scelte una per copia e mai
// insieme. Convive con useIsMounted(), che risponde alla stessa domanda per
// chi ha un `await` dentro un GESTORE e non un effetto.
//
// Copre entrambe le corse, che le nove copie coprivano a metà ciascuna: lo
// smontaggio E il cambio di dipendenza (l'ultima risposta arrivata non è per
// forza l'ultima richiesta fatta — vedi Avatar, dove `photo` cambia).
import { useEffect, useState } from "react";

export function useCaricamento(carica, deps, { iniziale = null, suErrore } = {}) {
  const [dato, setDato] = useState(iniziale);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    let corrente = true;
    setCaricando(true);
    setErrore(null);
    Promise.resolve(carica())
      .then((r) => {
        if (!corrente) return;
        // La forma { data, error } del data layer, o un valore nudo.
        if (r && typeof r === "object" && "error" in r) {
          if (r.error) { setErrore(r.error); suErrore?.(r.error); return; }
          setDato(r.data);
        } else setDato(r);
      })
      .catch((e) => { if (corrente) { setErrore(e); suErrore?.(e); } })
      .finally(() => { if (corrente) setCaricando(false); });
    return () => { corrente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { dato, caricando, errore };
}
```

`AdvancedSearchPanel.jsx:92-105` (undici righe) diventa una:

```js
const { dato: liste } = useCaricamento(
  () => (listeAllowed ? listeRicercabili() : { data: [], error: null }),
  [listeAllowed],
  { iniziale: [], suErrore: (e) => console.error("[liste] ricerca", e) },
);
```

---

## M-5 · `AdvancedSearchPanel`: quattro lavori in un componente

**Dove.** `components/search/AdvancedSearchPanel.jsx` (384 righe effettive).

**Il rilievo.** Il file fa quattro cose che si possono nominare separatamente:

| Righe | Responsabilità |
|---|---|
| 42-66 | Un reducer di filtri (`FILTRI_VUOTI`, `filtriReducer`) |
| 92-105 | Una **chiamata dati** (`listeRicercabili()`, fetch all'apertura) |
| 146-250 | ~110 righe di **filtraggio di dominio** su due famiglie di entità (task e liste): indici, filtri strutturali, `matchIndice`, due ordinamenti |
| 255-510 | La UI |

Il blocco di dominio è **puro** — prende `(indice, filtri, keyword)` e ritorna
un array — e non è testabile senza montare un pannello con sei provider. Il
progetto ha già `lib/searchUtils.js` e `liste/listeOrdinamento.js`: la casa
c'è, il codice non ci è entrato.

**Perché è di media e non di bassa.** Questo pannello promette due cose
delicate che la sua logica implementa e nessun test unitario copre: cercare
**dentro il cestino** e dentro le **task completate** (`useStoricoTaskCompleto`),
e trovare una lista **dai cointestatari** — un caso che il commento alla riga
238 racconta essere già andato storto una volta («stessa ricerca, due esiti
diversi»). Una ricerca che non trova non dice «non ho cercato lì», dice «non
c'è».

**La correzione.** Estrarre le due funzioni pure, lasciare al componente i
`useMemo` che le chiamano.

```js
// src/lib/searchTask.js
// M-5 · Il filtraggio del pannello di ricerca avanzata, estratto da
// AdvancedSearchPanel.jsx. Puro e testabile senza montare il pannello: era
// ~110 righe fra sei provider, e sono le righe che promettono di cercare
// dentro il cestino e dentro le completate.
import { matchIndice, terminiRicerca } from "./searchUtils.js";
import { startOfLocalDay, endOfLocalDay } from "./dates.js";

/** @param {{t: object, idx: object}[]} indice  @returns {object[]} */
export function filtraTask(indice, { keyword, dateFrom, dateTo, cats, stats, agents, includeTrashed }) {
  const termini = terminiRicerca(keyword);
  const from = startOfLocalDay(dateFrom);
  const to = endOfLocalDay(dateTo);
  return indice
    // I filtri STRUTTURALI restano davanti al confronto testuale: scartano una
    // riga con un'uguaglianza, e ogni riga che cade qui è un matchIndice
    // risparmiato.
    .filter(({ t, idx }) =>
      (includeTrashed || !t.deletedAt) &&
      (!cats.length   || cats.includes(t.category)) &&
      (!stats.length  || stats.includes(t.status)) &&
      (!agents.length || (t.assignees || []).some(a => agents.includes(a))) &&
      (!from || (t.dueDate && new Date(t.dueDate) >= from)) &&
      (!to   || (t.dueDate && new Date(t.dueDate) <= to)) &&
      matchIndice(termini, idx))
    .map(r => r.t)
    .sort(perScadenzaCrescente);
}

/** Le task senza scadenza vanno in fondo, non in testa (null non è "presto"). */
const perScadenzaCrescente = (a, b) =>
  !a.dueDate && !b.dueDate ? 0
  : !a.dueDate ? 1 : !b.dueDate ? -1
  : new Date(a.dueDate) - new Date(b.dueDate);
```

Nel componente resta il memo, cioè la sola cosa che dipende da React:

```js
const results = useMemo(
  () => (hasFilters ? filtraTask(indiceTask, filtri, keyword) : []),
  [indiceTask, filtri, keyword, hasFilters]);
```

Stessa operazione per `listaResults` → `lib/searchListe.js` (che resta fuori dal
modulo Liste: è la ricerca del *core* sulle liste, e il confine
`VIETATO_LISTEAPI_DA_FUORI` non viene toccato — si indicizzano oggetti già
ottenuti da `listeModuleApi.js`).

---

## M-6 · Due scritture che non passano da nessun registry

**Dove.** `admin/AddTeamMemberModal.jsx:62,87-94` · `admin/BulkInviteModal.jsx:65,92-117`.

**Il rilievo, e come è emerso.** Non era nella prima stesura di questo audit:
l'ha trovato il controllo corretto di A-1. Entrambe le modali hanno dati
digitati, tengono `busy` a mano e scrivono con `Users.invite` — una Edge
Function chiamata direttamente, senza passare né dal registry del core né da
quello del modulo Liste. Hanno quindi le stesse tre debolezze di A-2 (freno sul
valore di stato invece che su un `ref`, `setBusy(false)` fuori da un `finally`,
nessun guard di smontaggio), e nessuno dei due predicati le raggiunge.

**Perché NON sono state corrette qui, ed è una scelta e non una dimenticanza.**
`AddTeamMemberModal` sarebbe la stessa modifica meccanica fatta dodici volte in
A-2. `BulkInviteModal` no: è un **batch sequenziale con esito per riga** (`out`
cresce a ogni iterazione, `setResults([...out])` dipinge l'avanzamento live) e
tre stati per riga — `ok`, `warn`, `err`. `useSalvataggio` ha *un* concetto per
la riuscita parziale (`avviso`, che blocca i tentativi successivi), ed è pensato
per «la scrittura è riuscita a metà, la cosa da fare non è riprovare — è
chiudere»: non è la stessa forma. Deciderla di corsa dentro una correzione
lunga significherebbe forzare l'una nell'altra.

Per la stessa ragione `scriveDavvero` **non** è stato allargato a
`Users.invite`: allargare il predicato prima di aver deciso quella forma darebbe
un rosso senza una correzione da applicare, che è il modo in cui un controllo
si impara a saltare. L'esclusione è dichiarata in `docs/CLAUDE.md` accanto ai
due controlli e nel commento di `scriveDavvero` — non è silenziosa, che è
l'unica proprietà che A-1 chiedeva davvero.

**La correzione**, quando si farà, ha due passi disuguali: `AddTeamMemberModal`
adotta `useSalvataggio` come le dodici di A-2; `BulkInviteModal` chiede prima
una risposta a «che forma ha il contratto per un batch con esito per riga?» —
e quella risposta, se arriva, vale anche per `ImportTab` del BulkTaskCreator,
che ha lo stesso problema e lo risolve con `avviso`.

---

## B-1 · `listeApi.js`: quattro moduli in uno

**Dove.** `components/liste/listeApi.js` (537 righe fisiche, 255 effettive).

**Il rilievo.** Il file dichiara in testa di essere «il layer dati del modulo
Liste Viaggio», e per le prime 400 righe lo è. Poi:

| Righe | Cosa | Ha a che fare col data layer? |
|---|---|---|
| 105-405 | `ListeAPI` — query e RPC | ✔ è il file |
| 410-441 | `eur`, `fmtDate`, `todayISO`, `EPS`, `saldoClass` | Formattazione |
| 443-466 | `METODI`, `ACTION_LABELS`, `actionLabel`, `parseImporto` | Costanti e parsing di dominio |
| 476-535 | `escHtml`, `docHtml`, `riepilogoTesto` | **Generazione di documenti** (Word via HTML, testo per il cliente) |

`docHtml` costruisce HTML come stringa con escaping manuale — correttamente:
`escHtml` è applicato a tutti e cinque i punti di testo libero, verificato. Ma è
un *generatore di documenti* dentro il modulo che parla al database, e le due
cose non cambiano mai insieme.

Effetto pratico: `verifica:convenzioni` misura questo file a 255 righe
effettive (sotto ogni soglia) mentre chi lo apre ne trova 537 — la stessa
differenza che A-4 dell'audit del 23 agosto ha rilevato su `api.js`, e per la
quale `fileOltreTettoFisico` è stato scritto. Qui il tetto fisico (850) non
scatta, ma la diagnosi è identica.

**La correzione.** Tre file, stesso confine di modulo, nessun import nuovo dal
di fuori:

```
components/liste/listeApi.js        →  solo ListeAPI + le due helper di embed
components/liste/listeFormato.js    →  eur, fmtDate, todayISO, EPS, saldoClass,
                                       METODI, ACTION_LABELS, actionLabel, parseImporto
components/liste/listeDocumenti.js  →  escHtml, docHtml, riepilogoTesto
```

`listeApi.js` continua a ri-esportare i nomi per non toccare i sedici
importatori in un colpo solo — con l'avvertenza che quella ri-esportazione è
una **passerella a scadenza**, non un'API:

```js
// ⚠️ Ri-esportazioni di transizione (B-1, audit del 26 agosto). Servono a
// separare i tre file senza toccare sedici call site nello stesso commit.
// Chi scrive codice nuovo importa dal file giusto: un `import { eur } from
// "./listeApi.js"` aggiunto da qui in avanti riporta il file al punto di
// partenza. Da togliere quando i call site sono migrati.
export { eur, fmtDate, todayISO, EPS, saldoClass, METODI, ACTION_LABELS,
         actionLabel, parseImporto } from "./listeFormato.js";
export { docHtml, riepilogoTesto } from "./listeDocumenti.js";
```

---

## B-2 · Tre editor in linea gemelli nella stessa cartella

**Dove.** `liste/TitoloTestata.jsx`, `liste/NoteInterne.jsx`, `liste/CellEditor.jsx`.

**Il rilievo.** Tre file, stessa forma dalla prima riga all'ultima:

```
stato:    editing? · value · saving · inputRef            (3/3)
effetto:  focus + select all'apertura                     (3/3)
tastiera: Enter = salva, Escape = annulla                 (3/3)
salva:    if (saving) return → esegui(rpc) → if (ok) onSaved()   (3/3)
markup:   <div className="lv-cell-edit-actions"> + Annulla + Salva/Salvo…  (3/3)
```

L'ultima riga è quella che lo rende un rilievo e non una somiglianza: la barra
azioni ha **la stessa classe CSS** in tutti e tre — cioè lo stile è già stato
riconosciuto come condiviso e centralizzato — ma il **markup** è stato copiato
lo stesso, tre volte. Un difetto qui (il `disabled` che manca, l'etichetta
che cambia) si corregge in un file su tre e nessuno se ne accorge.

Nota di lettura, minore: in `TitoloTestata:12` e `NoteInterne:15` l'inizializzatore
`useState(lista.titolo || "")` è **codice morto** — `open()` riassegna sempre il
valore dalla prop prima di mostrare l'editor. Non è un difetto, ma fa credere a
chi legge che ci sia una sincronizzazione prop→stato da mantenere.

**La correzione.** Un hook per il ciclo, un componente per la barra. Con A-2
già applicato, l'hook si appoggia a `useSalvataggio` e le tre garanzie arrivano
gratis a tutti e tre gli editor.

```js
// src/components/liste/useModificaInLinea.js
// B-2 · Il ciclo dei tre editor in linea del modulo (titolo, note, cella del
// foglio movimenti): apri → focus → Enter salva / Escape annulla → onSaved.
// Era scritto tre volte, e la barra azioni copiata tre volte benché la sua
// classe CSS fosse già condivisa.
import { useEffect, useRef, useState } from "react";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import { useListeWrite } from "./listePersistence.js";

export function useModificaInLinea({ valoreIniziale, operazione, payload, invariato, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const esegui = useListeWrite();

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    el?.focus();
    if (el?.type === "text") el.select();
  }, [editing]);

  const { salva, inVolo } = useSalvataggio(
    async (v) => {
      const { ok } = await esegui(operazione, payload(v));
      return ok ? {} : { error: true };   // il toast lo mostra già il registry
    },
    { alSuccesso: async () => { setEditing(false); await onSaved(); } },
  );

  const apri   = () => { setValue(valoreIniziale()); setEditing(true); };
  const chiudi = () => setEditing(false);
  // Niente da salvare: si chiude senza toccare la rete.
  const conferma = () => (invariato(value) ? chiudi() : salva(value));

  return {
    editing, value, setValue, inputRef, inVolo, apri, chiudi, conferma,
    onKeyDown: (e) => {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") { e.preventDefault(); conferma(); }
      else if (e.key === "Escape") chiudi();
    },
  };
}
```

```jsx
// src/components/liste/AzioniModifica.jsx
export const AzioniModifica = ({ onAnnulla, onSalva, inVolo }) => (
  <div className="lv-cell-edit-actions">
    <button className="lv-btn sm" onClick={onAnnulla}>Annulla</button>
    <button className="lv-btn primary sm" disabled={inVolo} onClick={onSalva}>
      {inVolo ? "Salvo…" : "Salva"}
    </button>
  </div>
);
```

`NoteInterne.jsx` scende da 62 a ~30 righe e non contiene più nulla di
condiviso:

```jsx
export function NoteInterne({ lista, onSaved }) {
  const m = useModificaInLinea({
    valoreIniziale: () => lista.note || "",
    operazione: "modificaNote",
    payload: (v) => ({ id: lista.id, note: v.trim() || null }),
    invariato: (v) => (v.trim() || null) === (lista.note || null),
    onSaved,
  });
  // … <textarea ref={m.inputRef} value={m.value} onChange={…} onKeyDown={m.onKeyDown} />
  //    <AzioniModifica onAnnulla={m.chiudi} onSalva={m.conferma} inVolo={m.inVolo} />
}
```

---

## B-3 · 143 file di test piatti contro 25 cartelle di sorgente

**Dove.** `src/test/`.

**Il rilievo.** Il sorgente è stato riorganizzato più volte — B-1 del 25 agosto
ha eliminato `modals/` e `views/` proprio perché erano «cartelle-contenitore
senza semantica» — e i test non hanno mai ricevuto lo stesso trattamento:

```
src/test/            143 file .test.js(x) tutti allo stesso livello
src/test/helpers/    (2 file)
src/test/integration/
```

La struttura c'è: vive nei **prefissi dei nomi**, dove nessuno strumento la
vede.

```
liste ×11    chat ×11    realtime ×6    bulk ×6    admin ×5    task ×4    client ×4
```

Tre conseguenze concrete:

1. **Non esiste «i test del modulo Liste».** `vitest src/test/liste*` è
   un'ipotesi sui nomi, non un confine — e infatti manca
   `anagraficaListeCoesistenza.test.jsx`, che è un test delle liste.
2. **I nomi si allungano per evitare collisioni** invece che per descrivere:
   `adminToggleActivePersistence` accanto ad `adminTeamToggleActive`.
3. **Spostare un componente non sposta il suo test**, quindi la corrispondenza
   sorgente↔test si mantiene solo a memoria.

Vale la pena dire cosa **non** è il rilievo: la copertura è ottima (1702 test) e
i test sono scritti bene — molti fissano un contratto invece di un dettaglio, e
i loro commenti sono la documentazione migliore del repo. Il difetto è di
navigabilità, e per questo è di bassa priorità.

**La correzione.** Rispecchiare le cartelle del sorgente, in un commit di soli
`git mv` (nessuna modifica al contenuto, quindi il diff è verificabile a
colpo d'occhio):

```
src/test/liste/       11 file, senza il prefisso ridondante nel nome
src/test/chat/        11
src/test/tasks/       bulk*, task*, trash*, archivio*
src/test/admin/        5
src/test/clients/      4
src/test/state/       reducer*, persistence*, registroScritture*, pendingWrites*
src/test/lib/         api*, mappers*, permissions*, searchUtils*, validators*
src/test/hooks/       use*
src/test/scripts/     verifica*
src/test/helpers/     (invariata)
src/test/integration/ (invariata)
```

Da fare **insieme**, altrimenti la cartella si ripopola di file sciolti come è
già successo a `components/` (B-1 del 25 agosto): un controllo in
`scripts/verifica-convenzioni/` che conta i file `.test.*` direttamente in
`src/test/` e pretende 0.

---

## B-4 · `key={i}` su una lista identificata e in realtime

**Dove.** `components/tasks/TaskCommenti.jsx:72`.

**Il rilievo.**

```jsx
{commenti.map((c, i) => (
  <div key={i} style={rowGap10}>
```

I commenti **hanno un id** (`fromDbComment` in `mappers.js:90-93` lo mappa) e
arrivano da due strade che possono cambiarne l'ordine sotto React: il dispatch
ottimistico `ADD_COMMENT` e il merge realtime `MERGE_TASK_COMMENTS`. Con la
chiave posizionale, l'inserimento di un commento non in coda fa ri-renderizzare
ogni riga sotto di esso invece di spostarle.

Oggi non produce un difetto visibile — le righe non hanno stato locale — ed è
per questo che è B e non M. Ma è l'unico `key={i}` dell'app su dati
**identificati e mutabili**: gli altri quindici sono su scheletri di
caricamento, anteprime in sola lettura e griglie di calendario a lunghezza
fissa, dove l'indice *è* l'identità.

**La correzione**, una riga:

```jsx
{commenti.map((c) => (
  <div key={c.id} style={rowGap10}>
```

---

## Appendice · Sicurezza — cosa è stato guardato e non ha prodotto rilievi

Il perimetro richiesto era il punto 1, ma il mandato nominava le vulnerabilità.
Verificato, senza rilievi:

| Controllo | Esito |
|---|---|
| Sink di HTML grezzo (`dangerouslySetInnerHTML`, `innerHTML`, `document.write`) | **0 occorrenze** in `src/` e `scripts/` |
| `eval` / `new Function` / `setTimeout("stringa")` | **0 occorrenze** |
| `target="_blank"` senza `rel="noopener"` | **0** — tutti e tre i punti lo passano |
| Escaping in `docHtml` (unico generatore di markup a stringa) | `escHtml` applicato a tutti e cinque i punti di testo libero |
| RLS | attiva su **tutte e 22** le tabelle di `public` |
| CSP (`vercel.json`) | `script-src 'self'`, nessun `unsafe-inline`, `object-src 'none'`, `frame-ancestors 'none'` |
| Segreti nel repository | nessuno; `.env`/`.env.local`/`import-liste/` in `.gitignore`, nessun file `env` tracciato |
| Gate delle Edge Function | `requireActiveAdmin` condiviso; `send-push` con confronto del secret **a tempo costante** |
| CORS delle Edge Function | origini in elenco esatto (`originConsentite.ts`), non un prefisso su `vercel.app` |
| Cicli negli import di `src/` | **0** su 258 moduli |

Un'osservazione di fragilità operativa, non una vulnerabilità: la CSP di
`vercel.json` **cabla il ref del progetto Supabase** (`vmxvnxsqfisucugcpqlc`) in
`connect-src`/`img-src`/`media-src`, mentre il client legge l'URL da
`VITE_SUPABASE_URL`. Puntare l'env var a un altro progetto (staging, un ripristino)
produce un'app che si carica e **fallisce ogni chiamata nel browser**, senza un
errore lato server. Un controllo di tre righe in `scripts/verifica-redirect/` che
confronti l'host di `VITE_SUPABASE_URL` con quello dichiarato nella CSP chiude
il caso prima del deploy.
