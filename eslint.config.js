import js from '@eslint/js';
import globals from 'globals';

export default [
  // El monolito heredado y los artefactos no se lintan.
  { ignores: ['dist/**', 'public/registros/**', 'node_modules/**'] },

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
];
