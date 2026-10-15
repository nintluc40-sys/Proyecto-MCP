import js from '@eslint/js';
import globals from 'globals';

export default [
  // El monolito heredado, los artefactos y las librerías de terceros (minificadas) no se lintan.
  { ignores: ['dist/**', 'public/registros/**', 'public/vendor/**', 'node_modules/**'] },

  js.configs.recommended,

  // Código de la app (navegador).
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, XLSX: 'readonly', d3: 'readonly' },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'warn',
      // `catch (_) {}` es una convención del repo: fallback silencioso intencional.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Escapes redundantes en regex heredados: backlog, no bloquean.
      'no-useless-escape': 'warn',
      eqeqeq: ['warn', 'smart'],
    },
  },

  // Tests (Vitest) y archivos de config (Node).
  {
    files: ['**/*.test.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // El service worker (script clásico: `register('./sw.js')` sin `type`). `globals.serviceworker` no trae AbortController.
  {
    files: ['public/sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.serviceworker, AbortController: 'readonly' },
    },
    rules: {
      // La misma convención que en src: `catch (_) {}` es un fallback silencioso intencional.
      'no-unused-vars': ['error', { caughtErrorsIgnorePattern: '^_' }],
    },
  },

  // Las auditorías que corre la CI (Node).
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
];
