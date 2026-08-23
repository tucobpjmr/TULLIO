// Flat config ESLint 9. Obiettivo: catturare errori reali (regole degli hook,
// dipendenze degli effetti, variabili/import inutilizzati) senza imporre uno
// stile invasivo o le nuove regole sperimentali del React Compiler su una
// codebase già scritta. Lo stile (spazi/virgole) resta fuori scope.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// ─── CONFINE DELLE SCRITTURE ─────────────────────────────────────────────────
// Le due regole qui sotto dicono la stessa cosa a due livelli diversi: una
// mutazione su un'entità che vive nello state del reducer si dichiara in
// state/persistence.js e si esegue con dispatch(), mai chiamando il data layer
// dal corpo di un componente.
//
// PERCHÉ SERVE UNA REGOLA E NON UNA CONVENZIONE. Il registry è l'unico punto in
// cui esistono, insieme: il doppio controllo di permesso (useSyncedDispatch.js
// ripete il verdetto del reducer PRIMA di toccare il server), il rollback dello
// stato ottimistico e il tag origin_client che fa scartare l'eco realtime della
// propria scrittura. Una chiamata diretta dal componente non ne ha nessuno dei
// tre: se fallisce, l'utente resta davanti a un dato che il database non ha —
// ed è successo davvero, in ProfileEditor, per diverse versioni.
//
// La forma è quella già collaudata contro appGlobals: lì il problema non era
// scrivere il modulo nuovo, era che ogni componente aggiunto copiava l'import
// dal vicino. Vale identico qui. Le due regole passano già oggi a zero
// violazioni: non chiedono un refactor, impediscono la prossima regressione.
// M-1 (audit del 12 agosto). 1.153 `style={{…}}` fatti di soli letterali sono
// stati sollevati a costanti di modulo: un oggetto per l'intera vita del
// modulo invece di uno nuovo a ogni render, quindi una prop stabile e un
// `memo` che può finalmente saltare il lavoro. Senza questa regola il numero
// risale da solo — è la forma che si copia dal vicino, esattamente come
// l'import legacy di appGlobals qui sotto.
//
// Il selettore accetta solo il caso PROVATO: nessuno spread, nessuna chiave
// calcolata, tutti i valori letterali. Un oggetto con anche una sola
// proprietà che dipende dallo stato passa, ed è giusto che passi: quello va
// costruito a ogni render. Restano fuori anche i letterali negativi
// (`marginTop: -8`, che nell'AST è una UnaryExpression) e i template string:
// la regola sotto-segnala di proposito, così non c'è modo che fermi codice
// legittimo.
const STILE_INLINE_COSTANTE = {
  selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression"
    + ':not(:has(> SpreadElement))'
    + ':not(:has(> Property[computed=true]))'
    + ':not(:has(> Property:not(:has(> Literal.value))))',
  message:
    'Questo style è fatto di soli valori costanti: definiscilo come const a '
    + 'livello di modulo (in cima al file, nel suo *Styles.js, o in '
    + 'styles/common.js se la forma ricorre in tre o più file — da lì si '
    + 'importa il namespace: `stiliComuni.rowCenterGap8`, vedi '
    + 'VIETATO_COMMON_NOMINATO) e passalo per nome. Un oggetto letterale nel '
    + 'JSX è nuovo a ogni render — vedi M-1 in '
    + 'docs/AUDIT_ARCHITETTURA_2026-08-12.md.',
};

// A-2 dell'audit del 16 agosto è nato da un oggetto letterale scritto nel JSX
// di un Provider (ChatContext): quattro livelli di propagazione da un value
// nuovo a ogni render, che nessun useMemo/memo a valle poteva mai bypassare.
// Stessa forma della regola sullo `style={{…}}` costante qui sopra, stesso
// obiettivo: chiudere la CATEGORIA — un `<X.Provider value={{…}}>` o
// `value={[…]}` letterale, invece del singolo caso già corretto.
//
// A differenza dello `style` costante, qui non si esenta il caso "con almeno
// una proprietà dinamica": un oggetto Provider con anche un solo campo
// derivato dallo stato è COMUNQUE un riferimento nuovo a ogni render, e la
// sua identità è esattamente ciò che ogni consumatore osserva. La risposta è
// sempre la stessa — `useMemo` sulle dipendenze vere, o una costante di
// modulo se è davvero invariante — quindi la regola non prova a distinguere
// i due casi come fa STILE_INLINE_COSTANTE.
const VIETATO_CONTEXT_VALUE_LETTERALE = {
  selector: "JSXOpeningElement[name.type='JSXMemberExpression'][name.property.name='Provider']"
    + " > JSXAttribute[name.name='value']"
    + ' > JSXExpressionContainer'
    + ' > :matches(ObjectExpression, ArrayExpression)',
  message:
    'Il value di un Context.Provider letterale è un riferimento nuovo a ogni '
    + 'render: ogni consumatore si ri-renderizza anche quando il contenuto non '
    + 'è cambiato, e nessun memo/useMemo a valle può saltare il lavoro. '
    + 'Costruiscilo con useMemo (dipendenze quelle che cambiano davvero) o, se '
    + 'è davvero costante, come const di modulo — vedi A-2 in '
    + 'docs/AUDIT_ARCHITETTURA_2026-08-16.md.',
};

const VIETATO_APPGLOBALS = {
  group: ['**/state/appGlobals', '**/state/appGlobals.js'],
  message:
    'appGlobals è stato eliminato: nei componenti usa useAppData() ' +
    '(src/state/AppDataContext.jsx), altrove le funzioni pure di src/lib/permissions.js.',
};

// Le entità che vivono nello state del reducer. Leggerle o scriverle da
// un componente scavalca il registry; l'idratazione le legge da hooks/, che
// resta fuori da questa restrizione perché è il posto in cui i dati entrano.
//
// A-1 dell'audit del 23 agosto (secondo passaggio): l'elenco ne copriva
// quattro e i namespace di dominio scritti dal registry sono OTTO. Mancavano
// `Comments` e `MessageTemplates` (ADD_COMMENT, ADD/UPDATE/DELETE_MESSAGE_
// TEMPLATE stanno in state/persistence.js come gli altri) più `Notifications`
// e `Push`, che il reducer non scrive ma che hanno comunque un proprietario
// fuori dai componenti — hooks/useNotifications.js e lib/push.js. Nessuno dei
// quattro era importato da un componente: la regola non chiede un refactor,
// impedisce che il primo call site sbagliato faccia scuola, che è la ragione
// per cui esiste anche VIETATO_APPGLOBALS.
//
// Cosa resta fuori, e perché. `Users`, `TaskFiles`, `TaskThreads`: sono il
// quarto gruppo di scritture dell'app — Storage, Edge Function, preferenze
// personali, letture di pannello — che il reducer non può ospitare, e che è
// delimitato per METODO da VIETATE_MUTAZIONI_TEAM invece che per namespace.
// `Conversations` e `Messages`: il registry della chat
// (components/chat/chatCommands.js) vive dentro components/ ed è il loro
// proprietario legittimo.
const VIETATE_ENTITA_DELLO_STATE = {
  group: ['**/lib/api', '**/lib/api.js'],
  importNames: [
    'Tasks', 'Notices', 'Clients', 'Categories',
    'Comments', 'MessageTemplates', 'Notifications', 'Push',
  ],
  message:
    'queste entità si mutano con dispatch() — la regola è ' +
    'dichiarata in src/state/persistence.js, che è l\'unico punto con guard di ' +
    'permesso, rollback e tag origin_client. Le letture stanno in src/hooks/. ' +
    'Notifications e Push hanno per proprietari hooks/useNotifications.js e ' +
    'lib/push.js. Restano diretti storage ed Edge Function (TaskFiles, ' +
    'Messages, Users.uploadAvatar/getAvatarUrl, Users.invite).',
};

// Confine dei chunk lazy per import statico: due componenti che ClienteDetail
// Panel.jsx e Archive.jsx importano volutamente con lazy(() => import(...)),
// perché trascinano moduli condivisi con l'altro punto d'ingresso dello
// stesso modulo (ListeViaggio.jsx, già lazy in VoyageDesk.jsx). Un import
// statico rimette quei moduli nel chunk eager senza che nessun test se ne
// accorga: è passato in review due volte prima di essere misurato a mano
// decodificando le sourcemap (docs/AUDIT_PERFORMANCE_2026-08.md, P2-1). La
// regola non vieta il componente, vieta la forma statica: `import()`
// dinamico non è un ImportDeclaration e resta permesso.
const VIETATI_IMPORT_LISTE_EAGER = {
  group: [
    '**/liste/ClienteListePanel', '**/liste/ClienteListePanel.jsx',
    '**/liste/ArchivedListe', '**/liste/ArchivedListe.jsx',
    // ChatPanel dal 2026-08-11 (ST-6…ST-15): stessa forma, stesso rischio, e
    // qui il modo di rompere il chunk è già stato trovato una volta — il
    // pannello ri-esportava `getUnreadCount`, che serve al badge dei non letti
    // e si calcola FUORI dal pannello. Bastava quel ri-export a tenere i ~54 kB
    // della chat nel chunk iniziale con il `lazy()` già scritto: chi serve
    // quella funzione la importa da chat/chatFormat.js.
    '**/chat/ChatPanel', '**/chat/ChatPanel.jsx',
  ],
  message:
    'ClienteListePanel/ArchivedListe/ChatPanel si importano con lazy(() => import(...)) ' +
    '(vedi ClienteDetailPanel.jsx/Archive.jsx/VoyageDesk.jsx): un import statico li rimette nel ' +
    'chunk eager insieme a listeStyles.jsx e liste/listeApi.js, che ListeViaggio.jsx ' +
    'tiene già fuori (docs/AUDIT_PERFORMANCE_2026-08.md, P2-1; ST-12). Le funzioni ' +
    'pure della chat che servono fuori dal pannello (getUnreadCount per il badge) ' +
    'si importano da chat/chatFormat.js, che non trascina il pannello.',
};

// Stesso principio per mockData.js: 17.9 kB di dati demo che devono restare
// irraggiungibili (quindi fuori dal bundle) in produzione. L'unico punto
// d'ingresso ammesso è state/demoState.js, che lo chiama sempre dentro
// `if (import.meta.env.DEV && …)` — il guard che permette al bundler di
// eliminare il ramo (docs/AUDIT_PERFORMANCE_2026-08.md, P2-2). Import diretti
// altrove bypassano quel guard e mockData.js torna nel bundle di produzione,
// invisibile finché qualcuno non rilegge le sourcemap.
const VIETATO_MOCKDATA_DIRETTO = {
  group: ['**/state/mockData', '**/state/mockData.js'],
  message:
    'mockData.js si importa solo da state/demoState.js, dietro il guard ' +
    'import.meta.env.DEV: altrove finisce nel bundle di produzione anche se ' +
    'irraggiungibile a runtime. Per stato iniziale non-demo (es. categorie) usa ' +
    'state/taskCategories.js.',
};

// Quarta regola di confine, stessa forma delle tre sopra. `listeApi.js` è il
// data layer PRIVATO del modulo Liste: dodici importatori, tutti dentro
// components/liste/, nessuno fuori. La facciata listeModuleApi.js aveva già
// chiuso la superficie verso il core — ma finché il file stava in `src/lib/`,
// la cartella dei moduli condivisi, quel confine era una CONVENZIONE e non una
// struttura: era esattamente il posto da cui Topbar/ricerca, ClientiView e
// Archive l'avevano raggiunto la prima volta, assemblando query sulle tabelle
// di un modulo altrui (ST-6 di docs/AUDIT_STRUTTURA_2026-08-10.md).
//
// Ora il file sta accanto ai suoi consumatori e questa regola dice la stessa
// cosa al linter. Come per appGlobals, il problema non era scrivere la facciata
// nuova: era che ogni vista aggiunta copiava l'import dal vicino. La regola
// passa a zero violazioni — non chiede un refactor, impedisce la prossima
// regressione, che si è presentata solo per distrazione.
// A-2 dell'audit del 22 agosto. `styles/common.js` esporta 61 forme con nomi
// che codificano la FORMA (`rowCenterGap8`, `txtF13Bold`), e la stessa
// convenzione la usano i file per le proprie costanti locali. Il risultato,
// misurato: 124 costanti locali che ombreggiavano un export omonimo, e TUTTE
// e 124 con una forma diversa. `flex1` valeva `{flex:1}` in common.js,
// `{flex:1, overflowY:"auto", overflowX:"hidden"}` in VoyageDeskInner.jsx e
// `{flex:1, minHeight:0, maxHeight:420, overflowY:"auto"}` in
// NotificationsPanel.jsx. Chi leggeva non poteva fidarsi del nome: doveva
// risalire agli import di quel file.
//
// ⛔ NON si è corretto rinominando i 122 locali divergenti, ed è una scelta
// misurata e non una scorciatoia: generare un nome dalla forma produce
// identificatori come `rowCenterGap10F13TLeftP810W100BordBgRadCur`, perché una
// convenzione che codifica la forma nel nome non scala oltre tre proprietà — ed
// è esattamente il motivo per cui i file avevano riusato il nome comune più
// vicino invece di inventarne uno. Rinominare avrebbe peggiorato la
// leggibilità che il rilievo esiste per difendere.
//
// La correzione toglie l'ambiguità dall'altro lato: l'import è QUALIFICATO
// (`import * as stiliComuni`), quindi dentro un file `rowCenterBetween` è
// sempre e solo la costante locale — dichiarata lì sopra, sotto gli occhi — e
// `stiliComuni.rowCenterBetween` è sempre e solo quella condivisa. Non c'è più
// un nome che possa mentire, e nessun locale è stato toccato.
// Selettore e non `no-restricted-imports`: quella regola blocca l'intero path,
// namespace compreso, mentre qui il namespace è proprio la forma da PERMETTERE.
// `ImportSpecifier` è il nodo dei soli import nominati — `import * as x` è un
// `ImportNamespaceSpecifier` e non viene toccato.
const VIETATO_COMMON_NOMINATO = {
  selector: 'ImportDeclaration[source.value=/styles\\u002Fcommon(\\.js)?$/] > ImportSpecifier',
  message:
    'Da styles/common.js si importa il NAMESPACE, non i singoli nomi: ' +
    '`import * as stiliComuni from "…/styles/common.js"` e poi ' +
    '`stiliComuni.rowCenterBetween`. Un import nominato rimette in circolo un ' +
    'identificatore che 40+ file usano già per una forma DIVERSA (A-2, audit ' +
    'del 22 agosto): chi legge non può più dire, guardando il nome, quale dei ' +
    'due sta guardando.',
};

const VIETATO_LISTEAPI_DA_FUORI = {
  group: ['**/liste/listeApi', '**/liste/listeApi.js'],
  message:
    'listeApi.js è PRIVATO del modulo Liste: dal core si passa da ' +
    'components/liste/listeModuleApi.js, che espone domande e non query. ' +
    'Tre viste del core (Topbar/ricerca, ClientiView, Archive) conoscevano la ' +
    'forma delle tabelle di un modulo altrui prima che quella facciata esistesse.',
};

// Su `Users` la granularità dell'import non basta: lo stesso namespace porta
// operazioni legittime dal componente (invito via Edge Function, avatar sul
// bucket, presence, preferenze personali) e mutazioni del team che appartengono
// al registry. Qui si vietano le seconde per nome, sotto entrambi gli alias in
// uso nella codebase.
const METODI_TEAM_RISERVATI = ['updateProfile', 'updateContact', 'approve', 'setActive', 'deleteUser'];
const MESSAGGIO_METODI_TEAM =
  'questa scrittura sul team/profilo passa da dispatch(): le entry sono ' +
  'UPDATE_TEAM_MEMBER / UPDATE_OWN_PROFILE / APPROVE_TEAM_MEMBER / ' +
  'TOGGLE_TEAM_MEMBER_ACTIVE / REMOVE_TEAM_MEMBER in src/state/persistence.js. ' +
  'Chiamarla qui salta guard di permesso e rollback.';
const VIETATE_MUTAZIONI_TEAM = ['Users', 'UsersAPI'].flatMap((object) =>
  METODI_TEAM_RISERVATI.map((property) => ({ object, property, message: MESSAGGIO_METODI_TEAM })),
);

// Stesso confine per il modulo Liste viaggio, che non passa dal reducer e ha
// quindi un registry proprio (components/liste/listePersistence.js). Le LETTURE
// restano libere — il modulo interroga ListeAPI in continuazione — quindi si
// vietano i singoli metodi di scrittura, non l'import.
const METODI_LISTE_RISERVATI = [
  'crea', 'modifica', 'modificaNote', 'cambiaStato', 'archivia', 'ripristina',
  'eliminaDefinitiva', 'spostaTitolare', 'aggiungiBeneficiario', 'rimuoviBeneficiario',
  'addMovimento', 'addMovimenti', 'modificaMovimento', 'annullaMovimento',
  'importaBackup', 'resetCompleto',
];
const VIETATE_SCRITTURE_LISTE = METODI_LISTE_RISERVATI.map((property) => ({
  object: 'ListeAPI',
  property,
  message:
    'le scritture del modulo Liste si dichiarano in LISTE_WRITES ' +
    '(src/components/liste/listePersistence.js) e si eseguono con useListeWrite(): ' +
    'è lì che vivono messaggio di successo e guard di ruolo. Le letture restano dirette.',
}));

export default [
  { ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      // Marca come "usati" i componenti referenziati in JSX (altrimenti
      // verrebbero segnalati come import inutilizzati).
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // Componente usato in JSX senza importarlo. `no-undef` di eslint:recommended
      // NON lo intercetta: gli identificatori JSX non sono trattati come reference
      // dall'analisi di scope, quindi `<QueueShell>` senza import passava il lint e
      // crashava solo a runtime, dentro il ViewErrorBoundary ("QueueShell is not
      // defined"). È esattamente il modo in cui UrgentQueue e UnassignedQueue si
      // sono rotte: serve la regola del plugin react.
      'react/jsx-no-undef': 'error',
      // Solo le due regole hook classiche: violazioni reali = errore,
      // dipendenze mancanti = warning (fix mirato, non bloccante).
      //
      // L'arretrato di exhaustive-deps è a ZERO. I quattro casi che restavano
      // (Toast, ChatPanel, i due di ConversationView) erano tutti omissioni
      // volute — callback del genitore che, se inclusi, avrebbero fatto
      // ripartire l'effetto a ogni render del genitore — e ora portano un
      // `eslint-disable-next-line` con la ragione accanto. La differenza non è
      // cosmetica: finché quei quattro erano warning permanenti, il quinto —
      // che magari conta — sarebbe comparso nello stesso output che si era
      // imparato a saltare. Ora un warning di questa regola è nuovo per
      // definizione.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // docs/CLAUDE.md prescrive di spezzare sopra le ~500 righe. È nata come
      // warning perché quindici file la violavano: un errore avrebbe bloccato
      // tutto il lavoro in corso il giorno in cui è stata introdotta.
      //
      // Ora è un errore, e la differenza non è di severità ma di significato.
      // Un warning con un arretrato aperto è rumore che si impara a saltare —
      // sei file lo hanno dimostrato restando sopra soglia per intere sessioni
      // senza che nessuno li leggesse più. Un errore a zero violazioni dice
      // una cosa sola e verificabile: nessun file supera la soglia, e il
      // prossimo che lo farà si ferma qui invece che in code review.
      //
      // L'unica eccezione è dichiarata più sotto, con la sua ragione.
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      // "Mai un secondo componente 'solo per ora' in un file che ne ha già
      // uno" (docs/CLAUDE.md) era l'altra metà della stessa convenzione, e non
      // era misurata affatto: listeModals.jsx ne conteneva tredici, ListaDetail
      // quattro, TaskSlideOver e ProfileEditor due ciascuno.
      //
      // Warning e non errore, a differenza di max-lines, perché qui l'arretrato
      // non è a zero: restano diciannove casi in dodici file (Sidebar/BottomNav,
      // TaskCard/TaskRow, i tre chip di QueueShell…), tutti in file ampiamente
      // sotto soglia, che spezzare oggi sarebbe churn senza una misura che lo
      // giustifichi. La differenza rispetto a prima è che ora quel numero
      // esiste: è scritto in docs/CLAUDE.md e lo si vede scendere o salire.
      'react/no-multi-comp': 'warn',
      // Lo shim state/appGlobals.js (tre `let` di modulo con TEAM/CATEGORIES/
      // CURRENT_USER) è stato eliminato: la fonte di verità è lo state del
      // reducer, esposta ai componenti da useAppData(). La regola esiste perché
      // il problema vero non era scrivere il modulo nuovo — era che ogni
      // componente aggiunto copiava l'import legacy dal vicino, e la migrazione
      // è rimasta ferma a zero consumatori per intere sessioni. Se il file
      // riappare, questo errore lo intercetta prima della review.
      'no-restricted-imports': ['error', {
        patterns: [
          VIETATO_APPGLOBALS, VIETATI_IMPORT_LISTE_EAGER, VIETATO_MOCKDATA_DIRETTO,
          VIETATO_LISTEAPI_DA_FUORI,
        ],
      }],
      'no-restricted-syntax': ['error', STILE_INLINE_COSTANTE, VIETATO_CONTEXT_VALUE_LETTERALE, VIETATO_COMMON_NOMINATO],
    },
  },
  // Il confine vale per i COMPONENTI. Non per src/hooks/ (è lì che i dati
  // entrano: useAppHydration legge Tasks/Notices/Clients/Categories per
  // idratare il reducer), non per src/state/ (il registry È il data layer di
  // scrittura), non per src/lib/ (definisce l'API, non la consuma).
  //
  // ATTENZIONE se si tocca questo blocco: in flat config le opzioni di una
  // regola NON si fondono fra blocchi, si sostituiscono. Ripetere
  // VIETATO_APPGLOBALS qui non è ridondanza — senza, i componenti perderebbero
  // proprio la protezione che ha fatto nascere la regola.
  {
    files: ['src/components/**/*.{js,jsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          VIETATO_APPGLOBALS, VIETATE_ENTITA_DELLO_STATE,
          VIETATI_IMPORT_LISTE_EAGER, VIETATO_MOCKDATA_DIRETTO,
          VIETATO_LISTEAPI_DA_FUORI,
        ],
      }],
      'no-restricted-properties': ['error', ...VIETATE_MUTAZIONI_TEAM],
    },
  },
  // state/demoState.js è l'unico punto ammesso a importare mockData.js
  // (staticamente, dietro il proprio guard DEV a ogni chiamata): senza questa
  // eccezione VIETATO_MOCKDATA_DIRETTO, ereditato dal blocco base sopra,
  // vieterebbe l'unico file che deve poter fare quell'import.
  {
    files: ['src/state/demoState.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [VIETATO_APPGLOBALS, VIETATI_IMPORT_LISTE_EAGER, VIETATO_LISTEAPI_DA_FUORI],
      }],
    },
  },
  {
    files: ['src/components/liste/**/*.{js,jsx}'],
    rules: {
      'no-restricted-properties': ['error', ...VIETATE_MUTAZIONI_TEAM, ...VIETATE_SCRITTURE_LISTE],
      // Il modulo È il proprietario di listeApi.js: qui l'import è la cosa
      // normale (dodici file lo fanno), quindi VIETATO_LISTEAPI_DA_FUORI si
      // toglie — senza questa riga il modulo vieterebbe se stesso.
      //
      // Le altre quattro pattern vanno RIPETUTE: in flat config le opzioni di
      // una regola non si fondono fra blocchi, si sostituiscono, quindi questo
      // blocco non eredita nulla da quelli sopra. Ometterle qui toglierebbe a
      // components/liste/** proprio le protezioni comuni a tutti i componenti.
      'no-restricted-imports': ['error', {
        patterns: [
          VIETATO_APPGLOBALS, VIETATE_ENTITA_DELLO_STATE,
          VIETATI_IMPORT_LISTE_EAGER, VIETATO_MOCKDATA_DIRETTO,
        ],
      }],
    },
  },
  // Il registry È il posto in cui le scritture del modulo si nominano: qui la
  // restrizione si toglie, e resta solo quella comune sul team. Senza questa
  // eccezione la regola vieterebbe l'unico file che deve poter chiamare le RPC.
  {
    files: ['src/components/liste/listePersistence.js'],
    rules: {
      'no-restricted-properties': ['error', ...VIETATE_MUTAZIONI_TEAM],
    },
  },
  // ─── L'UNICA ECCEZIONE A max-lines ─────────────────────────────────────────
  // Il reducer è UNO switch: 517 righe effettive, quasi tutte i suoi case (il
  // numero qui era fermo a 504, poi 539, e va rimisurato quando lo si tocca,
  // non dedotto).
  // Spezzarlo per dimensione significherebbe distribuire su più file le
  // transizioni di un'unica macchina a stati, e la proprietà che rende questo
  // file leggibile — vedere in un colpo solo tutto ciò che può succedere allo
  // state — è esattamente quella che si perderebbe. È una decisione, quindi sta
  // scritta qui con un tetto suo invece di restare un warning che nessuno legge.
  //
  // Il tetto è 550 e non "nessun limite": la deroga vale per la forma del file,
  // non è un permesso di crescere senza fine. Se il reducer arriva lì, la
  // domanda giusta non è alzare ancora il numero — è se una fetta di dominio
  // meriti un reducer suo.
  //
  // Successo, il 12 agosto: aggiungendo la compensazione (M-1) e
  // ROLLBACK_EMPTY_TRASH (M-4) il file ha sfondato il tetto di 7 righe. Il
  // numero NON è stato alzato: è uscito `buildLogEntry` + `LOGGED_ACTIONS`
  // (→ state/activityLog.js), che non sono transizioni di stato ma il
  // dizionario che le racconta — l'unica fetta che si può togliere senza
  // spezzare la macchina a stati su due file.
  //
  // Nota su src/lib/api.js, l'altro candidato naturale a questa deroga: oggi
  // sta a 376 righe effettive e non gli serve. Esentarlo per categoria ("è un
  // elenco di query, quindi può essere lungo") gli regalerebbe 130 righe di
  // margine che nessuno ha chiesto, ed è il modo in cui un'eccezione motivata
  // diventa un'esenzione permanente.
  {
    files: ['src/state/reducer.js'],
    rules: { 'max-lines': ['error', { max: 550, skipBlankLines: true, skipComments: true }] },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Un file di test dichiara sonde usa-e-getta (un componente che registra
      // cosa ha letto dal contesto, un guscio che simula il genitore): sono lo
      // strumento della misura, non "un secondo componente solo per ora".
      'react/no-multi-comp': 'off',
      // I test (e i loro helper, es. test/helpers/appData.jsx) leggono
      // INITIAL_TEAM da mockData.js direttamente: non finiscono nel bundle di
      // produzione, quindi il confine di VIETATO_MOCKDATA_DIRETTO non li
      // riguarda. VIETATI_IMPORT_LISTE_EAGER resta: i test che montano
      // ClienteListePanel/ArchivedListe lo fanno con `await import(...)`
      // dinamico, mai colpito da questa regola.
      // VIETATO_LISTEAPI_DA_FUORI vale anche qui: un test che monta il modulo
      // Liste lo fa dai suoi componenti, e quando gli serve il data layer lo
      // mocka o lo importa dinamicamente — nessuna delle due forme è un
      // ImportDeclaration, quindi la regola non le tocca. Un `import` statico
      // di listeApi.js in un test, invece, è il primo passo con cui il percorso
      // torna a circolare fuori dal modulo.
      'no-restricted-imports': ['error', {
        patterns: [VIETATO_APPGLOBALS, VIETATI_IMPORT_LISTE_EAGER, VIETATO_LISTEAPI_DA_FUORI],
      }],
    },
  },
];
