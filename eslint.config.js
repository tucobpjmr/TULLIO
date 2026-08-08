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
const VIETATO_APPGLOBALS = {
  group: ['**/state/appGlobals', '**/state/appGlobals.js'],
  message:
    'appGlobals è stato eliminato: nei componenti usa useAppData() ' +
    '(src/state/AppDataContext.jsx), altrove le funzioni pure di src/lib/permissions.js.',
};

// Le quattro entità che vivono nello state del reducer. Leggerle o scriverle da
// un componente scavalca il registry; l'idratazione le legge da hooks/, che
// resta fuori da questa restrizione perché è il posto in cui i dati entrano.
const VIETATE_ENTITA_DELLO_STATE = {
  group: ['**/lib/api', '**/lib/api.js'],
  importNames: ['Tasks', 'Notices', 'Clients', 'Categories'],
  message:
    'tasks/notices/clients/categories si mutano con dispatch() — la regola è ' +
    'dichiarata in src/state/persistence.js, che è l\'unico punto con guard di ' +
    'permesso, rollback e tag origin_client. Le letture stanno in src/hooks/. ' +
    'Restano diretti storage ed Edge Function (TaskFiles, Messages, ' +
    'Users.uploadAvatar/getAvatarUrl, Users.invite).',
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
      'no-restricted-imports': ['error', { patterns: [VIETATO_APPGLOBALS] }],
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
        patterns: [VIETATO_APPGLOBALS, VIETATE_ENTITA_DELLO_STATE],
      }],
      'no-restricted-properties': ['error', ...VIETATE_MUTAZIONI_TEAM],
    },
  },
  {
    files: ['src/components/liste/**/*.{js,jsx}'],
    rules: {
      'no-restricted-properties': ['error', ...VIETATE_MUTAZIONI_TEAM, ...VIETATE_SCRITTURE_LISTE],
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
  // Il reducer è UNO switch: 539 righe effettive, quasi tutte i suoi case (il
  // numero qui era fermo a 504 e va rimisurato quando lo si tocca, non dedotto).
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
    // Un file di test dichiara sonde usa-e-getta (un componente che registra
    // cosa ha letto dal contesto, un guscio che simula il genitore): sono lo
    // strumento della misura, non "un secondo componente solo per ora".
    rules: { 'react/no-multi-comp': 'off' },
  },
];
