import js from '@eslint/js';
import globals from 'globals';

const rules = {
  ...js.configs.recommended.rules,
  'no-console': 'off',
  'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^(_|next$)', varsIgnorePattern: '^_', caughtErrors: 'all', caughtErrorsIgnorePattern: '^_' }],
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],
  'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
  eqeqeq: ['error', 'smart'],
};

export default [
  { ignores: ['node_modules/**', '**/node_modules/**', 'frontend/public/**', 'frontend/angular/dist/**', '**/coverage/**', 'backend/thunder-tests/**', 'output/**', '.vercel/**', '.agents/**', '.codex/**', '.aws/**'] },
  js.configs.recommended,
  {
    files: ['backend/src/**/*.js', 'api/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules,
  },
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.jest } },
    rules: { ...rules, 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
];
