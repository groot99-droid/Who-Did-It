import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**', 'pnpm-lock.yaml'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The NPC name pool is server-only: a client holding it could tell an NPC seat by its name (A39).
    files: ['apps/client/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@wdi/content/server', message: 'Server-only content (A39).' }] },
      ],
    },
  },
);
