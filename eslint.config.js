// Flat config ESLint 9. Obiettivo: catturare errori reali (regole degli hook,
// dipendenze degli effetti, variabili/import inutilizzati) senza imporre uno
// stile invasivo o le nuove regole sperimentali del React Compiler su una
// codebase già scritta. Lo stile (spazi/virgole) resta fuori scope.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

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
      // Solo le due regole hook classiche: violazioni reali = errore,
      // dipendenze mancanti = warning (fix mirato, non bloccante).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // docs/CLAUDE.md prescrive di spezzare sopra le ~500 righe e di non
      // tenere un secondo componente "solo per ora" in un file che ne ha già
      // uno. Era una convenzione scritta e mai misurata: quindici file la
      // violavano, il peggiore con sei componenti dentro. Warning e non error
      // perché alcuni file grandi sono legittimi (il reducer È uno switch, il
      // data layer È un elenco di query): serve un segnale in review, non un
      // blocco.
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      // Lo shim state/appGlobals.js (tre `let` di modulo con TEAM/CATEGORIES/
      // CURRENT_USER) è stato eliminato: la fonte di verità è lo state del
      // reducer, esposta ai componenti da useAppData(). La regola esiste perché
      // il problema vero non era scrivere il modulo nuovo — era che ogni
      // componente aggiunto copiava l'import legacy dal vicino, e la migrazione
      // è rimasta ferma a zero consumatori per intere sessioni. Se il file
      // riappare, questo errore lo intercetta prima della review.
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/state/appGlobals', '**/state/appGlobals.js'],
          message:
            'appGlobals è stato eliminato: nei componenti usa useAppData() ' +
            '(src/state/AppDataContext.jsx), altrove le funzioni pure di src/lib/permissions.js.',
        }],
      }],
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
