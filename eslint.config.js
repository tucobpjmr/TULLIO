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
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
];
